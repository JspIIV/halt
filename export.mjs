// Export what the guard knows, for the page to read.
//
// The page shows the chain rather than a story about it: guards, their red
// lines, every alarm and the reason the validators gave, exported straight from
// the contract.
//
//   node export.mjs <halt> <vault>
import { createClient } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';

const HALT = process.argv[2];
const VAULT = process.argv[3];
const c = createClient({ chain: studionet });
const parse = v => JSON.parse(typeof v === 'string' ? v : String(v));

const size = parse(await c.readContract({ address: HALT, functionName: 'size', args: [] }));
const guard = parse(await c.readContract({ address: HALT, functionName: 'guard', args: [VAULT] }));
const history = parse(await c.readContract({ address: HALT, functionName: 'history', args: [VAULT] }));
const vault = VAULT ? parse(await c.readContract({ address: VAULT, functionName: 'status', args: [] })) : null;
const ledger = VAULT ? parse(await c.readContract({ address: VAULT, functionName: 'entries', args: ['30'] })) : null;

let battery = null;
try { battery = JSON.parse(fs.readFileSync('results/battery.json', 'utf8')); } catch {}

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/data.json', JSON.stringify({
  halt: HALT, vault: VAULT, network: 'GenLayer Studionet',
  exported_at: new Date().toISOString(),
  size, guard: guard.guard ?? null, alarms: history.alarms ?? [],
  vault_status: vault, ledger: ledger?.entries ?? [],
  battery: battery ? { summary: battery.summary, refusals: battery.refusals, timings: battery.timings } : null,
}, null, 2));
console.log('guards', size.protected, 'alarms', size.alarms, JSON.stringify(size.outcomes));
