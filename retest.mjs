// Point a vault at the new guardian and open the guard it needs there.
//   node retest.mjs <halt> <vault> <line: simple|actor>
import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';
const [HALT, VAULT, WHICH] = process.argv.slice(2);
const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/padv.json`,'utf8'), PASS.padv);
const owner = createClient({ chain: studionet, account: createAccount(w.privateKey) });
const GEN = 10n**18n;
const read = r => { const l=r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return { e:l?.execution_result }; } };
async function send(a,fn,args,v=0n){ const h=await owner.writeContract({address:a,functionName:fn,args,value:v});
  return read(await owner.waitForTransactionReceipt({hash:h,status:'FINALIZED',retries:200,interval:6000})); }

const LINES = {
  simple: 'No address may withdraw more than half of what it deposited into this vault '
    + 'inside any ten minute window.',
  actor: 'Addresses acting together are one actor in this vault, and no actor may take out more '
    + 'than a third of everything the vault holds inside ten minutes, however many separate '
    + 'addresses it spreads itself across. Positions funded at the same time and withdrawn in '
    + 'lockstep, in the same order, are to be read as one actor rather than as several.',
};
const status = JSON.parse(await owner.readContract({ address: VAULT, functionName: 'status', args: [] }));
if (status.halted) console.log('lower  ', JSON.stringify(await send(status.guardian, 'lower', [VAULT])));
console.log('point  ', JSON.stringify(await send(VAULT, 'point_at', [HALT])));
console.log('protect', JSON.stringify(await send(HALT, 'protect', [VAULT, LINES[WHICH]], GEN/100n)));
