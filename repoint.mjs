// Move a vault onto a different guardian and open a guard on it there.
//
// Used to re run a question against a changed contract without rebuilding the
// ledger underneath it, so the only thing that differs between the before and
// the after is the guardian.
//
//   node repoint.mjs <new halt> <vault> [lower first]
import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
const [HALT, VAULT, LOWER] = process.argv.slice(2);
const KS = String.raw`C:\Users\ysfym\.genlayer\keystores`;
const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/padv.json`,'utf8'), 'placard-test-adv-2026');
const owner = createClient({ chain: studionet, account: createAccount(w.privateKey) });
const GEN = 10n**18n;
const read = r => { const l=r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return { e:l?.execution_result }; } };
async function send(a,fn,args,v=0n){ const h=await owner.writeContract({address:a,functionName:fn,args,value:v});
  return read(await owner.waitForTransactionReceipt({hash:h,status:'FINALIZED',retries:200,interval:6000})); }

const RED_LINE =
  'Addresses acting together are one actor in this vault, and no actor may take out more than '
  + 'a third of everything the vault holds inside ten minutes, however many separate addresses '
  + 'it spreads itself across. Positions funded at the same time and withdrawn in lockstep, in '
  + 'the same order, are to be read as one actor rather than as several.';

if (LOWER) {
  const old = JSON.parse(await owner.readContract({ address: VAULT, functionName: 'status', args: [] }));
  console.log('lower on old guardian', JSON.stringify(await send(old.guardian, 'lower', [VAULT])));
}
console.log('point_at', JSON.stringify(await send(VAULT, 'point_at', [HALT])));
console.log('protect ', JSON.stringify(await send(HALT, 'protect', [VAULT, RED_LINE], GEN/100n)));
