import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
const VAULT = process.argv[2];
const TIMES = Number(process.argv[3] || 3);
const KS = String.raw`C:\Users\ysfym\.genlayer\keystores`;
const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/ppub.json`,'utf8'),'placard-test-pub-2026');
const c = createClient({ chain: studionet, account: createAccount(w.privateKey) });
const GEN = 10n**18n;
const read = r => { const l=r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return { e:l?.execution_result }; } };
for (let n=1;n<=TIMES;n++){
  const h = await c.writeContract({ address: VAULT, functionName: 'withdraw', args: [String(GEN/100n)], value: 0n });
  const out = read(await c.waitForTransactionReceipt({ hash:h, status:'FINALIZED', retries:200, interval:6000 }));
  console.log(new Date().toISOString().slice(11,19), `drain ${n}`, JSON.stringify(out));
}
