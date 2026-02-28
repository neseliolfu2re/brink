# Last Click Wins

Terminal is a time-gated, fully on-chain incentive game built with Aptos Move.
Each interaction increases economic pressure, creating a competitive race against time where the final participant before timeout captures the prize pool.

A single global, time-gated, fee-based on-chain incentive game implemented in Aptos Move.

## Prerequisites

- **Aptos CLI** — Install [latest Aptos CLI](https://github.com/aptos-labs/aptos-core/releases) so the Move compiler matches the framework (`rev = "mainnet"`).

## Rules

- **Base fee:** 0.01 APT (1_000_000 octas)
- **Increment:** +0.002 APT per click (200_000 octas)
- **Timeout:** 5 minutes (300 seconds) — only the last clicker can claim after the timeout
- **Cooldown:** 60 seconds per address
- **Pool:** Entire pool goes to the last clicker (new round starts after claim)
- **Protocol fee:** 5% of each click goes to treasury; 95% to the prize pool (e.g. 0.01 APT fee → 0.0095 pool, 0.0005 treasury)

## Demo

The frontend shows:
- **Timer ticking** — Live countdown (5:00 → 0:00) until claimable
- **Fee increase** — Each click raises the fee (0.01 → 0.012 → …)
- **Pool growth** — 95% of each fee adds to the prize pool
- **Recent activity** — Click and Claim events from chain

*Add a short GIF/screen recording here once captured.*

---

## Project structure

```
click/
├── .aptos/
│   └── config.yaml
├── Move.toml
├── sources/
│   └── last_click_wins.move
├── scripts/
│   ├── publish.ps1
│   └── publish.sh
├── docs/
│   └── API.md        # API reference (views, events, errors)
├── frontend/
│   ├── src/
│   └── .env.example
└── README.md
```

## Step-by-step

### 0. Push to GitHub

```bash
# Repo already initialized and committed. Create repo on github.com (New repository).
# Then:
git remote add origin https://github.com/YOUR_USERNAME/last-click-wins.git
git branch -M main
git push -u origin main
```

### 1. Prerequisites

- Install [latest Aptos CLI](https://github.com/aptos-labs/aptos-core/releases).
- Optional: `aptos init` to create a profile with a funded account for deploy.

### 2. Build and test

```bash
aptos move compile --dev
aptos move test --dev
```

### 3. Deploy

The deployer account address **is** the module address; `init_module` runs at publish and creates the single global `GameState` at that address.

**Devnet (önerilen — faucet çalışır):**
```powershell
.\scripts\deploy-devnet.ps1
```

**One-command deploy (Testnet)**

```powershell
# From project root (click/)
.\scripts\deploy-testnet.ps1
```

This script: creates profile (if needed) → funds with faucet → publishes.

**Manual steps**

```powershell
# 1. Create profile (first time)
aptos init --network Testnet

# 2. Fund account
aptos account fund-with-faucet --profile default

# 3. Publish
.\scripts\publish.ps1
# or: .\scripts\publish.ps1 -Address 0xYOUR_HEX
```

**CLI directly**

```bash
aptos move publish --dev --named-addresses last_click_wins=0xYOUR_DEPLOYER_HEX --profile default
```

Config: `.aptos/config.yaml` (testnet/devnet profiles). Run `aptos init` to fill keys.

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_MODULE_ADDRESS to your deployed module address
npm run dev
```

Open http://localhost:5173. Connect Petra, click, claim when timeout.

### 5. Vercel deploy

1. Push to GitHub, then [vercel.com](https://vercel.com) → Import Project.
2. **Root Directory:** `frontend`
3. **Env vars:** `VITE_MODULE_ADDRESS` (deployed address), `VITE_NETWORK` (e.g. `DEVNET`)
4. Deploy.

Or from `frontend/`: `npx vercel`

## Functions

| Function | Description |
|----------|-------------|
| `click(signer)` | Pays the current fee and records a click; 95% of fee to pool, 5% to treasury; cooldown enforced. |
| `claim_if_timeout(signer)` | If timeout has passed, only the last clicker claims the pool and a new round starts. |
| `withdraw_treasury(signer)` | Only the protocol admin (deployer) withdraws accumulated treasury to their address. |

## Events

| Event | When | Fields |
|-------|------|--------|
| `ClickEvent` | On `click()` | `clicker`, `fee_octas`, `pool_amount_octas`, `click_count`, `round_id`, `timestamp_seconds` |
| `ClaimEvent` | On `claim_if_timeout()` | `winner`, `amount_octas`, `round_id` |
| `WithdrawTreasuryEvent` | On `withdraw_treasury()` | `admin`, `amount_octas` |

## View functions

- `get_current_fee()` — Current click fee (octas)
- `get_time_remaining()` — Seconds left until claim is allowed
- `get_pool_amount()` — Total amount in the pool (octas)
- `get_round_id()` — Current round id
- `get_treasury_amount()` — Amount accumulated in protocol treasury (octas)

## API reference

See [docs/API.md](docs/API.md) for full API documentation: entry functions, view functions, events, error codes, and SDK examples.

## Mechanism Design Rationale

**Why linear increment?**  
Each click increases the fee by a fixed amount (0.002 APT). This creates predictable, escalating economic pressure: early clicks are cheap, late clicks are expensive. Linear is simple, auditable, and avoids exponential blow-ups that could make the game unwinnable.

**Why cooldown?**  
60 seconds per address prevents a single actor from spamming clicks and dominating the round. It forces strategic timing and allows other participants to compete. Cooldown also reduces front-running and MEV-style attacks.

**Why protocol fee?**  
5% of each click funds protocol treasury for maintenance, audits, and sustainability. 95% stays in the pool so participants retain most of the value. The fee is small enough to keep the game attractive while supporting long-term development.

**How does economic pressure evolve?**  
- Click 1: 0.01 APT fee, 0.0095 to pool  
- Click 5: 0.018 APT fee, pool grows faster  
- Click 10: 0.028 APT fee, high stake for "last click"  

As the countdown ticks, the incentive to be last intensifies. The pool grows; the fee rises; the timeout approaches. Rational players balance cost vs. reward, creating a time-gated bidding dynamic.

---

## Simulation Table (approx.)

| Click # | Fee (APT) | To pool (95%) | Cumulative pool (approx.) |
|---------|-----------|---------------|---------------------------|
| 1       | 0.0100    | 0.0095        | 0.0095                    |
| 2       | 0.0120    | 0.0114        | 0.0209                    |
| 3       | 0.0140    | 0.0133        | 0.0342                    |
| 5       | 0.0180    | 0.0171        | 0.0648                    |
| 10      | 0.0280    | 0.0266        | 0.1643                    |
| 20      | 0.0480    | 0.0456        | 0.5633                    |

*Formula: fee = 0.01 + (click_count × 0.002) APT; pool share = fee × 0.95*

---

## Invariants (in comments)

- Pool cannot be claimed before timeout.
- Fee increases each click: `current_fee = base_fee + (click_count * increment)`.
- Per-address cooldown is enforced.
- Each round has a single winner (the last clicker).

## Troubleshooting: "Could not find module ABI"

Bu hata genelde wallet'ın modül ABI'sini çekemediğinde oluşur.

1. **Wallet Devnet'te mi?** Settings → Network → Devnet
2. **Başka wallet dene:** Martian veya Fewcha (Petra yerine)
3. **Yeniden deploy:** `.\scripts\deploy-devnet.ps1` — güncel framework ile deploy et, Vercel env'de `VITE_MODULE_ADDRESS` güncelle

## Disclaimer

This contract is deployed for experimental and educational purposes.
Not audited. Use at your own risk.
