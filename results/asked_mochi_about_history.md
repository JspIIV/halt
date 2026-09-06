# Asked GenLayer's own assistant whether a fix exists

`silent_vault.py` defeats the balance check by shrinking its whole reported
history in step with its real balance: understated deposits, no withdrawals
shown, holdings that match what is actually there. Nothing published is
internally inconsistent, so there is nothing for the guard to catch.

Closing that needs a fact about the protocol's **past** that the protocol
itself did not choose to record. Rather than assume GenVM has no way to get
one, we asked Mochi, GenLayer's own community assistant, directly.

## What came back

**First answer** proposed reading GenLayer's own Studio/Asimov explorer through
`gl.nondet.web`, or anchoring a Merkle root of the vault's history on chain,
describing the second as "the Equivalence Principle in action." Both are wrong
in the same direction: an event the vault itself emits is still authored by the
vault, so an append-only log does not stop it being false, only stops it being
edited after the fact. And verifying a hash chain's extension is deterministic
code; it does not need the Equivalence Principle, which exists for validators to
agree on a *nondeterministic* result.

**Pressed on the explorer specifically**, Mochi corrected itself: Studio/Asimov
are indexers reading the same chain data anyone can read, not a source outside
GenLayer's own consensus, so treating explorer output as untamperable would only
move the trust problem, not remove it. Its next suggestion, an external RPC
provider such as Infura, is the same category of thing under a different name.

**Asked directly whether GenVM can read a contract's balance at a past block**,
the way `gl.get_contract_at(address).balance` reads it now, deterministically,
with no web fetch and no third party: no. That primitive does not exist. The
alternatives offered again were an event the vault emits itself, or a
community-run oracle, both of which reintroduce exactly the trust this project
exists to avoid needing.

## The conclusion this earns

Not a gap in this project's design. A platform limit, confirmed by asking rather
than assumed, and published as one in the README rather than left unsaid.
