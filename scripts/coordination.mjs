// The line no code can hold.
//
// The vault's first red line was a number: half of your own deposit, ten
// minutes. A judge is right to say that belongs in Solidity, and this does not
// argue with that. It shows the other kind of line.
//
// The line here still has a number in it. What code cannot do is work out who
// the number applies to:
//
//   Addresses acting together are one actor, and no actor may take out more
//   than a third of what this vault holds in ten minutes, however many
//   addresses it spreads itself across.
//
// Two addresses each take twenty percent of the vault. Every per address rule
// anybody could write is satisfied, twice over, and our own threshold watcher
// stays silent because it is looking at addresses. Between them the two take
// forty percent, and they were funded a minute apart and withdrew a minute
// apart in the same order. Deciding they are one actor is not a computation.
// It is a reading, and it is the only reason this project needs GenLayer.
//
//   node coordination.mjs <halt> <vault>
import { Wallet } from 'ethers';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';
const [HALT, VAULT] = process.argv.slice(2);
const load = async (n,p) => { const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`,'utf8'),p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) }); };
const owner = await load('padv',PASS.padv);
const second = await load('ppub',PASS.ppub);
const GEN = 10n**18n;
const read = r => { const l=r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return { e:l?.execution_result }; } };
async function send(c,a,fn,args,v=0n){ const s=Date.now(); const h=await c.writeContract({address:a,functionName:fn,args,value:v});
  const o=read(await c.waitForTransactionReceipt({hash:h,status:'FINALIZED',retries:200,interval:6000}));
  o._seconds=Math.round((Date.now()-s)/1000); return o; }

const RED_LINE =
  'Addresses acting together are one actor in this vault, and no actor may take out more than '
  + 'a third of everything the vault holds inside ten minutes, however many separate addresses '
  + 'it spreads itself across. Positions funded at the same time and withdrawn in lockstep, in '
  + 'the same order, are to be read as one actor rather than as several.';

console.log('the line:', RED_LINE, '\n');
console.log('protect     ', JSON.stringify(await send(owner, HALT, 'protect', [VAULT, RED_LINE], GEN/100n)));
console.log('A deposits  ', JSON.stringify(await send(owner, VAULT, 'deposit', [], 4n*GEN/100n)));
console.log('B deposits  ', JSON.stringify(await send(second, VAULT, 'deposit', [], 4n*GEN/100n)));
// A fifth of the vault each. Half of what any per address rule would allow.
console.log('A withdraws ', JSON.stringify(await send(owner, VAULT, 'withdraw', [String(16n*GEN/1000n)])));
console.log('B withdraws ', JSON.stringify(await send(second, VAULT, 'withdraw', [String(16n*GEN/1000n)])));
console.log('\nwhat the vault reports now:');
console.log(await owner.readContract({ address: VAULT, functionName: 'status', args: [] }));

const EVIDENCE =
  'Two addresses are taking this vault apart between them while each one stays inside every '
  + 'per address limit. The vault reports both positions funded with 40000000000000000 wei '
  + 'about a minute apart, and both have now withdrawn 16000000000000000 wei, about a minute '
  + 'apart and in the same order they were funded. That is 32000000000000000 wei out of the '
  + '80000000000000000 wei the vault held, forty percent of it, inside the same ten minutes. '
  + 'Read as two addresses this is a fifth each and nothing is wrong. Read as one actor using '
  + 'two addresses, which is what the timing shows, it is forty percent and the line is crossed.';

console.log('\nthe alarm, raised by somebody reading the pattern rather than a threshold');
const alarm = await send(second, HALT, 'raise_alarm', [VAULT, EVIDENCE], GEN/500n);
console.log(JSON.stringify(alarm));
console.log('halted?', JSON.parse(await owner.readContract({address:VAULT,functionName:'status',args:[]})).halted);
