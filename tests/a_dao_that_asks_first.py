"""The second protocol shape, through its real methods.

`stops_only_what_it_should.py` tests the guardian. This tests the other side of
the integration on something that is not a vault, because until now everything
this project protected moved money out of an account and a rule about accounts
is nearly writable in code. A treasury that pays out what its members vote for
is the case that is not, and it is the case the guardian exists for.

The governance attack rehearsed at the end is the shape of the one BonkDAO lost
about twenty million dollars to in July 2026: buy a little over quorum, stake it,
open a proposal, vote for it, and have the contract execute exactly what it was
told. Nothing in that sequence breaks a rule, which is why the last check here is
that the contract refuses to execute when the guard is up rather than that it
noticed anything itself.

    python tests/a_dao_that_asks_first.py
"""

import io
import json
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
CONTRACT = os.path.join(HERE, "..", "contracts", "dao.py")


class _Store:
    def __init__(self, kind): self.kind = kind
    def __class_getitem__(cls, item): return cls("map" if isinstance(item, tuple) else "list")
    def make(self): return {} if self.kind == "map" else []


class _Address:
    def __init__(self, hex_value): self.as_hex = hex_value
    def __str__(self): return str(self.as_hex)


class _Message:
    def __init__(self):
        self.sender_address = _Address("0x" + "0" * 40)
        self.contract_address = _Address("0x" + "d" * 40)
        self.value = 0


class _Evm:
    """`contract_interface` is a decorator rather than a call, and paying goes
    through the class it returns."""
    def __init__(self):
        self.transfers = []
        outer = self

        def contract_interface(cls):
            class Bound:
                def __init__(self, address): self.address = str(address).lower()
                def emit_transfer(self, value): outer.transfers.append((self.address, int(value)))
            return Bound
        self.contract_interface = contract_interface


class _Guardian:
    """The guard, answering the one question a protected contract asks it."""
    def __init__(self, gl): self._gl = gl
    def view(self): return self

    def halted(self, target):
        if self._gl.guard_reachable is False:
            raise RuntimeError("no guardian at that address")
        return self._gl.guard_is_up


class _Write:
    def __call__(self, fn): return fn
    def payable(self, fn): return fn


class _PublicNS:
    def __init__(self):
        self.write = _Write()
        self.view = lambda fn: fn


class _GL:
    def __init__(self):
        self.Contract = object
        self.public = _PublicNS()
        self.message = _Message()
        self.evm = _Evm()
        self.guard_is_up = False
        self.guard_reachable = True
        self.get_contract_at = lambda address: _Guardian(self)


def load():
    gl = _GL()
    fake = types.ModuleType("genlayer")
    fake.gl = gl
    fake.DynArray = _Store
    fake.TreeMap = _Store
    fake.u32 = int
    fake.u256 = int
    fake.Address = _Address
    sys.modules["genlayer"] = fake
    module = types.ModuleType("dao_under_test")
    exec(compile(io.open(CONTRACT, encoding="utf-8").read(), CONTRACT, "exec"), module.__dict__)
    return module, gl


def fresh(module, guardian, quorum):
    contract = module.Dao.__new__(module.Dao)
    for field, declared in module.Dao.__annotations__.items():
        if isinstance(declared, _Store):
            setattr(contract, field, declared.make())
    contract.__init__(guardian, quorum)
    return contract


RESULTS = []


def check(label, condition):
    RESULTS.append((label, bool(condition)))
    print(("  ok  " if condition else " FAIL "), label)


GUARDIAN = "0x1111111111111111111111111111111111111111"
FOUNDER = "0x2222222222222222222222222222222222222222"
MEMBER = "0x3333333333333333333333333333333333333333"
ATTACKER = "0x4444444444444444444444444444444444444444"
# Deliberately not the attacker's own address. If the proposal paid the address
# that opened it, a contract could refuse it with one comparison and this whole
# project would be answering a question somebody else had already answered.
POCKET = "0x5555555555555555555555555555555555555555"


def main():
    module, gl = load()

    def as_(address, value=0):
        gl.message.sender_address = _Address(address)
        gl.message.value = value

    print("a treasury that pays out what its members vote for")
    c = fresh(module, GUARDIAN, "1000")
    as_(FOUNDER, 5000)
    check("the treasury takes money", json.loads(c.fund())["ok"])
    as_(FOUNDER, 0)
    check("and refuses an empty payment", not json.loads(c.fund())["ok"])
    as_(MEMBER, 600)
    c.acquire()
    check("voting power is bought", json.loads(c.power_of(MEMBER))["power"] == "600")
    as_(MEMBER)
    staked = json.loads(c.stake("600"))
    check("and staked, with the moment recorded", staked["ok"] and staked["staked_at"])
    check("staking more than you hold takes what you have",
          not json.loads(c.stake("100"))["ok"])

    print("\na proposal needs somewhere to pay and something to pay with")
    as_(MEMBER)
    check("an address that is not one is refused",
          not json.loads(c.propose("pay me", "the treasury", "100"))["ok"])
    check("and more than the treasury holds is refused",
          not json.loads(c.propose("everything", POCKET, "999999"))["ok"])
    first = json.loads(c.propose("a grant", POCKET, "500"))
    check("a real one opens", first["ok"] and first["proposal"] == 0)

    print("\nvoting")
    as_(ATTACKER)
    check("an address with nothing staked cannot vote",
          not json.loads(c.vote("0", "yes"))["ok"])
    as_(MEMBER)
    out = json.loads(c.vote("0", "yes"))
    check("a member votes its stake", out["ok"] and out["weight"] == "600")
    check("600 is under the quorum of 1000, so nothing passes", out["state"] == "OPEN")
    check("and voting twice is refused", not json.loads(c.vote("0", "yes"))["ok"])
    check("an unexecutable proposal is not executed",
          not json.loads(c.execute("0"))["ok"])

    print("\nthe guard, which is the only thing this contract gives up")
    as_(ATTACKER, 900)
    c.acquire()
    as_(ATTACKER)
    c.stake("900")
    as_(ATTACKER)
    passed = json.loads(c.vote("0", "yes"))
    check("1500 clears the quorum and the proposal passes", passed["state"] == "PASSED")

    gl.guard_is_up = True
    gl.evm.transfers.clear()
    as_(MEMBER)
    stopped = json.loads(c.execute("0"))
    check("a passed proposal is not executed while a guard is up",
          not stopped["ok"] and stopped["halted"])
    check("nothing moved", gl.evm.transfers == [])
    check("and the contract counted the refusal", stopped["blocked_so_far"] == 1)
    check("its own report agrees that it is stopped",
          json.loads(c.status())["halted"] is True)

    gl.guard_reachable = False
    as_(MEMBER)
    check("a guardian that cannot be reached does not stop it",
          json.loads(c.execute("0"))["ok"])
    check("and the money went where the proposal said",
          gl.evm.transfers == [(POCKET, 500)])
    gl.guard_reachable = True
    gl.guard_is_up = False
    check("the treasury is 500 lighter", json.loads(c.status())["treasury"] == "4500")
    check("and an executed proposal cannot be executed twice",
          not json.loads(c.execute("0"))["ok"])

    print("\nthe shape BonkDAO lost twenty million dollars to")
    c = fresh(module, GUARDIAN, "1000")
    as_(FOUNDER, 20000)
    c.fund()
    as_(MEMBER, 100)
    c.acquire()
    as_(MEMBER)
    c.stake("100")

    # Bought days later, and only just enough. In the real thing the margin was
    # 882.38 billion against a threshold of 879.95, which is under a third of a
    # percent, and the buyer held 99.878 percent of the votes cast.
    as_(ATTACKER, 1001)
    c.acquire()
    as_(ATTACKER)
    c.stake("1001")
    as_(ATTACKER)
    opened = json.loads(c.propose("Treasury diversification", POCKET, "20000"))
    voted = json.loads(c.vote(str(opened["proposal"]), "yes"))
    check("it passes, on the buyer's own stake alone", voted["state"] == "PASSED")

    report = json.loads(c.status())
    proposal = report["proposals"][opened["proposal"]]
    check("nothing in the contract objected, because nothing was broken",
          proposal["state"] == "PASSED")
    check("the report publishes how narrowly quorum cleared",
          proposal["over_quorum_by"] == "1")
    check("and what share of the votes cast one holder held",
          proposal["largest_share_of_votes_cast"] == "1000 per thousand")
    check("and when that holder's stake first appeared",
          proposal["votes"][0]["staked_at"] != "")
    check("and that the proposal pays somewhere other than the address that opened it",
          proposal["pays"] != proposal["opened_by"])

    gl.guard_is_up = True
    gl.evm.transfers.clear()
    as_(ATTACKER)
    refused = json.loads(c.execute(str(opened["proposal"])))
    check("and with a guard up, the twenty thousand stays where it is",
          not refused["ok"] and gl.evm.transfers == []
          and json.loads(c.status())["treasury"] == "20000")

    failed = [label for label, ok in RESULTS if not ok]
    print()
    if failed:
        print("%d of %d checks failed" % (len(failed), len(RESULTS)))
        return 1
    print("%d checks, through acquire, stake, propose, vote, execute and the views"
          % len(RESULTS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
