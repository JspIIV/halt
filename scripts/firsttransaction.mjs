// The one case this project could not touch, and the exact size of what it can
// now do about it.
//
// Everything else here stops the withdrawal after the one that broke the rule.
// A protocol that asks `would_break` before it pays refuses the one in front of
// it, in the same transaction, with no round and no model anywhere in the path.
// What it cannot do is the same as before: a breach that needs reading needs a
// round, and a round in the path of every payment is not a protection anybody
// would keep.
//
//   node firsttransaction.mjs [halt] [vault]
import { Wallet } from 'ethers';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';

const load = async (n, p) => {
  const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`, 'utf8'), p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) });
};
const owner = await load('padv', PASS.padv);
const user = await load('ppub', PASS.ppub);
const GEN = 10n ** 18n;
const read = r => {
  const l = r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); }
  catch { return { e: l?.execution_result }; }
};
async function send(c, a, fn, args, v = 0n) {
  const h = await c.writeContract({ address: a, functionName: fn, args, value: v });
  return read(await c.waitForTransactionReceipt(
    { hash: h, status: 'FINALIZED', retries: 240, interval: 4000 }));
}
async function deploy(file, args) {
  const h = await owner.deployContract({ code: fs.readFileSync(file), args, leaderOnly: false });
  const r = await owner.waitForTransactionReceipt(
    { hash: h, status: 'FINALIZED', retries: 240, interval: 4000 });
  return r?.data?.contract_address ?? r?.contract_address;
}

const LINE = 'No address may withdraw more than half of what it deposited into this vault '
  + 'inside any ten minute window.';

let HALT = process.argv[2];
if (!HALT) { HALT = await deploy('contracts/halt.py', []); console.log('guardian', HALT); }
let VAULT = process.argv[3];
if (!VAULT) { VAULT = await deploy('contracts/vault.py', [HALT]); console.log('vault   ', VAULT); }

console.log('protect ', JSON.stringify(await send(owner, HALT, 'protect', [VAULT, LINE], GEN / 100n)));
console.log('deposit ', JSON.stringify(await send(user, VAULT, 'deposit', [], 4n * GEN / 100n)));
// Published after the deposit, so the high point is the funded balance.
console.log('floor   ', JSON.stringify(await send(owner, HALT, 'promise', [VAULT, '50', '600'])));

// A quarter of it. Inside the floor, and it goes through.
console.log('\ntaking a quarter, which the floor allows');
console.log('  ', JSON.stringify(await send(user, VAULT, 'withdraw', [String(GEN / 100n)])));

// Another 37 percent of the high point on top of that, which is not.
console.log('\ntaking enough to cross it, in one transaction');
const refused = await send(user, VAULT, 'withdraw', [String(15n * GEN / 1000n)]);
console.log('  ', JSON.stringify(refused));

const halted = await owner.readContract({ address: HALT, functionName: 'halted', args: [VAULT] });
const asked = JSON.parse(await owner.readContract(
  { address: HALT, functionName: 'would_break', args: [VAULT, String(15n * GEN / 1000n)] }));
console.log('\nthe guard was never raised:', halted === false || halted === 'false');
console.log('what the guard answered   :', JSON.stringify(asked));
console.log('\nthe money never moved. No alarm, no deposit, no round, no model.');
