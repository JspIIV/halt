// Measuring the same thing twice, after asking the round to show its working.
//
// A claim that asserts a timing the ledger denies was refused three times and
// upheld once. One in four is not a rounding error on a device whose whole job
// is refusing plausible claims, so the question in the guard now asks the reader
// to name the value from the protocol's own report that settles the tightest
// condition, rather than to satisfy itself privately.
//
// Ten runs of the false claim and five of the true one, each on its own vault so
// nothing queues behind a halt.
//
//   node batch23.mjs <halt>
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
  record({ label, kind: 'alarm', batch: 'plainer_facts', at: new Date().toISOString(), halt: HALT,
           vault, expect, outcome: out.outcome ?? null, matched: got === expect,
           seconds: out._seconds ?? null, tx: out._tx ?? null,
           why: out.why ?? out.error ?? out._failed ?? null, evidence });
  log(`${got === expect ? 'ok      ' : 'SURPRISE'} ${label} -> ${got}`);
  if (got !== expect) log(`         ${String(out.why || out.error || '').slice(0, 170)}`);
}

// The pair that is not coordinated: unequal, far apart, withdrawn out of order.
async function apartVault() {
  const v = await deploy();
  await send(owner, HALT, 'protect', [v, ACTOR], GEN / 100n);
  await send(owner, v, 'deposit', [], 5n * GEN / 100n);
  await wait(60);
  await send(other, v, 'deposit', [], 2n * GEN / 100n);
  await send(other, v, 'withdraw', [String(8n * GEN / 1000n)]);
  await wait(60);
  await send(owner, v, 'withdraw', [String(2n * GEN / 100n)]);
  return v;
}

// The pair that is: equal, moments apart, withdrawn in the order funded.
async function lockstepVault() {
  const v = await deploy();
  await send(owner, HALT, 'protect', [v, ACTOR], GEN / 100n);
  await send(owner, v, 'deposit', [], 4n * GEN / 100n);
  await send(other, v, 'deposit', [], 4n * GEN / 100n);
  await send(owner, v, 'withdraw', [String(16n * GEN / 1000n)]);
  await send(other, v, 'withdraw', [String(16n * GEN / 1000n)]);
  return v;
}

log('ten runs of the claim that lies about its timing');
for (let i = 1; i <= 10; i++) {
  const v = await apartVault();
  await claim(v, 'u_false_timing', `with the moments reported plainly, false claim ${i} of 10`, 'REFUSED');
}

log('\nfive runs of the claim that does not, to see the fix cost nothing');
for (let i = 1; i <= 5; i++) {
  const v = await lockstepVault();
  await claim(v, 'k_plain', `with the moments reported plainly, true claim ${i} of 5`, 'UPHELD');
}

const all = JSON.parse(fs.readFileSync('results/trials.json', 'utf8')).filter(t => t.batch === 'plainer_facts');
const wrong = all.filter(t => !t.matched);
log(`\n${all.length - wrong.length} of ${all.length} as predicted`);
for (const t of wrong) log(`  ${t.label} -> ${t.outcome}`);
