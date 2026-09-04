// Set up a plain, undisputed breach of the simple red line, so the only thing
// under test is whatever else is different about the protocol.
//
//   node breach.mjs <halt> <vault>
import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';
const [HALT, VAULT] = process.argv.slice(2);
const load = async (n,p) => { const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`,'utf8'),p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) }); };
const owner = await load('padv',PASS.padv);
const user = await load('ppub',PASS.ppub);
const GEN = 10n**18n;
const read = r => { const l=r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return { e:l?.execution_result }; } };
async function send(c,a,fn,args,v=0n){ const h=await c.writeContract({address:a,functionName:fn,args,value:v});
  return read(await c.waitForTransactionReceipt({hash:h,status:'FINALIZED',retries:200,interval:6000})); }

const LINE = 'No address may withdraw more than half of what it deposited into this vault '
  + 'inside any ten minute window.';

console.log('protect ', JSON.stringify(await send(owner, HALT, 'protect', [VAULT, LINE], GEN/100n)));
console.log('deposit ', JSON.stringify(await send(user, VAULT, 'deposit', [], 4n*GEN/100n)));
console.log('withdraw', JSON.stringify(await send(user, VAULT, 'withdraw', [String(3n*GEN/100n)])));
console.log('\nstatus:\n' + await owner.readContract({ address: VAULT, functionName: 'status', args: [] }));
