# Ledger on Ledger: the first run

Ledger on Ledger (LOL) was the first token distributed by locking XRP. It ran on XRP Ledger mainnet from 2025-10-11 to 2026-10-07 and is finished. This page records what it showed and why the protocol in this repo differs from the game that ran it.

## What it was

Players locked XRP in escrows to themselves and got "gas" for it. Gas fuelled miner NFTs, and every block (about every seven minutes) one miner won the block reward, with odds set by the gas it burned that round. A server ran the game and paid winners from a hot wallet.

## The numbers

All lock figures below were checked against the ledger, one escrow at a time.

| | |
|---|---|
| Accounts that locked XRP | 31 |
| Locks | 308 escrows, 3,856 XRP |
| Lock length | median 5 years, the longest the app allowed |
| XRP locked over time | 12,279 XRP-years |

## What it showed

- **The lock works.** Every lock was a native escrow in the owner's own account. No player's XRP was ever at risk, and the locks are still on the ledger, opening on schedule.
- **People choose long locks when long locks pay.** The median player locked for the maximum of five years.
- **XRP locked over time is what decided the outcome.** Across all accounts, each one's share of XRP-years and its share of rewards line up with a correlation of 0.99. The NFTs, the gas and the block lottery did not change who got what by much.
- **It ran a full year on schedule,** from the first block to the end of emission.

## What the protocol changes

| In LOL | The problem | In Proof of Escrow |
|---|---|---|
| Game state lived in a private database | Nobody could check the results | Rewards are a function of ledger data; anyone can rebuild them |
| Locks were credited from what the app reported, after checking only that the transaction existed | Eight escrows whose transactions failed were credited before a fix; the credit was clawed back | Locks are read from ledger state, where failed transactions leave nothing |
| A miner NFT had to be bought to take part | It cost players money and gave one party a gate, without changing the outcome | No NFTs. Locking is the only way in. |
| Weight was gas credited up front | An app-side number nobody else could see | Weight is computed per epoch from the lock itself |
| Each block's winner came from a server seed and a ledger hash the server picked at draw time | Players had to trust the operator not to choose among hashes. About 1.3% of rounds fell back to server-only randomness. | Pro rata payouts need no randomness. The optional draw mode uses a ledger fixed in advance. |
| Rewards came from one hot wallet with its key on the server | It once ran out of fee reserve and payouts failed silently | A pool account, multisigned by independent signers at level 2 |
| The issuer kept its keys | More tokens could be issued at any time | Issuer locked, pool funded in full before the start |
| Winners needed a trust line to be paid | Rewards were won by accounts that could not receive them | The trust line is the opt-in, so nobody is owed what they cannot receive |

LOL's token, site and game are not part of this repo. What it leaves is proof that people will lock XRP for years to take part in a distribution, and the lessons behind most of the rules above.
