// A stop that was wrong, answered rather than waited out.
//
// The vault is untouched. An alarm is raised with figures the ledger does not
// have, and this time it is believed, because the claim is written to be. The
// protocol stops. Then its owner answers, the network takes a second look with
// the vault's own state in front of it, and the stop comes off in the same
// transaction with the alarm's deposit going to the protocol it froze.
import { Wallet } from 'ethers';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';
const [HALT, VAULT] = process.argv.slice(2);
const load = async (n,p) => { const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`,'utf8'),p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) }); };
const owner = await load('padv',PASS.padv);
const accuser = await load('ppub',PASS.ppub);
const GEN = 10n**18n;
const read = r => { const l=r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return { e:l?.execution_result }; } };
async function send(c,a,fn,args,v=0n){ const s=Date.now(); const h=await c.writeContract({address:a,functionName:fn,args,value:v});
  const o=read(await c.waitForTransactionReceipt({hash:h,status:'FINALIZED',retries:200,interval:6000}));
  o._seconds=Math.round((Date.now()-s)/1000); return o; }
const halted = async () => JSON.parse(await owner.readContract({address:VAULT,functionName:'status',args:[]})).halted;

const RED_LINE = 'No address may withdraw more than half of what it deposited into this vault within '
  + 'ten minutes. A pattern of repeated withdrawals that empties a holder position faster than that '
  + 'is forbidden and the vault must stop.';

console.log('protect ', JSON.stringify(await send(owner, HALT, 'protect', [VAULT, RED_LINE], GEN/100n)));
console.log('deposit ', JSON.stringify(await send(accuser, VAULT, 'deposit', [], 4n*GEN/100n)));
console.log('withdraw', JSON.stringify(await send(accuser, VAULT, 'withdraw', [String(3n*GEN/100n)])));
console.log('halted? ', await halted());

console.log('\nan alarm that will be believed');
const alarm = await send(accuser, HALT, 'raise_alarm', [VAULT,
  'Address 0x0b57877ec84d96b672cd47d8ea4424283fdb9f6c deposited 0.04 GEN into this vault and has '
  + 'now withdrawn 0.03 GEN of it, which is three quarters of its position, inside the ten minute '
  + 'window the published line names.'], GEN/500n);
console.log(JSON.stringify(alarm));
console.log('halted? ', await halted());

console.log('\nthe owner answers');
const appeal = await send(owner, HALT, 'appeal', [VAULT,
  'The withdrawal was a single transaction, not a pattern of repeated withdrawals emptying a '
  + 'position, and the depositor is the vault operator moving its own funds. The line forbids a '
  + 'pattern of repeated withdrawals; one withdrawal by the only depositor is not that.']);
console.log(JSON.stringify(appeal));
console.log('halted? ', await halted());
