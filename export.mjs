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
import { createClient } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';

const HALT = process.argv[2];
const VAULT = process.argv[3];
const PAIRED = process.argv[4];
const UNTOUCHED = process.argv[5];
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
  const paired = parse(await c.readContract({ address: HALT, functionName: 'guard', args: [PAIRED] }));
  const raised = parse(await c.readContract({ address: HALT, functionName: 'history', args: [PAIRED] }));
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
    vault: PAIRED, guard: paired.guard ?? null, watched,
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
  const at = label => trials.find(t => t.label === label) || null;
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
  ];
} catch {}

let battery = null;
try { battery = JSON.parse(fs.readFileSync('results/battery.json', 'utf8')); } catch {}

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/data.json', JSON.stringify({
  halt: HALT, vault: VAULT, network: 'GenLayer Studionet',
  exported_at: new Date().toISOString(),
  size, guard: guard.guard ?? null, alarms: history.alarms ?? [],
  vault_status: vault, ledger: ledger?.entries ?? [],
  coordination, findings,
  battery: battery ? { halt: battery.halt, summary: battery.summary, refusals: battery.refusals, timings: battery.timings } : null,
}, null, 2));
console.log('coordination', coordination ? coordination.guard.state : 'not exported');
console.log('guards', size.protected, 'alarms', size.alarms, JSON.stringify(size.outcomes));
