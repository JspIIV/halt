# Moving to Studio Next, and where it stops

Reviewers on the GenLayer Builders call of 8 September 2026 asked that
submissions use Studio Next rather than the Studio this project was built on,
and said they were considering disabling submissions made on the old one. This
is what happened when we tried. Most of it is reusable by anybody attempting the
same move, and the part that blocks it is not ours to fix.

## What Studio Next is

Not a network of its own. The documentation is explicit: `studio-next.genlayer.com`
is a browser alias, and the canonical target is the Studio development preview.

| | |
| --- | --- |
| RPC | `https://studio-dev.genlayer.com/api` |
| Chain ID | 61997 |
| Explorer | `https://explorer-studio-dev.genlayer.com` |
| SDK preset | `studioDevnet`, in genlayer-js **2.0.0-rc.1** |
| Executor | **v0.3.x**, where the stable Studio runs v0.2.x |

It also carries a warning worth repeating: **state and availability are not
guaranteed across deployments.** It resets.

## Four things that work, and are not obvious

**The stable SDK cannot talk to it.** genlayer-js 1.1.8 builds a transaction the
preview's consensus contract rejects, and the revert carries no reason. The
release candidate gives the same failure a name. So
[`scripts/network.mjs`](../scripts/network.mjs) holds both SDKs side by side,
`genlayer-rc` being 2.0.0-rc.1 installed under another name, and hands out
whichever matches the chosen network.

**It charges for a round, and the amount is not a guess.** A transaction with no
fee reverts with `FeeValueMustBeNonZero`, and an arbitrary value does not fix it
either. Ask the SDK:

```js
const fees = await client.estimateTransactionFees({});
await client.deployContract({ code, args, fees });
```

About 0.1 GEN per transaction, against a policy of `genPerTimeUnit=1`,
`executionBudgetFloor=76548000000000`.

**It funds accounts over the RPC**, which the stable Studio does not: there the
faucet is a button. `sim_fundAccount` is documented as localnet only and the SDK
refuses to call it elsewhere, but the endpoint answers. The amount is in wei, so
asking for `100` buys 100 wei and reads as a faucet that did nothing.

**The receipt only carries the deployed address when you ask the new way.**
`waitForTransactionReceipt({ status: 'FINALIZED' })` is deprecated there and
comes back without one; `waitUntil: 'finalized'` carries `data.contract_address`.
Falling back to `recipient` produced four addresses with no contracts behind
them, which looked like success.

## The runner, and how to find the right one

A contract written for the stable Studio is rejected before it runs:

```
{"status":"contract_error","payload":"invalid_contract runner malformed"}
```

The pinned `py-genlayer:1jb45aa8…` that the documentation uses everywhere is not
accepted, with or without a version line above it. The id Studio Next actually
uses is in its own frontend bundle, next to the example contract it ships:

```
# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
```

With that, the contract is accepted and runs. **Their example deploys, executes
and reads back**, so the environment itself is working.

## The API changed, and the changes are knowable

Read from `genlayerlabs/genvm-executor`, branch `v0.3.x`,
`runners/genlayer-py-std/src/genlayer/__init__.py`, rather than guessed:

| v0.2 | v0.3 |
| --- | --- |
| `from genlayer import *` | `import genlayer as gl` |
| `gl.Contract` | `gl.contract.Contract` |
| `TreeMap`, `DynArray`, `Address`, `u256` | `gl.TreeMap`, `gl.DynArray`, `gl.Address`, `gl.u256` |
| `gl.get_contract_at(a)` | `gl.contract.get_at(a)` |
| a declared interface to pay an address | `gl.contract.get_at(a).emit_transfer(n)` |
| `u256(0)` | `0` |

That last one is the one that bites. In v0.3 `u256` is
`typing.Annotated[int, StaticIntMeta(32, False)]`, so `u256(0)` calls an
annotation and the contract dies with nothing on stderr.
[`scripts/port_to_v03.py`](../scripts/port_to_v03.py) does the mechanical part
and reports what it will not attempt.

**The linter typechecks against the real SDK**, which is how the `u256` change
was found rather than deployed into:

```bash
pip install genvm-linter
genvm-lint typecheck contract.py --json
```

Two notes on it. It needs Python 3.11 or newer, because it calls
`TarFile.extractall(filter=…)`. And its own `validate` step still expects the
v0.2 layout, failing with `No module named 'genlayer.py'`, so on a v0.3 contract
only `typecheck` is usable.

## Where it stops

**A contract with a storage collection does not deploy.** This is sixteen lines,
it typechecks clean against the v0.3 SDK, it imports fine against that SDK
locally, and on Studio Next it is accepted, charged, finalized, and comes back
`execution_result: ERROR` with `exit_code 1` and both stderr and stdout empty:

```python
# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import genlayer as gl


class ProbeB(gl.contract.Contract):
    owner: str
    ledger: gl.DynArray[str]

    def __init__(self, owner: str) -> None:
        self.owner = owner

    @gl.public.view
    def size(self) -> str:
        return str(len(self.ledger))
```

Remove `ledger` and it is their own example, which works. Every contract in this
project keeps a `DynArray` or a `TreeMap`: the alarms, the ledger, the guards.

So the move is written and ready, and it stops one line short of anything this
project could run:

```bash
HALT_NET=studionext node scripts/stand_up.mjs
```

**Until that works, this stays on Studionet**, where the record, the video and
every measurement on the page were made.
