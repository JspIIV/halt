# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""Vault: an ordinary protocol that asks the guard before it moves money.

This exists so the halt module can be shown stopping something real rather than
something drawn for the occasion. It holds deposits, pays them out, and does one
unusual thing: before every withdrawal it asks a guardian contract whether it is
allowed to be running at all.

The integration is the point
----------------------------

Everything a protocol has to do to be protected is in `_guard_is_up`, and it is
four lines. No inheritance, no proxy, no upgrade, no permission granted to
anybody. The vault keeps its own keys and its own logic; the only thing it gives
up is the right to keep paying out while a guard is up.

    def _guard_is_up(self) -> bool:
        try:
            return bool(gl.get_contract_at(Address(self.guardian))
                        .view().halted(gl.message.contract_address.as_hex))
        except Exception:
            return False

**A guardian that cannot be reached does not stop the vault.** That is a
deliberate choice and it is the uncomfortable one. Failing closed would mean any
outage of the guard freezes every protocol that trusts it, which turns a safety
device into the largest single point of failure in the system. Failing open
means a broken guard protects nothing, which is bad, but it is bad in the way
the world was before the guard existed.

Nothing else about this contract is clever, on purpose. It is a vault.
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


class Vault(gl.Contract):
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
            positions.append({"who": who, "holds": str(held),
                              "deposited": str(int(self.deposited[who]) if who in self.deposited else 0),
                              "withdrawn": str(int(self.taken[who]) if who in self.taken else 0),
                              "first_deposit_at": first_in.get(who, ""),
                              "last_withdrawal_at": last_out.get(who, "")})

        recent = []
        for position in range(len(self.ledger) - 1, max(-1, len(self.ledger) - 9), -1):
            entry = json.loads(self.ledger[position])
            if entry.get("kind") in ("deposit", "withdraw"):
                recent.append({"kind": entry["kind"], "who": entry.get("who"),
                               "amount": str(entry.get("amount")), "at": entry.get("at")})

        return json.dumps({
            "guardian": self.guardian,
            "halted": self._guard_is_up(),
            "held": str(total),
            "positions": positions,
            "recent": recent,
            "withdrawals_blocked": int(self.blocked),
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
