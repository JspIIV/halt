# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""The whole integration, in one function you paste into your own contract.

Copy `_guard_is_up` into your contract, keep a `guardian` field with the Halt
address in it, and call it first in every method that moves value. That is the
entire adoption cost. No inheritance, no proxy, no upgrade path, no admin key
handed to anybody, and nothing about your contract changes except that it stops
paying out while a guard is up.

    class YourProtocol(gl.Contract):
        guardian: str

        def _guard_is_up(self) -> bool:
            try:
                return bool(gl.get_contract_at(Address(self.guardian))
                            .view().halted(gl.message.contract_address.as_hex))
            except Exception:
                return False

        @gl.public.write
        def withdraw(self, amount: str) -> str:
            if self._guard_is_up():
                return json.dumps({"ok": False, "halted": True})
            ...

Three decisions inside those four lines, and each one could have gone the other
way:

**It fails open.** A guardian that cannot be reached does not stop you. Failing
closed sounds safer and is not: it would make the guard the single point of
failure for every protocol that trusted it, so one bad deploy of ours would
freeze all of them. A broken guard protects nothing, which is exactly the world
before you adopted it.

**It reads live, every time.** Nothing is cached in your contract, so there is
no stale copy to go wrong and no event to miss. The read is synchronous and sees
the guardian as of the current block.

**It is your call where to put it.** This file does not stop you doing anything;
it tells you when a guard is up. Deposits usually stay open while withdrawals
stop, because refusing a payable method that already holds somebody's value is
how funds get stranded.

`GuardedExample` below is a complete, deployable contract that does nothing else,
so the pattern can be read on its own before it is put anywhere important.
"""

from genlayer import *
import json


def _address(value: str) -> str:
    text = str(value).strip().lower()
    if not text.startswith("0x") or len(text) != 42:
        return ""
    for character in text[2:]:
        if character not in "0123456789abcdef":
            return ""
    return text


class GuardedExample(gl.Contract):
    """A contract with one protected action and nothing else in the way."""

    owner: str
    guardian: str
    done: u256
    stopped: u256

    def __init__(self, guardian: str) -> None:
        self.owner = str(gl.message.sender_address.as_hex).lower()
        self.guardian = _address(guardian)
        self.done = u256(0)
        self.stopped = u256(0)

    # ---- the whole integration ------------------------------------------

    def _guard_is_up(self) -> bool:
        try:
            return bool(gl.get_contract_at(Address(self.guardian))
                        .view().halted(gl.message.contract_address.as_hex))
        except Exception:
            return False

    # ---------------------------------------------------------------------

    @gl.public.write
    def do_the_dangerous_thing(self) -> str:
        if self._guard_is_up():
            self.stopped = u256(int(self.stopped) + 1)
            return json.dumps({"ok": False, "halted": True,
                               "error": "a guard is up on this contract"})
        self.done = u256(int(self.done) + 1)
        return json.dumps({"ok": True, "done": int(self.done)})

    @gl.public.view
    def status(self) -> str:
        return json.dumps({
            "guardian": self.guardian,
            "halted": self._guard_is_up(),
            "completed": int(self.done),
            "stopped": int(self.stopped),
        })
