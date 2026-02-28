// Last Click Wins — single global, time-gated, fee-based on-chain game.
// Invariants (logical guarantees):
// - Pool cannot be claimed before timeout.
// - Fee increases linearly with each click (current_fee = base_fee + click_count * increment).
// - Per-address cooldown is enforced between clicks.
// - Each round has exactly one winner (the last clicker when timeout is claimed).
// - Each click fee: 95% → prize pool, 5% → protocol treasury (Model 1 — Small Protocol Cut).

module last_click_wins::last_click_wins {
    use std::signer;
    use std::error;

    use aptos_framework::coin;
    use aptos_framework::event;
    use aptos_framework::timestamp;
    use aptos_framework::aptos_coin::AptosCoin;

    use aptos_std::table::{Self, Table};

    // ============ Constants ============

    /// 0.01 APT in octas (1 APT = 10^8 octas).
    const BASE_FEE_OCTAS: u64 = 1_000_000;
    /// 0.002 APT in octas (increment per click).
    const INCREMENT_OCTAS: u64 = 200_000;
    /// Time window after last click before the last clicker can claim (5 minutes).
    const TIMEOUT_SECONDS: u64 = 300;
    /// Cooldown per address between clicks (60 seconds).
    const COOLDOWN_SECONDS: u64 = 60;

    /// Protocol cut: 5% of each click fee goes to treasury (basis points: 500 = 5%).
    const PROTOCOL_CUT_BPS: u64 = 500;
    const BPS_DENOMINATOR: u64 = 10_000;

    // ============ Errors ============
    // Named for clarity: avoid magic numbers; clients map these to user-friendly messages.
    const EALREADY_INITIALIZED: u64 = 1;
    const ENOT_INITIALIZED: u64 = 2;
    const EINSUFFICIENT_FEE: u64 = 3;
    const ECOOLDOWN_NOT_PASSED: u64 = 4;   // Address must wait cooldown_seconds before next click.
    const ETIMEOUT_NOT_REACHED: u64 = 5;   // Last clicker cannot claim until timeout expires.
    const ENOT_LAST_CLICKER: u64 = 6;      // Only the last clicker can claim the pool.
    const EPOOL_EMPTY: u64 = 7;            // No clicks yet or pool already claimed.
    const ENOT_PROTOCOL_ADMIN: u64 = 8;
    const ETREASURY_EMPTY: u64 = 9;

    // ============ Events ============

    #[event]
    struct ClickEvent has drop, store {
        clicker: address,
        fee_octas: u64,
        pool_amount_octas: u64,
        click_count: u64,
        round_id: u64,
        timestamp_seconds: u64,
    }

    #[event]
    struct ClaimEvent has drop, store {
        winner: address,
        amount_octas: u64,
        round_id: u64,
    }

    #[event]
    struct WithdrawTreasuryEvent has drop, store {
        admin: address,
        amount_octas: u64,
    }

    // ============ State ============

    struct GameState has key {
        round_id: u64,
        base_fee: u64,
        increment: u64,
        click_count: u64,
        last_clicker: address,
        last_click_timestamp: u64,
        timeout_seconds: u64,
        cooldown_seconds: u64,
        pool: coin::Coin<AptosCoin>,
        treasury: coin::Coin<AptosCoin>,
        protocol_admin: address,
        cooldowns: Table<address, u64>,
    }

    // ============ Init ============

    /// Initializes the single global game state. Must be called once at deploy (by the module deployer).
    /// GameState is stored at the module deployer's address (module address when deployed from that address).
    fun init_module(owner: &signer) {
        let owner_addr = signer::address_of(owner);
        assert!(!exists<GameState>(owner_addr), error::already_exists(EALREADY_INITIALIZED));

        let empty_pool = coin::zero<AptosCoin>();
        let empty_treasury = coin::zero<AptosCoin>();
        move_to(owner, GameState {
            round_id: 0,
            base_fee: BASE_FEE_OCTAS,
            increment: INCREMENT_OCTAS,
            click_count: 0,
            last_clicker: @0x0,
            last_click_timestamp: 0,
            timeout_seconds: TIMEOUT_SECONDS,
            cooldown_seconds: COOLDOWN_SECONDS,
            pool: empty_pool,
            treasury: empty_treasury,
            protocol_admin: owner_addr,
            cooldowns: table::new(),
        });
    }

    // ============ Entry / Public ============

    /// Pay current fee and register a click. Fee = base_fee + (click_count * increment).
    /// Enforces per-address cooldown. Adds paid amount to the pool and updates last clicker and timestamp.
    public entry fun click(account: &signer) acquires GameState {
        let account_addr = signer::address_of(account);
        let game = borrow_global_mut<GameState>(@last_click_wins);

        let now = timestamp::now_seconds();
        let current_fee = get_current_fee_internal(game);

        // Enforce cooldown: address can only click again after cooldown_seconds from last click.
        if (table::contains(&game.cooldowns, account_addr)) {
            let cooldown_until = *table::borrow(&game.cooldowns, account_addr);
            assert!(now >= cooldown_until, error::invalid_argument(ECOOLDOWN_NOT_PASSED));
        };

        let to_pay = coin::withdraw<AptosCoin>(account, current_fee);
        // 95% → pool, 5% → protocol treasury (Model 1)
        let protocol_cut = (current_fee * PROTOCOL_CUT_BPS) / BPS_DENOMINATOR;
        if (protocol_cut > 0) {
            let treasury_coin = coin::extract(&mut to_pay, protocol_cut);
            coin::merge(&mut game.treasury, treasury_coin);
        };
        coin::merge(&mut game.pool, to_pay);

        game.last_clicker = account_addr;
        game.last_click_timestamp = now;
        game.click_count = game.click_count + 1;

        let cooldown_until = now + game.cooldown_seconds;
        table::upsert(&mut game.cooldowns, account_addr, cooldown_until);

        event::emit(ClickEvent {
            clicker: account_addr,
            fee_octas: current_fee,
            pool_amount_octas: coin::value(&game.pool),
            click_count: game.click_count,
            round_id: game.round_id,
            timestamp_seconds: now,
        });
    }

    /// Last clicker can claim the entire pool after timeout. Starts a new round and resets state.
    /// Cooldown table is logically reset (old entries become irrelevant as round_id and time advance).
    public entry fun claim_if_timeout(claimant: &signer) acquires GameState {
        let claimant_addr = signer::address_of(claimant);
        let game = borrow_global_mut<GameState>(@last_click_wins);

        let now = timestamp::now_seconds();
        assert!(game.last_click_timestamp > 0, error::invalid_state(EPOOL_EMPTY));
        assert!(
            now >= game.last_click_timestamp + game.timeout_seconds,
            error::invalid_argument(ETIMEOUT_NOT_REACHED)
        );
        assert!(claimant_addr == game.last_clicker, error::invalid_argument(ENOT_LAST_CLICKER));

        let pool_coin = coin::extract_all(&mut game.pool);
        let amount = coin::value(&pool_coin);
        assert!(amount > 0, error::invalid_state(EPOOL_EMPTY));
        coin::deposit(claimant_addr, pool_coin);

        event::emit(ClaimEvent {
            winner: claimant_addr,
            amount_octas: amount,
            round_id: game.round_id,
        });

        game.round_id = game.round_id + 1;
        game.click_count = 0;
        game.last_clicker = @0x0;
        game.last_click_timestamp = 0;
        // Cooldown table is not physically cleared (Table has no clear). Old entries are ignored
        // because cooldown_until is in the past after a new round; next click overwrites per address.
    }

    // ============ View functions ============

    #[view]
    /// Current fee in octas: base_fee + (click_count * increment).
    public fun get_current_fee(): u64 acquires GameState {
        let game = borrow_global<GameState>(@last_click_wins);
        get_current_fee_internal(game)
    }

    #[view]
    /// Seconds until last clicker can claim.
    /// - No clicks yet: returns timeout_seconds (countdown not started; nothing to claim).
    /// - Countdown active: returns seconds left.
    /// - Timeout passed: returns 0 (claimable).
    public fun get_time_remaining(): u64 acquires GameState {
        let game = borrow_global<GameState>(@last_click_wins);
        if (game.last_click_timestamp == 0) return game.timeout_seconds;
        let now = timestamp::now_seconds();
        let deadline = game.last_click_timestamp + game.timeout_seconds;
        if (now >= deadline) 0 else (deadline - now)
    }

    #[view]
    /// True if at least one click has occurred this round (countdown has started).
    public fun get_round_active(): bool acquires GameState {
        let game = borrow_global<GameState>(@last_click_wins);
        game.last_click_timestamp > 0
    }

    #[view]
    /// Current pool amount in octas.
    public fun get_pool_amount(): u64 acquires GameState {
        let game = borrow_global<GameState>(@last_click_wins);
        coin::value(&game.pool)
    }

    #[view]
    /// Current round id.
    public fun get_round_id(): u64 acquires GameState {
        let game = borrow_global<GameState>(@last_click_wins);
        game.round_id
    }

    #[view]
    /// Protocol treasury balance in octas (5% of all click fees).
    public fun get_treasury_amount(): u64 acquires GameState {
        let game = borrow_global<GameState>(@last_click_wins);
        coin::value(&game.treasury)
    }

    /// Protocol admin withdraws accumulated treasury to their account.
    public entry fun withdraw_treasury(admin: &signer) acquires GameState {
        let admin_addr = signer::address_of(admin);
        let game = borrow_global_mut<GameState>(@last_click_wins);
        assert!(admin_addr == game.protocol_admin, error::invalid_argument(ENOT_PROTOCOL_ADMIN));
        let amount = coin::value(&game.treasury);
        assert!(amount > 0, error::invalid_state(ETREASURY_EMPTY));
        let treasury_coin = coin::extract_all(&mut game.treasury);
        coin::deposit(admin_addr, treasury_coin);

        event::emit(WithdrawTreasuryEvent {
            admin: admin_addr,
            amount_octas: amount,
        });
    }

    // ============ Internal ============

    fun get_current_fee_internal(game: &GameState): u64 {
        game.base_fee + (game.click_count * game.increment)
    }

    // ============ Unit tests (skeleton) ============

    #[test(framework = @0x1, deployer = @last_click_wins)]
    fun test_init_and_view_functions(framework: &signer, deployer: &signer) acquires GameState {
        timestamp::set_time_has_started_for_testing(framework);
        init_module(deployer);

        assert!(get_current_fee() == BASE_FEE_OCTAS, 0);
        assert!(get_round_id() == 0, 0);
        assert!(get_pool_amount() == 0, 0);
        assert!(get_treasury_amount() == 0, 0);
        assert!(get_time_remaining() == TIMEOUT_SECONDS, 0);
        assert!(!get_round_active(), 0);
    }

    #[test(framework = @0x1, deployer = @last_click_wins)]
    #[expected_failure]
    fun test_double_init_fails(framework: &signer, deployer: &signer) {
        timestamp::set_time_has_started_for_testing(framework);
        init_module(deployer);
        init_module(deployer);
    }

    #[test(framework = @0x1, deployer = @last_click_wins)]
    #[expected_failure]
    fun test_claim_fails_when_no_clicks(framework: &signer, deployer: &signer) acquires GameState {
        timestamp::set_time_has_started_for_testing(framework);
        init_module(deployer);
        claim_if_timeout(deployer);
    }

    #[test(framework = @0x1, deployer = @last_click_wins)]
    #[expected_failure]
    fun test_withdraw_treasury_fails_when_empty(framework: &signer, deployer: &signer) acquires GameState {
        timestamp::set_time_has_started_for_testing(framework);
        init_module(deployer);
        withdraw_treasury(deployer);
    }

    #[test(framework = @0x1, deployer = @last_click_wins, not_admin = @0x3)]
    #[expected_failure]
    fun test_withdraw_treasury_fails_if_not_admin(
        framework: &signer,
        deployer: &signer,
        not_admin: &signer,
    ) acquires GameState {
        timestamp::set_time_has_started_for_testing(framework);
        init_module(deployer);
        withdraw_treasury(not_admin);
    }

    #[test(framework = @0x1, deployer = @last_click_wins)]
    fun test_fee_formula(framework: &signer, deployer: &signer) acquires GameState {
        timestamp::set_time_has_started_for_testing(framework);
        init_module(deployer);
        assert!(get_current_fee() == BASE_FEE_OCTAS, 0);
        assert!(
            get_current_fee() == expected_fee_for_click_count(0),
            0
        );
    }

    #[test_only]
    // Fee formula: base_fee + (click_count * increment). Used in tests without needing real clicks.
    fun expected_fee_for_click_count(click_count: u64): u64 {
        BASE_FEE_OCTAS + (click_count * INCREMENT_OCTAS)
    }
}
