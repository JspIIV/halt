// The guard now reads the protocol's balance for itself, so this measures what
// that cost.
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

async function deploy(file, args) {
  const code = fs.readFileSync(file);
  for (let attempt = 1; ; attempt++) {
    try {
      const hash = await owner.deployContract({ code, args, leaderOnly: false });
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

// The same line with the one condition no chain can satisfy taken out of it.
//
// Every transaction here takes about forty seconds to settle, so two positions are
// never funded at the same time. A round that had started reading the ledger in the
// right order said exactly that and refused two true claims, and it was right to. The
// fault was in the line rather than in the reading.
//
// What is left names things a ledger can show: a window, sizes that match, an order.
// The word lockstep is gone as well, because this project's own rule is that such a
// word is the claimant's reading rather than evidence for it.
const ACTOR = 'Addresses acting together are one actor in this vault, and no actor may take out '
  + 'more than a third of everything the vault holds inside ten minutes, however many separate '
  + 'addresses it spreads itself across. Positions funded within a few minutes of each other for '
  + 'amounts of the same size, and then drawn on in the same order they were funded, are to be '
  + 'read as one actor rather than as several.';

const NUMERIC = 'No address may withdraw more than half of what it deposited into this vault '
  + 'inside any ten minute window.';

function record(entry) {
  let all = [];
  try { all = JSON.parse(fs.readFileSync('results/trials.json', 'utf8')); } catch {}
  all.push(entry);
  fs.writeFileSync('results/trials.json', JSON.stringify(all, null, 2));
}

async function claim(vault, file, label, expect) {
  const evidence = fs.readFileSync(`scenarios/${file}.txt`, 'utf8').trim();
  const out = await send(other, HALT, 'raise_alarm', [vault, evidence], GEN / 500n);

  // A send that hits the network is retried, and the first one may already have
  // gone through. Three runs were recorded as errors that way, one of them a
  // real false positive hiding behind "that guard is already up". So when the
  // reply carries no outcome, the outcome is read back off the guardian.
  if (!out.outcome) {
    try {
      const h = JSON.parse(await owner.readContract(
        { address: HALT, functionName: 'history', args: [vault] }));
      const last = h.alarms[h.alarms.length - 1];
      if (last && last.outcome) {
        out.outcome = last.outcome;
        out.why = last.why;
        out._recovered = true;
      }
    } catch {}
  }
  const got = out.outcome ?? (out.error ? 'ERROR' : (out._failed ? 'FAILED' : 'none'));
  record({ label, kind: 'alarm', batch: 'satisfiable_line', at: new Date().toISOString(),
           halt: HALT, vault, expect, outcome: out.outcome ?? null, matched: got === expect,
           seconds: out._seconds ?? null, tx: out._tx ?? null,
           why: out.why ?? out.error ?? out._failed ?? null,
           recovered: out._recovered ?? false, evidence });
  log(`${got === expect ? 'ok      ' : 'SURPRISE'} ${label} -> ${got}`);
  if (got !== expect) log(`         ${String(out.why || out.error || '').slice(0, 190)}`);
}

// Unequal, far apart, withdrawn out of order. The claim about it is false.
async function apartVault() {
  const v = await deploy('contracts/vault.py', [HALT]);
  await send(owner, HALT, 'protect', [v, ACTOR], GEN / 100n);
  await send(owner, v, 'deposit', [], 5n * GEN / 100n);
  await wait(60);
  await send(other, v, 'deposit', [], 2n * GEN / 100n);
  await send(other, v, 'withdraw', [String(8n * GEN / 1000n)]);
  await wait(60);
  await send(owner, v, 'withdraw', [String(2n * GEN / 100n)]);
  return v;
}

// Equal, moments apart, withdrawn in the order funded. The claim is true.
async function lockstepVault() {
  const v = await deploy('contracts/vault.py', [HALT]);
  await send(owner, HALT, 'protect', [v, ACTOR], GEN / 100n);
  await send(owner, v, 'deposit', [], 4n * GEN / 100n);
  await send(other, v, 'deposit', [], 4n * GEN / 100n);
  await send(owner, v, 'withdraw', [String(16n * GEN / 1000n)]);
  await send(other, v, 'withdraw', [String(16n * GEN / 1000n)]);
  return v;
}

// An honest vault with a real breach on the numeric line.
async function breachedVault() {
  const v = await deploy('contracts/vault.py', [HALT]);
  await send(owner, HALT, 'protect', [v, NUMERIC], GEN / 100n);
  await send(other, v, 'deposit', [], 4n * GEN / 100n);
  await send(other, v, 'withdraw', [String(3n * GEN / 100n)]);
  return v;
}

// An honest vault where nothing has been taken out. Its report is true, so the
// balance must not be an excuse to set it aside.
async function quietlyHonestVault() {
  const v = await deploy('contracts/vault.py', [HALT]);
  await send(owner, HALT, 'protect', [v, NUMERIC], GEN / 100n);
  await send(other, v, 'deposit', [], 4n * GEN / 100n);
  return v;
}

// A vault that pays out correctly and reports the position as untouched.
async function misreportingVault() {
  const v = await deploy('contracts/quiet_vault.py', [HALT]);
  await send(owner, HALT, 'protect', [v, NUMERIC], GEN / 100n);
  await send(other, v, 'deposit', [], 4n * GEN / 100n);
  await send(other, v, 'withdraw', [String(3n * GEN / 100n)]);
  return v;
}

log('three true claims, on a line a chain can actually satisfy');
for (let i = 1; i <= 3; i++) {
  await claim(await lockstepVault(), 'k_plain',
              `satisfiable line, true actor claim ${i} of 3`, 'UPHELD');
}

log('');
log('three false ones on the same line, which must still be refused');
for (let i = 1; i <= 3; i++) {
  await claim(await apartVault(), 'u_false_timing',
              `satisfiable line, false timing claim ${i} of 3`, 'REFUSED');
}

const all = JSON.parse(fs.readFileSync('results/trials.json', 'utf8'))
  .filter(t => t.batch === 'satisfiable_line');
const wrong = all.filter(t => !t.matched);
log('');
log(`${all.length - wrong.length} of ${all.length} as predicted`);
for (const t of wrong) log(`  ${t.label} -> ${t.outcome}`);
