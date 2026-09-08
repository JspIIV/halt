# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""A protocol's own witness: arithmetic over its own book, and no opinions.

A reviewer of this project put the missing piece well. The claim comes from
outside and there is nothing from inside the protocol to weigh it against, so
the round is left deciding whether a story sounds plausible. What they wanted
was an agent internal to the project, with read only access to what the project
knows, producing evidence a round can set beside the outsider's claim.

This is the smallest honest version of that. It reads the protocol's own ledger
and works out, per address, how much went in, how much came out, and the largest
share any one address took inside a window. No model, no judgement, no fetching:
ordinary arithmetic over numbers the protocol published about itself.

## Why a protocol would run one against itself

Because a claim it cannot answer is a claim that stands. An accusation of "an
address is emptying its position" is either supported by this arithmetic or it
is not, and a protocol with nothing to hide would rather the round saw the
figures than the adjective.

And because the guardian tells the round exactly what this is: **a witness the
accused chose.** It carries weight when it agrees with the accuser and almost
none when it agrees with the accused. A protocol cannot talk its way out through
its own monitor, which is the only reason it is safe to let it have one.

## What it will not do

**It does not decide anything.** There is no reading, no verdict and no word the
guardian acts on. It reports figures and the round does what it likes with them.

**It reads one place.** Whatever the protocol wrote in its own ledger. If the
protocol leaves a movement out, this will not see it, and the thing that catches
that is elsewhere: the guardian compares what the protocol says it owes against
what the chain says it holds.

**It has no state to poison.** Nothing is stored between calls and there is no
write method at all, so there is no snapshot to take at a convenient moment. It
answers from the ledger as it stands when the question is asked.
"""

from genlayer import *
import json
import typing


ENTRIES = 60
WINDOW_SECONDS = 600
MAX_REPORT = 900


def _addr(value) -> str:
    text = str(value).strip().lower()
    if not text.startswith("0x") or len(text) != 42:
        return ""
    for character in text[2:]:
        if character not in "0123456789abcdef":
            return ""
    return text


def _whole(value) -> int:
    try:
        return int(str(value).strip())
    except Exception:
        return 0


def _seconds(stamp: str) -> int:
    """An ISO time as a number, or 0 when it cannot be read.

    A movement whose time cannot be read is still counted in the totals and left
    out of the window arithmetic. Dropping it entirely would let a protocol hide
    a withdrawal by writing a broken timestamp beside it.
    """
    from datetime import datetime
    try:
        return int(datetime.fromisoformat(str(stamp)).timestamp())
    except Exception:
        return 0


def _gen(amount: int) -> str:
    whole = amount // 10 ** 18
    part = (amount % 10 ** 18) // 10 ** 14
    return str(whole) + "." + str(part).rjust(4, "0")


class Monitor(gl.Contract):
    """Reads one protocol's ledger and states what is in it."""

    def __init__(self) -> None:
        pass

    @gl.public.view
    def report(self, target: str) -> str:
        """The figures, as a paragraph, for whoever is judging an alarm.

        The guardian calls this by name and expects a string. Anything it
        cannot read it treats as no witness at all, so failing here costs the
        protocol its answer and nothing else.
        """
        address = _addr(target)
        if not address:
            return "no protocol was named"

        try:
            answer = str(gl.get_contract_at(Address(address)).view().entries(str(ENTRIES)))
            said = json.loads(answer)
        except Exception:
            return ("this protocol keeps no readable movement record, so there is "
                    "nothing here to report")

        rows = said.get("entries") if isinstance(said, dict) else None
        if not isinstance(rows, list) or not rows:
            return "this protocol has recorded no movements"

        # Oldest first, whatever order they arrived in, because a window is a
        # question about order.
        movements = []
        for item in rows:
            if not isinstance(item, dict):
                continue
            who = _addr(item.get("who", ""))
            if not who:
                continue
            kind = str(item.get("kind", ""))
            amount = _whole(item.get("amount", item.get("wanted", 0)))
            movements.append((_seconds(item.get("at", "")), kind, who, amount))
        movements.sort(key=lambda m: m[0])

        put_in: typing.Dict[str, int] = {}
        took_out: typing.Dict[str, int] = {}
        for _, kind, who, amount in movements:
            if kind == "deposit":
                put_in[who] = put_in.get(who, 0) + amount
            elif kind == "withdraw":
                took_out[who] = took_out.get(who, 0) + amount

        # The most any single address moved out inside one window, found by
        # walking each of its withdrawals as the start of a window. This is the
        # figure a red line about rapid exits is actually asking for, and the
        # protocol's totals cannot answer it at all.
        worst_share = 0
        worst_who = ""
        worst_amount = 0
        for who in took_out:
            mine = [(at, amount) for at, kind, holder, amount in movements
                    if holder == who and kind == "withdraw"]
            deposited = put_in.get(who, 0)
            for start, _ in mine:
                if start == 0:
                    continue
                inside = 0
                for at, amount in mine:
                    if at >= start and at - start <= WINDOW_SECONDS:
                        inside += amount
                share = (inside * 100) // deposited if deposited > 0 else 0
                if share > worst_share or (share == worst_share and inside > worst_amount):
                    worst_share = share
                    worst_who = who
                    worst_amount = inside

        lines = []
        for who in sorted(set(list(put_in.keys()) + list(took_out.keys()))):
            deposited = put_in.get(who, 0)
            withdrawn = took_out.get(who, 0)
            share = (withdrawn * 100) // deposited if deposited > 0 else 0
            lines.append(who + ": put in " + _gen(deposited) + " GEN, took out "
                         + _gen(withdrawn) + " GEN, which is " + str(share)
                         + " percent of what it put in")

        if worst_who:
            lines.append("the most any one address took out inside ten minutes was "
                         + _gen(worst_amount) + " GEN by " + worst_who + ", "
                         + str(worst_share) + " percent of what it had put in")
        else:
            lines.append("no address has taken anything out")

        return _clip("read from the protocol's own ledger, " + str(len(movements))
                     + " movements: " + chr(10) + chr(10).join(lines), MAX_REPORT)


def _clip(text: str, limit: int) -> str:
    text = str(text).strip()
    return text if len(text) <= limit else text[:limit] + " [...]"
