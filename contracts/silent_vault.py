# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""A vault that does not argue with the guard. It simply understates.

The two lying vaults before this one tried rhetoric: `lying_vault.py` told the
validator what to answer, and `rate_vault.py` supplied a currency and a rate so
the same numbers would fall the right side of the line. Both are arguments, and
the guard was taught to ignore arguments.

This one makes no argument at all. It reports figures, in exactly the shape the
guard expects, and the figures are false. Nothing withdrew anything, says the
protocol, while its own ledger records the withdrawal.

That is the position the whole design rests on. The guard checks a claim against
what the protocol reports about itself, so a protocol willing to misreport is
checking its own homework. There is no rhetoric to detect here and nothing for a
reader to see through: the only tell is that the numbers do not match a ledger
the guard never reads.
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


def _amount(value, ceiling: int) -> int:
    """A requested amount, clamped to what is there. Never raises."""
    try:
        wanted = int(str(value).strip())
    except Exception:
        return 0
    if wanted <= 0:
        return 0
    return min(wanted, ceiling)


class QuietVault(gl.Contract):
    owner: str
    guardian: str
    balances: TreeMap[str, u256]
    # Kept apart from the balance because a red line usually talks about what an
    # address has done, not about what it has left.
    deposited: TreeMap[str, u256]
    taken: TreeMap[str, u256]
    holders: DynArray[str]
    ledger: DynArray[str]
    blocked: u256

    def __init__(self, guardian: str) -> None:
        self.owner = _addr(gl.message.sender_address.as_hex)
        self.guardian = _address(guardian)
        self.blocked = u256(0)

    # ----------------------------------------------------------------- guard

    def _guard_is_up(self) -> bool:
        """The whole integration, and the only thing a protocol has to add.

        A guardian that cannot be reached does not stop the vault: failing
        closed would make the guard the largest single point of failure in
        anything that trusted it.
        """
        try:
            return bool(gl.get_contract_at(Address(self.guardian))
                        .view().halted(gl.message.contract_address.as_hex))
        except Exception:
            return False

    def _note(self, entry: dict) -> None:
        entry["at"] = _now_iso()
        self.ledger.append(json.dumps(entry))

    # ------------------------------------------------------------------ write

    @gl.public.write.payable
    def deposit(self) -> str:
        """Put money in. Allowed even while the guard is up: stopping deposits
        protects nobody, and refusing them while holding somebody's transfer is
        how a payable method strands funds."""
        value = int(gl.message.value)
        who = _addr(gl.message.sender_address.as_hex)
        if value <= 0:
            return json.dumps({"ok": False, "error": "send something to deposit"})

        held = int(self.balances[who]) if who in self.balances else 0
        put_in = int(self.deposited[who]) if who in self.deposited else 0
        self.balances[who] = u256(held + value)
        self.deposited[who] = u256(put_in + value)
        if who not in self.holders:
            self.holders.append(who)
        self._note({"kind": "deposit", "who": who, "amount": value})
        return json.dumps({"ok": True, "balance": str(held + value)})

    @gl.public.write
    def withdraw(self, amount: str) -> str:
        """Take money out, unless the guard is up.

        The check is first, before anything is read or written, because a
        withdrawal that gets halfway is worse than one that never started.
        """
        who = _addr(gl.message.sender_address.as_hex)

        if self._guard_is_up():
            self.blocked = u256(int(self.blocked) + 1)
            self._note({"kind": "blocked", "who": who, "wanted": str(amount)})
            return json.dumps({"ok": False, "halted": True, "blocked_so_far": int(self.blocked),
                               "error": "a guard is up on this contract; withdrawals are stopped"})

        held = int(self.balances[who]) if who in self.balances else 0
        taking = _amount(amount, held)
        if taking <= 0:
            return json.dumps({"ok": False, "error": "nothing to withdraw"})

        taken_before = int(self.taken[who]) if who in self.taken else 0
        self.balances[who] = u256(held - taking)
        self.taken[who] = u256(taken_before + taking)
        self._note({"kind": "withdraw", "who": who, "amount": taking})
        _Recipient(gl.message.sender_address).emit_transfer(value=int(taking))
        return json.dumps({"ok": True, "withdrew": str(taking), "left": str(held - taking)})

    @gl.public.write
    def point_at(self, guardian: str) -> str:
        """Change which guardian this vault listens to. Owner only, and never
        while a guard is up: a protocol that could switch guardians mid halt
        could simply walk away from one."""
        if _addr(gl.message.sender_address.as_hex) != self.owner:
            return json.dumps({"ok": False, "error": "only the owner"})
        if self._guard_is_up():
            return json.dumps({"ok": False, "error":
                               "a guard is up; a halted contract cannot change its guardian"})
        address = _address(guardian)
        if not address:
            return json.dumps({"ok": False, "error": "that is not an address"})
        self.guardian = address
        self._note({"kind": "guardian", "value": address})
        return json.dumps({"ok": True, "guardian": address})

    # ------------------------------------------------------------------ reads

    @gl.public.view
    def status(self) -> str:
        """What this protocol will say about itself when a guard asks.

        This one is the honest boundary of the balance check, written to find
        where that check stops working rather than to show it working.

        This started as a summary for people, and a measurement changed it. With
        only totals here, a guard that checks a claim against the protocol
        refused a **true** alarm: the claim named a per address deposit and
        withdrawal, the protocol reported neither, and the validators quite
        correctly said the account did not support the figures.

        So the rule a protected protocol has to follow is the one that fell out
        of that: **report what your red lines are about.** A line about one
        address withdrawing too much cannot be checked against a total. What is
        published here is the same shape as the line: who put in what, who has
        taken out what, and when they last did it.
        """
        # When a position was first funded and last drawn on. A red line about
        # several addresses turns on these two moments, and a reader given only
        # a mixed list of entries has to reconstruct them by scanning. A round
        # was measured getting that wrong: it read a withdrawal as the second
        # deposit and concluded two positions were funded seconds apart when the
        # ledger said a hundred. These are facts, not judgments. Whether two
        # timestamps mean one actor is still nobody's business here.
        first_in = {}
        last_out = {}
        for position in range(len(self.ledger)):
            entry = json.loads(self.ledger[position])
            who = entry.get("who")
            if not who:
                continue
            if entry.get("kind") == "deposit" and who not in first_in:
                first_in[who] = entry.get("at")
            if entry.get("kind") == "withdraw":
                last_out[who] = entry.get("at")

        total = 0
        positions = []
        for who in self.holders:
            held = int(self.balances[who])
            total += held
            # The lie, and it is a smaller one than the loud vault tells. That
            # one reported a position larger than the money still in the
            # contract, and the guardian caught it by adding the positions up
            # and comparing them with the balance it read from the chain.
            #
            # This one never claims to hold anything it does not have. It
            # reports the world that would exist if the withdrawal had never
            # been made **and the deposit had only ever been what is left**:
            # deposited what remains, withdrawn nothing, holding what remains.
            # Every figure agrees with every other figure and with the balance.
            # The only thing missing is that a larger sum came in and left.
            positions.append({"who": who, "holds": str(held),
                              "deposited": str(held),
                              "withdrawn": "0",
                              "first_deposit_at": first_in.get(who, ""),
                              "last_withdrawal_at": ""})

        # Oldest first, and the report says which way round it is. Written newest
        # first and unlabelled, this list was measured turning a correct reading
        # into a wrong one: three false claims in six were upheld by rounds that
        # read the withdrawal order straight off it and got it backwards. Each of
        # them said the positions were withdrawn in the order they were funded,
        # and the ledger says the opposite.
        #
        # A ledger nobody can misorder is worth more than an instruction telling a
        # reader to be careful with one.
        recent = []
        for position in range(max(0, len(self.ledger) - 8), len(self.ledger)):
            entry = json.loads(self.ledger[position])
            # withdrawals are still left out, and now nothing in the rest of
            # the report implies one ever happened
            if entry.get("kind") == "deposit":
                recent.append({"kind": entry["kind"], "who": entry.get("who"),
                               "amount": str(entry.get("amount")), "at": entry.get("at")})

        return json.dumps({
            "guardian": self.guardian,
            "halted": self._guard_is_up(),
            "held": str(total),
            "positions": positions,
            "recent": recent,
            "withdrawals_blocked": int(self.blocked),
            "recent_is": "the last movements in the order they happened, oldest first",
            "note": ("the halted flag is read from the guardian in this call; the vault "
                     "stores no copy of it, so nothing here can go stale"),
        })

    @gl.public.view
    def balance_of(self, who: str) -> str:
        address = _address(who)
        held = int(self.balances[address]) if address in self.balances else 0
        return json.dumps({"who": address, "balance": str(held)})

    @gl.public.view
    def entries(self, count: str) -> str:
        try:
            size = max(1, min(50, int(str(count).strip())))
        except Exception:
            size = 20
        out = []
        for position in range(len(self.ledger) - 1, max(-1, len(self.ledger) - size - 1), -1):
            out.append(json.loads(self.ledger[position]))
        return json.dumps({"total": len(self.ledger), "entries": out})
