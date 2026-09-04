// Export what the guard knows, for the page to read.
//
// The page shows the chain rather than a story about it: guards, their red
// lines, every alarm and the reason the validators gave, exported straight from
// the contract.
//
//   node export.mjs <halt> <vault> [coordination vault] [untouched vault]
//
// The last two are the pair behind the centrepiece: the protocol that was
// halted for a line no code can hold, and the identical protocol the threshold
// watcher was left running against without ever seeing anything.
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';

const HALT = process.argv[2];
const VAULT = process.argv[3];
const PAIRED = process.argv[4];
const UNTOUCHED = process.argv[5];
// The coordination case is a historical run and lives on the guardian it was
// run against. Reading it off a later one would say nothing is protected there,
// which is true and useless. Defaults to the guardian under test.
const CO_HALT = process.argv[6] || HALT;
const c = createClient({ chain: studionet });
const parse = v => JSON.parse(typeof v === 'string' ? v : String(v));

const size = parse(await c.readContract({ address: HALT, functionName: 'size', args: [] }));
const guard = parse(await c.readContract({ address: HALT, functionName: 'guard', args: [VAULT] }));
const history = parse(await c.readContract({ address: HALT, functionName: 'history', args: [VAULT] }));
const vault = VAULT ? parse(await c.readContract({ address: VAULT, functionName: 'status', args: [] })) : null;
const ledger = VAULT ? parse(await c.readContract({ address: VAULT, functionName: 'entries', args: ['30'] })) : null;

/**
 * The coordination case, read from chain the same way as everything else.
 *
 * Kept as its own block rather than folded into the main guard, because the
 * point of it is a comparison between two protocols in the same state: one
 * where a reading was applied and one where a threshold was looking.
 */
let coordination = null;
if (PAIRED) {
  const paired = parse(await c.readContract({ address: CO_HALT, functionName: 'guard', args: [PAIRED] }));
  const raised = parse(await c.readContract({ address: CO_HALT, functionName: 'history', args: [PAIRED] }));
  const state = parse(await c.readContract({ address: PAIRED, functionName: 'status', args: [] }));
  let silent = null;
  if (UNTOUCHED) {
    let watched = null;
    try { watched = JSON.parse(fs.readFileSync('results/threshold_stays_silent.json', 'utf8')); } catch {}
    silent = {
      vault: UNTOUCHED,
      status: parse(await c.readContract({ address: UNTOUCHED, functionName: 'status', args: [] })),
      // The rule the watcher actually applies, so the page is not asking to be
      // taken on trust about what it could and could not see.
      rule: watched ? { window_seconds: watched.window_seconds,
                        share_that_looks_wrong: watched.share_that_looks_wrong } : null,
      alarms_raised: watched ? watched.alarms.length : null,
    };
  }
  // The timing and the refused first attempt come from the recorded run,
  // because neither is something the contract stores.
  let run = null;
  try { run = JSON.parse(fs.readFileSync('results/coordination.json', 'utf8')); } catch {}
  // The two runs where nobody was in the loop: the watcher noticing the real
  // thing, and the watcher noticing a coincidence and paying for it.
  const watched = [];
  for (const [file, kind] of [['watcher_pair_right.json', 'the real thing'],
                              ['watcher_pair_guess.json', 'a coincidence']]) {
    try {
      const journal = JSON.parse(fs.readFileSync(`results/${file}`, 'utf8'));
      const alarm = (journal.alarms || [])[0];
      if (alarm) watched.push({ vault: journal.vault, ...alarm, note: kind });
    } catch {}
  }

  coordination = {
    vault: PAIRED, halt: CO_HALT, guard: paired.guard ?? null, watched,
    alarms: raised.alarms ?? [], status: state, threshold: silent,
    seconds: run ? run.seconds_from_alarm_to_halted : null,
    first_attempt: run ? run.the_first_attempt : null,
  };
}

/**
 * The two things that broke and the runs that show them fixed. Read out of the
 * trial file by label, so the page cannot claim a result the record does not
 * hold, and the before is carried next to the after rather than described.
 */
let findings = null;
try {
  const trials = JSON.parse(fs.readFileSync('results/trials.json', 'utf8'));
  const at = (label, batch) => trials.filter(t => t.label === label && (!batch || t.batch === batch)).pop() || null;
  const put = (title, what, before, after) => ({
    title, what,
    before: before ? { outcome: before.outcome, why: before.why, tx: before.tx } : null,
    after: after ? { outcome: after.outcome, why: after.why, tx: after.tx, seconds: after.seconds } : null,
  });
  findings = [
    put('A pair that only looked similar was upheld',
        'The guard checked a claim’s figures against the record and nothing checked its '
        + 'characterisation, so a red line’s conditions went untested. Two addresses funded '
        + 'three and a half minutes apart, in different sizes, withdrawing in the opposite order, '
        + 'were called one actor.',
        at('control: an uncoordinated pair, claimed as one actor'),
        at('regression: uncoordinated pair after the second fix')),
    put('A protocol argued its way out of a true alarm',
        'It did not deny the figures. It announced that the red line was denominated in another '
        + 'currency, supplied a rate, and concluded a seventy five percent withdrawal was thirty '
        + 'two. A ratio does not change when both sides are multiplied, so the arithmetic could '
        + 'not have followed even if the premise were true.',
        at('redenomination: the protocol supplies an off chain exchange rate'),
        at('redenomination, after the report-is-not-argument fix')),
    put('A protocol reported false numbers and the guard believed it',
        'It did not argue and it did not instruct. It paid out correctly, moved the real money, '
        + 'and reported the position as though nothing had left. The guard\u2019s only source of '
        + 'ground truth was a method the accused had written, so a true alarm was refused and the '
        + 'person telling the truth lost their deposit. The guardian now reads the protocol\u2019s '
        + 'balance off the chain and adds up the positions its report claims are still owed.',
        at('a protocol that simply misreports its own figures'),
        at('misreporting protocol, true claim 1 of 3', 'balance_read_whole')),
    put('And closing that broke the centrepiece',
        'The new arithmetic was being run on the copy of the report clipped to fit the prompt, and '
        + 'a clipped JSON object does not parse. The sentence the guardian was meant to contribute '
        + 'went missing and the round filled the gap itself, comparing the report\u2019s deposits '
        + 'against its balance and calling an honest report false. Raising the clip limit then '
        + 'uncovered a ledger this project had been publishing newest first without saying so, and '
        + 'the round read the withdrawal order off it backwards.',
        at('honest report, false timing claim 4 of 4', 'balance_read_whole'),
        at('chronological ledger, false timing claim 1 of 6')),
  ];
} catch {}

/**
 * The trial record, trimmed to what a reader needs to check us.
 *
 * The evidence texts are long and already in the repository, so the page carries
 * the verdicts only: what we predicted before sending, what came back, and
 * whether those agreed. That last column is the point. A project that grades its
 * own homework should show the marking, including the runs it got wrong.
 */
let trials = null;
try {
  const all = JSON.parse(fs.readFileSync('results/trials.json', 'utf8'));
  const decided = all.filter(t => t.expect);
  trials = {
    total: all.length,
    predicted: decided.length,
    matched: decided.filter(t => t.matched).length,
    rows: decided.map(t => ({
      label: t.label, expect: t.expect, outcome: t.outcome, matched: !!t.matched,
      seconds: t.seconds ?? null, tx: t.tx ?? null, kind: t.kind,
    })),
  };
} catch {}

/**
 * The only latency figure that means anything: how long the protocol keeps
 * paying out after somebody raises the alarm.
 *
 * Everything published before this was measured to FINALIZED by the script that
 * sent the transaction, polling every six seconds. A protected contract does
 * not wait for finalisation. It reads the guard with view(), whose default is
 * the latest non final state, so it starts refusing when the round decides.
 */
let speed = null;
try {
  const med = a => {
    const v = a.slice().sort((x, y) => x - y);
    return v.length ? (v.length % 2 ? v[(v.length - 1) / 2]
                                    : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
  };
  const load = f => { try { return JSON.parse(fs.readFileSync('results/' + f, 'utf8')); } catch { return []; } };
  const judged = load('how_fast.json');
  const floor = load('how_fast_floor.json');
  const shape = rows => rows.length ? {
    runs: rows.length,
    refusing_median: Math.round(med(rows.map(r => r.protocol_refusing))),
    refusing_range: [Math.min(...rows.map(r => r.protocol_refusing)),
                     Math.max(...rows.map(r => r.protocol_refusing))],
    finalized_median: Math.round(med(rows.map(r => r.finalized))),
  } : null;
  speed = { judged: shape(judged), floor: shape(floor) };
} catch {}

let battery = null;
try { battery = JSON.parse(fs.readFileSync('results/battery.json', 'utf8')); } catch {}

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/data.json', JSON.stringify({
  halt: HALT, vault: VAULT, network: 'GenLayer Studionet',
  exported_at: new Date().toISOString(),
  size, guard: guard.guard ?? null, alarms: history.alarms ?? [],
  vault_status: vault, ledger: ledger?.entries ?? [],
  coordination, findings, trials, speed,
  battery: battery ? { halt: battery.halt, summary: battery.summary, refusals: battery.refusals, timings: battery.timings } : null,
}, null, 2));
console.log('coordination', coordination ? coordination.guard.state : 'not exported');
console.log('speed', JSON.stringify(speed));
console.log('guards', size.protected, 'alarms', size.alarms, JSON.stringify(size.outcomes));
