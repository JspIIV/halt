// How long a protocol actually keeps paying out after an alarm is sent.
//
// Every number this project has published so far was measured to FINALIZED,
// polled every six seconds by the script that sent the transaction. That is not
// the thing a protocol owner cares about. What matters is the moment the
// protected contract starts refusing, and a protected contract reads the guard
// with view(), whose default is LATEST_NON_FINAL.
//
// So this sends one alarm and does nothing but ask, once a second, whether the
// guard is up yet.
//
//   node timetostop.mjs <halt> <vault>
import { Wallet } from 'ethers';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';

const [HALT, VAULT] = process.argv.slice(2);
const load = async (n, p) => {
  const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`, 'utf8'), p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) });
};
const other = await load('ppub', PASS.ppub);
const watch = await load('padv', PASS.padv);
const GEN = 10n ** 18n;
const wait = ms => new Promise(r => setTimeout(r, ms));

const evidence = fs.readFileSync('scenarios/true_breach.txt', 'utf8').trim();
const t0 = Date.now();
const since = () => ((Date.now() - t0) / 1000).toFixed(1);

const hash = await other.writeContract(
  { address: HALT, functionName: 'raise_alarm', args: [VAULT, evidence], value: GEN / 500n });
console.log(`${since()}s  alarm sent  ${hash}`);

let stopped = null, vaultSaw = null;
const poll = (async () => {
  for (;;) {
    try {
      const up = await watch.readContract({ address: HALT, functionName: 'halted', args: [VAULT] });
      if ((up === true || up === 'true') && stopped === null) {
        stopped = since();
        console.log(`${stopped}s  THE GUARD IS UP`);
      }
    } catch {}
    if (stopped !== null && vaultSaw === null) {
      try {
        const s = JSON.parse(await watch.readContract(
          { address: VAULT, functionName: 'status', args: [] }));
        if (s.halted) { vaultSaw = since(); console.log(`${vaultSaw}s  the protocol itself is refusing`); }
      } catch {}
    }
    if (stopped !== null && vaultSaw !== null) return;
    await wait(1000);
  }
})();

const receipt = await other.waitForTransactionReceipt(
  { hash, status: 'FINALIZED', retries: 300, interval: 2000 });
const finalized = since();
console.log(`${finalized}s  FINALIZED`);
await poll;

const created = Number(receipt.created_timestamp) * 1000;
const decided = Number(receipt.timestamp_awaiting_finalization) * 1000;
console.log('\nfrom the chain itself:');
console.log('  round took        ', ((decided - created) / 1000).toFixed(0) + 's');
console.log('  stop was live at  ', stopped + 's');
console.log('  protocol refusing ', vaultSaw + 's');
console.log('  finalized at      ', finalized + 's');
