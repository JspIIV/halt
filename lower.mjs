import { Wallet } from '../courtscan/node_modules/ethers/lib.esm/index.js';
import { createClient, createAccount } from '../placard-app/node_modules/genlayer-js/dist/index.js';
import { studionet } from '../placard-app/node_modules/genlayer-js/dist/chains/index.js';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';
const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/padv.json`, 'utf8'), PASS.padv);
const c = createClient({ chain: studionet, account: createAccount(w.privateKey) });
const h = await c.writeContract({ address: process.argv[2], functionName: 'lower', args: [process.argv[3]], value: 0n });
const r = await c.waitForTransactionReceipt({ hash: h, status: 'FINALIZED', retries: 150, interval: 8000 });
const l = r?.consensus_data?.leader_receipt?.[0];
try { console.log(JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"'))); } catch { console.log(l?.execution_result); }
