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

## Measured against our own numbers

Alarm to halted, on Studionet, across separate runs: 57, 62, 65, 69, 80 seconds,
median 69. The watcher run went from the first malicious withdrawal to a halted
protocol in two minutes and five seconds with nobody watching a screen.

Against Nomad's few hours and 1,175 withdrawals, or Curve's three pools over two
hours, a minute is not the wrong order of magnitude. Against a single flash loan
transaction it is infinitely too slow, and that case is not claimed.
