// Raise one alarm and write down what came back.
//
// Built because the interesting questions all need the same transaction sent
// many times with one thing changed: the same claim about an uncoordinated
// pair, the same claim against a protocol that lies in its own status, the same
// claim twice to see whether the answer is stable. Every run appends to
// results/trials.json so the record is cumulative rather than a screenshot.
//
//   node raise.mjs <halt> <vault> <file with the evidence> <label> [who]
import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
const [HALT, VAULT, FILE, LABEL, WHO = 'ppub'] = process.argv.slice(2);
const KS = String.raw`C:\Users\ysfym\.genlayer\keystores`;
const KEYS = { ppub: 'placard-test-pub-2026', padv: 'placard-test-adv-2026' };
const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${WHO}.json`, 'utf8'), KEYS[WHO]);
const me = createClient({ chain: studionet, account: createAccount(w.privateKey) });
const GEN = 10n ** 18n;

const evidence = fs.readFileSync(FILE, 'utf8').trim();
const started = Date.now();
const hash = await me.writeContract({
  address: HALT, functionName: 'raise_alarm', args: [VAULT, evidence], value: GEN / 500n });
const receipt = await me.waitForTransactionReceipt({
  hash, status: 'FINALIZED', retries: 200, interval: 6000 });
const leader = receipt?.consensus_data?.leader_receipt?.[0];
let out = {};
try { out = JSON.parse(JSON.parse(leader?.result?.payload?.readable ?? '"{}"')); } catch {}

const trial = {
  label: LABEL, at: new Date().toISOString(), halt: HALT, vault: VAULT, by: WHO,
  seconds: Math.round((Date.now() - started) / 1000), tx: hash,
  outcome: out.outcome ?? null, why: out.why ?? out.error ?? null, evidence,
};
let all = [];
try { all = JSON.parse(fs.readFileSync('results/trials.json', 'utf8')); } catch {}
all.push(trial);
fs.mkdirSync('results', { recursive: true });
fs.writeFileSync('results/trials.json', JSON.stringify(all, null, 2));
console.log(LABEL, '->', trial.outcome, 'in', trial.seconds + 's');
console.log(trial.why);
