import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
const KS = String.raw`C:\Users\ysfym\.genlayer\keystores`;
const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/padv.json`, 'utf8'), 'placard-test-adv-2026');
const c = createClient({ chain: studionet, account: createAccount(w.privateKey) });
const TARGET = '0x4ae9894c10701CeDd1cF15b5627D4D98407e60b8';
const READER = process.argv[2];
const read = r => { const l = r?.consensus_data?.leader_receipt?.[0]; try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); } catch { return { execution: l?.execution_result, raw: JSON.stringify(l?.result).slice(0,200) }; } };
async function send(addr, fn, args) {
  const h = await c.writeContract({ address: addr, functionName: fn, args, value: 0n });
  return read(await c.waitForTransactionReceipt({ hash: h, status: 'FINALIZED', retries: 150, interval: 8000 }));
}
console.log('target state now:', await c.readContract({ address: TARGET, functionName: 'state', args: [] }));
console.log('typed  ', JSON.stringify(await send(READER, 'read_typed', [TARGET])));
console.log('dynamic', JSON.stringify(await send(READER, 'read_dynamic', [TARGET])));
