// Build the brief an outside reviewer would need to check our results without
// taking any of them on trust. Generated from trials.json so the figures in it
// are the figures on chain, including the runs that went the wrong way.
//
//   node audit_brief.mjs > AUDIT_BRIEF.md
import fs from 'fs';
const trials = JSON.parse(fs.readFileSync('results/trials.json', 'utf8'));

// The watcher keeps its own journal, and the runs where nobody was in the loop
// are the ones an outside reader should look at hardest, so they are folded in
// rather than described separately.
for (const file of fs.readdirSync('results').filter(f => /^watcher.*\.json$/.test(f))) {
  const journal = JSON.parse(fs.readFileSync(`results/${file}`, 'utf8'));
  for (const alarm of journal.alarms || []) {
    trials.push({
      label: `raised by the watcher with no human in the loop, ${file}`,
      kind: 'alarm', at: alarm.at, halt: journal.halt, vault: journal.vault,
      seconds: alarm.seconds, tx: alarm.tx, outcome: alarm.outcome, why: alarm.why,
    });
  }
}
trials.sort((one, two) => Date.parse(one.at) - Date.parse(two.at));
const rows = trials.map(t =>
  `| ${t.label} | ${t.kind === 'appeal' ? 'appeal' : 'alarm'} | ${t.outcome ?? 'none'} | ${t.seconds}s | \`${t.tx}\` |`);

console.log(`# Halt: a brief for someone checking the results

Everything below is on GenLayer Studionet and every row carries the transaction
that produced it. Nothing here needs to be taken on our word: the guardian, the
protocols it watches and the reasoning the validators gave are all readable from
the chain.

Guardian under test: \`${trials[trials.length - 1].halt}\`

## What we are claiming

1. A red line can carry a condition that no contract could evaluate, and a
   consensus round can enforce it. The condition we used: **addresses acting
   together are one actor**, with the ordinary limit applying to the actor
   rather than to each address.
2. That reading discriminates. It upholds a pair that really is moving together
   and refuses a pair that only looks similar.
3. The check survives a protocol that argues about its own case, and one that
   claims to hold money it does not have. It does not survive a protocol that
   shrinks its whole reported history to match its balance, and we say where
   that boundary is rather than leaving it to be found.
4. An owner cannot talk a correct stop away.

**And the claim we are least sure of.** Rows in this table come from six builds
of the guard, not one, and three of those builds were worse than the one before.
The table is in the order the runs happened, so a rate computed across the whole
of it is meaningless. Read it by build. The current one is the rows labelled
\`chronological ledger\` and \`satisfiable line\`, and everything before them is
either history or a fault we caused and then fixed. One of those rows is a live
protocol halted on a false claim, and it is left in.

## Every run, in order

| what was tested | kind | outcome | time | transaction |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

## What we want checked

- **The false positive and its fix.** The first control run was upheld when it
  should not have been. Read the reasoning on that transaction and then the
  reasoning on the matched pair after the fix, and say whether the difference is
  the fix or noise. Three repeats of the refusal are in the table; that is a
  small number and we know it.
- **Whether the evidence does too much work.** Both claims are written by us.
  Look at the two scenario files in \`scenarios/\` and say whether the
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
true alarm refused.`);
