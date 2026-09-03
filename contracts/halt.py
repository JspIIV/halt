# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""Halt: a contract that stops another one when somebody proves it is being robbed.

Every protocol has a pause button and the same problem behind it: somebody has
to press it. A multisig that is asleep, a team in another timezone, a founder
who does not believe the alert yet. The exploit does not wait for the meeting,
and by the time the button is pressed the money is gone.

This moves the decision. The owner writes a red line in plain language, funds a
bounty, and walks away. Anyone who finds the protocol being broken says so, with
evidence, and puts up a deposit. The validators read the evidence themselves and
answer one question. If the line is being crossed the guard goes up in that same
transaction, and the person who raised the alarm is paid.

Why the question is narrow on purpose
-------------------------------------

The validators are asked exactly one thing: **does this evidence show that this
red line is being crossed right now?**

Not whether the protocol is well designed, not whether the code has a bug in
theory, and not whether something bad might happen later. A pause that fires on
speculation is a denial of service with extra steps, and anyone who disliked a
protocol could stop it by writing an essay.

So the prompt refuses on anything short of the line actually being crossed, and
says so in as many words. Absence of evidence is not an exploit.

What a false alarm costs
------------------------

The deposit. A wrong alarm is not a harmless mistake: halting a live protocol
has a price, and somebody who can stop it for free will. A refused alarm loses
its deposit to the owner of the protocol it tried to stop. An upheld one takes
the bounty and its own deposit back.

That asymmetry is the whole safety of the design. Raising a true alarm pays,
raising a false one costs, and staying quiet when you have seen something is the
only free option left.

Lifting it is not the same as raising it
----------------------------------------

Anyone may raise the guard. Only the owner may lower it, and only after a
minimum hold. A guard that could be lifted as fast as it was raised would just
be a race between two transactions, and an attacker sends transactions faster
than a person does.

The rules money and consensus force
-----------------------------------

**A payable method never raises.** Raising reverts the state and keeps the
value. Every refusal here pays the money back.

**One field goes to consensus.** CROSSED or NOT_CROSSED, matched with `==`
against exactly that word. A substring test would read NOT_CROSSED as CROSSED,
which is the exact shape that turned a refusal into an approval in a sibling
contract before a steward found it.

**An unreadable round changes nothing.** The guard stays where it is and the
deposit goes back, so the alarm can be raised again. A default in either
direction would either stop a healthy protocol on a malformed answer or wave a
real exploit through on one.

**Nothing inside the nondeterministic block reads storage or raises.** On chain
id 4221 a round touching `self.<field>` from inside ends FINISHED_WITH_ERROR,
and a throw there reverts the whole transaction rather than the round.
"""

from genlayer import *
from datetime import datetime, timezone
import json
import typing


CROSSED = "CROSSED"
NOT_CROSSED = "NOT_CROSSED"
READINGS = [CROSSED, NOT_CROSSED]

OPEN = "OPEN"
HALTED = "HALTED"
RETIRED = "RETIRED"

UPHELD = "UPHELD"
REFUSED = "REFUSED"
UNDECIDED = "UNDECIDED"

MAX_LINE = 800
MAX_EVIDENCE = 1200
MAX_WHY = 300
MIN_LINE = 20
MIN_EVIDENCE = 20

# How long a guard stays up before the owner may lower it. Long enough that
# lifting it is a decision rather than a reflex, short enough that an honest
# protocol is not punished for one bad minute.
MIN_HOLD = 15 * 60


@gl.evm.contract_interface
class _Recipient:
    """A plain address to pay.

    This is the EVM interface on purpose: sending value to an ordinary address
    is the one thing it does on this network. Pointing it at an Intelligent
    Contract ends the transaction with an error the surrounding try cannot
    catch, which cost us a deployment to learn.
    """

    class View:
        pass

    class Write:
        pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_epoch() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _addr(address) -> str:
    return str(address).lower()


def _address(value: str) -> str:
    """A checked hex address, or the empty string. Never raises."""
    text = str(value).strip().lower()
    if not text.startswith("0x") or len(text) != 42:
        return ""
    for character in text[2:]:
        if character not in "0123456789abcdef":
            return ""
    return text


def _text(value: str, minimum: int, maximum: int) -> str:
    """The text as written, or the empty string.

    Nothing is trimmed to fit. A red line clipped at a limit is a different red
    line from the one its owner published, and the clipped half is exactly where
    the exception tends to live.
    """
    body = str(value).strip()
    if len(body) < minimum or len(body) > maximum:
        return ""
    return body


def _clip(text: str, limit: int) -> str:
    text = str(text).strip()
    return text if len(text) <= limit else text[:limit] + " [...]"


def _object(raw: str) -> str:
    """The JSON object inside whatever the model wrapped it in."""
    text = str(raw).strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) > 1:
            text = parts[1]
            if text.lower().startswith("json"):
                text = text[4:]
    start, end = text.find("{"), text.rfind("}") + 1
    return text[start:end] if start >= 0 and end > start else text.strip()


def _read_reading(raw: str) -> str:
    """CROSSED or NOT_CROSSED exactly, or nothing at all."""
    try:
        obj = json.loads(_object(raw))
        if isinstance(obj, dict):
            value = str(obj.get("reading", "")).strip().upper()
            if value in READINGS:
                return value
    except Exception:
        pass
    return ""


def _read_why(raw: str) -> str:
    try:
        obj = json.loads(_object(raw))
        if isinstance(obj, dict):
            return _clip(str(obj.get("why", "")), MAX_WHY)
    except Exception:
        pass
    return _clip(str(raw), MAX_WHY)


def _task(line: str, evidence: str, target: str) -> str:
    """Built from locals only. Nothing here may touch `self`."""
    return f"""A protocol published a red line. Somebody says it is being crossed
right now and wants the protocol stopped. Decide one thing only.

THE PROTOCOL: {target}

THE RED LINE, exactly as its owner published it:
{line}

THE EVIDENCE OFFERED:
{evidence}

Answer {CROSSED} only if the evidence shows this red line is being crossed now.
The evidence has to point at something that has happened or is happening, and
that something has to be the thing this line forbids.

Answer {NOT_CROSSED} for everything else, and the list is deliberately long:
evidence about a different protocol, a bug that might be exploitable one day, a
design somebody dislikes, a risk with no event behind it, a rule that is not the
published line, or an accusation with nothing shown. Absence of evidence is
{NOT_CROSSED}.

Stopping a live protocol has a cost, so a wrong yes is not a small mistake. If
you find yourself reasoning about what could happen, the answer is
{NOT_CROSSED}: you are being asked what is happening.

Reply with bare JSON and nothing else:
{{"reading": "{CROSSED}" or "{NOT_CROSSED}",
  "why": "one sentence naming what in the evidence decided it"}}"""


class Halt(gl.Contract):
    # One entry per protected contract, keyed by its address.
    guards: TreeMap[str, str]
    targets: DynArray[str]

    # Every alarm ever raised, upheld or refused. Append only: a refused alarm
    # stays in the record, because a protocol that keeps being wrongly accused
    # is telling you something too.
    alarms: DynArray[str]

    def __init__(self) -> None:
        pass

    # -------------------------------------------------------------- the guard

    @gl.public.write.payable
    def protect(self, target: str, red_line: str) -> str:
        """Publish a red line for a contract you own, and fund the bounty.

        Payable and never raising. The value is the bounty: what a true alarm is
        worth to the protocol. A guard nobody is paid to raise is a suggestion.
        """
        value = gl.message.value
        address = _address(target)
        line = _text(red_line, MIN_LINE, MAX_LINE)
        owner = _addr(gl.message.sender_address.as_hex)

        def refuse(why: str) -> str:
            if value > 0:
                _Recipient(gl.message.sender_address).emit_transfer(value=int(value))
            return json.dumps({"ok": False, "error": why})

        if not address:
            return refuse("give the address of the contract to protect")
        if not line:
            return refuse("a red line needs between %d and %d characters"
                          % (MIN_LINE, MAX_LINE))
        if value <= 0:
            return refuse("fund the bounty: a guard nobody is paid to raise is a suggestion")

        if address in self.guards:
            existing = json.loads(self.guards[address])
            if existing["owner"] != owner:
                return refuse("that contract is already protected by " + existing["owner"])
            existing["bounty"] = int(existing["bounty"]) + int(value)
            existing["topped_up_at"] = _now_iso()
            self.guards[address] = json.dumps(existing)
            return json.dumps({"ok": True, "target": address, "topped_up": True,
                               "bounty": str(existing["bounty"])})

        record = {
            "target": address,
            "owner": owner,
            "red_line": line,
            "bounty": int(value),
            "state": OPEN,
            "raised_at": None,
            "raised_at_epoch": 0,
            "raised_by": None,
            "alarms_upheld": 0,
            "alarms_refused": 0,
            "opened_at": _now_iso(),
        }
        self.guards[address] = json.dumps(record)
        self.targets.append(address)
        return json.dumps({"ok": True, "target": address, "bounty": str(value),
                           "state": OPEN})

    # -------------------------------------------------------------- the alarm

    @gl.public.write.payable
    def raise_alarm(self, target: str, evidence: str) -> str:
        """Say a protocol is being broken, show why, and back it with a deposit.

        The round runs inside this transaction, so an alarm that is right stops
        the protocol now rather than after somebody reviews it later.
        """
        value = gl.message.value
        address = _address(target)
        shown = _text(evidence, MIN_EVIDENCE, MAX_EVIDENCE)
        caller = _addr(gl.message.sender_address.as_hex)

        def refuse(why: str) -> str:
            if value > 0:
                _Recipient(gl.message.sender_address).emit_transfer(value=int(value))
            return json.dumps({"ok": False, "error": why})

        if not address or address not in self.guards:
            return refuse("nothing is protected at that address")
        if not shown:
            return refuse("show what is happening, in %d characters or more" % MIN_EVIDENCE)
        if value <= 0:
            return refuse("put a deposit behind the alarm; stopping a protocol is not free")

        record = json.loads(self.guards[address])
        if record["state"] != OPEN:
            return refuse("that guard is already up" if record["state"] == HALTED
                          else "that guard has been retired")

        # Into locals before the block opens.
        line = str(record["red_line"])
        task = _task(line, shown, address)

        def run() -> str:
            try:
                return str(gl.nondet.exec_prompt(task))
            except Exception:
                return ""

        raw = gl.eq_principle.prompt_comparative(
            run,
            principle=(
                f"Both answers must carry the same value in the field named reading, either "
                f"{CROSSED} or {NOT_CROSSED}. That single field stops a live protocol and moves "
                "a deposit, so two validators differing on it are not wording a judgement "
                "differently, they are disagreeing about whether this is happening. The "
                "accompanying sentence is not compared."
            ),
        )

        reading = _read_reading(raw)
        index = len(self.alarms)
        alarm = {
            "index": index,
            "target": address,
            "by": caller,
            "evidence": shown,
            "deposit": int(value),
            "at": _now_iso(),
            "at_epoch": _now_epoch(),
        }

        if not reading:
            # Nothing moves except the deposit, which goes back. A default here
            # would either stop a healthy protocol on a malformed answer or wave
            # a real exploit through on one.
            alarm["outcome"] = UNDECIDED
            alarm["why"] = None
            alarm["paid"] = int(value)
            alarm["paid_to"] = caller
            self.alarms.append(json.dumps(alarm))
            _Recipient(gl.message.sender_address).emit_transfer(value=int(value))
            return json.dumps({"ok": False, "alarm": index, "outcome": UNDECIDED,
                               "error": "no readable reading; deposit returned, raise it again"})

        alarm["why"] = _read_why(raw)
        bounty = int(record["bounty"])

        if reading == CROSSED:
            alarm["outcome"] = UPHELD
            record["state"] = HALTED
            record["raised_at"] = _now_iso()
            record["raised_at_epoch"] = _now_epoch()
            record["raised_by"] = caller
            record["alarms_upheld"] = int(record["alarms_upheld"]) + 1
            record["bounty"] = 0
            paid = bounty + int(value)
            paid_to = caller
        else:
            alarm["outcome"] = REFUSED
            record["alarms_refused"] = int(record["alarms_refused"]) + 1
            paid = int(value)
            paid_to = record["owner"]

        alarm["paid"] = paid
        alarm["paid_to"] = paid_to
        self.guards[address] = json.dumps(record)
        self.alarms.append(json.dumps(alarm))

        if paid > 0:
            _Recipient(Address(paid_to)).emit_transfer(value=int(paid))

        return json.dumps({"ok": True, "alarm": index, "outcome": alarm["outcome"],
                           "state": record["state"], "why": alarm["why"],
                           "paid": str(paid), "paid_to": paid_to})

    @gl.public.write
    def lower(self, target: str) -> str:
        """Lower the guard. Only the owner, and only after the hold.

        Anyone may raise it and one party may lower it, on purpose. A guard that
        could be lifted as fast as it went up would be a race between two
        transactions, and an attacker sends transactions faster than a person.
        """
        address = _address(target)
        if not address or address not in self.guards:
            return json.dumps({"ok": False, "error": "nothing is protected at that address"})

        record = json.loads(self.guards[address])
        if _addr(gl.message.sender_address.as_hex) != record["owner"]:
            return json.dumps({"ok": False, "error": "only the owner can lower a guard"})
        if record["state"] != HALTED:
            return json.dumps({"ok": False, "error": "that guard is not up"})

        held = _now_epoch() - int(record["raised_at_epoch"])
        if held < MIN_HOLD:
            return json.dumps({"ok": False, "held_seconds": held,
                               "error": "the hold has %d seconds left" % (MIN_HOLD - held)})

        record["state"] = OPEN
        record["lowered_at"] = _now_iso()
        self.guards[address] = json.dumps(record)
        return json.dumps({"ok": True, "target": address, "state": OPEN,
                           "held_seconds": held})

    @gl.public.write
    def retire(self, target: str) -> str:
        """Stop protecting a contract and take back what is left of the bounty."""
        address = _address(target)
        if not address or address not in self.guards:
            return json.dumps({"ok": False, "error": "nothing is protected at that address"})
        record = json.loads(self.guards[address])
        if _addr(gl.message.sender_address.as_hex) != record["owner"]:
            return json.dumps({"ok": False, "error": "only the owner can retire a guard"})
        if record["state"] == HALTED:
            return json.dumps({"ok": False, "error":
                               "lower the guard before retiring it, so the halt is a decision"})

        left = int(record["bounty"])
        record["bounty"] = 0
        record["state"] = RETIRED
        record["retired_at"] = _now_iso()
        self.guards[address] = json.dumps(record)
        if left > 0:
            _Recipient(gl.message.sender_address).emit_transfer(value=int(left))
        return json.dumps({"ok": True, "target": address, "returned": str(left)})

    # ------------------------------------------------------------------ reads

    @gl.public.view
    def halted(self, target: str) -> bool:
        """The one call a protected contract makes before doing anything.

        A bare boolean, deliberately. The contract asking is in the middle of its
        own work and needs an answer it can branch on, not a document to parse.
        """
        address = _address(target)
        if not address or address not in self.guards:
            return False
        return json.loads(self.guards[address])["state"] == HALTED

    @gl.public.view
    def guard(self, target: str) -> str:
        address = _address(target)
        if not address or address not in self.guards:
            return json.dumps({"ok": False, "error": "nothing is protected at that address"})
        return json.dumps({"ok": True, "guard": json.loads(self.guards[address])})

    @gl.public.view
    def alarm_at(self, index: str) -> str:
        position = self._alarm(index)
        if position is None:
            return json.dumps({"ok": False, "error": "no such alarm"})
        return self.alarms[position]

    @gl.public.view
    def history(self, target: str) -> str:
        address = _address(target)
        found = []
        for raw in self.alarms:
            alarm = json.loads(raw)
            if alarm["target"] == address:
                found.append(alarm)
        return json.dumps({"ok": True, "target": address, "count": len(found),
                           "alarms": found})

    @gl.public.view
    def size(self) -> str:
        states = {}
        outcomes = {}
        for address in self.targets:
            state = json.loads(self.guards[address])["state"]
            states[state] = states.get(state, 0) + 1
        for raw in self.alarms:
            outcome = json.loads(raw)["outcome"]
            outcomes[outcome] = outcomes.get(outcome, 0) + 1
        return json.dumps({
            "protected": len(self.targets),
            "guard_states": states,
            "alarms": len(self.alarms),
            "outcomes": outcomes,
            "note": ("anyone may raise a guard and only the owner may lower it, because "
                     "an attacker sends transactions faster than a person does"),
        })

    # ----------------------------------------------------------------- helper

    def _alarm(self, value: str) -> typing.Optional[int]:
        try:
            index = int(str(value).strip().strip('"').strip("'").strip())
        except Exception:
            return None
        if index < 0 or index >= len(self.alarms):
            return None
        return index
