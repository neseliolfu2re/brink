# Last Click Wins — Frontend

React + Vite + Aptos Wallet Adapter (Petra). Connect wallet, view game state, click, claim.

## Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env: set VITE_MODULE_ADDRESS to your deployed module address
npm run dev
```

## Env

| Variable | Description |
|----------|-------------|
| `VITE_MODULE_ADDRESS` | Module address (same as deployer after publish) |
| `VITE_NETWORK` | `TESTNET` \| `DEVNET` \| `MAINNET` |
| `VITE_APTOS_API_KEY` | Optional API key |

## Build

```bash
npm run build
npm run preview
```

## Deploy to Vercel

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → Import Project → select the repo.
3. **Root Directory:** Set to `frontend` (important).
4. **Environment Variables:** Add in Vercel dashboard:
   - `VITE_MODULE_ADDRESS` = `0x51c8a1bdc669a51d2b58934c19534df02e8e6dfc7e22be819c3bbb09c2ed25ff`
   - `VITE_NETWORK` = `DEVNET`
5. Deploy.

Or via CLI from `frontend/`:

```bash
cd frontend
npx vercel
# Set env vars when prompted, or in Vercel dashboard
```
