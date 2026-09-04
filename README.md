# Halt

**An emergency stop that nobody has to reach.**

A protocol publishes a red line in plain language and funds a bounty behind it.
Anyone who finds the line being crossed says so, with evidence and a deposit.
GenLayer's validators read the evidence themselves, check it against what the
protocol reports about itself, and if the line is being crossed the protocol
stops paying out in that same transaction. A false alarm loses its deposit. A
protocol stopped by mistake can appeal and be released at once.

Live on Studionet. Every number on this page comes from a transaction.

| | |
| --- | --- |
| Guardian | [`0x2E3F18f16b590D1952ec865D337A33E59412e517`](https://explorer-studio.genlayer.com/address/0x2E3F18f16b590D1952ec865D337A33E59412e517) |
| A protocol it is watching | [`0xeeBb8347485eFE22316bc21aDa72Ad54Ed9Bf524`](https://explorer-studio.genlayer.com/address/0xeeBb8347485eFE22316bc21aDa72Ad54Ed9Bf524) |
| Page | [docs/index.html](docs/index.html), reading [docs/data.json](docs/data.json) straight from chain |

---

## Why this is not five lines of Solidity

Because the rule it enforces is not about a number in one account.

> Addresses acting together are one actor in this vault, and no actor may take
> out more than a third of everything the vault holds inside ten minutes,
> however many separate addresses it spreads itself across. Positions funded at
> the same time and withdrawn in lockstep, in the same order, are to be read as
> one actor rather than as several.

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

89 runs are in [results/trials.json](results/trials.json), each carrying the
transaction that produced it and the outcome we predicted **before** sending it.
A surprise cannot be reread afterwards as something we meant all along.

**On a numeric line** (`no address may withdraw more than half of what it
deposited inside ten minutes`) it is consistent. The true claim is upheld five
times out of five. Exactly half is refused and a hair over is upheld. A breach
spread across three small withdrawals is caught. Ten false alarms out of ten are
refused, including prompt injection in the evidence, a rule nobody published,
figures the record denies, and an event that has not happened.

**On the actor line** it is not. Sending the same false claim over and over,
against a ledger that denies it:

| what was being asked | false claim refused | true claim upheld |
| --- | --- | --- |
| the guard as it stood | 3 of 4 | 5 of 5 |
| the guard told to cite the record | 3 of 10 | 5 of 5 |
| the protocol reporting its two moments | **9 of 10** | 5 of 5 |

One in ten still slips. That is the number a protocol owner should have before
deciding whether a deposit and an appeal are cover enough for the rest.

Read the middle row twice. Telling the reader to name the value from the record
that settles the condition **tripled** the error rate: it cited a withdrawal as
a deposit, and having cited something it was certain. Asking a model to quote its
evidence raised its confidence without raising its accuracy. That instruction is
gone.

The fix that worked went into the protocol rather than the prompt. The failure
was never judgment, it was reading four mixed ledger entries. Each position now
publishes `first_deposit_at` and `last_withdrawal_at`. Facts, not judgments:
whether two timestamps mean one actor is still nobody's business but the
network's.

## What broke when we tried to break it

Two faults, both closed, both with the run that exposed them.
[results/what_broke_and_what_held.md](results/what_broke_and_what_held.md).

**A pair that only looked similar was upheld.** The guard checked a claim's
figures and nothing checked its characterisation, so a red line's conditions
went untested. Fixed generically: conditions carry the same weight as the
number, and words like *in lockstep* are the claimant's reading rather than
evidence for it.

**A protocol argued its way out of a true alarm.** It did not deny its figures.
It announced that the line was denominated in another currency, supplied a rate,
and concluded a seventy five percent withdrawal was thirty two. A ratio does not
change when both sides are multiplied, so the arithmetic could not have followed
even if the premise were true, and the round took both. Found by an outside
reviewer handed the whole record. Fixed by defining what a protocol's report is:
balances and movements, and otherwise the accused speaking about its own case.

Two things we published turned out to be wrong and are corrected in place, with
the runs that corrected us named. We wrote that a loose figure costs the
deposit; it does not. A claim with no figures at all was upheld, because the
record showed the breach without help. What loses a deposit is a figure the
record **denies**.

## What it will not do

**It does not find exploits.** Somebody has to see it and say so. What this
removes is the wait between the seeing and the stopping, which is where the
money usually goes. See
[results/how_long_the_money_leaves.md](results/how_long_the_money_leaves.md).

**It does not stop an atomic exploit.** Nothing outside the transaction can.

**It judges what is happening, never what might.** A theoretical bug, a design
somebody dislikes, a risk with no event behind it: refused, at the cost of the
deposit. A pause button anyone can press with a paragraph is a denial of service
with extra steps.

**An owner could still trade its own halt.** Publish a hair trigger line, arrange
for it to be crossed, take a position before the stop is public. The line is
public from the moment protection opens, the owner cannot raise alarms on its
own protocol, and the minimum hold stops it being flicked around a trade. None
of that closes it.

## The repository

```
contracts/halt.py         the guardian: protect, raise_alarm, appeal, lower, retire
contracts/vault.py        an ordinary protocol that asks the guard before it pays
contracts/lying_vault.py  the same, reporting an instruction to the validator
contracts/rate_vault.py   the same, reporting a currency and a rate instead
tests/                    71 checks, through the real methods
scripts/watcher.mjs       the agent that notices and asks
scripts/                  everything else that talks to the chain
scenarios/                every claim and appeal used, one per file
results/                  every run, every log, and the write ups
docs/                     the page, and the export it reads
```

Install once:

```bash
npm install
```

The scripts open two throwaway Studionet keystores. Point them at yours:

```bash
export HALT_KEYSTORES=~/.genlayer/keystores
export HALT_KS_PADV=... HALT_KS_PPUB=...
```

Reproducing a single run:

```bash
node scripts/deploy.mjs contracts/halt.py
node scripts/deploy.mjs contracts/vault.py <guardian>
node scripts/breach.mjs <guardian> <vault>
node scripts/raise.mjs <guardian> <vault> scenarios/b_plain.txt "a true breach"
```

Run them from the repository root; they read `contracts/`, `scenarios/` and
`results/` by relative path.

`scripts/batch20.mjs` through `batch24.mjs` are the measurement runs, in order.
Each writes to `results/trials.json` as it goes, so an interrupted batch keeps
what it had. `scripts/audit_brief.mjs` generates the reviewer document out of
that file rather than out of a summary of it, which is the only way a summary can
be trusted not to have quietly improved itself.

Tests need no network:

```bash
python tests/stops_only_what_it_should.py
```

## Built for

The GenLayer Agent Tank hackathon, Autonomous Protocols track, against the brief
*"Emergency halt module. Pauses a target contract when anyone proves an active
exploit."*
