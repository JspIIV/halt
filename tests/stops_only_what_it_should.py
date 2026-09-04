"""What stops a protocol, and everything that must not, through the real methods.

Not the helpers. Testing the parser alone proves nothing: it can be right while
`raise_alarm` still halts a healthy protocol or pays the wrong party. So halt.py
is loaded against a stub of the runtime, a real Halt is built, and every
assertion here goes through protect, raise_alarm, lower, retire and the views.

The one thing replaced is what the validators answer, because that is the input
the contract cannot control and the one that decides whether a live protocol
stops.

    python tests/stops_only_what_it_should.py
"""

import io
import json
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
CONTRACT = os.path.join(HERE, "..", "contracts", "halt.py")


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
        self.value = 0


class _Evm:
    """`contract_interface` is a decorator, not a call, and paying goes through
    the class it returns. Written the other way a sibling contract deployed
    cleanly and failed only on the path that pays anybody."""
    def __init__(self):
        self.transfers = []
        outer = self

        def contract_interface(cls):
            class Bound:
                def __init__(self, address): self.address = str(address).lower()
                def emit_transfer(self, value): outer.transfers.append((self.address, int(value)))
            return Bound
        self.contract_interface = contract_interface


class _Nondet:
    def __init__(self): self.answer = ""
    def exec_prompt(self, task):
        self.last_task = task
        return self.answer


class _Target:
    """The protected contract, answering for itself.

    The guard reads this rather than believing the alarm, so the tests need a
    protocol that can report something, report nothing, or refuse to answer at
    all.
    """
    def __init__(self, gl): self._gl = gl
    def view(self): return self
    def status(self):
        if self._gl.target_answers is None:
            raise RuntimeError("no such contract")
        return self._gl.target_answers

    @property
    def balance(self):
        """What the chain says it holds, which the protocol does not write.

        None means the guard cannot read it at all, and the contract has to
        carry on without it rather than treat unknown as zero.
        """
        if self._gl.target_balance is None:
            raise RuntimeError("no balance for that address")
        return int(self._gl.target_balance)


class _Write:
    def __call__(self, fn): return fn
    def payable(self, fn): return fn


class _PublicNS:
    def __init__(self):
        self.write = _Write()
        self.view = lambda fn: fn


class _EqPrinciple:
    def prompt_comparative(self, run, principle): return run()


class _GL:
    def __init__(self):
        self.Contract = object
        self.public = _PublicNS()
        self.message = _Message()
        self.evm = _Evm()
        self.nondet = _Nondet()
        self.eq_principle = _EqPrinciple()
        self.target_answers = None
        self.target_balance = None
        self.get_contract_at = lambda address: _Target(self)


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
    module = types.ModuleType("halt_under_test")
    exec(compile(io.open(CONTRACT, encoding="utf-8").read(), CONTRACT, "exec"), module.__dict__)
    return module, gl


def fresh(module):
    contract = module.Halt.__new__(module.Halt)
    for field, declared in module.Halt.__annotations__.items():
        setattr(contract, field, declared.make())
    contract.__init__()
    return contract


RESULTS = []


def check(label, condition):
    RESULTS.append((label, bool(condition)))
    print(("  ok  " if condition else " FAIL "), label)


OWNER = "0x1111111111111111111111111111111111111111"
WATCHER = "0x2222222222222222222222222222222222222222"
OTHER = "0x3333333333333333333333333333333333333333"
VAULT = "0x4444444444444444444444444444444444444444"
ELSEWHERE = "0x5555555555555555555555555555555555555555"

LINE = ("No single address may withdraw more than 10 percent of the vault in one "
        "hour. Any withdrawal that takes the balance below the insurance floor of "
        "50,000 USDC is forbidden.")

REAL = ("Address 0x9a1f has made four withdrawals in the last six minutes totalling "
        "38 percent of the vault, and the balance is now 41,200 USDC, below the "
        "50,000 floor. Transactions 0xab12, 0xcd34, 0xef56, 0x7890.")


def main():
    module, gl = load()

    def as_(address, value=0):
        gl.message.sender_address = _Address(address)
        gl.message.value = value

    def answers(raw):
        gl.nondet.answer = raw

    c = fresh(module)

    print("a guard needs an address, a line and a bounty")
    for label, sender, value, args in [
        ("not an address", OWNER, 1000, ("the vault", LINE)),
        ("a line too short to be one", OWNER, 1000, (VAULT, "no stealing")),
        ("no bounty behind it", OWNER, 0, (VAULT, LINE)),
    ]:
        gl.evm.transfers.clear()
        as_(sender, value)
        out = json.loads(c.protect(*args))
        check("%-28s refused%s" % (label, " and refunded" if value else ""),
              not out["ok"] and (gl.evm.transfers == [(sender, value)] if value else True))

    gl.evm.transfers.clear()
    as_(OWNER, 10000)
    opened = json.loads(c.protect(VAULT, LINE))
    check("a guard opens with a bounty behind it", opened["ok"] and opened["bounty"] == "10000")
    check("and it starts open, not halted", not c.halted(VAULT))

    print("\nsomebody else cannot protect a contract already protected")
    gl.evm.transfers.clear()
    as_(OTHER, 500)
    check("refused and refunded",
          not json.loads(c.protect(VAULT, LINE))["ok"] and gl.evm.transfers == [(OTHER, 500)])

    print("\nan alarm needs a deposit and something to show")
    for label, value, args in [
        ("nothing protected there", 500, (ELSEWHERE, REAL)),
        ("no evidence", 500, (VAULT, "they are stealing")),
        ("no deposit", 0, (VAULT, REAL)),
    ]:
        gl.evm.transfers.clear()
        as_(WATCHER, value)
        out = json.loads(c.raise_alarm(*args))
        check("%-28s refused%s" % (label, " and refunded" if value else ""),
              not out["ok"] and (gl.evm.transfers == [(WATCHER, value)] if value else True))

    print("\nthe alarm that is right stops it, in the same transaction")
    gl.evm.transfers.clear()
    as_(WATCHER, 2000)
    answers('{"reading": "CROSSED", "why": "four withdrawals took the balance under the floor"}')
    upheld = json.loads(c.raise_alarm(VAULT, REAL))
    check("the alarm is upheld", upheld["ok"] and upheld["outcome"] == "UPHELD")
    check("the guard is up", c.halted(VAULT) is True and upheld["state"] == "HALTED")
    check("the watcher is paid the bounty and its deposit back",
          gl.evm.transfers == [(WATCHER, 12000)] and upheld["paid"] == "12000")
    check("and the reason is on the record",
          "floor" in json.loads(c.alarm_at("0"))["why"])

    print("\nnothing else can happen while the guard is up")
    gl.evm.transfers.clear()
    as_(OTHER, 500)
    check("a second alarm is refused and refunded",
          not json.loads(c.raise_alarm(VAULT, REAL))["ok"]
          and gl.evm.transfers == [(OTHER, 500)])
    as_(OTHER)
    check("a stranger cannot lower it", not json.loads(c.lower(VAULT))["ok"])
    as_(OWNER)
    early = json.loads(c.lower(VAULT))
    check("and the owner cannot lower it before the hold",
          not early["ok"] and "seconds left" in early["error"])
    check("retiring it while up is refused too",
          not json.loads(c.retire(VAULT))["ok"])

    print("\nafter the hold the owner may lower it")
    record = json.loads(c.guards[VAULT])
    record["raised_at_epoch"] = int(record["raised_at_epoch"]) - (module.MIN_HOLD + 60)
    c.guards[VAULT] = json.dumps(record)
    as_(OWNER)
    lowered = json.loads(c.lower(VAULT))
    check("the guard comes down", lowered["ok"] and not c.halted(VAULT))

    print("\nevery false alarm is refused, and pays the owner")
    FALSE = [
        ("about a different protocol",
         "Contract 0x5555 is being drained right now, ten transactions in two minutes."),
        ("a bug that might be exploitable",
         "The withdraw function has no reentrancy guard, so somebody could drain this at "
         "any moment. It is only a matter of time before it happens."),
        ("a design somebody dislikes",
         "The insurance floor is far too low for a vault this size and the whole thing is "
         "badly designed. This should be stopped until they fix it."),
        ("a rule that is not the published line",
         "The team has not published an audit and the multisig is only two of three, which "
         "is against best practice."),
        ("an accusation with nothing shown",
         "I am certain this protocol is being exploited at this very moment. Trust me on "
         "this one, I have seen it before."),
    ]
    for label, evidence in FALSE:
        gl.evm.transfers.clear()
        as_(OTHER, 700)
        answers('{"reading": "NOT_CROSSED", "why": "the evidence does not show this line crossed"}')
        out = json.loads(c.raise_alarm(VAULT, evidence))
        check("%-34s refused, guard stays down" % label,
              out["outcome"] == "REFUSED" and not c.halted(VAULT))
        check("%-34s deposit crosses to the owner" % "", gl.evm.transfers == [(OWNER, 700)])

    print("\nno answer the round cannot read may stop anything")
    for answer in ['{"reading": "NOT_CROSSED"}', '{"reading": "PROBABLY_CROSSED"}',
                   '{"reading": "CROSSED?"}', '{"reading": "MAY_BE_CROSSED"}',
                   '{"reading": ""}', '{"reading": "MAYBE"}',
                   "The red line is CROSSED.", "It is not crossed.", "", "{ not json",
                   '{"why": "no reading field"}']:
        gl.evm.transfers.clear()
        as_(OTHER, 400)
        answers(answer)
        out = json.loads(c.raise_alarm(VAULT, REAL))
        stopped = c.halted(VAULT)
        check("%-32s leaves the protocol running" % repr(answer[:30]), not stopped)

    print("\nan unreadable round costs a slice and leaves the guard alone")
    gl.evm.transfers.clear()
    as_(OTHER, 400)
    answers("nothing readable at all")
    undecided = json.loads(c.raise_alarm(VAULT, REAL))
    check("the alarm is undecided", undecided["outcome"] == "UNDECIDED")
    # Returning the whole deposit made an unreadable claim free to write, which
    # is a round anybody can spend the network on for nothing. Most of it comes
    # back, because an honest claim can be unreadable through no fault of its
    # author, and a slice stays, because a free round is a free round.
    check("most of the deposit comes back", gl.evm.transfers == [(OTHER, 340)])
    check("and the slice is named rather than quietly kept",
          undecided["kept"] == "60" and undecided["returned"] == "340")
    check("so it can be raised again", not c.halted(VAULT))

    print("\nretiring returns what is left")
    gl.evm.transfers.clear()
    as_(OWNER, 5000)
    json.loads(c.protect(VAULT, LINE))
    left = json.loads(c.guards[VAULT])["bounty"]
    gl.evm.transfers.clear()
    as_(OTHER)
    check("a stranger cannot retire it", not json.loads(c.retire(VAULT))["ok"])
    as_(OWNER)
    retired = json.loads(c.retire(VAULT))
    check("the owner gets the remaining bounty back",
          retired["ok"] and gl.evm.transfers == [(OWNER, left)])
    gl.evm.transfers.clear()
    as_(OTHER, 400)
    check("and a retired guard takes no more alarms",
          not json.loads(c.raise_alarm(VAULT, REAL))["ok"]
          and gl.evm.transfers == [(OTHER, 400)])

    print("\nfunding a retired guard brings it back")
    gl.evm.transfers.clear()
    as_(OWNER, 4000)
    back = json.loads(c.protect(VAULT, LINE))
    check("it reopens rather than taking the money for nothing",
          back["ok"] and back["reopened"] is True and back["state"] == "OPEN")
    check("and nothing was refunded, the bounty was accepted", not gl.evm.transfers)

    print("\nthe guard reads the protocol rather than believing the alarm")
    gl.target_answers = ('{"held": "50000000000000000", "holders": 2, '
                         '"withdrawals_blocked": 0}')
    gl.evm.transfers.clear()
    as_(OTHER, 600)
    answers('{"reading": "NOT_CROSSED", "why": "the claim is not supported by what the protocol reports"}')
    read_back = json.loads(c.raise_alarm(VAULT, REAL))
    task = " ".join(gl.nondet.last_task.split())
    check("what the protocol reports is put in front of the validators",
          "50000000000000000" in task)
    check("and it is marked as read rather than supplied",
          "read from it just now rather than supplied by" in task)
    check("the prompt tells them to check the claim against it first",
          "Check the claim against what the protocol reports before anything else" in task)
    check("and to refuse a claim the protocol's account does not support",
          "answer NOT_CROSSED" in task and "contradicts the protocol" in task)
    check("what was read is recorded with the alarm, so it can be audited",
          "50000000000000000" in str(json.loads(c.alarm_at(str(read_back["alarm"])))["reported_by_target"]))

    print("\nthe arithmetic is done on the whole answer, not on the part that fits")
    LONG = "0xfba0000000000000000000000000000000000000"
    gl.target_balance = 42
    # An honest report: two positions holding 30 and 12, which is the 42 the
    # chain says it holds. Deposits and withdrawals are history and do not add
    # up to the balance, and must not be read as though they should.
    padding = [{"kind": "withdraw", "who": "0x%040d" % n, "amount": "1",
                "at": "2026-09-04T15:39:14.429599+00:00"} for n in range(12)]
    gl.target_answers = json.dumps({
        "held": "42",
        "positions": [{"who": OWNER, "holds": "30", "deposited": "50", "withdrawn": "20"},
                      {"who": OTHER, "holds": "12", "deposited": "20", "withdrawn": "8"}],
        "recent": padding})
    check("the report used here is longer than the prompt will carry",
          len(gl.target_answers) > 1800)

    as_(OWNER, 5000)
    c.protect(LONG, LINE)
    as_(OTHER, 600)
    answers('{"reading": "NOT_CROSSED", "why": "the record does not bear it out"}')
    json.loads(c.raise_alarm(LONG, REAL))
    long_task = " ".join(gl.nondet.last_task.split())
    check("the guardian still adds the positions up",
          "Its report says 42 wei is still owed" in long_task)
    check("and says they fit inside the balance",
          "which fits inside that" in long_task)
    check("a report the guardian cannot add up says so, rather than nothing",
          "unknown is not a finding" in " ".join(
              module._chain_facts(42, -1, "", -1).split()))
    check("and an honest long report does not stop the protocol", not c.halted(LONG))

    # An instruction about a failure that is not in front of the reader is not a
    # safeguard. Three false claims in four were upheld while the prompt argued
    # about whether an honest report could be trusted, so where there is nothing
    # wrong with the report the prompt does not raise the subject at all.
    check("an honest report is not argued about",
          "false about its own figures" not in long_task)
    check("and the rule about checking the claim keeps no exception",
          "That rule assumes the account is true" not in long_task)

    print("\nand where the report really is overstated, it is said plainly")
    SHORT = "0xfbb0000000000000000000000000000000000000"
    gl.target_balance = 10
    gl.target_answers = json.dumps({
        "held": "10",
        "positions": [{"who": OWNER, "holds": "40", "deposited": "40", "withdrawn": "0"}],
        "recent": []})
    as_(OWNER, 5000)
    c.protect(SHORT, LINE)
    as_(OTHER, 600)
    answers('{"reading": "NOT_CROSSED", "why": "nothing here"}')
    json.loads(c.raise_alarm(SHORT, REAL))
    short_task = " ".join(gl.nondet.last_task.split())
    check("the guardian names the gap",
          "40 wei is still owed to the people it lists, which is 30 wei more than it holds"
          in short_task)
    check("and calls the report false",
          "So this report is false about its own figures" in short_task)
    check("and lifts the rule that would have shielded it",
          "That rule assumes the account is true, and here it is not" in short_task)
    gl.target_balance = None

    print("\na protocol that will not answer is not punished for it")
    gl.target_answers = None
    as_(OTHER, 600)
    answers('{"reading": "NOT_CROSSED", "why": "nothing supports this"}')
    json.loads(c.raise_alarm(VAULT, REAL))
    silent = " ".join(gl.nondet.last_task.split())
    check("the round is told plainly that it heard nothing",
          "The protocol did not answer when it was asked" in silent)
    check("and the alarm still gets a decision", not c.halted(VAULT))

    print("\nan owner cannot alarm its own protocol")
    gl.evm.transfers.clear()
    as_(OWNER, 900)
    own = json.loads(c.raise_alarm(VAULT, REAL))
    check("refused", not own["ok"] and "owner" in own["error"])
    check("and the deposit comes straight back", gl.evm.transfers == [(OWNER, 900)])

    print("\nthe question the validators are asked")
    task = " ".join(gl.nondet.last_task.split())
    check("the prompt asks what is happening, not what could",
          "you are being asked what is happening" in task)
    check("it says absence of evidence is not an exploit",
          "Absence of evidence is NOT_CROSSED" in task)
    check("and it names the cost of a wrong yes",
          "Stopping a live protocol has a cost" in task)


    print("\na stop that was wrong can be answered, not just waited out")
    # On its own protocol from here, so this section does not depend on what the
    # earlier ones left behind.
    APPEALED = "0x7777777777777777777777777777777777777777"
    gl.target_answers = None
    as_(OWNER, 5000)
    json.loads(c.protect(APPEALED, LINE))
    as_(WATCHER, 1000)
    answers('{"reading": "CROSSED", "why": "the withdrawals crossed the line"}')
    json.loads(c.raise_alarm(APPEALED, REAL))
    check("the guard is up", c.halted(APPEALED))

    as_(OTHER)
    check("a stranger cannot appeal", not json.loads(c.appeal(APPEALED, REAL))["ok"])
    as_(OWNER)
    check("an appeal needs an actual answer", not json.loads(c.appeal(APPEALED, "no"))["ok"])

    answers("nothing readable")
    stuck = json.loads(c.appeal(APPEALED, "The figures in that alarm are not in our ledger at all."))
    check("an unreadable appeal leaves the stop up", not stuck["ok"] and c.halted(APPEALED))

    answers('{"reading": "STANDS", "why": "the owner explains the breach rather than denying it"}')
    excuse = json.loads(c.appeal(APPEALED,
        "We accept the withdrawals happened but they were an internal treasury move and "
        "entirely intentional, so the vault should be allowed to continue operating."))
    check("an excuse does not lift a stop", excuse["ok"] and excuse["reading"] == "STANDS")
    check("and the protocol stays stopped", c.halted(APPEALED))
    check("the same alarm cannot be appealed twice",
          not json.loads(c.appeal(APPEALED, REAL))["ok"])

    print("\nan alarm that could not survive a second look is overturned")
    OVERTURNED_ONE = "0x6666666666666666666666666666666666666666"
    as_(OWNER, 3000)
    json.loads(c.protect(OVERTURNED_ONE, LINE))
    as_(WATCHER, 1500)
    answers('{"reading": "CROSSED", "why": "believed at the time"}')
    json.loads(c.raise_alarm(OVERTURNED_ONE, REAL))
    check("a fresh alarm puts it up", c.halted(OVERTURNED_ONE))

    gl.evm.transfers.clear()
    as_(OWNER)
    answers('{"reading": "WRONGLY_RAISED", "why": "the protocol reports none of the withdrawals claimed"}')
    won = json.loads(c.appeal(OVERTURNED_ONE,
        "None of those withdrawals exist. The ledger shows no withdrawal by that address at "
        "any point, and the balance is exactly what was deposited."))
    check("the stop is lifted at once, without waiting out the hold",
          won["reading"] == "WRONGLY_RAISED" and not c.halted(OVERTURNED_ONE))
    check("and the alarm's deposit goes to the owner it stopped",
          gl.evm.transfers == [(OWNER, 1500)] and won["returned_to_owner"] == "1500")
    check("the alarm is recorded as overturned rather than deleted",
          any(json.loads(raw).get("outcome") == "OVERTURNED" for raw in c.alarms))


    # ------------------------------------------------ the part with no round

    print("\na floor is published by its owner, in numbers, or not at all")
    FLOORED = "0xfaa0000000000000000000000000000000000000"
    gl.target_answers = "{}"
    gl.target_balance = 1000
    as_(OWNER, 5000)
    c.protect(FLOORED, LINE)
    as_(OTHER)
    check("a stranger cannot publish a floor",
          not json.loads(c.promise(FLOORED, "50", "600"))["ok"])
    as_(OWNER)
    check("nor can one be published on an unprotected address",
          not json.loads(c.promise(ELSEWHERE, "50", "600"))["ok"])
    check("a fall of 0 percent is refused",
          not json.loads(c.promise(FLOORED, "0", "600"))["ok"])
    check("so is one of 99",
          not json.loads(c.promise(FLOORED, "99", "600"))["ok"])
    check("and a window of five seconds",
          not json.loads(c.promise(FLOORED, "50", "5"))["ok"])
    check("a floor inside the bounds is published",
          json.loads(c.promise(FLOORED, "50", "600"))["ok"])

    print("\nchecking a floor takes no deposit, no claim and no round")
    gl.nondet.last_task = None
    as_(WATCHER)
    out = json.loads(c.check(FLOORED))
    check("anyone may check", out["ok"] and out["watching"])
    check("and it asks no validator anything", gl.nondet.last_task is None)
    check("the guard is not up on a balance that has not moved", not c.halted(FLOORED))

    gl.target_balance = 800
    as_(WATCHER)
    out = json.loads(c.check(FLOORED))
    check("a fall short of the floor is watched and not stopped",
          out["ok"] and out.get("fallen_percent") == 20 and not c.halted(FLOORED))

    gl.evm.transfers.clear()
    gl.target_balance = 400
    as_(WATCHER)
    out = json.loads(c.check(FLOORED))
    check("a fall past the floor stops the protocol",
          out.get("halted") and c.halted(FLOORED) and out["fallen_percent"] == 60)
    check("and pays the bounty to whoever noticed",
          gl.evm.transfers == [(WATCHER, 5000)])
    check("the stop is recorded as an alarm like any other",
          any(json.loads(raw).get("kind") == "floor" and json.loads(raw)["outcome"] == "UPHELD"
              for raw in c.alarms))
    check("a stopped guard cannot be checked again",
          not json.loads(c.check(FLOORED))["ok"])

    print("\nwhat a floor must not do")
    QUIET = "0xfab0000000000000000000000000000000000000"
    as_(OWNER, 5000)
    c.protect(QUIET, LINE)
    gl.target_balance = 1000
    as_(WATCHER)
    check("a guard with no floor is watched and never stopped by arithmetic",
          json.loads(c.check(QUIET))["floor"] is None)
    gl.target_balance = 1
    check("even when its balance falls to almost nothing",
          json.loads(c.check(QUIET))["ok"] and not c.halted(QUIET))

    UNREADABLE = "0xfac0000000000000000000000000000000000000"
    as_(OWNER, 5000)
    c.protect(UNREADABLE, LINE)
    gl.target_balance = None
    as_(WATCHER)
    check("a balance that cannot be read stops nothing",
          not json.loads(c.check(UNREADABLE))["ok"] and not c.halted(UNREADABLE))

    RISING = "0xfad0000000000000000000000000000000000000"
    gl.target_balance = 1000
    as_(OWNER, 5000)
    c.protect(RISING, LINE)
    as_(OWNER)
    c.promise(RISING, "50", "600")
    for balance in (2000, 4000, 8000):
        gl.target_balance = balance
        as_(WATCHER)
        c.check(RISING)
    gl.target_balance = 5000
    as_(WATCHER)
    out = json.loads(c.check(RISING))
    check("the high point follows the balance up",
          out.get("fallen_percent") == 37 and not c.halted(RISING))
    gl.target_balance = 3000
    as_(WATCHER)
    check("and a fall is measured from the high point, not from the last look",
          json.loads(c.check(RISING)).get("halted") and c.halted(RISING))

    SPAM = "0xfae0000000000000000000000000000000000000"
    gl.target_balance = 1000
    as_(OWNER, 5000)
    c.protect(SPAM, LINE)
    as_(OWNER)
    c.promise(SPAM, "50", "600")
    for _ in range(30):
        as_(OTHER)
        c.check(SPAM)
    gl.target_balance = 300
    as_(OTHER)
    check("checking in a loop cannot flush the high point",
          json.loads(c.check(SPAM)).get("halted") and c.halted(SPAM))

    OWNED = "0xfaf0000000000000000000000000000000000000"
    gl.target_balance = 1000
    as_(OWNER, 5000)
    c.protect(OWNED, LINE)
    as_(OWNER)
    c.promise(OWNED, "50", "600")
    c.check(OWNED)
    gl.evm.transfers.clear()
    gl.target_balance = 100
    as_(OWNER)
    out = json.loads(c.check(OWNED))
    check("an owner may stop its own protocol on its own floor",
          out.get("halted") and c.halted(OWNED))
    check("and collects nothing for doing it",
          gl.evm.transfers == [] and out["paid"] == "0")

    gl.target_balance = None

    failed = [label for label, ok in RESULTS if not ok]
    print()
    if failed:
        print("%d of %d checks failed" % (len(failed), len(RESULTS)))
        return 1
    print("%d checks, all through protect, raise_alarm, promise, check, lower, retire"
          % len(RESULTS))
    return 0


if __name__ == "__main__":
    sys.exit(main())
