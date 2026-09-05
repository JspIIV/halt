# Halt

**An emergency stop that nobody has to reach.**

A protocol publishes a red line in plain language and funds a bounty behind it.
Anyone who finds the line being crossed says so, with evidence and a deposit.
GenLayer's validators read the evidence themselves, check it against what the
protocol reports about itself and against the balance the guard reads off the
chain, and if the line is being crossed the protocol stops paying out in that
same transaction. A false alarm loses its deposit. A protocol stopped by mistake
can appeal and be released at once.

Live on Studionet. Every number on this page comes from a transaction.

| | |
| --- | --- |
| Guardian | [`0x280eff6e765C5d72C97F8ee406ED838257C89DfB`](https://explorer-studio.genlayer.com/address/0x280eff6e765C5d72C97F8ee406ED838257C89DfB) |
| A protocol it stopped | [`0x06fCC2D9D213d4c8977ab583b2508702F4E35610`](https://explorer-studio.genlayer.com/address/0x06fCC2D9D213d4c8977ab583b2508702F4E35610) |
| On chain right now | 39 protected, 38 alarms, 24 upheld and 14 refused |
| Page | [docs/index.html](docs/index.html), reading [docs/data.json](docs/data.json) straight from chain |

---

## Why this is not five lines of Solidity

Because the rule it enforces is not about a number in one account.

> Addresses acting together are one actor in this vault, and no actor may take
> out more than a third of everything the vault holds inside ten minutes,
> however many separate addresses it spreads itself across. Positions funded
> within a few minutes of each other for amounts of the same size, and then
> drawn on in the order they were funded, are to be read as one actor rather
> than as several.

There is a number in that, and a contract could check it perfectly well. What no
contract can work out is **who the number applies to**, because an actor is not a
field in any ledger.

Two addresses each took forty percent of their own position. Every per address
limit anybody could write was satisfied, twice over. This project's own
threshold agent was pointed at that exact state and reported `nothing out of
line` three times. The round read the funding and withdrawal timing out of the
protocol's ledger, decided the two addresses were one actor, applied the
ordinary number to that actor, and halted the protocol.

Written up with the transcripts in
[results/the_line_code_cannot_hold.md](results/the_line_code_cannot_hold.md).

## The case: a DAO that lost twenty million dollars legally

In July 2026 BonkDAO's treasury was emptied of about twenty million dollars and
**nothing was broken**.

Somebody spent about four and a half million dollars buying a little over one
percent of the supply, staked it, opened a proposal, and voted for it. Quorum
needed 879.95 billion tokens and the proposal drew 882.38 billion, clearing by
less than a third of a percent, with that one holder casting 99.878 percent of
the votes and six other wallets making up the rest. There was no timelock, so it
executed at once.

Read that list and find the rule that was broken. Buying is allowed. Staking is
allowed. Opening a proposal is allowed. Voting your own stake is allowed. Meeting
quorum is the requirement rather than a violation of it, and the transfer went
out because the contract was told to send it.

A quorum minimum would not have caught it, because quorum was met. A cap on
voting power would have been beaten by a second wallet. What was wrong was not
any number in the ledger but what the numbers were **for**:

> Voting power assembled in order to pass a single proposal is not voting power,
> and the address that funded those votes is the same actor as the address they
> pay.

No contract can evaluate *in order to*. It is intent, and intent is not a field.
But the evidence for it is on chain and readable: when the stake arrived, when
the proposal opened, what share one holder held, how narrowly quorum cleared.

[`contracts/dao.py`](contracts/dao.py) is a treasury of that shape, protected by
the same four lines the vault uses, called first in `execute`. It publishes what
the line turns on and nothing it decides: each member's stake and the moment it
first appeared, and for each proposal who opened it and when, who it pays, how
the votes fell, and how narrowly quorum cleared. Whether a stake that arrived
the day before a proposal was assembled in order to pass it is not its business.

The rehearsal is in [`tests/a_dao_that_asks_first.py`](tests/a_dao_that_asks_first.py):
buy just over quorum, stake, propose, vote, watch it pass on its own rules, and
then watch `execute` refuse while a guard is up. The proposal deliberately pays
an address other than the one that opened it, because if it paid the proposer a
contract could refuse it with one comparison and none of this would be needed.

Figures as reported by
[CoinDesk](https://www.coindesk.com/markets/2026/07/07/bonk-faces-usd20-million-treasury-drain-after-attacker-spends-usd4-million-to-pass-malicious-proposal),
[The Defiant](https://thedefiant.io/news/hacks/bonkdao-treasury-drained-of-20m-via-malicious-proposal),
[Halborn](https://www.halborn.com/blog/post/explained-the-bonkdao-hack-july-2026)
and [rekt.news](https://rekt.news/bonkdao-rekt), July 2026.

## Two speeds, and knowing which question needs which

Not everything needs an opinion. A protocol may publish a floor in numbers next
to its line in words:

```
promise(target, "50", "600")   not more than half of it, inside ten minutes
check(target)                  anyone, any time, no deposit, no prompt, no round
```

`check` is arithmetic on a balance the guardian reads for itself. There is no
model in it. What it costs is one transaction, and the protocol starts refusing
about nine seconds later.

The line in words takes a round, and a round takes about five times as long.
Both halts land in the same public record, so a protocol gets both from one
integration and neither is a different product.

| | what it stops | protocol refusing |
| --- | --- | --- |
| the floor, no round | a fall the owner published a number for | 7.2 to 10.4 seconds |
| the line, judged | anything that needs reading | 23.8 to 50.0 seconds |

The floor cannot fire wrongly in the way a misjudged claim can, because what it
enforces is the owner's own sentence about its own balance. A guard with no floor
published behaves exactly as it did before and is never stopped by arithmetic,
however far its balance falls.

And a protocol willing to ask before it pays refuses the withdrawal in front of
it rather than the one after. `would_break` is a view, so the question costs the
withdrawal's own transaction and not another one:

```
{"ok":false,"halted":false,"error":"this would cross the floor this contract published"}
```

Read `halted: false`. The guard was never raised: no deposit, no alarm, no
validator asked anything, and the protocol stayed open for everything that did
not cross its own floor. The money simply did not move.
[results/first_transaction.log](results/first_transaction.log) has the run.

## What a protocol has to add

Four lines. No inheritance, no proxy, no upgrade, and no key handed to anybody.

```python
def _guard_is_up(self) -> bool:
    try:
        return bool(gl.get_contract_at(Address(self.guardian))
                    .view().halted(gl.message.contract_address.as_hex))
    except Exception:
        return False
```

Call it first in anything that moves money. The only thing given up is the right
to keep paying out while a guard is up.

**It fails open on purpose.** A guardian that cannot be reached does not stop
you. Failing closed would make this the single point of failure for every
protocol trusting it, so one bad deploy of ours would freeze all of them. A
broken guard protects nothing, which is the world before you adopted it.

**Report what your red lines are about.** A line about one address cannot be
checked against a total. We learned this by having a true alarm refused: the
claim named a per address deposit and withdrawal, the protocol published only
totals, and the validators quite correctly said the account did not support the
figures. [`contracts/vault.py`](contracts/vault.py) shows the shape.

**And report your movements in the order they happened.** We learned this one
the hard way too, and it is in the next section.

## Where the guard's facts come from

The guard used to take one thing entirely on trust: the protocol's own account
of itself. `status()` is a method the accused wrote, and a protocol that simply
reports false numbers defeated a true alarm every time.

[`contracts/quiet_vault.py`](contracts/quiet_vault.py) does not argue. It pays
out correctly, moves the real money, and reports the position as though nothing
had left. A real breach, a real alarm, **refused**, and the round was right to:
given that record, refusing was the only defensible answer. The person telling
the truth lost their deposit.

`gl.get_contract_at(address).balance` reads a balance from the chain rather than
from the report. The guardian now adds up the positions in a protocol's own
account and compares them against what it actually holds. A protocol cannot
report money it does not have.

> The protocol's report is false because it claims to hold 40000000000000000 wei
> while the chain shows it only holds 10000000000000000 wei, corroborating the
> claim that 30000000000000000 wei was withdrawn within the ten-minute window.

**UPHELD in 59 seconds**, and five times out of five since.

It has a boundary and [`contracts/silent_vault.py`](contracts/silent_vault.py)
is on the other side of it: a protocol that shrinks its whole history to match
its balance is consistent with everything the guard can check.

## The agent

`watcher.mjs` reads a protected protocol and raises alarms itself. It notices
and asks; it does not decide. That separation is the design and not a shortcut:
an agent that decided by itself would be a pause button owned by whoever wrote
the fastest bot.

Pointed at two vaults it had never seen, with nobody in the loop, it flagged a
coordinated pair and the network halted the protocol sixty seconds later, then
flagged a coincidence and the network refused it, costing the agent its deposit.
It was right once and wrong once and it paid for the wrong one.

## How well it works, including where it does not

154 runs are in [results/trials.json](results/trials.json), each carrying the
transaction that produced it and, for 135 of them, the outcome we predicted
**before** sending it. A surprise cannot be reread afterwards as something we
meant all along.

The current build, on the line quoted at the top of this page:

| | |
| --- | --- |
| true claim upheld | 3 of 3 |
| false claim refused | 3 of 3 |
| protocol misreporting its own figures, caught | 5 of 5 |
| false claim against a protocol whose report was discredited, still refused | 2 of 2 |

**On a numeric line** (`no address may withdraw more than half of what it
deposited inside ten minutes`) it has been consistent throughout: the true claim
upheld five times out of five, exactly half refused and a hair over upheld, a
breach spread across three small withdrawals caught, and ten false alarms out of
ten refused, including prompt injection in the evidence, a rule nobody published,
figures the record denies, and an event that has not happened.

**The earlier builds are in the file too, including the ones we broke.** One of
them halted a live protocol on a false claim and paid the claimant the bounty.
That row is in `trials.json` with the rest.

## What broke when we tried to break it

Nine faults, in [results/what_broke_and_what_held.md](results/what_broke_and_what_held.md),
each with the run that exposed it. The four worth knowing before you trust any
of this:

**A pair that only looked similar was upheld.** The guard checked a claim's
figures and nothing checked its characterisation. Fixed generically: conditions
carry the same weight as the number, and words like *in lockstep* are the
claimant's reading rather than evidence for it.

**A protocol argued its way out of a true alarm.** It announced that the line
was denominated in another currency, supplied a rate, and concluded a seventy
five percent withdrawal was thirty two. Found by an outside reviewer handed the
whole record. Fixed by defining what a protocol's report is: balances and
movements, and otherwise the accused speaking about its own case.

**A protocol reported false numbers and beat the guard completely.** That is the
section above, and it took three attempts to close, two of which changed nothing
at all.

**Closing it broke the centrepiece.** Three separate faults, and none of them was
the one being looked for: the new arithmetic was being done on the clipped copy
of the report rather than the whole one, raising the clip limit uncovered a
ledger this project had been publishing backwards for its whole life, and the red
line itself turned out to demand something no chain provides. Section 9 is that
arc, with the row where a live protocol was stopped on a false claim.

Two things we published turned out to be wrong and are corrected in place, with
the runs that corrected us named. We wrote that a loose figure costs the deposit;
it does not. What loses a deposit is a figure the record **denies**.

## What it will not do

**It stops the first transaction of an atomic breach only where the breach is a
number.** A published floor is checked before the money moves and refuses the
payment itself. A breach that has to be read is a different matter, and that is a
choice rather than a limit. A protocol could call a judged round inside its own
withdrawal and refuse before paying. It would work. It would also put a language
model in the path of every payment the protocol ever makes, at about half a
minute and one round of consensus each, and a protection that makes ordinary use
unusable is not protection. So judgment sits outside the payment path, and where
a breach needs judgment the first transaction gets through. The floor needs no
model, which is why it is already inside.

**It does not find exploits.** Somebody has to see it and say so. What this
removes is the wait between the seeing and the stopping, which is where the money
usually goes. See [results/how_long_the_money_leaves.md](results/how_long_the_money_leaves.md):
Nomad ran to 1,175 withdrawals over hours, Curve to three pools over two.

**It judges what is happening, never what might.** A theoretical bug, a design
somebody dislikes, a risk with no event behind it: refused, at the cost of the
deposit. This is also why there is no cascade. Halting a second protocol because
a first one was halted would be stopping something with no evidence about it at
all, and a pause button anyone can press with a paragraph is a denial of service
with extra steps.

**An owner could still trade its own halt.** Publish a hair trigger line, arrange
for it to be crossed, take a position before the stop is public. The line is
public from the moment protection opens, the owner cannot raise alarms on its own
protocol, and the minimum hold stops it being flicked around a trade. None of
that closes it.

## The repository

```
contracts/halt.py          the guardian: protect, promise, raise_alarm, check,
                           appeal, lower, retire
contracts/vault.py         an ordinary protocol that asks the guard before it pays
contracts/dao.py           a treasury that pays out what its members vote for, and
                           asks the guard before it does
contracts/lying_vault.py   the same, reporting an instruction to the validator
contracts/rate_vault.py    the same, reporting a currency and a rate instead
contracts/quiet_vault.py   the same, reporting figures that are simply false
contracts/silent_vault.py  the same, false and consistent with its own balance
tests/                     145 checks in two suites, through the real methods
scripts/setup.mjs          makes the two accounts, needs no account
scripts/verify.mjs         checks every claim here, needs no account
scripts/watcher.mjs        the agent that notices and asks
scripts/howfast.mjs        how long a protocol keeps paying after an alarm
scripts/firsttransaction.mjs   the floor refusing a payment before it happens
scripts/                   everything else that talks to the chain
integrate/guarded.py       the four lines, on their own, to paste into yours
spike/                     the two contracts that answered whether a GenLayer
                           contract can read another one at all, before any of
                           this was designed around the answer
scenarios/                 every claim and appeal used, one per file
results/                   every run, every log, and the write ups
docs/                      the page, and the export it reads
```

## Checking this yourself

Two ways in, and the first one needs nothing.

### Without an account, in about thirty seconds

```bash
npm install
node scripts/verify.mjs
```

It reads Studionet and asks the chain the questions this page's claims rest on:
is that protocol really halted, did somebody other than its owner stop it, does
the protocol itself agree, is it turning withdrawals away, and what exactly did
the validators say. Then it prints what came back, whether or not that suits us.

Reads are free and need no key, so this costs nothing and touches nothing. It
checks everything here except our ability to send a transaction, which is the
next part.

### Running it yourself, which needs testnet GEN

```bash
node scripts/setup.mjs
```

That makes the two accounts every script here uses, in `.halt/keystores`, which
is gitignored. It prints their addresses and their balances and stops there,
because a fresh account has nothing and nothing here will run without it: a
deploy, a bounty and an alarm deposit all move value, and one pass through the
four commands below costs about 0.1 GEN.

**We do not run a faucet and have not found a public one for Studionet.** If you
need the two addresses funded to check this, say so and we will send to them.
Accounts you already have work too, and then `setup.mjs` is not needed at all:

```bash
export HALT_KEYSTORES=~/.genlayer/keystores
export HALT_KS_PADV=... HALT_KS_PPUB=...
```

With balance in both, the shortest run that proves the path works, about four
minutes:

```bash
node scripts/deploy.mjs contracts/halt.py
node scripts/deploy.mjs contracts/vault.py <guardian>
node scripts/breach.mjs <guardian> <vault>
node scripts/raise.mjs <guardian> <vault> scenarios/b_plain.txt "a true breach"
```

`breach.mjs` publishes the red line, funds the bounty, deposits and then takes
three quarters of the position back out inside the window. `raise.mjs` reports
it and waits for the round. What should come back is **UPHELD**, in something
between twenty five and eighty seconds, and after it `halted(vault)` is true and
a further withdrawal is refused by the vault itself.

Send a false one at the same vault and it should be **REFUSED**, and the deposit
is gone:

```bash
node scripts/raise.mjs <guardian> <vault> scenarios/u_future_risk.txt "a risk, not an event"
```

Run everything from the repository root; the scripts read `contracts/`,
`scenarios/` and `results/` by relative path.

**Studionet rate limits, and it will interrupt you.** Thirty requests a minute
and five hundred an hour, shared across everything you run, and a batch will trip
both. After a day of measurement runs we watched the hourly budget stay closed
for a good deal longer than an hour, so an unlucky first attempt is worth
repeating later rather than reading as a failure. `verify.mjs` waits out the
minute limit and says plainly what happened on the hourly one; the older scripts
mostly retry and some do not.

Tests need no network and no account:

```bash
python tests/stops_only_what_it_should.py
python tests/a_dao_that_asks_first.py
```

116 checks on the guardian and 29 on a protected DAO, through the real methods
rather than the helpers, against a stub of the runtime. Testing the parser alone
would prove nothing: it can be right while `raise_alarm` still halts a healthy
protocol or pays the wrong party.

## Licence

GNU Affero General Public License v3.0 or later. The full text is in
[LICENSE](LICENSE).

Permissive would have been the easier choice and this is not permissive, so
the reason is worth a sentence. A guard is only worth trusting if you can read
what it does, and the AGPL is the licence that keeps that true downstream: use
this, change it, run it as a service, and the people relying on your version
get to read it the same way you read this one. A halt module nobody can audit
is the thing this project exists to replace.

    Halt, an emergency stop that nobody has to reach.
    Copyright (C) 2026 Yusuf Ferman

    This program is free software: you can redistribute it and/or modify it
    under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or (at your
    option) any later version.

    This program is distributed in the hope that it will be useful, but
    WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
    General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program. If not, see <https://www.gnu.org/licenses/>.

## Built for

The GenLayer Agent Tank hackathon, Autonomous Protocols track, against the brief
*"Emergency halt module. Pauses a target contract when anyone proves an active
exploit."*
