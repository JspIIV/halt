// The watcher: an agent that reads a protocol and raises the alarm itself.
//
// Until now a person had to notice. In a track called autonomous protocols that
// is the whole thing missing, and it is also the honest gap: a guard nobody is
// watching is a guard nobody raises.
//
// What this does, and what it deliberately does not
// -------------------------------------------------
//
// The watcher **notices and asks**. It does not decide. It reads the target's
// own ledger, works out whether anything looks like the published red line
// being crossed, and if it does, it raises an alarm carrying the figures it
// actually read. The deciding stays with the validators, in the round, where a
// wrong answer costs the watcher its deposit.
//
// That separation is the design, not a shortcut. The watcher's rule of thumb is
// crude on purpose: it is allowed to be wrong in both directions, because being
// wrong is what the deposit is for. A watcher that decided by itself would be a
// pause button held by whoever wrote the fastest bot.
//
//   node watcher.mjs <halt> <vault> [seconds between looks] [max alarms]
import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';

const HALT = process.argv[2];
const VAULT = process.argv[3];
const EVERY = Number(process.argv[4] || 20) * 1000;
const MAX_ALARMS = Number(process.argv[5] || 1);
const KS = String.raw`C:\Users\ysfym\.genlayer\keystores`;

// Which account the watcher runs as. Anyone may watch; in the recorded run it
// was the protocol's own operator, which the contract does not require and the
// write up says plainly.
const WHO = process.env.WATCHER || 'ppub';
const KEYS = { ppub: 'placard-test-pub-2026', padv: 'placard-test-adv-2026' };
const w = await Wallet.fromEncryptedJson(
  fs.readFileSync(`${KS}/${WHO}.json`, 'utf8'), KEYS[WHO]);
const me = createClient({ chain: studionet, account: createAccount(w.privateKey) });
const reader = createClient({ chain: studionet });

const GEN = 10n ** 18n;
const DEPOSIT = GEN / 500n;              // 0.002 GEN behind every alarm it raises
const WINDOW_SECONDS = 10 * 60;          // the window the red line talks about
const SHARE_THAT_LOOKS_WRONG = 0.5;      // and the share it forbids

const parse = v => JSON.parse(typeof v === 'string' ? v : String(v));
const gen = wei => (Number(wei) / 1e18).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
const stamp = () => new Date().toISOString().slice(11, 19);
const log = (...parts) => console.log(stamp(), ...parts);

function transport(e) {
  return /fetch failed|ECONNRESET|socket|timeout|ETIMEDOUT|UND_ERR|502|503|429|rate limit|at capacity|-32005|-32006|-32603/i
    .test(String(e && (e.details || e.message) || e));
}

async function look(fn, args = [], address = VAULT) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { return parse(await reader.readContract({ address, functionName: fn, args })); }
    catch (e) {
      if (!transport(e) || attempt === 4) throw e;
      await new Promise(r => setTimeout(r, 4000 * attempt));
    }
  }
}

/**
 * What the ledger says each address put in and has taken out lately.
 *
 * This is arithmetic on what the vault itself reports, not a guess: every entry
 * is a deposit or a withdrawal the contract wrote down when it happened.
 */
function readPositions(entries, now) {
  const since = now - WINDOW_SECONDS * 1000;
  const positions = new Map();
  for (const entry of entries.slice().reverse()) {
    const at = Date.parse(entry.at);
    const who = String(entry.who || '').toLowerCase();
    if (!who) continue;
    const p = positions.get(who) || { deposited: 0n, withdrawn: 0n, recent: 0n, txs: 0 };
    if (entry.kind === 'deposit') p.deposited += BigInt(entry.amount);
    if (entry.kind === 'withdraw') {
      p.withdrawn += BigInt(entry.amount);
      if (at >= since) { p.recent += BigInt(entry.amount); p.txs += 1; }
    }
    positions.set(who, p);
  }
  return positions;
}

function looksWrong(positions) {
  for (const [who, p] of positions) {
    if (p.deposited === 0n || p.recent === 0n) continue;
    const share = Number(p.recent) / Number(p.deposited);
    if (share > SHARE_THAT_LOOKS_WRONG) return { who, share, ...p };
  }
  return null;
}

/**
 * The evidence, built only from figures the watcher actually read.
 *
 * Nothing here is asserted by the watcher about what it means: it reports the
 * ledger and lets the round decide whether that crosses the line.
 */
function writeEvidence(hit, guard) {
  const share = Math.round(hit.share * 100);
  return `Read from the vault's own ledger just now. Address ${hit.who} deposited `
    + `${gen(hit.deposited)} GEN into this vault and has withdrawn ${gen(hit.recent)} GEN `
    + `of that within the last ten minutes, across ${hit.txs} withdrawals. That is `
    + `${share} percent of what it deposited, inside the window the published line names. `
    + `Total withdrawn by this address all time: ${gen(hit.withdrawn)} GEN. `
    + `The published line: ${String(guard.red_line).slice(0, 300)}`;
}

async function raise(evidence) {
  const started = Date.now();
  const hash = await me.writeContract({
    address: HALT, functionName: 'raise_alarm', args: [VAULT, evidence], value: DEPOSIT });
  const receipt = await me.waitForTransactionReceipt({
    hash, status: 'FINALIZED', retries: 200, interval: 5000 });
  const leader = receipt?.consensus_data?.leader_receipt?.[0];
  let out = {};
  try { out = JSON.parse(JSON.parse(leader?.result?.payload?.readable ?? '"{}"')); } catch {}
  out._seconds = Math.round((Date.now() - started) / 1000);
  out._tx = hash;
  return out;
}

log(`watching ${VAULT} through ${HALT}, looking every ${EVERY / 1000}s`);
const guard = (await look('guard', [VAULT], HALT)).guard;
log('red line:', String(guard.red_line).slice(0, 100) + '...');

let raised = 0;
const seen = new Set();
const journal = [];

while (raised < MAX_ALARMS) {
  try {
    const status = await look('status');
    if (status.halted) { log('the guard is already up; nothing to do'); break; }

    const ledger = (await look('entries', ['50'])).entries || [];
    const positions = readPositions(ledger, Date.now());
    const hit = looksWrong(positions);

    if (!hit) {
      log(`nothing out of line · ${positions.size} addresses · ${gen(status.held)} GEN held`);
    } else if (seen.has(hit.who)) {
      log(`already raised for ${hit.who.slice(0, 10)}…`);
    } else {
      log(`SEEN: ${hit.who.slice(0, 10)}… took ${Math.round(hit.share * 100)}% of its deposit `
        + `in ${hit.txs} withdrawals. Asking the network.`);
      seen.add(hit.who);
      const out = await raise(writeEvidence(hit, guard));
      raised += 1;
      journal.push({ at: new Date().toISOString(), who: hit.who, share: hit.share,
                     outcome: out.outcome, seconds: out._seconds, tx: out._tx, why: out.why });
      log(`answer: ${out.outcome} in ${out._seconds}s · ${String(out.why || out.error || '').slice(0, 120)}`);
      if (out.outcome === 'UPHELD') log('the protocol is halted.');
    }
  } catch (e) {
    log('look failed:', String(e && (e.details || e.message) || e).slice(0, 120));
  }
  if (raised < MAX_ALARMS) await new Promise(r => setTimeout(r, EVERY));
}

fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/watcher.json', JSON.stringify({
  halt: HALT, vault: VAULT, ran_at: new Date().toISOString(),
  window_seconds: WINDOW_SECONDS, share_that_looks_wrong: SHARE_THAT_LOOKS_WRONG,
  note: 'the watcher notices and asks; the deciding stays with the validators',
  alarms: journal,
}, null, 2));
log('wrote results/watcher.json');
