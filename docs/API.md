# Last Click Wins — API Reference

For frontend, indexers, and integrations. Replace `{MODULE_ADDRESS}` with your deployed module address (deployer address).

## Module identifier

```
{MODULE_ADDRESS}::last_click_wins
```

Example: `0xabc123...::last_click_wins`

---

## Entry functions (transactions)

### `click`

Pays the current fee and records a click. Fee = base_fee + (click_count × increment). Enforces 60s cooldown per address.

**Function:** `{MODULE_ADDRESS}::last_click_wins::click`

**Arguments:** None (signer is implicit)

**Example (TypeScript / Wallet Adapter):**

```ts
await signAndSubmitTransaction({
  data: {
    function: `${moduleAddress}::last_click_wins::click`,
    typeArguments: [],
    functionArguments: [],
  },
});
```

---

### `claim_if_timeout`

Last clicker claims the entire pool after 5-minute timeout. Starts a new round.

**Function:** `{MODULE_ADDRESS}::last_click_wins::claim_if_timeout`

**Arguments:** None (signer must be `last_clicker`)

**Example:**

```ts
await signAndSubmitTransaction({
  data: {
    function: `${moduleAddress}::last_click_wins::claim_if_timeout`,
    typeArguments: [],
    functionArguments: [],
  },
});
```

---

### `withdraw_treasury`

Protocol admin withdraws accumulated treasury (5% of all click fees). Only deployer can call.

**Function:** `{MODULE_ADDRESS}::last_click_wins::withdraw_treasury`

**Arguments:** None (signer must be protocol admin)

---

## View functions (read-only)

All views return `u64` (octas). Call via REST or SDK view API. No signer required.

### `get_current_fee`

**Function:** `{MODULE_ADDRESS}::last_click_wins::get_current_fee`  
**Returns:** `u64` — Current click fee in octas (1 APT = 10^8 octas)

**REST example:**

```http
POST /v1/view
Content-Type: application/json

{
  "function": "0x...::last_click_wins::get_current_fee",
  "type_arguments": [],
  "arguments": []
}
```

**TypeScript (Aptos SDK):**

```ts
const [fee] = await aptos.view({
  payload: {
    function: `${moduleAddress}::last_click_wins::get_current_fee`,
    functionArguments: [],
  },
});
// fee: string (octas)
const aptAmount = Number(fee) / 1e8;
```

---

### `get_pool_amount`

**Function:** `{MODULE_ADDRESS}::last_click_wins::get_pool_amount`  
**Returns:** `u64` — Prize pool in octas

---

### `get_time_remaining`

**Function:** `{MODULE_ADDRESS}::last_click_wins::get_time_remaining`  
**Returns:** `u64` — Seconds until last clicker can claim.  
- No clicks: returns `timeout_seconds` (countdown not started).  
- Active round: seconds left.  
- Timeout passed: 0 (claimable).

### `get_round_active`

**Function:** `{MODULE_ADDRESS}::last_click_wins::get_round_active`  
**Returns:** `bool` — True if at least one click has occurred this round.

---

### `get_round_id`

**Function:** `{MODULE_ADDRESS}::last_click_wins::get_round_id`  
**Returns:** `u64` — Current round id

---

### `get_treasury_amount`

**Function:** `{MODULE_ADDRESS}::last_click_wins::get_treasury_amount`  
**Returns:** `u64` — Protocol treasury in octas

---

## Events

Query via REST: `GET /v1/accounts/{address}/events/{event_handle}`  
Event handle is derived from the emitting module.

### `ClickEvent`

**Type:** `{MODULE_ADDRESS}::last_click_wins::ClickEvent`

| Field              | Type    | Description                          |
|--------------------|---------|--------------------------------------|
| `clicker`          | address | Address that clicked                 |
| `fee_octas`        | u64     | Fee paid (octas)                     |
| `pool_amount_octas`| u64     | Pool after this click                |
| `click_count`      | u64     | Total clicks in round                |
| `round_id`         | u64     | Round id                             |
| `timestamp_seconds`| u64     | Unix timestamp of click              |

---

### `ClaimEvent`

**Type:** `{MODULE_ADDRESS}::last_click_wins::ClaimEvent`

| Field           | Type    | Description           |
|-----------------|---------|-----------------------|
| `winner`        | address | Address that claimed  |
| `amount_octas`  | u64     | Amount claimed        |
| `round_id`      | u64     | Round id              |

---

### `WithdrawTreasuryEvent`

**Type:** `{MODULE_ADDRESS}::last_click_wins::WithdrawTreasuryEvent`

| Field          | Type    | Description          |
|----------------|---------|----------------------|
| `admin`        | address | Admin that withdrew  |
| `amount_octas` | u64     | Amount withdrawn     |

---

## Error codes

| Code | Name                  | When                                           |
|------|-----------------------|------------------------------------------------|
| 1    | EALREADY_INITIALIZED  | Double init_module                             |
| 4    | ECOOLDOWN_NOT_PASSED  | Click within 60s cooldown                      |
| 5    | ETIMEOUT_NOT_REACHED  | Claim before 5-min timeout                     |
| 6    | ENOT_LAST_CLICKER     | Non–last-clicker tries to claim                |
| 7    | EPOOL_EMPTY           | Claim when no clicks / empty pool              |
| 8    | ENOT_PROTOCOL_ADMIN   | Non-admin calls withdraw_treasury               |
| 9    | ETREASURY_EMPTY       | withdraw_treasury when treasury is empty        |

Coin errors (e.g. insufficient balance) come from `0x1::coin` (EINSUFFICIENT_BALANCE = 6).

---

## Constants

| Name             | Value     | Description                |
|------------------|-----------|----------------------------|
| Base fee         | 1_000_000 | 0.01 APT (octas)           |
| Increment        | 200_000   | 0.002 APT per click        |
| Timeout          | 300       | 5 minutes (seconds)        |
| Cooldown         | 60        | 60 seconds per address    |
| Protocol cut     | 5%        | 500 bps of each fee       |

---

## Octas conversion

```
1 APT = 10^8 octas
octas → APT: amount / 1e8
APT → octas: amount * 1e8
```
