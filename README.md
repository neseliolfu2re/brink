# Last Click Wins

Single global, time-gated, fee-based Aptos Move on-chain game contract.

## Prerequisites

- **Aptos CLI** — The project uses `aptos-node-v1.8.0` framework for broad CLI compatibility. For mainnet/latest features, change `Move.toml` to `rev = "mainnet"` and upgrade the CLI to the [latest release](https://github.com/aptos-labs/aptos-core/releases).

## Rules

- **Base fee:** 0.01 APT (1_000_000 octas)
- **Increment:** +0.002 APT per click (200_000 octas)
- **Timeout:** 5 minutes (300 seconds) — only the last clicker can claim after the timeout
- **Cooldown:** 60 seconds per address
- **Pool:** Entire pool goes to the last clicker (new round starts after claim)
- **Protocol cut (Model 1):** **95%** of each click fee goes to the prize pool, **5%** to the protocol treasury (e.g. 0.01 APT fee → 0.0095 pool, 0.0005 treasury)

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

- Install [Aptos CLI](https://github.com/aptos-labs/aptos-core/releases) (latest so Move compiler matches the framework).
- Optional: `aptos init` to create a profile with a funded account for deploy.

### 2. Build and test

```bash
aptos move compile --dev
aptos move test --dev
```

Uses framework rev `aptos-node-v1.8.0` by default for compatibility.

### 3. Deploy

The deployer account address **is** the module address; `init_module` runs at publish and creates the single global `GameState` at that address.

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

## Invariants (in comments)

- Pool cannot be claimed before timeout.
- Fee increases each click: `current_fee = base_fee + (click_count * increment)`.
- Per-address cooldown is enforced.
- Each round has a single winner (the last clicker).
