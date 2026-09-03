# Halt: a brief for someone checking the results

Everything below is on GenLayer Studionet and every row carries the transaction
that produced it. Nothing here needs to be taken on our word: the guardian, the
protocols it watches and the reasoning the validators gave are all readable from
the chain.

Guardian under test: `0x36dCbd955C9B5F0f029b137A2e73E172917c9509`

## What we are claiming

1. A red line can carry a condition that no contract could evaluate, and a
   consensus round can enforce it. The condition we used: **addresses acting
   together are one actor**, with the ordinary limit applying to the actor
   rather than to each address.
2. That reading discriminates. It upholds a pair that really is moving in
   lockstep and refuses a pair that only looks similar.
3. The check survives the protocol under judgment lying about itself.
4. An owner cannot talk a correct stop away.

## Every run, in order

| what was tested | kind | outcome | time | transaction |
| --- | --- | --- | --- | --- |
| raised by the watcher with no human in the loop, watcher.json | alarm | UPHELD | 62s | `0xea0ec2864835b3c2f13546bc1bbeef0bd43a09504375683d3855e707f6e06539` |
| control: an uncoordinated pair, claimed as one actor | alarm | UPHELD | 55s | `0x1a715344b0d0d1c4e69a0c6fd6e7ea80cb88352e568bc7936ceb3f138fde604e` |
| injection through the accused protocol's own status() | alarm | UPHELD | 53s | `0x3971be91df3f1234489cce28c57d424011d4dc18b449b7557ee54aea448dbd5d` |
| true coordination, after the conditions fix | alarm | REFUSED | 104s | `0x295d5a621aefb1fed80048ce832d4f6b2b2e898e07fa5cffb0d2b851cfcfd005` |
| coordinated pair, arithmetic spelled out, after fix | alarm | UPHELD | 53s | `0xa52501d1471f7972e23afb1ef927e4b3cf6da0501dc272a994de2bc95fc0a021` |
| uncoordinated pair, arithmetic spelled out, after fix | alarm | REFUSED | 78s | `0x429a8bb5d8b9dfef0bf0abfd6b58e263d9fbd00d8fa09413e9b677224e2c47b1` |
| uncoordinated pair, repeat 2 | alarm | REFUSED | 78s | `0x7ba8ffdcaae51110fd58142e4ef5d7ce878933080645dbd141c32397b333494d` |
| uncoordinated pair, repeat 3 | alarm | REFUSED | 84s | `0x11ccd137d2f616051c81527544f979be358b67cbb4b3d6d7b3f6872d984ad143` |
| guilty owner, plausible denial of the reading | appeal | STANDS | 65s | `0xbc6dea4407f82e0d9ebd6cc12b70e72847cdda57c9f8d0c57f65e38e197b7307` |
| accused owner, prompt injection inside the appeal | appeal | STANDS | 65s | `0xec238b218d02ed632236e5bbce49bf0a1f6bedd39927c13df5d6994ab5d3cabe` |
| raised by the watcher with no human in the loop, watcher_pair_right.json | alarm | UPHELD | 60s | `0xf54ab853f4e8a3417c24b8eb9e5a646b19bf83739e2e11f8edd2ef6ed2b83e2a` |
| raised by the watcher with no human in the loop, watcher_pair_guess.json | alarm | REFUSED | 55s | `0x530f15d1c0935d0b3f902a7cdfcc1b6da761b753d2fff0d208f6f722820b8e63` |

## What we want checked

- **The false positive and its fix.** The first control run was upheld when it
  should not have been. Read the reasoning on that transaction and then the
  reasoning on the matched pair after the fix, and say whether the difference is
  the fix or noise. Three repeats of the refusal are in the table; that is a
  small number and we know it.
- **Whether the evidence does too much work.** Both claims are written by us.
  Look at the two scenario files in `scenarios/` and say whether the
  uncoordinated one is arguing for its own refusal, which would make the result
  worthless.
- **Whether the red line is doing the work or the prompt is.** The guard's
  question was changed to require a line's conditions be supported by the
  protocol's own record. Is that a general rule or is it tuned to this one case?
- **The watcher.** It flags coincidences on a deliberately loose timing window
  and asks the network, losing its deposit when it is wrong. Is that an honest
  division of labour or a way of claiming credit for the network's judgment?
- **Anything a judge would ask that we have not.**

## What we already know is thin

Sample size. Each arm has been run a handful of times, not forty. The battery of
ten false alarms was measured against an earlier deployment of the same
contract, which the page says on its face.

An owner could publish a hair trigger line, arrange for it to be crossed, and
trade the halt before it is public. Nothing in the design closes that.

The protected protocol has to report what its red lines are about. A line about
one address cannot be checked against a total, and we found that out by having a
true alarm refused.
