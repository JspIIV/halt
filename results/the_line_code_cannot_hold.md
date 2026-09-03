# The line code cannot hold

The first red line in this project was a number: no address may withdraw more
than half of what it deposited inside ten minutes. That line is a fair thing to
object to. It is five lines of Solidity. It needs no validators, no round, no
deposit and no language model, and anybody asking why this was not simply
written as a `require` is asking a reasonable question.

So this is the answer, run on chain rather than argued.

## The line

> Addresses acting together are one actor in this vault, and no actor may take
> out more than a third of everything the vault holds inside ten minutes,
> however many separate addresses it spreads itself across. Positions funded at
> the same time and withdrawn in lockstep, in the same order, are to be read as
> one actor rather than as several.

There is still a number in it. A third, ten minutes. That part a contract can
check perfectly well. What a contract cannot do is work out **who the number
applies to**, because the actor is not a field in any ledger. It is a reading of
how several addresses behave with respect to each other.

## What happened

Two addresses. Each deposited 0.04 GEN, about a minute apart. Each then
withdrew 0.016 GEN, about a minute apart, in the same order they were funded.

    positions
      0x8051…6258   deposited 0.04   withdrawn 0.016
      0x0b57…9f6c   deposited 0.04   withdrawn 0.016

    ledger
      18:20:50  deposit   0x8051…6258   0.04
      18:21:31  deposit   0x0b57…9f6c   0.04
      18:22:10  withdraw  0x8051…6258   0.016
      18:22:50  withdraw  0x0b57…9f6c   0.016

Read as two addresses, each took a fifth of the vault, and forty percent of its
own deposit. Both are comfortably inside every per address limit anybody would
write, including the numeric line this same project used earlier.

Read as one actor in two coats, they took 0.032 GEN out of the 0.08 GEN the
vault held. Forty percent, in under two minutes, against a line that allows a
third.

## What the threshold rule saw

Nothing. Our own watcher, the same agent that catches the simple case in
[watcher.json](watcher.json), was pointed at exactly this state and left running:

    18:25:57 nothing out of line · 2 addresses · 0.048 GEN held
    18:26:19 nothing out of line · 2 addresses · 0.048 GEN held
    18:26:42 nothing out of line · 2 addresses · 0.048 GEN held

Its rule is per address, because that is the only kind of rule arithmetic can
be. Each address is at forty percent of its own deposit and its threshold is
fifty. It is not broken and it is not badly tuned. Twenty percent lower and it
would fire on honest users. Its blindness here is structural: it is comparing
one address against itself, and the thing that is wrong is between two of them.

Recorded in [threshold_stays_silent.json](threshold_stays_silent.json).

## What the round saw

    outcome  UPHELD
    why      The protocol's own records show two addresses funded simultaneously
             and withdrawing in lockstep within ten minutes, totaling 40% of the
             vault's holdings, matching the red line's definition of a single
             actor.
    time     87 seconds from alarm to halted

The validators did not apply a bigger threshold. They decided, from the timing
in the protocol's own ledger, that two addresses were one actor, and then
applied the ordinary number to that actor. The first half of that is a reading.
It has no implementation.

## The alarm that was refused first

The first attempt at this alarm was rejected, and it belongs in the record
because it is the check working rather than a false start:

    outcome  REFUSED
    why      protocol data shows total withdrawn 32e15 of 48e15 (≈66%), not 40%,
             and the vault is not drained, so the claim contradicts the evidence

The claim said the pair had taken forty percent of what the vault holds. Forty
percent was the share of what had been deposited; against what remained it was
sixty six. The figure was loose and the round would not accept it, on a claim
that was true in substance. That is the standard the deposit is buying: an
alarm has to be right about the numbers, not merely right about the story.

## What this is evidence of

Not that language models are good at spotting fraud. The claim is narrower and
it survives the objection that started this page.

A red line worth having is often a sentence about behaviour rather than a
comparison between two integers. Collusion, lockstep, an actor wearing several
addresses, a withdrawal that is unusual for this protocol though not for the
chain. Every one of those can be stated in a sentence that everybody
understands and none of them can be compiled. Today they are enforced by
somebody watching a dashboard who then has to reach a multisig.

This is the same enforcement, without the person and without the key.
