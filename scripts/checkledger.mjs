import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
const c = createClient({ chain: studionet });
const s = JSON.parse(await c.readContract({ address: process.argv[2], functionName: 'status', args: [] }));
const e = s.recent.slice().reverse();
const t = e.map(x => Date.parse(x.at));
console.log('order of events, oldest first:');
e.forEach((x, i) => console.log(' ', x.at.slice(11,19), x.kind.padEnd(9), x.who.slice(0,10),
  (i ? '+' + Math.round((t[i]-t[i-1])/1000) + 's' : '')));
const dep = e.filter(x => x.kind === 'deposit').map(x => Date.parse(x.at));
const wit = e.filter(x => x.kind === 'withdraw').map(x => Date.parse(x.at));
console.log('deposits apart:', Math.round(Math.abs(dep[1]-dep[0])/1000) + 's');
console.log('withdrawals apart:', Math.round(Math.abs(wit[1]-wit[0])/1000) + 's');
