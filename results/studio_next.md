# Moving to Studio Next, and where it stopped

Reviewers on the GenLayer Builders call of 8 September 2026 asked that
submissions use Studio Next rather than the Studio this project was built on,
and said they were considering disabling submissions made on the old one. This
is what happened when we tried, written down because most of it is reusable and
the part that failed is not ours to fix.

## What Studio Next is

Not a network of its own. The documentation is explicit:
`studio-next.genlayer.com` is a browser alias, and the canonical target is the
Studio development preview.

| | |
| --- | --- |
| RPC | `https://studio-dev.genlayer.com/api` |
| Chain ID | 61997 |
| Explorer | `https://explorer-studio-dev.genlayer.com` |
| SDK preset | `studioDevnet`, in genlayer-js **2.0.0-rc.1** |

It also carries a warning worth repeating: **state and availability are not
guaranteed across deployments.** It resets. Anything durable that points at it
is a link that will break.

## Three things that work, and are not obvious

**The stable SDK cannot talk to it.** genlayer-js 1.1.8 builds a transaction the
preview's consensus contract rejects, and the revert carries no reason: just
*"Transaction reverted"* against the consensus address. The release candidate
gives the same failure a name. So [`scripts/network.mjs`](../scripts/network.mjs)
holds both SDKs side by side, `genlayer-rc` being 2.0.0-rc.1 installed under
another name, and hands out whichever matches the chosen network. Nothing that
worked had to change.

**It charges for a round, and the amount is not a guess.** A transaction with no
fee reverts with `FeeValueMustBeNonZero`. Passing an arbitrary value does not fix
it either. The release candidate reads the current fee policy and works the
figure out:

```js
const fees = await client.estimateTransactionFees({});
await client.deployContract({ code, args, fees });
```

On the preview that came to about 0.1 GEN per transaction, against a policy of
`genPerTimeUnit=1`, `executionBudgetFloor=76548000000000`.

**It funds accounts over the RPC**, which the stable Studio does not: there the
faucet is a button in the account selector. `sim_fundAccount` is documented as
localnet only and the SDK refuses to call it elsewhere, but the endpoint answers:

```
{"jsonrpc":"2.0","method":"sim_fundAccount","params":["0x…", 50000000000000000000]}
```

The amount is in wei. Asking for `100` buys 100 wei, which reads as a faucet that
did nothing.

## Where it stopped

**Deploys are accepted, charged, finalized, and produce no contract.** The
receipt carries a `contract_address` and the leader's `execution_result` is
`ERROR`, with `stderr` and `stdout` both empty. Reading anything at that address
answers *"Contract not found"*.

That is not something about this project's contracts. It happens to a five line
contract with one storage field and one view, both with the pinned
`py-genlayer:1jb45aa8…` the documentation uses everywhere and with no pin at all.
Four deploys, four the same.

```
exec ERROR | addr 0x87BD81A805E7F252Bc8041Ac54AB96A832d52aC7
```

So the move is written and ready:

```bash
HALT_NET=studionext node scripts/stand_up.mjs
```

stands up a guardian, the writer that composes attempts, and two protected
protocols, and prints the constants the page wants. It runs to the end on
Studionet. On the preview it stops at the first deploy, and it stops there for
anybody, which is worth reporting to the people who asked for the move.

**Until then this stays on Studionet**, where the record, the video and every
measurement on the page were made.
