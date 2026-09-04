# How long does the money actually take to leave?

The hardest question anyone asks about this project is the fair one: **a halt
that takes about a minute is useless, because exploits are instant.**

Half of that is true. So here is what the record says, from published
post-mortems rather than from memory, with the sources attached and the
disagreements left in.

## What is being asked

Not "how long did the incident last" and not "when was it discovered". The
question is narrower: **after the first malicious transaction, how much of the
loss was still ahead?** That is the only window anything external can act in,
and it is the window this project claims.

## Three incidents where the answer is most of it

**Nomad Bridge, 1 August 2022, about $190M.** The first exploit transaction
landed at 21:32:31 UTC. What followed was not one attacker: the exploit could be
replayed by copying a successful transaction and swapping in your own address,
and hundreds of addresses did. The incident ran to **960 transactions and 1,175
separate withdrawals over a few hours**, ending with the bridge holding $16.5k.
The first transaction took a small share of it. Everything after the first
minute was copycats.

**Curve Finance, 30 July 2023, about $70M.** The pETH/ETH pool went first at
13:10 UTC. **The next two pools, msETH/ETH and alETH/ETH, were exploited over
the following couple of hours.** Each pool was a separate contract and a
separate decision to keep going.

**Euler Finance, 13 March 2023, about $197M.** The exploit contract was deployed
at 08:50:23 UTC. Sources disagree on the shape of what followed: some describe
roughly **fifteen minutes**, others a single large flash loan transaction. That
disagreement is left here rather than resolved, because resolving it from
secondary sources would be inventing precision.

## The part that cannot be claimed

**An atomic exploit is untouchable.** A flash loan attack that borrows, drains
and repays inside one transaction is over before any external system has seen
it. Not this, not a multisig, not an off-chain monitor, not a human. Any project
claiming otherwise is claiming something the ordering of a block does not allow.

So the honest sentence is: **this does not stop the first transaction. It stops
the second through the nth**, and in the incidents above that is where most of
the money went.

## What this is not

A comprehensive study. Three incidents, taken from published write ups, chosen
because their timelines are documented in enough detail to answer the question.
A real version of this would read the chain directly, take every incident above
some size, and measure the loss curve minute by minute from the first malicious
transaction. That is the study nobody has published, and it is the one worth
doing next.

## Sources

* [Immunefi, Hack Analysis: Nomad Bridge, August 2022](https://medium.com/immunefi/hack-analysis-nomad-bridge-august-2022-5aa63d53814a)
* [Halborn, The Nomad Bridge Hack: A Deeper Dive](https://www.halborn.com/blog/post/the-nomad-bridge-hack-a-deeper-dive)
* [ChainLight, Curve Finance Analysis and Post-mortem](https://medium.com/chainlight/curve-finance-analysis-and-post-mortem-ba55f2b26909)
* [Hacken, Curve Finance Liquidity Pools Hack Explained](https://hacken.io/discover/curve-finance-liquidity-pools-hack-explained/)
* [BlockSec, Euler Finance Incident](https://blocksec.com/blog/euler-finance-incident-the-largest-hack-of-2023)
* [Coinbase, Euler Compromise Investigation, Part 1](https://www.coinbase.com/blog/euler-compromise-investigation-part-1-the-exploit)

## Measured against our own numbers, after we found we had measured it wrong

The figure this document used to carry was **57, 62, 65, 69, 80 seconds, median
69**, and it was the answer to a question nobody asks.

It was measured to FINALIZED, by the same script that sent the transaction,
polling every six seconds. A protected protocol does not wait for finalisation.
It reads the guard with `view()`, whose default state is the latest non final
one, so it starts refusing when the round decides. The number that matters is
the one a depositor would feel: **how long does the protocol keep paying out
after somebody raises the alarm.**

`scripts/howfast.mjs` sends an alarm and then does nothing but ask, several times
a second, whether the protocol has started refusing. Each run gets its own vault.

| | protocol refusing | finalised |
| --- | --- | --- |
| the judged line, five runs | 23.8, 25.7, 40.8, 44.5, 50.0 | 52.6 to 77.5 |
| the published floor, four runs | 7.2, 8.9, 9.0, 10.4 | 34.8 to 37.9 |

Two thirds of what we had been publishing was a wait nothing was waiting for.

The floor is the path with no round in it: no prompt, no model, no deposit, just
a balance the guardian reads for itself and a number its owner published. It
lands inside a single Ethereum block time. The judged line is four to five times
slower, and that is the price of asking a question a contract cannot answer.

**One caution about the judged figures.** They range from 23.8 to 50.0 seconds
across five runs on a network that spent the day returning HTML error pages
instead of RPC replies. A single earlier observation on a different build came
in at 16.9 seconds. Five runs on a bad day is a range, not a median worth
quoting to one decimal place, and it is published as a range for that reason.

## What that changes about the argument

Nothing, and it is worth saying why not.

Against Nomad's few hours and 1,175 withdrawals, or Curve's three pools over two
hours, forty seconds and seventy seconds are the same answer. The correction
matters for honesty rather than for the case: we were publishing a number that
described our own polling loop and calling it the speed of the system.

Against a single flash loan transaction, both are infinitely too slow, and that
case is still not claimed. What can now be said precisely is which half of the
problem sits on which side of the line. A velocity floor needs no judgment, runs
in one transaction with no model in it, and could be called from inside a
withdrawal by a protocol willing to pay one cross contract call. A red line about
who an actor is cannot, unless a protocol is willing to put a consensus round in
the path of every payment it ever makes.
