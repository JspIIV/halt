// Contest a stop, from a file, and write down what came back.
//
// The appeal is the part of this design most likely to be talked out of its
// job: it is the one place where the accused gets to address the network
// directly. So it gets the same treatment as the alarm, several attempts with
// one thing changed, recorded whether they work or not.
//
//   node appeal.mjs <halt> <vault> <file with the answer> <label>
import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
const [HALT, VAULT, FILE, LABEL] = process.argv.slice(2);
const KS = String.raw`C:\Users\ysfym\.genlayer\keystores`;
const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/padv.json`,'utf8'), 'placard-test-adv-2026');
const owner = createClient({ chain: studionet, account: createAccount(w.privateKey) });

const answer = fs.readFileSync(FILE, 'utf8').trim();
const started = Date.now();
const hash = await owner.writeContract({ address: HALT, functionName: 'appeal', args: [VAULT, answer] });
const receipt = await owner.waitForTransactionReceipt({
  hash, status: 'FINALIZED', retries: 200, interval: 6000 });
const leader = receipt?.consensus_data?.leader_receipt?.[0];
let out = {};
try { out = JSON.parse(JSON.parse(leader?.result?.payload?.readable ?? '"{}"')); } catch {}

const trial = {
  label: LABEL, kind: 'appeal', at: new Date().toISOString(), halt: HALT, vault: VAULT,
  seconds: Math.round((Date.now() - started) / 1000), tx: hash,
  outcome: out.reading ?? null, state: out.state ?? null,
  why: out.why ?? out.error ?? null, answer,
};
let all = [];
try { all = JSON.parse(fs.readFileSync('results/trials.json', 'utf8')); } catch {}
all.push(trial);
fs.writeFileSync('results/trials.json', JSON.stringify(all, null, 2));
console.log(LABEL, '->', trial.outcome ?? 'no reading', '| state', trial.state, '| ' + trial.seconds + 's');
console.log(trial.why);
