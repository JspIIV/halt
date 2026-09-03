// What an alarm actually costs, read from a receipt rather than estimated.
//
// The answer, on Studionet, is that there is no answer to quote: a finalized
// alarm comes back with a gaslimit and no price against it. Kept because the
// question gets asked, and "we checked and the network does not price it" is a
// better answer than a number somebody made up.
import { createClient } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
const c = createClient({ chain: studionet });
const battery = JSON.parse(fs.readFileSync('results/battery.json', 'utf8'));
const hash = process.argv[2] || battery.refusals[0].tx;
const r = await c.getTransaction({ hash });
const interesting = {};
for (const [k, v] of Object.entries(r || {})) {
  if (/gas|fee|price|cost|value|consumed|burn/i.test(k)) interesting[k] = v;
}
console.log('tx', hash);
console.log('fields', Object.keys(r || {}).join(', '));
console.log('cost-ish', JSON.stringify(interesting, (_, v) => typeof v === 'bigint' ? String(v) : v, 1));
