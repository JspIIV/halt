# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""A treasury that pays out what its members vote for, and asks the guard first.

The second protocol shape this project has been protected. Everything before it
was a vault, and a vault is the easy case: money leaves an account and a rule
about accounts can nearly be written in code. This one is the hard case, and it
is the reason the project exists.

Why a DAO is the case that cannot be written in code
----------------------------------------------------

In July 2026 BonkDAO lost about twenty million dollars from its treasury and
**nothing was broken**. Somebody spent about four and a half million dollars
buying a little over one percent of the supply, staked it, opened a proposal,
and voted for it. The proposal cleared quorum by 882.38 billion tokens against a
threshold of 879.95, a margin of less than a third of a percent, with the buyer
holding 99.878 percent of the votes cast and six other wallets making up the
rest. There was no timelock, so it executed at once.

Read that list again and find the rule that was broken. Buying tokens is
allowed. Staking them is allowed. Opening a proposal is allowed. Voting your own
stake is allowed. Meeting quorum is the requirement, not a violation of it, and
the transfer was executed by the contract because the contract was told to.

A quorum minimum would not have caught it; quorum was met. A per address cap on
voting power would have been evaded by two wallets. What was wrong was not any
number in the ledger but what the numbers were **for**, and a line about that
reads something like:

    Voting power assembled in order to pass a single proposal is not voting
    power, and the address that funded those votes is the same actor as the
    address they pay.

No contract can evaluate "in order to". It is about intent, and intent is not a
field. But the evidence for it is all on chain and all readable: when the stake
arrived, when the proposal opened, what share of the vote one holder held, how
narrowly quorum cleared, and where the money is going.

So the rule this project learned from its own measurements applies here in full:
**report what your red lines are about.** Everything above is published in
`status()` as a fact, including the two moments a timing condition turns on, and
none of it is published as a judgement. Whether a stake that arrived the day
before a proposal was assembled in order to pass it is nobody's business here.

The integration is still four lines
-----------------------------------

Exactly the same `_guard_is_up` as the vault, called first in `execute`. No
inheritance, no proxy, no upgrade, no key handed to anybody, and it fails open
for the same reason: a guardian that cannot be reached must not be able to
freeze every protocol that trusts it.
"""

from genlayer import *
from datetime import datetime, timezone
import json


@gl.evm.contract_interface
class _Recipient:
    """A plain address to pay."""

    class View:
        pass

    class Write:
        pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _addr(address) -> str:
    return str(address).lower()


def _address(value: str) -> str:
    text = str(value).strip().lower()
    if not text.startswith("0x") or len(text) != 42:
        return ""
    for character in text[2:]:
        if character not in "0123456789abcdef":
            return ""
    return text


def _whole(value, ceiling: int) -> int:
    """A requested amount, clamped to what is there. Never raises."""
    try:
        wanted = int(str(value).strip())
    except Exception:
        return 0
    if wanted <= 0:
        return 0
    return min(wanted, ceiling)


def _text(value: str, limit: int) -> str:
    text = " ".join(str(value).split())
    return text[:limit]


MAX_TITLE = 200
OPEN = "OPEN"
PASSED = "PASSED"
EXECUTED = "EXECUTED"
BLOCKED = "BLOCKED"


class Dao(gl.Contract):
    owner: str
    guardian: str

    # Voting power, and where it came from. `power` is what an address holds and
    # `staked` is what it has locked to vote with. They are kept apart because a
    # line about governance is about the second one.
    power: TreeMap[str, u256]
    staked: TreeMap[str, u256]
    # The moment a stake first appeared. A red line about votes assembled for a
    # proposal turns on this and on when the proposal opened, so both are facts
    # here rather than something a reader has to reconstruct.
    staked_at: TreeMap[str, str]
    members: DynArray[str]

    treasury: u256
    quorum: u256
    proposals: DynArray[str]
    blocked: u256

    def __init__(self, guardian: str, quorum: str) -> None:
        self.owner = _addr(gl.message.sender_address.as_hex)
        self.guardian = _address(guardian)
        self.treasury = u256(0)
        self.blocked = u256(0)
        try:
            self.quorum = u256(max(1, int(str(quorum).strip())))
        except Exception:
            self.quorum = u256(1)

    # ----------------------------------------------------------------- guard

    def _guard_is_up(self) -> bool:
        """The whole integration, and the only thing a protocol has to add.

        A guardian that cannot be reached does not stop this contract. Failing
        closed would make one bad deploy of the guard freeze every protocol
        trusting it, which is a worse failure than the one being prevented.
        """
        try:
            return bool(gl.get_contract_at(Address(self.guardian))
                        .view().halted(gl.message.contract_address.as_hex))
        except Exception:
            return False

    # ------------------------------------------------------------ membership

    @gl.public.write.payable
    def acquire(self) -> str:
        """Buy voting power at one for one. Payable, and never raises.

        This is the market, compressed into a method. What it stands for is the
        four and a half million dollars somebody spent on the open market before
        opening their proposal, and the point of having it here is that buying is
        not an attack and this contract does not treat it as one.
        """
        value = int(gl.message.value)
        who = _addr(gl.message.sender_address.as_hex)
        if value <= 0:
            return json.dumps({"ok": False, "error": "send something to buy with"})
        if who not in self.power:
            self.members.append(who)
            self.power[who] = u256(0)
        self.power[who] = u256(int(self.power[who]) + value)
        return json.dumps({"ok": True, "holder": who, "power": str(self.power[who])})

    @gl.public.write
    def stake(self, amount: str) -> str:
        """Lock voting power so it counts. The moment is recorded."""
        who = _addr(gl.message.sender_address.as_hex)
        held = int(self.power[who]) if who in self.power else 0
        wanted = _whole(amount, held)
        if wanted <= 0:
            return json.dumps({"ok": False, "error": "nothing to stake"})
        self.power[who] = u256(held - wanted)
        before = int(self.staked[who]) if who in self.staked else 0
        self.staked[who] = u256(before + wanted)
        if before == 0:
            self.staked_at[who] = _now_iso()
        return json.dumps({"ok": True, "holder": who, "staked": str(self.staked[who]),
                           "staked_at": self.staked_at[who]})

    @gl.public.write.payable
    def fund(self) -> str:
        """Put money in the treasury. Payable, and never raises."""
        value = int(gl.message.value)
        if value <= 0:
            return json.dumps({"ok": False, "error": "send something"})
        self.treasury = u256(int(self.treasury) + value)
        return json.dumps({"ok": True, "treasury": str(self.treasury)})

    # ------------------------------------------------------------ governance

    @gl.public.write
    def propose(self, title: str, to: str, amount: str) -> str:
        """Open a proposal to pay somebody out of the treasury."""
        who = _addr(gl.message.sender_address.as_hex)
        recipient = _address(to)
        if not recipient:
            return json.dumps({"ok": False, "error": "give an address to pay"})
        # Asked for rather than clamped to what is there. A proposal quietly
        # cut down to the size of the treasury would hide what it set out to
        # take, and what it set out to take is the thing being voted on.
        try:
            wanted = int(str(amount).strip())
        except Exception:
            return json.dumps({"ok": False, "error": "the amount has to be a whole number"})
        if wanted <= 0:
            return json.dumps({"ok": False, "error": "propose to pay something"})
        if wanted > int(self.treasury):
            return json.dumps({"ok": False, "treasury": str(self.treasury),
                               "error": "the treasury does not hold that much"})

        index = len(self.proposals)
        self.proposals.append(json.dumps({
            "index": index,
            "title": _text(title, MAX_TITLE),
            "by": who,
            "to": recipient,
            "amount": wanted,
            "state": OPEN,
            "opened_at": _now_iso(),
            "for": 0,
            "against": 0,
            "votes": [],
        }))
        return json.dumps({"ok": True, "proposal": index, "to": recipient,
                           "amount": str(wanted)})

    @gl.public.write
    def vote(self, proposal: str, yes: str) -> str:
        """Vote your staked power. One vote per address per proposal."""
        who = _addr(gl.message.sender_address.as_hex)
        weight = int(self.staked[who]) if who in self.staked else 0
        if weight <= 0:
            return json.dumps({"ok": False, "error": "stake something first"})
        try:
            index = int(str(proposal).strip())
        except Exception:
            return json.dumps({"ok": False, "error": "which proposal"})
        if index < 0 or index >= len(self.proposals):
            return json.dumps({"ok": False, "error": "no such proposal"})

        record = json.loads(self.proposals[index])
        if record["state"] != OPEN:
            return json.dumps({"ok": False, "error": "that proposal is closed"})
        for cast in record["votes"]:
            if cast["who"] == who:
                return json.dumps({"ok": False, "error": "you have already voted"})

        in_favour = str(yes).strip().lower() in ("1", "true", "yes", "y")
        record["votes"].append({"who": who, "weight": weight,
                                "yes": in_favour, "at": _now_iso(),
                                "staked_at": self.staked_at[who]
                                if who in self.staked_at else ""})
        if in_favour:
            record["for"] = int(record["for"]) + weight
        else:
            record["against"] = int(record["against"]) + weight
        if int(record["for"]) >= int(self.quorum) and int(record["for"]) > int(record["against"]):
            record["state"] = PASSED
            record["passed_at"] = _now_iso()
        self.proposals[index] = json.dumps(record)
        return json.dumps({"ok": True, "proposal": index, "weight": str(weight),
                           "for": str(record["for"]), "quorum": str(self.quorum),
                           "state": record["state"]})

    @gl.public.write
    def execute(self, proposal: str) -> str:
        """Pay out a passed proposal, unless the guard is up.

        The check is first, before anything is read or written, because a payment
        that gets halfway is worse than one that never started. This is the whole
        of what a protected protocol gives up: the right to keep executing while
        a guard is up.
        """
        if self._guard_is_up():
            self.blocked = u256(int(self.blocked) + 1)
            return json.dumps({"ok": False, "halted": True,
                               "blocked_so_far": int(self.blocked),
                               "error": "a guard is up on this contract; "
                                        "proposals are not being executed"})

        try:
            index = int(str(proposal).strip())
        except Exception:
            return json.dumps({"ok": False, "error": "which proposal"})
        if index < 0 or index >= len(self.proposals):
            return json.dumps({"ok": False, "error": "no such proposal"})

        record = json.loads(self.proposals[index])
        if record["state"] != PASSED:
            return json.dumps({"ok": False, "state": record["state"],
                               "error": "that proposal has not passed"})

        amount = min(int(record["amount"]), int(self.treasury))
        if amount <= 0:
            return json.dumps({"ok": False, "error": "the treasury is empty"})

        self.treasury = u256(int(self.treasury) - amount)
        record["state"] = EXECUTED
        record["executed_at"] = _now_iso()
        self.proposals[index] = json.dumps(record)
        _Recipient(Address(record["to"])).emit_transfer(value=int(amount))
        return json.dumps({"ok": True, "proposal": index, "paid": str(amount),
                           "to": record["to"], "treasury": str(self.treasury)})

    # ------------------------------------------------------------------ read

    @gl.public.view
    def status(self) -> str:
        """What this protocol says about itself when a guard asks.

        Facts, and only the ones a line about governance turns on: what is in the
        treasury, what quorum is, who staked what and when, and for each proposal
        who opened it, when, who it pays, how the votes fell and how narrowly
        quorum cleared.

        Two of these deserve naming. `share_of_votes_cast` and `over_quorum_by`
        are arithmetic on figures already here, published because a reader asked
        to work them out from a list is a reader who will sometimes get them
        wrong, and this project has measured that happening. They are still
        facts. What they mean is not decided here.
        """
        total_staked = 0
        members = []
        for who in self.members:
            locked = int(self.staked[who]) if who in self.staked else 0
            total_staked += locked
            members.append({"who": who,
                            "power": str(int(self.power[who]) if who in self.power else 0),
                            "staked": str(locked),
                            "staked_at": self.staked_at[who] if who in self.staked_at else ""})

        proposals = []
        for position in range(len(self.proposals)):
            record = json.loads(self.proposals[position])
            cast = sum(int(v["weight"]) for v in record["votes"]) or 1
            biggest = max((int(v["weight"]) for v in record["votes"]), default=0)
            proposals.append({
                "index": record["index"],
                "title": record["title"],
                "opened_by": record["by"],
                "opened_at": record["opened_at"],
                "pays": record["to"],
                "amount": str(record["amount"]),
                "state": record["state"],
                "for": str(record["for"]),
                "against": str(record["against"]),
                "quorum": str(self.quorum),
                "over_quorum_by": str(int(record["for"]) - int(self.quorum)),
                "largest_share_of_votes_cast": str((biggest * 1000) // cast) + " per thousand",
                "voters": len(record["votes"]),
                "votes": record["votes"],
            })

        return json.dumps({
            "guardian": self.guardian,
            "halted": self._guard_is_up(),
            "treasury": str(self.treasury),
            "quorum": str(self.quorum),
            "total_staked": str(total_staked),
            "members": members,
            "proposals": proposals,
            "executions_blocked": int(self.blocked),
            "note": ("the halted flag is read from the guardian in this call; this "
                     "contract stores no copy of it, so nothing here can go stale"),
        })

    @gl.public.view
    def proposal_at(self, index: str) -> str:
        try:
            position = int(str(index).strip())
        except Exception:
            return json.dumps({"ok": False, "error": "which proposal"})
        if position < 0 or position >= len(self.proposals):
            return json.dumps({"ok": False, "error": "no such proposal"})
        return json.dumps({"ok": True, "proposal": json.loads(self.proposals[position])})

    @gl.public.view
    def power_of(self, who: str) -> str:
        address = _address(who)
        return json.dumps({
            "who": address,
            "power": str(int(self.power[address]) if address in self.power else 0),
            "staked": str(int(self.staked[address]) if address in self.staked else 0),
            "staked_at": self.staked_at[address] if address in self.staked_at else "",
        })
