// The whole demo, chained: deploy a guardian, deploy a vault, protect it,
// breach it, raise a true alarm, and confirm the halt. One command, real
// Studionet, nothing simulated.
//
// GenLayer has no local testnet to spin up the way Hardhat or Anvil do.
// Studionet is a shared, hosted network, so every step here is a real
// transaction on it and the whole run takes a few minutes end to end.
//
//   node scripts/onecommand.mjs
import { Wallet } from 'ethers';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import { KS, PASS } from './keys.mjs';

const started = Date.now();
const since = () => ((Date.now() - started) / 1000).toFixed(0) + 's';
const step = label => console.log(`\n[${since()}] ${label}`);

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
async function send(c, address, fn, args, v = 0n) {
  const h = await c.writeContract({ address, functionName: fn, args, value: v });
  const out = read(await c.waitForTransactionReceipt(
    { hash: h, status: 'FINALIZED', retries: 200, interval: 6000 }));
  return { ...out, _tx: h };
}
async function deploy(c, file, args) {
  const h = await c.deployContract({ code: fs.readFileSync(file), args, leaderOnly: false });
  const r = await c.waitForTransactionReceipt({ hash: h, status: 'FINALIZED', retries: 200, interval: 6000 });
  return r?.data?.contract_address ?? r?.contract_address;
}

const LINE = 'No address may withdraw more than half of what it deposited into this vault '
  + 'inside any ten minute window.';

step('deploying the guardian');
const HALT = await deploy(owner, 'contracts/halt.py', []);
console.log('  guardian', HALT);

step('deploying a vault that will ask it before paying out');
const VAULT = await deploy(owner, 'contracts/vault.py', [HALT]);
console.log('  vault   ', VAULT);

step('the owner publishes the red line and funds the bounty');
const protect = await send(owner, HALT, 'protect', [VAULT, LINE], GEN / 100n);
console.log(' ', JSON.stringify(protect), '\n  tx', protect._tx);

step('a user deposits, then withdraws three quarters of it inside the window');
const deposit = await send(user, VAULT, 'deposit', [], 4n * GEN / 100n);
console.log('  deposit ', JSON.stringify(deposit));
const withdraw = await send(user, VAULT, 'withdraw', [String(3n * GEN / 100n)]);
console.log('  withdraw', JSON.stringify(withdraw), '\n  tx', withdraw._tx);

step('someone else raises a true alarm, with a deposit behind it');
const evidence = 'Address ' + user.account.address + ' deposited 40000000000000000 wei into '
  + 'this vault and has now withdrawn 30000000000000000 wei of it, three quarters of its '
  + 'position, well inside the ten minute window the published line names.';
const alarm = await send(user, HALT, 'raise_alarm', [VAULT, evidence], GEN / 500n);
console.log('  ', JSON.stringify(alarm), '\n  tx', alarm._tx);

step('checking the guard');
const halted = await owner.readContract({ address: HALT, functionName: 'halted', args: [VAULT] });
const status = JSON.parse(await owner.readContract({ address: VAULT, functionName: 'status', args: [] }));

console.log('\n' + '='.repeat(60));
console.log(alarm.outcome === 'UPHELD' && (halted === true || halted === 'true')
  ? 'PASS: the alarm was upheld and the vault is halted'
  : 'DID NOT MATCH THE EXPECTED OUTCOME, see the transactions above');
console.log('  outcome        ', alarm.outcome);
console.log('  why            ', alarm.why);
console.log('  halted()       ', halted);
console.log('  vault reports  ', status.halted);
console.log('  total time     ', since());
console.log('='.repeat(60));
