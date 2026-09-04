// The only latency number that means anything: how long a protocol keeps paying
// out after somebody raises the alarm.
//
// Everything published before this was measured to FINALIZED, by the script that
// sent the transaction, polling every six seconds. A protected contract does not
// wait for finalization. It reads the guard with view(), whose default state is
// LATEST_NON_FINAL, so it starts refusing when the round decides.
//
// Each run gets its own vault, so nothing queues behind an earlier halt.
//
//   node howfast.mjs <halt> [runs]
import { Wallet } from 'ethers';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';

const HALT = process.argv[2];
const RUNS = Number(process.argv[3] || 5);
const load = async (n, p) => {
  const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`, 'utf8'), p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) });
};
const owner = await load('padv', PASS.padv);
const other = await load('ppub', PASS.ppub);
const GEN = 10n ** 18n;
const wait = ms => new Promise(r => setTimeout(r, ms));
const read = r => { const l = r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return {}; } };

const LINE = 'No address may withdraw more than half of what it deposited into this vault '
  + 'inside any ten minute window.';
const evidence = fs.readFileSync('scenarios/true_breach.txt', 'utf8').trim();

async function send(c, a, fn, args, v = 0n) {
  const h = await c.writeContract({ address: a, functionName: fn, args, value: v });
  return read(await c.waitForTransactionReceipt(
    { hash: h, status: 'FINALIZED', retries: 240, interval: 4000 }));
}

async function breachedVault() {
  const code = fs.readFileSync('contracts/vault.py');
  const h = await owner.deployContract({ code, args: [HALT], leaderOnly: false });
  const r = await owner.waitForTransactionReceipt(
    { hash: h, status: 'FINALIZED', retries: 240, interval: 4000 });
  const v = r?.data?.contract_address ?? r?.contract_address;
  await send(owner, HALT, 'protect', [v, LINE], GEN / 100n);
  await send(other, v, 'deposit', [], 4n * GEN / 100n);
  await send(other, v, 'withdraw', [String(3n * GEN / 100n)]);
  return v;
}

// Appends. A run that dies on a network timeout should not take the runs
// that already happened with it.
let results = [];
try { results = JSON.parse(fs.readFileSync('results/how_fast.json', 'utf8')); } catch {}
const startAt = results.length;
for (let i = startAt + 1; i <= startAt + RUNS; i++) {
  const vault = await breachedVault();
  const t0 = Date.now();
  const since = () => (Date.now() - t0) / 1000;

  const hash = await other.writeContract(
    { address: HALT, functionName: 'raise_alarm', args: [vault, evidence], value: GEN / 500n });

  let guardUp = null, refusing = null;
  const poll = (async () => {
    for (;;) {
      if (guardUp === null) {
        try {
          const up = await owner.readContract({ address: HALT, functionName: 'halted', args: [vault] });
          if (up === true || up === 'true') guardUp = since();
        } catch {}
      } else if (refusing === null) {
        try {
          const s = JSON.parse(await owner.readContract(
            { address: vault, functionName: 'status', args: [] }));
          if (s.halted) return (refusing = since());
        } catch {}
      }
      await wait(700);
    }
  })();

  await other.waitForTransactionReceipt({ hash, status: 'FINALIZED', retries: 300, interval: 2000 });
  const finalized = since();
  await poll;

  let round = null;
  try {
    const tx = await owner.getTransaction({ hash });
    round = Number(tx.timestamp_awaiting_finalization) - Number(tx.created_timestamp);
  } catch {}

  const row = { run: i, vault, tx: hash,
                guard_up: +guardUp.toFixed(1), protocol_refusing: +refusing.toFixed(1),
                finalized: +finalized.toFixed(1), round_on_chain: round };
  results.push(row);
  console.log(`run ${i}: guard up ${row.guard_up}s, protocol refusing ${row.protocol_refusing}s, `
              + `finalized ${row.finalized}s, round on chain ${row.round_on_chain}s`);
  fs.writeFileSync('results/how_fast.json', JSON.stringify(results, null, 2));
}

const col = k => results.map(r => r[k]).filter(x => x != null).sort((a, b) => a - b);
const med = a => a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
console.log('\nmedian, over ' + results.length + ' runs:');
for (const k of ['guard_up', 'protocol_refusing', 'finalized', 'round_on_chain'])
  console.log('  ' + k.padEnd(20), med(col(k)) + 's', '  range', col(k)[0] + 's to ' + col(k)[col(k).length - 1] + 's');
