# Testnet run, 2026-11-16

A real run of the calculator on XRP Ledger testnet, kept as test vectors for other implementations.

- Epochs of 60 seconds, `M` of one hour, 1,000 EXA per epoch.
- Alice locked 30 XRP for two hours (full weight). Bob locked 10 XRP for 30 minutes (half weight, falling).
- Carol locked 20 XRP but has no trust line, so she is not a participant. Dave's 90-second lock is shorter than `min_seconds`.

| Epoch | Alice | Bob |
|---|---|---|
| 0 | 861.248838 | 138.751161 |
| 1 | 863.102373 | 136.897626 |

| | Hash |
|---|---|
| Distribution id | `019C3F775C164232DCE072F1B266A089AAF5DC777E8DDE9E3023867FDD8F96F0` |
| `report0.json` | `F9AC61735472DC7D73ACCCA587834529C4BED33E783E3A12880E1AA111CDF78A` |
| `report1.json` | `D5E6E384C58402746EC9716863A78F17466BBAB6AB613ECE32D8C69B4D41FFBC` |

Both epochs were paid on testnet from the pool with the report hash in the memo, and both reports verify against the ledger. Testnet is reset from time to time. After that, the reports can still be checked offline by rebuilding them from the locks they list, which is what `npm test` does.
