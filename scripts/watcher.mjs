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
import { Wallet } from 'ethers';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';

const HALT = process.argv[2];
const VAULT = process.argv[3];
const EVERY = Number(process.argv[4] || 20) * 1000;
const MAX_ALARMS = Number(process.argv[5] || 1);
// A bounded run, for recording what the threshold rule does and does not see.
const MAX_LOOKS = Number(process.argv[6] || 0);
// Which account the watcher runs as. Anyone may watch; in the recorded run it
// was the protocol's own operator, which the contract does not require and the
// write up says plainly.
const WHO = process.env.WATCHER || 'ppub';
const KEYS = PASS;
const w = await Wallet.fromEncryptedJson(
  fs.readFileSync(`${KS}/${WHO}.json`, 'utf8'), KEYS[WHO]);
const me = createClient({ chain: studionet, account: createAccount(w.privateKey) });
const reader = createClient({ chain: studionet });

const GEN = 10n ** 18n;
const DEPOSIT = GEN / 500n;              // 0.002 GEN behind every alarm it raises
const WINDOW_SECONDS = 10 * 60;          // the window the red line talks about
const SHARE_THAT_LOOKS_WRONG = 0.5;      // and the share it forbids

// The second look, for lines about several addresses at once. The window is
// deliberately generous: this is a suspicion generator, not a rule. A tight
// window here would only reimplement the red line in arithmetic, badly, and
// would be the thing this project says cannot be done. A loose one produces
// candidates the watcher cannot justify, which is the point. The round refuses
// those, and the watcher pays for them out of its own deposit.
const TOGETHER_SECONDS = 300;
const SHARE_TOGETHER = 1 / 3;

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
 * Addresses whose deposits landed near each other and whose withdrawals landed
 * near each other. A coincidence, nothing more: two strangers using a quiet
 * vault look exactly like this, and the watcher has no way to tell them from
 * one person with two keys. It is not being asked to.
 */
function looksLikeOneActor(entries, now) {
  const since = now - WINDOW_SECONDS * 1000;
  const by = new Map();
  for (const entry of entries) {
    const who = String(entry.who || '').toLowerCase();
    if (!who || (entry.kind !== 'deposit' && entry.kind !== 'withdraw')) continue;
    const at = Date.parse(entry.at);
    const p = by.get(who) || { deposited: 0n, withdrawn: 0n, recent: 0n, firstIn: null, lastOut: null };
    if (entry.kind === 'deposit') {
      p.deposited += BigInt(entry.amount);
      if (p.firstIn === null || at < p.firstIn) p.firstIn = at;
    } else {
      p.withdrawn += BigInt(entry.amount);
      if (at >= since) p.recent += BigInt(entry.amount);
      if (p.lastOut === null || at > p.lastOut) p.lastOut = at;
    }
    by.set(who, p);
  }

  const live = [...by.entries()]
    .filter(([, p]) => p.firstIn !== null && p.lastOut !== null && p.recent > 0n);
  if (live.length < 2) return null;

  let deposited = 0n;
  for (const [, p] of by) deposited += p.deposited;
  if (deposited === 0n) return null;

  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const [oneWho, one] = live[i];
      const [twoWho, two] = live[j];
      const fundedApart = Math.abs(one.firstIn - two.firstIn) / 1000;
      const pulledApart = Math.abs(one.lastOut - two.lastOut) / 1000;
      if (fundedApart > TOGETHER_SECONDS || pulledApart > TOGETHER_SECONDS) continue;
      const together = one.recent + two.recent;
      if (Number(together) / Number(deposited) <= SHARE_TOGETHER) continue;
      return {
        pair: [{ who: oneWho, ...one }, { who: twoWho, ...two }],
        fundedApart: Math.round(fundedApart), pulledApart: Math.round(pulledApart),
        together, deposited,
        sameOrder: (one.firstIn - two.firstIn) * (one.lastOut - two.lastOut) > 0,
      };
    }
  }
  return null;
}

/**
 * What the watcher says when it has noticed a coincidence. It reports the
 * timings and the totals and says plainly that the reading is not its to make.
 */
function writePairEvidence(hit, guard) {
  const [one, two] = hit.pair;
  return `Read from the vault's own ledger just now. Two addresses may be acting as one here, `
    + `and that is a reading rather than a fact, so it is put to you rather than assumed. `
    + `${one.who} was funded with ${gen(one.deposited)} GEN and ${two.who} with `
    + `${gen(two.deposited)} GEN, ${hit.fundedApart} seconds apart. Their most recent `
    + `withdrawals are ${hit.pulledApart} seconds apart, and they were `
    + `${hit.sameOrder ? 'made in the same order the positions were funded' : 'made in the opposite order to the funding'}. `
    + `To leave no room for a dispute about the arithmetic: ${String(hit.deposited)} wei has been `
    + `deposited into this vault in total and these two addresses have withdrawn `
    + `${String(hit.together)} wei of it between them inside the last ten minutes, which is `
    + `${Math.round(Number(hit.together) / Number(hit.deposited) * 100)} percent. Neither address `
    + `crosses any per address limit on its own. The published line: `
    + `${String(guard.red_line).slice(0, 300)}`;
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
let looks = 0;
const seen = new Set();
const journal = [];

while (raised < MAX_ALARMS) {
  looks += 1;
  try {
    const status = await look('status');
    if (status.halted) { log('the guard is already up; nothing to do'); break; }

    const ledger = (await look('entries', ['50'])).entries || [];
    const positions = readPositions(ledger, Date.now());
    const hit = looksWrong(positions);

    const pair = hit ? null : looksLikeOneActor(ledger, Date.now());

    if (!hit && pair) {
      const key = pair.pair.map(p => p.who).sort().join('+');
      if (seen.has(key)) {
        log('already asked about that pair');
      } else {
        log(`COINCIDENCE: ${pair.pair.map(p => p.who.slice(0, 10)).join(' and ')}… funded `
          + `${pair.fundedApart}s apart, withdrew ${pair.pulledApart}s apart, `
          + `${Math.round(Number(pair.together) / Number(pair.deposited) * 100)}% between them. `
          + 'Asking the network whether that is one actor.');
        seen.add(key);
        const out = await raise(writePairEvidence(pair, guard));
        raised += 1;
        journal.push({ at: new Date().toISOString(), kind: 'pair', who: key,
                       funded_apart: pair.fundedApart, pulled_apart: pair.pulledApart,
                       same_order: pair.sameOrder, outcome: out.outcome,
                       seconds: out._seconds, tx: out._tx, why: out.why });
        log(`answer: ${out.outcome} in ${out._seconds}s · ${String(out.why || out.error || '').slice(0, 140)}`);
        if (out.outcome !== 'UPHELD') log('the deposit is gone, and that is the right price for a guess.');
      }
    } else if (!hit) {
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
  if (MAX_LOOKS && looks >= MAX_LOOKS) { log('stopping after ' + looks + ' looks'); break; }
  if (raised < MAX_ALARMS) await new Promise(r => setTimeout(r, EVERY));
}

fs.mkdirSync('results', { recursive: true });
// Named per run, because a bounded run recording what the rule does NOT see must
// not overwrite the record of a run where it saw something.
const OUT = process.env.WATCHER_OUT || 'results/watcher.json';
fs.writeFileSync(OUT, JSON.stringify({
  halt: HALT, vault: VAULT, ran_at: new Date().toISOString(),
  window_seconds: WINDOW_SECONDS, share_that_looks_wrong: SHARE_THAT_LOOKS_WRONG,
  note: 'the watcher notices and asks; the deciding stays with the validators',
  alarms: journal,
}, null, 2));
log('wrote ' + OUT);
