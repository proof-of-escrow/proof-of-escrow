# Decentralizing Proof of Escrow

The lock is already as decentralized as the XRP Ledger. It is a native escrow in the owner's own account, and nobody else ever touches it. Everything else is a question of who decides the payouts and who holds the keys that send them.

This page goes through every route we found for taking people out of that loop, what each one trusts, and what exists today. Facts were checked on 2026-11-16.

## The ladder

| Level | Payouts decided by | You trust | Available |
|---|---|---|---|
| 0. Operator | One server and its database | Everything the operator does | What Ledger on Ledger was |
| 1. Verifiable | One payer running the open calculator | The payer to pay. Cheating is provable from the ledger. | Today |
| 2. Federated | k of n independent signers on the pool | That a quorum of named parties will not collude | Today |
| 3. On-ledger | Code the ledger enforces | The ledgers involved | Xahau today, with limits. XRP Ledger not yet. |

## Level 1: verifiable

What this repo gives you. The rules are a pure function of ledger data, the manifest is anchored on-ledger before the start, every payment carries the hash of the report that justifies it, and anyone can rebuild the report.

The payer can still steal the pool or stop paying. What it can no longer do is quietly favour someone, because the ledger shows it.

## Level 2: federated

The pool account's master key is disabled and its SignerList names independent signers (up to 32), with a quorum. Each signer runs its own copy of the calculator against its own ledger server and signs only payments that match its own report. Because the payment list is a deterministic function of the report, every signer builds the same unsigned transactions and the signatures combine without anyone coordinating.

What it takes to be real:

- **Independent signers.** Different people and organizations, on different infrastructure. A SignerList of five keys held by one person is level 1 with extra steps.
- **A quorum that resists both theft and stalling.** With n signers and quorum k, theft needs k colluding and a halt needs n - k + 1 refusing. Something like 5 of 7 is a reasonable start.
- **Locked supply.** The issuer has no usable keys left, so the only tokens that can ever be paid are the ones in the pool.
- **An emission schedule enforced by the ledger (optional).** Token escrows (XLS-85, live since 2026-02-12) can lock each phase of the schedule so it only reaches the pool on time. The issuer needs `asfAllowTrustLineLocking` set before it is locked.

### Running signers on Evernode

Evernode can host the signers as a HotPocket cluster that reads the ledger, agrees on the report, and multisigns. [Blume Bridge](https://github.com/blume-bridge/blume-bridge) already runs this pattern on mainnet for a token bridge.

It removes servers, not parties. Whoever deploys and upgrades the contract still controls it, and hosts have root on the machines. Host concentration is high: in a sample of 500 reward-eligible hosts on 2026-11-04, about half sat on one cloud provider, and the ten largest operators ran 44% of active hosts. Evernode is a good way for one signer to stay online. It is not a substitute for signers held by different people.

## Level 3: on-ledger

### XRP Ledger

Nothing live on XRP Ledger mainnet can both read escrows and pay out tokens on its own:

- **Smart Escrows (XLS-100)** run code that decides whether an escrow can finish. That code can read other ledger entries but cannot send anything, and an escrow's amount and destination are fixed at creation. As of 2026-11-16 the amendment is not in any release and runs only on the WASM devnet.
- **Native smart contracts (XLS-101)** would do the whole job: a contract account can hold tokens, send payments and read any ledger entry. It is a draft spec running on a community test network, with no date. When it ships, this is the end state: the pool becomes a contract and the calculator becomes its code.

### Xahau, today

Xahau can verify an XRP Ledger lock without trusting anyone but the two ledgers:

1. The owner creates the lock on the XRP Ledger with `OperationLimit: 21337`. The XRP Ledger accepts the field on an `EscrowCreate`; we confirmed that on testnet on 2026-11-16.
2. The owner imports a proof of that transaction (an XPOP) into Xahau with an `Import` transaction.
3. A Hook on the distribution's Xahau account fires on the import, loads the original transaction with `xpop_slot`, and checks the owner, amount, `FinishAfter` and the absence of a condition. `xpop_slot` is live on Xahau mainnet.
4. The Hook records the lock in its state and pays rewards on a schedule using `Cron`, and either emitted payments or `Remit`. All of these are live on Xahau mainnet.

The limits:

- **The reward token lives on Xahau,** not the XRP Ledger.
- **Every owner has to produce an XPOP and import it.** No public XPOP service exists today.
- **Each owner needs a Xahau account.**
- **Imports must arrive in sequence order** per account.
- **Every lock that might ever be imported must carry `OperationLimit: 21337` from day one.** That is why section 3.3 of the spec recommends it now.

### Xahau Export, coming

Export ([xahaud PR #880](https://github.com/Xahau/xahaud/pull/880), opened 2026-10-08, not merged) lets a Hook ask the Xahau validators to multisign a transaction on the XRP Ledger, from an XRP Ledger account whose SignerList is the Xahau validator set. Payments are on its list.

That closes the loop entirely on ledgers:

- the lock is on the XRP Ledger,
- the Hook on Xahau verifies it through Import and computes the rewards,
- the reward is an XRP Ledger token paid through Export.

The XRP Ledger pool account would need its master key disabled so only the validators can move it. Export still needs multi-node and testnet runs before it ships.

This is the most promising fully decentralized design for an XRP Ledger token, and the one worth building toward.

### XRPL EVM

A contract on the XRPL EVM sidechain cannot see an escrow on the XRP Ledger:

- **Axelar** attests only payments into its own gateway account.
- **No light client** of the XRP Ledger runs on an EVM chain.
- **No oracle** serves escrow entries.

The EVM can host a different flavour: lock bridged XRP in a timelock contract and earn an ERC-20, all trustless inside the EVM. But the XRP leaves the owner's XRP Ledger account and sits in Axelar's 19-of-28 multisig on the XRP Ledger. That breaks the promise that matters most here: your XRP stays in your wallet. Worth offering only as a separate variant, clearly labelled.

## What "truly decentralized" takes

1. Rules that are a pure function of public ledger data, with at least two independent implementations that agree on test vectors.
2. An issuer that can never issue again, and a pool funded in full before the start.
3. No single key that can move the pool: either a SignerList of independent parties (level 2) or code the ledger enforces (level 3).
4. Locks that any wallet can make, with no app, account or API key in the way.
5. Payouts that keep going if the people who started it walk away: anyone can run a signer, the code is public, and the reports can be rebuilt by anyone.
6. A home for the spec that is not one person's project: a neutral organization, outside implementers, outside signers.
