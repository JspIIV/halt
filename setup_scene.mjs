import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
const [HALT, VAULT] = process.argv.slice(2);
const KS = String.raw`C:\Users\ysfym\.genlayer\keystores`;
const load = async (n,p) => { const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`,'utf8'),p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) }); };
const owner = await load('padv','placard-test-adv-2026');
const attacker = await load('ppub','placard-test-pub-2026');
const GEN = 10n**18n;
const read = r => { const l=r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return { e:l?.execution_result }; } };
async function send(c,a,fn,args,v=0n){ const h=await c.writeContract({address:a,functionName:fn,args,value:v});
  return read(await c.waitForTransactionReceipt({hash:h,status:'FINALIZED',retries:200,interval:6000})); }
const RED_LINE = 'No address may withdraw more than half of what it deposited into this vault within '
  + 'ten minutes. A pattern of repeated withdrawals that empties a holder position faster than that '
  + 'is forbidden and the vault must stop.';
console.log('protect ', JSON.stringify(await send(owner, HALT, 'protect', [VAULT, RED_LINE], GEN/100n)));
console.log('deposit ', JSON.stringify(await send(attacker, VAULT, 'deposit', [], 4n*GEN/100n)));
