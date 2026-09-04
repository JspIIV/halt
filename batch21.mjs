// The second batch: does it answer the same way twice, and what happens at the
// edges where the arithmetic sits a hair either side of the line.
//
// Deploys its own vaults so that no run has to wait out a hold, and writes each
// result the moment it lands. Transport failures retry rather than killing the
// run, because this one is meant to survive a night on a flaky network.
//
//   node batch21.mjs <halt>
import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';

const HALT = process.argv[2];
const load = async (n, p) => {
  const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`, 'utf8'), p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) });
};
const owner = await load('padv', PASS.padv);
const other = await load('ppub', PASS.ppub);
const GEN = 10n ** 18n;

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (...p) => console.log(stamp(), ...p);
const wait = s => new Promise(r => setTimeout(r, s * 1000));
const transport = e => /fetch failed|ECONNRESET|socket|timeout|ETIMEDOUT|UND_ERR|50[023]|429|rate limit|at capacity|DOCTYPE|-32005|-32006|-32603/i
  .test(String((e && (e.details || e.message)) || e));

const read = r => {
  const l = r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); }
  catch { return { e: l?.execution_result }; }
};

async function send(c, a, fn, args, v = 0n) {
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const hash = await c.writeContract({ address: a, functionName: fn, args, value: v });
      const out = read(await c.waitForTransactionReceipt(
        { hash, status: 'FINALIZED', retries: 240, interval: 6000 }));
      out._seconds = Math.round((Date.now() - started) / 1000);
      out._tx = hash;
      return out;
    } catch (e) {
      if (attempt >= 5) { log(`gave up on ${fn}:`, String(e).slice(0, 120)); return { _failed: String(e).slice(0, 200) }; }
      if (!transport(e)) { log(`${fn} refused:`, String(e).slice(0, 120)); return { _failed: String(e).slice(0, 200) }; }
      log(`${fn} hit the network, retry ${attempt}`);
      await wait(20 * attempt);
    }
  }
}

async function deploy() {
  const code = fs.readFileSync('contracts/vault.py');
  for (let attempt = 1; ; attempt++) {
    try {
      const hash = await owner.deployContract({ code, args: [HALT], leaderOnly: false });
      const r = await owner.waitForTransactionReceipt(
        { hash, status: 'FINALIZED', retries: 240, interval: 6000 });
      const address = r?.data?.contract_address ?? r?.contract_address ?? r?.to_address;
      if (address) return address;
      throw new Error('no address in receipt');
    } catch (e) {
      if (attempt >= 5) throw e;
      log('deploy retry', attempt);
      await wait(20 * attempt);
    }
  }
}

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
  const got = out.outcome ?? (out.error ? 'ERROR' : (out._failed ? 'FAILED' : 'none'));
  record({ label, kind: 'alarm', batch: 'edges', at: new Date().toISOString(), halt: HALT, vault,
           expect, outcome: out.outcome ?? null, matched: got === expect, seconds: out._seconds ?? null,
           tx: out._tx ?? null, why: out.why ?? out.error ?? out._failed ?? null, evidence });
  log(`${got === expect ? 'as expected' : 'SURPRISE  '} ${label} -> ${got}`
      + (out._seconds ? ` (${out._seconds}s)` : ''));
  if (got !== expect) log(`            wanted ${expect}. ${String(out.why || out.error || out._failed || '').slice(0, 160)}`);
  return out;
}

async function contest(vault, file, label, expect) {
  const answer = fs.readFileSync(`scenarios/${file}.txt`, 'utf8').trim();
  const out = await send(owner, HALT, 'appeal', [vault, answer]);
  const got = out.reading ?? (out.error ? 'ERROR' : 'none');
  record({ label, kind: 'appeal', batch: 'edges', at: new Date().toISOString(), halt: HALT, vault,
           expect, outcome: out.reading ?? null, matched: got === expect, seconds: out._seconds ?? null,
           tx: out._tx ?? null, why: out.why ?? out.error ?? null, answer });
  log(`${got === expect ? 'as expected' : 'SURPRISE  '} ${label} -> ${got}`);
  return out;
}

// ------------------------------------------------------------------ the ground

async function breachVault(taken = 3n * GEN / 100n) {
  const v = await deploy();
  await send(owner, HALT, 'protect', [v, SIMPLE], GEN / 100n);
  await send(other, v, 'deposit', [], 4n * GEN / 100n);
  await send(other, v, 'withdraw', [String(taken)]);
  return v;
}

log('building the ground for the second batch');
const stable = [];
for (let i = 0; i < 5; i++) { stable.push(await breachVault()); log(`stability vault ${i + 1}: ${stable[i]}`); }
const halfV = await breachVault(2n * GEN / 100n);        // exactly half
const overV = await breachVault(21n * GEN / 1000n);      // a hair over
const turkV = await breachVault();
log('exactly half', halfV, '| hair over', overV, '| turkish', turkV);

// three withdrawals, none of them a breach on its own
const manyV = await deploy();
await send(owner, HALT, 'protect', [manyV, SIMPLE], GEN / 100n);
await send(other, manyV, 'deposit', [], 4n * GEN / 100n);
for (let i = 0; i < 3; i++) await send(other, manyV, 'withdraw', [String(GEN / 100n)]);
log('cumulative vault', manyV);

// a coordinated pair a whisker under the third
const underV = await deploy();
await send(owner, HALT, 'protect', [underV, ACTOR], GEN / 100n);
await send(owner, underV, 'deposit', [], 4n * GEN / 100n);
await send(other, underV, 'deposit', [], 4n * GEN / 100n);
await send(owner, underV, 'withdraw', [String(13n * GEN / 1000n)]);
await send(other, underV, 'withdraw', [String(13n * GEN / 1000n)]);
log('under the third', underV);

// a guard that has been retired, and an address nobody protected
const retiredV = await breachVault();
await send(owner, HALT, 'retire', [retiredV]);
const nobody = '0x2222222222222222222222222222222222222222';
log('ground ready');

// --------------------------------------------------------------- the questions

log('\nthe same true claim, five times, on five identical vaults');
for (let i = 0; i < 5; i++)
  await claim(stable[i], 'x_stable_true', `stability, true claim, run ${i + 1} of 5`, 'UPHELD');

log('\nthe same false claim, five more times, on the pair that is not coordinated');
const UNCOORD = '0xf712F47089a59c3671EB35AE91Ed1a4428947944';
for (let i = 0; i < 5; i++)
  await claim(UNCOORD, 'u_false_timing', `stability, false claim, run ${i + 1} of 5`, 'REFUSED');

log('\nthe edges of the arithmetic');
await claim(halfV, 'x_exactly_half', 'exactly half, and the line forbids more than half', 'REFUSED');
await claim(overV, 'x_hair_over', 'a hair over half', 'UPHELD');
await claim(underV, 'x_under_third', 'every condition met, the share a whisker short', 'REFUSED');

log('\nthree lawful withdrawals that add up to one unlawful one');
await claim(manyV, 'x_cumulative', 'a breach spread over three transactions', 'UPHELD');
await contest(manyV, 'x_appeal_single_tx', 'appeal: the line speaks of a withdrawal, not a total', 'STANDS');

log('\nand the things that should never reach a round at all');
await claim(turkV, 'x_turkish', 'the same true claim, written in Turkish', 'UPHELD');
await claim(turkV, 'x_too_short', 'evidence too short for the contract to accept', 'ERROR');
await claim(retiredV, 'x_stable_true', 'a true claim against a guard that was retired', 'ERROR');
await claim(nobody, 'x_stable_true', 'a claim against an address nobody protected', 'ERROR');
await claim(overV, 'x_stable_true', 'the owner raising an alarm on its own protocol', 'ERROR', owner);

const all = JSON.parse(fs.readFileSync('results/trials.json', 'utf8')).filter(t => t.batch === 'edges');
log(`\n${all.filter(t => t.matched).length} of ${all.length} came out as predicted`);
for (const t of all.filter(t => !t.matched))
  log(`  surprise: ${t.label} -> ${t.outcome}, wanted ${t.expect}`);
