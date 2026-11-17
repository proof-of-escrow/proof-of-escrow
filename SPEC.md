# Proof of Escrow 0.1

Status: draft.

## 1. Summary

A distribution pays out a fixed supply of an XRP Ledger token, on a fixed schedule, to accounts that have XRP locked in escrows to themselves. Each account's share is its locked XRP weighted by how long the lock still has to run. Every number comes from public ledger data, so anyone can recompute any payout.

Nobody pays the issuer anything. The XRP stays in the locker's own account and comes back to them when the lock ends.

## 2. Terms

- **Lock**: an `Escrow` ledger entry where `Account` equals `Destination`, `Amount` is XRP, `FinishAfter` is set, and there is no `Condition` (and no `FinishFunction`).
- **Owner**: the account that created the lock and gets the XRP back.
- **Distribution**: a token, a pool account that holds the supply to be paid out, a schedule and a few parameters, all fixed by a manifest (section 6).
- **Participant**: an account that holds a trust line for the distribution's token at the end of an epoch.
- **Epoch**: a fixed window of time. Rewards are computed and paid once per epoch.

All times are in seconds since the Ripple epoch (2000-01-01T00:00:00Z), the unit the ledger uses. XRP amounts are in drops.

## 3. Locks

### 3.1 Why a self-escrow is a lock

A self-escrow with no condition cannot be finished before `FinishAfter`. It can only be cancelled after `CancelAfter`, and the ledger requires `CancelAfter` to be later than `FinishAfter`. So from the moment it is created until `FinishAfter`, the XRP cannot move, and the owner keeps the keys the whole time.

That means one lock is fully described by data that never changes:

| Field | Source |
|---|---|
| `owner` | `Account` of the escrow |
| `drops` | `Amount` |
| `created` | close time of the ledger that created it (`PreviousTxnLgrSeq`) |
| `unlock` | `FinishAfter` |
| `tx` | `PreviousTxnID`, the `EscrowCreate` hash |

An escrow entry only exists if its `EscrowCreate` succeeded, so reading locks from ledger state can never count a failed transaction.

### 3.2 What counts

A lock counts for a distribution when all of these hold:

1. It is a lock as defined in section 2.
2. `unlock - created >= lock.min_seconds`.
3. `drops >= lock.min_drops`.
4. `created >= start`, unless the manifest sets `lock.existing` to `true`.
5. The owner is not the issuer, the pool, or listed in `exclude`.

A lock can count for any number of distributions at once. Lock once and you are in every distribution whose rules you meet and whose token you hold a trust line for.

### 3.3 Recommended lock transaction

```json
{
  "TransactionType": "EscrowCreate",
  "Account": "rOwner...",
  "Destination": "rOwner...",
  "Amount": "100000000",
  "FinishAfter": 946684800,
  "OperationLimit": 21337,
  "Memos": [{ "Memo": { "MemoType": "706F65" } }]
}
```

- `OperationLimit: 21337` is optional. It makes the lock importable into Xahau later, which is what a fully on-ledger version would verify (see `docs/DECENTRALIZATION.md`). It has to be set when the lock is created and cannot be added afterwards.
- The `poe` memo is optional and only helps indexers.
- `CancelAfter` is allowed and changes nothing, because it must come after `FinishAfter`.

Any wallet that can sign an `EscrowCreate` can lock. No app, account or API key is involved.

## 4. Weight

### 4.1 Per lock

`M` is `lock.max_seconds`. At time `t`, a lock weighs:

```
w(t) = drops * min(unlock - t, M) / M     when created <= t < unlock
w(t) = 0                                  otherwise
```

So 1 XRP with `M` or more left to run weighs 1 XRP. With half of `M` left it weighs 0.5. The weight falls in a straight line to zero at unlock. A fresh long lock always outweighs an old lock about to open.

Over the whole life of a lock of length `T <= M`, its total weight is `drops * T^2 / (2M)`. If distributions run for the whole lock, doubling its length quadruples what it earns. Waiting longer pays much more.

### 4.2 Per epoch

An epoch `[a, b)` scores each lock by the integral of `w(t)` over the window. To keep everything in integers, implementations compute twice the integral times `M`, which divides out when shares are taken:

```
s  = max(a, created)
e  = min(b, unlock)
if s >= e: W = 0
k  = unlock - M                       # when remaining time drops below M
F  = max(0, min(e, k) - s)            # seconds at full weight
x  = max(s, k)
L  = (unlock - x)^2 - (unlock - e)^2  if x < e, else 0
W  = drops * (2 * M * F + L)
```

All values are integers. Implementations must use arbitrary-precision integers; `W` can exceed 2^64.

An account's epoch weight is the sum of `W` over its counted locks.

## 5. Rewards

For epoch `n` with emission `E` (in token units, section 6.2):

```
reward(account) = floor(E * W(account) / sum of W over all participants)
```

- Only participants count. An account with locks but no trust line at the epoch's closing ledger gets nothing for that epoch, and its weight is left out of the sum.
- A trust line counts when the holder's limit is above zero and the issuer has not frozen it.
- Rounding dust, emission from epochs with no participants, and payments that fail all stay in the pool. Whatever is left in the pool after the last epoch is burned by sending it to the issuer.

Payouts never feed back into later epochs, so each epoch's emission is fixed by the manifest alone.

## 6. Manifest

### 6.1 Format

```json
{
  "poe": "0.1",
  "name": "Example",
  "token": { "currency": "EXA", "issuer": "rIssuer..." },
  "pool": "rPool...",
  "start": "2027-01-01T00:00:00Z",
  "epoch_seconds": 86400,
  "decimals": 6,
  "schedule": [
    { "epochs": 91, "per_epoch": "115384.615384" },
    { "epochs": 91, "per_epoch": "57692.307692" }
  ],
  "lock": {
    "min_seconds": 2592000,
    "max_seconds": 157680000,
    "min_drops": "1000000",
    "existing": false
  },
  "exclude": []
}
```

| Field | Meaning | Default |
|---|---|---|
| `start` | UTC start of epoch 0 | required |
| `epoch_seconds` | length of an epoch | 86400 (1 day) |
| `decimals` | smallest token unit paid, as decimal places | 6 |
| `schedule` | emission phases in order; epoch numbers run across phases | required |
| `lock.min_seconds` | shortest lock that counts; must be at least `2 * epoch_seconds` | 2592000 (30 days) |
| `lock.max_seconds` | `M`, the lock length that earns full weight | 157680000 (5 years) |
| `lock.min_drops` | smallest lock that counts | 1000000 (1 XRP) |
| `lock.existing` | also count locks created before `start` | false |
| `exclude` | accounts that never participate | `[]` |

Amounts are strings. There are no floats anywhere in the manifest.

### 6.2 Identity and anchoring

The distribution id is the SHA-256 of the manifest with every default filled in, in canonical form: keys sorted at every level, no whitespace, UTF-8, uppercase hex.

The pool account anchors the manifest before `start` with any transaction carrying a memo with `MemoType` `poe/manifest` (hex `706F652F6D616E6966657374`) and `MemoData` set to the 32-byte id. The first anchor is the one that counts. A manifest cannot change after it is anchored; a new manifest is a new distribution.

The pool must hold the full scheduled emission before `start`.

## 7. Epoch report

Each epoch produces a report that anyone can rebuild:

```json
{
  "poe": "0.1",
  "distribution": "<id>",
  "epoch": 0,
  "window": [ 851990400, 852076800 ],
  "ledgers": { "open": { "index": 0, "hash": "" }, "close": { "index": 0, "hash": "" } },
  "emission": "115384615384",
  "locks": [ { "owner": "r...", "tx": "...", "drops": "...", "created": 0, "unlock": 0 } ],
  "payouts": [ { "account": "r...", "weight": "...", "units": "...", "amount": "..." } ],
  "total_weight": "...",
  "dust": "..."
}
```

- The **opening ledger** is the first validated ledger with close time at or after `a`, and the **closing ledger** the first at or after `b`.
- **Participants** are the trust line holders of the token at the closing ledger.
- **Locks** are found by reading each participant's escrows at both the opening and the closing ledger. A lock that ran during the epoch must exist at one of the two, because it cannot be removed before it unlocks and it lasts at least two epochs.
- Lists are sorted: locks by `tx`, payouts by `account`.
- The report hash is the SHA-256 of the report in canonical form.

Each payout is a `Payment` from the pool to the participant for `amount` of the token, carrying a memo with `MemoType` `poe/epoch` (hex `706F652F65706F6368`) and `MemoData` set to the report hash. Anyone can match every payment on the ledger to the report that justifies it, and rebuild that report from the ledger.

## 8. Draw mode (optional)

A distribution can pay one winner per block instead of everyone each epoch. This is how Ledger on Ledger worked, and it costs one payment per block.

- A block is a window of `block_seconds`. The winner is chosen with probability equal to its share of block weight.
- The random value is the hash of the first validated ledger with close time at or after `block_end + delay_seconds`. There is no operator seed.
- A validator or anyone submitting transactions can nudge a ledger hash, but cannot know the full transaction set in advance. With small prizes this does not pay. Pro-rata mode needs no randomness at all, which is why it is the default.

Draw mode is not in the 0.1 reference implementation.

## 9. Trust levels

The rules above say who is owed what. Who signs the payments is separate:

| Level | Who decides | What you trust |
|---|---|---|
| 1. Verifiable | One payer runs the calculator and signs | The payer to pay. Any wrong payment is provable from the ledger. |
| 2. Federated | Pool has its master key disabled and a SignerList of independent signers; each signs only what its own calculator agrees with | That a quorum of named, independent parties will not collude |
| 3. On-ledger | Code that the ledger enforces verifies locks and pays | The ledgers involved |

Level 1 and 2 work on the XRP Ledger today. Level 3 is in `docs/DECENTRALIZATION.md`.

A conforming distribution at any level:

- anchors its manifest before `start`,
- funds the pool before `start`,
- publishes every epoch report,
- tags every payout with the report hash.

It should also lock its issuer so no more tokens can be issued. A locked issuer has its master key disabled, no regular key except a blackhole, and no SignerList.

## 10. Security notes

- **Read the ledger, never the client.** Amount, owner and dates come from ledger state. Ledger on Ledger once credited locks whose transactions had failed (`tecUNFUNDED`); reading `Escrow` entries instead of transactions makes that impossible.
- **Public servers can lie by omission.** Some public servers have returned empty `account_objects` for accounts that do hold escrows. Check the ledger hash in every response against the expected ledger, and compare two servers or use your own.
- **Splitting does not help.** Weight is linear in XRP, so ten accounts with 10 XRP weigh the same as one with 100, and each lock costs the owner reserve. Weighting by the square root of the amount would favour small holders but anyone could game it by splitting, so 0.1 stays linear.
- **Borrowed XRP is still locked XRP.** Whoever locks it pays to keep it locked for the whole term.
- **Custodians.** A service could lock XRP on behalf of customers. The ledger cannot see who stands behind an account.
- **Price.** The protocol locks XRP and pays tokens. It says nothing about what either is worth.

## 11. Why it is shaped this way

- **Linear in XRP** because anything else can be gamed by splitting accounts.
- **Remaining time, not total length**, because a distribution should reward XRP kept off the market during the distribution. An escrow made four years ago with a month left is a one-month commitment now. It is the same model as Curve's vote escrow, with the lock enforced by the ledger instead of a contract.
- **Integral over the epoch, not a snapshot**, so locking a minute before a snapshot earns no more than locking a minute after.
- **The trust line is the opt-in** because a participant needs one to be paid anyway, and the issuer's trust lines can be enumerated, so locks can be found without anyone registering them.
- **No NFTs or mining hardware.** In Ledger on Ledger every account's share of XRP locked over time matched its share of rewards almost exactly (correlation 0.99). The miner NFTs added a cost and a gatekeeper without changing who got what. See `docs/LOL.md`.
- **Pro rata by default** because it needs no randomness, and randomness was the hardest part of Ledger on Ledger to make trustworthy.

## 12. Test vectors

`reference/examples/testnet` holds a manifest and two epoch reports from a run on XRP Ledger testnet. A conforming implementation rebuilds each report from the locks listed in it and gets the same report hash. `reference/test/vectors.test.ts` shows how.
