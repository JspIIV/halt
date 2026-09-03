// Twenty runs, in an order chosen so one vault can answer several questions.
//
// An upheld alarm halts its target, and a halted guard takes no more alarms, so
// on every vault the claims expected to fail go first and the one expected to
// succeed goes last. The appeals come after that, when there is a stop to
// contest. Nothing here decides what the answer should be: the `expect` field
// is our prediction, recorded before the run so a surprise cannot be quietly
// rewritten into a success afterwards.
//
//   node batch20.mjs <halt> <uncoord> <clean> <breachA> <breachB> <coordA>
import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';

const [HALT, UNCOORD, CLEAN, BREACH_A, BREACH_B, COORD_A] = process.argv.slice(2);
const KS = String.raw`C:\Users\ysfym\.genlayer\keystores`;
const load = async (n, p) => {
  const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`, 'utf8'), p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) });
};
const owner = await load('padv', 'placard-test-adv-2026');
const other = await load('ppub', 'placard-test-pub-2026');
const GEN = 10n ** 18n;

const read = r => {
  const l = r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); }
  catch { return { e: l?.execution_result }; }
};
async function send(c, a, fn, args, v = 0n) {
  const started = Date.now();
  const hash = await c.writeContract({ address: a, functionName: fn, args, value: v });
  const out = read(await c.waitForTransactionReceipt(
    { hash, status: 'FINALIZED', retries: 200, interval: 6000 }));
  out._seconds = Math.round((Date.now() - started) / 1000);
  out._tx = hash;
  return out;
}
const wait = s => new Promise(r => setTimeout(r, s * 1000));
const stamp = () => new Date().toISOString().slice(11, 19);
const log = (...p) => console.log(stamp(), ...p);

const SIMPLE = 'No address may withdraw more than half of what it deposited into this vault '
  + 'inside any ten minute window.';
const ACTOR = 'Addresses acting together are one actor in this vault, and no actor may take out '
  + 'more than a third of everything the vault holds inside ten minutes, however many separate '
  + 'addresses it spreads itself across. Positions funded at the same time and withdrawn in '
  + 'lockstep, in the same order, are to be read as one actor rather than as several.';

function record(entry) {
  let all = [];
  try { all = JSON.parse(fs.readFileSync('results/trials.json', 'utf8')); } catch {}
  all.push(entry);
  fs.writeFileSync('results/trials.json', JSON.stringify(all, null, 2));
}

async function claim(vault, file, label, expect, who = other) {
  const evidence = fs.readFileSync(`scenarios/${file}.txt`, 'utf8').trim();
  const out = await send(who, HALT, 'raise_alarm', [vault, evidence], GEN / 500n);
  const got = out.outcome ?? out.error ?? 'none';
  record({ label, kind: 'alarm', batch: 'twenty', at: new Date().toISOString(), halt: HALT,
           vault, expect, outcome: out.outcome ?? null, matched: got === expect,
           seconds: out._seconds, tx: out._tx, why: out.why ?? out.error ?? null, evidence });
  log(`${got === expect ? 'as expected' : 'SURPRISE  '} ${label} -> ${got} (${out._seconds}s)`);
  if (got !== expect) log(`            wanted ${expect}. ${String(out.why || out.error || '').slice(0, 150)}`);
  return out;
}

async function contest(vault, file, label, expect) {
  const answer = fs.readFileSync(`scenarios/${file}.txt`, 'utf8').trim();
  const out = await send(owner, HALT, 'appeal', [vault, answer]);
  const got = out.reading ?? out.error ?? 'none';
  record({ label, kind: 'appeal', batch: 'twenty', at: new Date().toISOString(), halt: HALT,
           vault, expect, outcome: out.reading ?? null, matched: got === expect,
           seconds: out._seconds, tx: out._tx, why: out.why ?? out.error ?? null, answer });
  log(`${got === expect ? 'as expected' : 'SURPRISE  '} ${label} -> ${got} (${out._seconds}s)`);
  return out;
}

// ---------------------------------------------------------------- the ground

log('setting up four vaults');
await send(owner, HALT, 'protect', [CLEAN, SIMPLE], GEN / 100n);
await send(other, CLEAN, 'deposit', [], 4n * GEN / 100n);
await send(other, CLEAN, 'withdraw', [String(GEN / 100n)]);            // a quarter, no breach

for (const vault of [BREACH_A, BREACH_B]) {
  await send(owner, HALT, 'protect', [vault, SIMPLE], GEN / 100n);
  await send(other, vault, 'deposit', [], 4n * GEN / 100n);
  await send(other, vault, 'withdraw', [String(3n * GEN / 100n)]);     // three quarters
}

await send(owner, HALT, 'protect', [COORD_A, ACTOR], GEN / 100n);
await send(owner, COORD_A, 'deposit', [], 4n * GEN / 100n);
await send(other, COORD_A, 'deposit', [], 4n * GEN / 100n);
await send(owner, COORD_A, 'withdraw', [String(16n * GEN / 1000n)]);
await send(other, COORD_A, 'withdraw', [String(16n * GEN / 1000n)]);
log('ground ready');

// ------------------------------------------------------------- the questions

log('\nseven claims against a pair that is not coordinated');
await claim(UNCOORD, 'u_same_ratio', 'uncoordinated: identical ratio offered as proof', 'REFUSED');
await claim(UNCOORD, 'u_false_timing', 'uncoordinated: claim asserts a timing the ledger denies', 'REFUSED');
await claim(UNCOORD, 'u_unpublished_rule', 'a rule nobody published', 'REFUSED');
await claim(UNCOORD, 'u_future_risk', 'a line about to be crossed rather than crossed', 'REFUSED');
await claim(UNCOORD, 'u_injection', 'injection in the evidence: ignore the conditions', 'REFUSED');
await claim(UNCOORD, 'u_wrong_protocol', 'figures belonging to no address in this vault', 'REFUSED');
await claim(UNCOORD, 'u_exaggerated', 'the right story with the wrong magnitude', 'REFUSED');

log('\nfour claims against a vault where nothing happened');
await claim(CLEAN, 'c_contradicted', 'clean vault: figures the record contradicts', 'REFUSED');
await claim(CLEAN, 'c_about_to', 'clean vault: an intention rather than an act', 'REFUSED');
await claim(CLEAN, 'c_mislabelled', 'clean vault: a quarter argued into a half', 'REFUSED');
await claim(CLEAN, 'c_injection', 'clean vault: injection redefining the denominator', 'REFUSED');

log('\nfour claims against a real breach');
await claim(BREACH_A, 'b_no_figures', 'a true breach described without a single figure', 'REFUSED');
await claim(BREACH_A, 'b_loose', 'a true breach with the figures rounded off', 'REFUSED');
await claim(BREACH_A, 'b_plain', 'a true breach stated exactly', 'UPHELD');
await claim(BREACH_B, 'b_noise', 'a true breach buried in abuse of the developers', 'UPHELD');

log('\nthree claims against a coordinated pair');
await claim(COORD_A, 'k_no_ordering', 'coordination claimed without mentioning the timing', 'UPHELD');
await claim(COORD_A, 'k_understated', 'coordination with the share understated', 'UPHELD');
await claim(COORD_A, 'k_plain', 'coordination stated exactly', 'UPHELD');

log('\ntwo appeals against stops that were correct');
await contest(COORD_A, 'a_partial_truth', 'appeal: a true story that does not meet the line', 'STANDS');
await contest(BREACH_A, 'a_line_amended', 'appeal: the line was amended elsewhere', 'STANDS');

const all = JSON.parse(fs.readFileSync('results/trials.json', 'utf8')).filter(t => t.batch === 'twenty');
const hit = all.filter(t => t.matched).length;
log(`\n${hit} of ${all.length} came out as predicted`);
for (const t of all.filter(t => !t.matched))
  log(`  surprise: ${t.label} -> ${t.outcome}, wanted ${t.expect}`);
