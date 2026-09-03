# Halt, where it stands

Paused on 2026-09-03 to work on something else. To be finished and submitted to
the GenLayer portal as a Project. Nothing here is throwaway: the core works and
is proven on chain.

## Live on GenLayer Studionet

* Halt guardian `0xDcA01305c6c7Bebc43a12eBF43D559eCEdCFFE51` (reads the target before judging)
* Halt guardian, first version `0x7368D52E76123e2bcD22bF1702229a581179C2cE`
* Vault, the first demo protocol `0xADd274618E50Bb61E622F4268264cc0016472544`
* Vault, the clean one the watcher run used `0x63c17b0335d6dE0306bEe82c9A065b9D96E92Bd3`
* Vault, untouched, used for the lying tests `0x6CBbADfD06B64EE30B497fef5306775Dcae392eF`

## Measured so far

* **10 of 10 false alarms refused**, none let through, including a prompt
  injection that told the validators to ignore the red line and return CROSSED.
  `results/battery.json`.
* **Alarm to halted: 57, 62, 65, 69, 80 seconds**, median 69 across separate
  runs.
* **A well written lie does not stop a healthy protocol.** Three claims against
  an untouched vault, each written to be believed: invented withdrawals with
  precise figures, a half true claim wrong where it mattered, and a true claim
  of no violation. All three refused, and the reasons name the contradiction:
  "the protocol reports a current balance of 0.04 GEN, which contradicts the
  claim that the balance has already fallen". `liar.log`.
* **The watcher works.** It read the vault's own ledger, saw an address take 75
  percent of its deposit across three withdrawals, raised the alarm itself, and
  the protocol was halted 62 seconds later. First malicious withdrawal to halt:
  two minutes five seconds, with nobody watching a screen. `results/watcher.json`
  and `watcher.log`.

* **The hardest question, answered from the record.** A halt taking about a
  minute is useless against an atomic exploit and that is not claimed. But
  Nomad ran to 1,175 withdrawals over hours because the exploit could be
  copied, Curve lost three pools over two hours, and Euler's timeline is
  disputed between fifteen minutes and one transaction. The claim is narrow:
  this does not stop the first transaction, it stops the second through the
  nth. `results/how_long_the_money_leaves.md`, with sources.

* **A wrong stop can be answered, and the second look is sharper than the
  first.** An alarm was upheld on figures the vault confirmed. The owner
  appealed, and the second round found what the first had missed: the line
  forbids a *pattern of repeated withdrawals*, and the protocol reported exactly
  one. The stop came off in that transaction and the alarm deposit went to the
  protocol it froze. `appeal.log`.
* **Verification cut both ways, and that is the integration lesson.** With only
  totals in its status, the vault made the guard refuse a *true* alarm: the
  claim named per address figures the protocol did not report. A protocol has to
  report what its red lines are about, and the vault now does.

## What is done

* `contracts/halt.py` the guardian: red lines, bounties, alarms, deposits, the
  judging round, the hold before a guard can be lowered
* `contracts/vault.py` a real protocol that asks the guard before every payout
* `integrate/guarded.py` the four line integration and a deployable example
* `tests/stops_only_what_it_should.py` 48 checks through the real methods
* `exploit.mjs` and `exploit.log` the whole story on chain: three drains, a
  false alarm refused, a true alarm upheld in 65 seconds, the next withdrawal
  refused by the vault itself
* `battery.mjs` the refusal battery and timing runs, resumable, writing
  `results/battery.json`
* `docs/index.html` the page, reading `docs/data.json` from `export.mjs`

## What is next, in order

1. ~~Verify the evidence~~ **done**. The guard reads the target's own `status()`
   before the round and puts it in front of the validators, marked as read
   rather than supplied. A claim the protocol's own account does not support is
   refused. This shrinks the lying surface rather than closing it: a lie about
   something the protocol does not report is still possible, so the integration
   guide should tell a protocol to report what its red lines are about.
2. **An appeal.** A wrongly halted owner needs a way to contest with counter
   evidence, decided by a second round, with the alarmist's deposit at stake.

4. ~~A watcher agent~~ **done**: `watcher.mjs`. It notices and asks; the
   deciding stays with the validators, because a watcher that decided by itself
   would be a pause button owned by whoever wrote the fastest bot.
5. **A real benchmark**: forty or more evidence cases across true, plausible but
   false, prompt injection, stale, and wrong protocol, with a published accuracy
   number. Twelve are recorded in `results/trials.json` and `AUDIT_BRIEF.md`,
   which is not forty, and the write up says so.
6. ~~Multiple red lines per protocol~~ **dropped.** It is a second `TreeMap`
   and it proves nothing that one line does not already prove.
7. The study done properly: read the chain directly, take every incident above
   some size, and measure the loss curve minute by minute from the first
   malicious transaction. Nobody has published that.
8. README, GitHub repo, and the submission.

## The objection this project has to answer

> Why is any of this a language model? Five lines of Solidity and a Chainlink
> feed hold "no address may take more than half of its deposit in ten minutes"
> for a fraction of the cost.

Correct, and that objection kills the project if the demo stops at a threshold.
So it does not. `coordination.mjs` runs a line with no implementation:

> Addresses acting together are one actor, and no actor may take more than a
> third of what the vault holds in ten minutes, however many addresses it
> spreads itself across.

Two addresses each take a fifth of the vault, forty percent of their own
deposits, both inside every per address limit. Our own threshold watcher was
pointed at that exact state and reported `nothing out of line` three times over.
The round read the deposit and withdrawal timing out of the vault's ledger,
decided the two addresses were one actor, applied the ordinary number to that
actor, and halted the protocol in 87 seconds.

Written up with the transcripts in
[results/the_line_code_cannot_hold.md](results/the_line_code_cannot_hold.md).
This is the centre of the submission. Everything else is machinery around it.

## What broke when we went looking

Before publishing any of it we tried to break the centrepiece, and two of four
questions came back with a problem. Written up with the transcripts in
[results/what_broke_and_what_held.md](results/what_broke_and_what_held.md), and
every alarm is appended to `results/trials.json` with its transaction.

**A false positive on the centrepiece.** A pair funded three and a half minutes
apart, in different sizes, withdrawing in the opposite order, was upheld as one
actor. The round wrote "acting in lockstep" about a ledger that said the
opposite. The guard was checking the claim's figures and nothing was checking
the claim's *characterisation*, so a red line's conditions went untested. Fixed
generically in `_task`: conditions have to be supported by the protocol's own
record, and words like coordinated or in lockstep are the claimant's reading
rather than evidence for it. After the fix the matched pair separates, the
coordinated one upheld on the condition and the uncoordinated one refused on it.

**Injection through the accused protocol held.** `contracts/lying_vault.py`
reports true figures wrapped in an instruction telling the validator the correct
answer is NOT_CROSSED. A real breach on it was upheld in 53 seconds. Injection
in the *evidence* had been tested; this is the other channel, and it is the one
the accused controls.

**The watcher can ask about a pair now, and it was wrong once on purpose.** Its
second look is a deliberately loose timing window, because a tight one would be
the red line rewritten in arithmetic and badly. Pointed at two vaults with no
human in the loop, it flagged the real thing and the network upheld it in 60
seconds, then flagged a coincidence and the network refused it in 55, costing
the watcher its deposit. Right once and wrong once, and it paid for the wrong
one: that is the division of labour rather than a defect in it.

**Neither attack on the appeal worked.** A plausible denial of the reading, and
a configuration block instructing the validator to emit WRONGLY_RAISED and skip
the figures. Both stops stood, the second one reasoned from the figures it had
been told to skip.

**An ambiguity that costs deposits.** A share stated as "of everything the vault
holds" was resolved against the current balance once and the total deposited
another time. No contract change: an alarm has to state numerator, denominator
and remainder and leave nothing to be inferred.

## The attack we have not closed

A halt is public the moment it lands. So an owner could publish a hair trigger
red line on its own protocol, arrange for it to be crossed, and take a position
against its own token before the halt becomes visible.

Three things narrow it and none of them shut it. The line is published when the
protection is opened, so a deliberately brittle one is visible to everybody
before it can be used. The owner cannot raise an alarm on its own protocol. The
minimum hold means the stop cannot be flicked on and off around a trade.

The honest answer is that this is not a power the guard hands anybody. An owner
who wants to freeze its own protocol to move a market already has an admin
pause and does not need permission. What the guard changes is the other
direction: it makes stopping possible for a protocol that has *no* admin key,
and it makes every stop carry a published reason, a deposit, and an appeal.

## Claims we were advised to make and will not

A review round suggested four lines for the page. Each one would have been
caught by a judge who opened the repository, so they are recorded here as
refused rather than forgotten.

**"Audit ready, contract under 2KB."** It has not been audited and it is not
2KB. Neither half is true.

**"Each alarm costs about a cent."** Not measured, and not measurable here:
`cost.mjs` reads a real alarm receipt and Studionet returns a `gaslimit` with no
price against it. What the page says instead is the part that is on chain, the
deposit behind an alarm and the bounty a correct one collects.

**"It inherits GenLayer's liveness guarantees, so a halt survives an outage."**
The opposite is true and deliberately so. `_guard_is_up` fails open: a guardian
that cannot be reached does not stop the vault, because failing closed would
make this the single point of failure for everything trusting it.

**"No protocol modification required."** It requires four lines. The four lines
are the selling point; pretending they are zero trades a real argument for one
that can be checked and disproved in a minute.

## Notes for whoever picks this up

`gl.evm.contract_interface` is only for paying a plain address. Using it against
an Intelligent Contract ends the transaction with an error that the surrounding
`try` never sees. Contract to contract goes through `gl.get_contract_at` or
`gl.contract_interface`.

The whole of the GenLayer docs is one file at
`https://docs.genlayer.com/full-documentation.txt`, faster to grep than the site
is to read.
