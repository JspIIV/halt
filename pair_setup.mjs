// Build a two address pattern on a fresh vault, so the watcher can be shown
// meeting it live rather than reading about it hours later.
//
//   node pair_setup.mjs <halt> <vault> lockstep|apart
//
// lockstep: equal positions, funded together, withdrawn together in the same
//           order. The thing the red line is about.
// apart:    unequal positions, funded a little apart, withdrawn in the opposite
//           order. Close enough that a timing heuristic will flag it, and not
//           the thing the red line is about. The watcher is meant to be wrong
//           here and the round is meant to say so.
import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';
const [HALT, VAULT, MODE] = process.argv.slice(2);
const load = async (n,p) => { const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`,'utf8'),p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) }); };
const A = await load('padv',PASS.padv);
const B = await load('ppub',PASS.ppub);
const GEN = 10n**18n;
const read = r => { const l=r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return { e:l?.execution_result }; } };
async function send(c,a,fn,args,v=0n){ const h=await c.writeContract({address:a,functionName:fn,args,value:v});
  return read(await c.waitForTransactionReceipt({hash:h,status:'FINALIZED',retries:200,interval:6000})); }
const wait = s => new Promise(r => setTimeout(r, s*1000));

const RED_LINE =
  'Addresses acting together are one actor in this vault, and no actor may take out more than '
  + 'a third of everything the vault holds inside ten minutes, however many separate addresses '
  + 'it spreads itself across. Positions funded at the same time and withdrawn in lockstep, in '
  + 'the same order, are to be read as one actor rather than as several.';

console.log('protect ', JSON.stringify(await send(A, HALT, 'protect', [VAULT, RED_LINE], GEN/100n)));

if (MODE === 'lockstep') {
  console.log('A in   ', JSON.stringify(await send(A, VAULT, 'deposit', [], 4n*GEN/100n)));
  console.log('B in   ', JSON.stringify(await send(B, VAULT, 'deposit', [], 4n*GEN/100n)));
  console.log('A out  ', JSON.stringify(await send(A, VAULT, 'withdraw', [String(16n*GEN/1000n)])));
  console.log('B out  ', JSON.stringify(await send(B, VAULT, 'withdraw', [String(16n*GEN/1000n)])));
} else {
  console.log('A in   ', JSON.stringify(await send(A, VAULT, 'deposit', [], 5n*GEN/100n)));
  await wait(60);
  console.log('B in   ', JSON.stringify(await send(B, VAULT, 'deposit', [], 2n*GEN/100n)));
  console.log('B out  ', JSON.stringify(await send(B, VAULT, 'withdraw', [String(8n*GEN/1000n)])));
  await wait(60);
  console.log('A out  ', JSON.stringify(await send(A, VAULT, 'withdraw', [String(20n*GEN/1000n)])));
}
console.log('\n' + await A.readContract({ address: VAULT, functionName: 'status', args: [] }));
