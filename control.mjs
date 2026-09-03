// The control the coordination demo needs.
//
// The demo shows a round reading two addresses as one actor. On its own that
// proves nothing: a reader that calls every pair of similar withdrawals
// collusion would also have upheld it, and would be useless. So this is the
// same claim made about a pair that is not coordinated.
//
// Two addresses, different sizes, funded minutes apart, withdrawing out of
// order and at their own pace, each taking roughly the same fraction of its own
// position as the coordinated pair did. Then the same alarm, asking the network
// to read them as one actor.
//
// The demo is only worth something if this one is refused.
//
//   node control.mjs <halt> <vault>
import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
const [HALT, VAULT] = process.argv.slice(2);
const KS = String.raw`C:\Users\ysfym\.genlayer\keystores`;
const load = async (n,p) => { const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`,'utf8'),p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) }); };
const owner = await load('padv','placard-test-adv-2026');
const second = await load('ppub','placard-test-pub-2026');
const GEN = 10n**18n;
const read = r => { const l=r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return { e:l?.execution_result }; } };
async function send(c,a,fn,args,v=0n){ const s=Date.now(); const h=await c.writeContract({address:a,functionName:fn,args,value:v});
  const o=read(await c.waitForTransactionReceipt({hash:h,status:'FINALIZED',retries:200,interval:6000}));
  o._seconds=Math.round((Date.now()-s)/1000); return o; }
const wait = s => new Promise(r => setTimeout(r, s*1000));

const RED_LINE =
  'Addresses acting together are one actor in this vault, and no actor may take out more than '
  + 'a third of everything the vault holds inside ten minutes, however many separate addresses '
  + 'it spreads itself across. Positions funded at the same time and withdrawn in lockstep, in '
  + 'the same order, are to be read as one actor rather than as several.';

console.log('protect  ', JSON.stringify(await send(owner, HALT, 'protect', [VAULT, RED_LINE], GEN/100n)));
// Different sizes. A is more than twice B.
console.log('A in 0.05', JSON.stringify(await send(owner, VAULT, 'deposit', [], 5n*GEN/100n)));
console.log('waiting three minutes so the fundings are nothing like simultaneous');
await wait(180);
console.log('B in 0.02', JSON.stringify(await send(second, VAULT, 'deposit', [], 2n*GEN/100n)));
// Out of order: the one funded second moves first, and the gap is uneven.
console.log('B out    ', JSON.stringify(await send(second, VAULT, 'withdraw', [String(8n*GEN/1000n)])));
console.log('waiting two more minutes');
await wait(120);
console.log('A out    ', JSON.stringify(await send(owner, VAULT, 'withdraw', [String(20n*GEN/1000n)])));
console.log('\nvault:', await owner.readContract({ address: VAULT, functionName: 'status', args: [] }));

const EVIDENCE =
  'Two addresses are taking this vault apart between them while each one stays inside every '
  + 'per address limit. The vault reports two positions, both of which have now withdrawn about '
  + 'forty percent of what they put in, and between them they have taken 28000000000000000 wei '
  + 'out of the 70000000000000000 wei the vault held, which is forty percent of it. Read as two '
  + 'addresses this is nothing. Read as one actor using two addresses it is forty percent and '
  + 'the line is crossed.';

console.log('\nthe same claim, about a pair that is not coordinated');
const alarm = await send(second, HALT, 'raise_alarm', [VAULT, EVIDENCE], GEN/500n);
console.log(JSON.stringify(alarm));
console.log('\nwanted REFUSED, got', alarm.outcome);
fs.writeFileSync('results/control.json', JSON.stringify({
  halt: HALT, vault: VAULT, ran_at: new Date().toISOString(), red_line: RED_LINE,
  evidence: EVIDENCE, alarm,
  question: 'does the one actor reading fire on a pair that only looks similar',
  wanted: 'REFUSED', got: alarm.outcome,
}, null, 2));
