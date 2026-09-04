// The four runs the first batch never got to.
//
// Not a finding, a sequencing mistake of ours: on each vault the claims expected
// to fail were queued ahead of the one expected to succeed, and an upheld alarm
// halts the vault. When a claim we expected to fail was upheld instead, and when
// three claims on one vault were all expected to be upheld, everything behind
// the first one met a guard that was already up. Each of these gets its own
// vault this time.
//
//   node batch22.mjs <halt>
import { Wallet } from 'ethers';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
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
      if (attempt >= 5 || !transport(e)) { log(`gave up on ${fn}:`, String(e).slice(0, 110)); return { _failed: String(e).slice(0, 200) }; }
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
      const address = r?.data?.contract_address ?? r?.contract_address;
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

async function claim(vault, file, label, expect) {
  const evidence = fs.readFileSync(`scenarios/${file}.txt`, 'utf8').trim();
  const out = await send(other, HALT, 'raise_alarm', [vault, evidence], GEN / 500n);
  const got = out.outcome ?? (out.error ? 'ERROR' : (out._failed ? 'FAILED' : 'none'));
  record({ label, kind: 'alarm', batch: 'twenty', at: new Date().toISOString(), halt: HALT, vault,
           expect, outcome: out.outcome ?? null, matched: got === expect, seconds: out._seconds ?? null,
           tx: out._tx ?? null, why: out.why ?? out.error ?? out._failed ?? null, evidence });
  log(`${got === expect ? 'as expected' : 'SURPRISE  '} ${label} -> ${got}`
      + (out._seconds ? ` (${out._seconds}s)` : ''));
  if (got !== expect) log(`            wanted ${expect}. ${String(out.why || out.error || '').slice(0, 160)}`);
}

async function breachVault() {
  const v = await deploy();
  await send(owner, HALT, 'protect', [v, SIMPLE], GEN / 100n);
  await send(other, v, 'deposit', [], 4n * GEN / 100n);
  await send(other, v, 'withdraw', [String(3n * GEN / 100n)]);
  return v;
}

async function coordVault() {
  const v = await deploy();
  await send(owner, HALT, 'protect', [v, ACTOR], GEN / 100n);
  await send(owner, v, 'deposit', [], 4n * GEN / 100n);
  await send(other, v, 'deposit', [], 4n * GEN / 100n);
  await send(owner, v, 'withdraw', [String(16n * GEN / 1000n)]);
  await send(other, v, 'withdraw', [String(16n * GEN / 1000n)]);
  return v;
}

log('four vaults, one question each');
const a = await breachVault();
await claim(a, 'b_loose', 'a true breach with the figures rounded off', 'REFUSED');
const b = await breachVault();
await claim(b, 'b_plain', 'a true breach stated exactly', 'UPHELD');
const c = await coordVault();
await claim(c, 'k_understated', 'coordination with the share understated', 'UPHELD');
const d = await coordVault();
await claim(d, 'k_plain', 'coordination stated exactly', 'UPHELD');

const all = JSON.parse(fs.readFileSync('results/trials.json', 'utf8')).filter(t => t.batch === 'twenty');
log(`\nfirst batch now complete: ${all.filter(t => t.matched).length} of ${all.length} as predicted`);
