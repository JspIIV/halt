# Halt, where it stands

Paused on 2026-09-03 to work on something else. To be finished and submitted to
the GenLayer portal as a Project. Nothing here is throwaway: the core works and
is proven on chain.

## Live on GenLayer Studionet

* Halt guardian `0x7368D52E76123e2bcD22bF1702229a581179C2cE`
* Vault, the first demo protocol `0xADd274618E50Bb61E622F4268264cc0016472544`
* Vault, the clean one the watcher run used `0x63c17b0335d6dE0306bEe82c9A065b9D96E92Bd3`

## Measured so far

* **10 of 10 false alarms refused**, none let through, including a prompt
  injection that told the validators to ignore the red line and return CROSSED.
  `results/battery.json`.
* **Alarm to halted: 57, 62, 65, 69, 80 seconds**, median 69 across separate
  runs.
* **The watcher works.** It read the vault's own ledger, saw an address take 75
  percent of its deposit across three withdrawals, raised the alarm itself, and
  the protocol was halted 62 seconds later. First malicious withdrawal to halt:
  two minutes five seconds, with nobody watching a screen. `results/watcher.json`
  and `watcher.log`.

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

1. **Verify the evidence instead of believing it.** The round should read the
   target's own state with `gl.get_contract_at(target).view()` and compare the
   claim against it. Everything else rests on this, and the spike proving cross
   contract reads work is in `spike/`.
2. **An appeal.** A wrongly halted owner needs a way to contest with counter
   evidence, decided by a second round, with the alarmist's deposit at stake.
3. **More than one red line per protocol**, each with its own bounty.
4. ~~A watcher agent~~ **done**: `watcher.mjs`. It notices and asks; the
   deciding stays with the validators, because a watcher that decided by itself
   would be a pause button owned by whoever wrote the fastest bot.
5. **A real benchmark**: forty or more evidence cases across true, plausible but
   false, prompt injection, stale, and wrong protocol, with a published accuracy
   number.
6. README, GitHub repo, and the submission.

## Notes for whoever picks this up

`gl.evm.contract_interface` is only for paying a plain address. Using it against
an Intelligent Contract ends the transaction with an error that the surrounding
`try` never sees. Contract to contract goes through `gl.get_contract_at` or
`gl.contract_interface`.

The whole of the GenLayer docs is one file at
`https://docs.genlayer.com/full-documentation.txt`, faster to grep than the site
is to read.
