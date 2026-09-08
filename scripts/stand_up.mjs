// Stand the whole thing up on one network, from nothing.
//
//   HALT_NET=studionext node scripts/stand_up.mjs
//
// A guardian, two healthy protocols with their red lines published and bounties
// behind them, and the writer that composes the attempts on the page. Six
// transactions, and it prints the addresses in the shape the page wants them.
//
// This exists because the reviewers asked for the submission to be on the
// preview rather than the old Studio, and moving there is not editing an
// address in one file: a guardian on one network knows nothing about a protocol
// on another, and a page pointed halfway between the two would show a line
// nobody is guarding.
import { Wallet } from 'ethers';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { KS, PASS } from './keys.mjs';
import { chain, NET, EXPLORER, createClient, createAccount } from './network.mjs';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const say = console.log;

const load = async (who, password) => {
  const w = await Wallet.fromEncryptedJson(
    fs.readFileSync(`${KS}/${who}.json`, 'utf8'), password);
  return { client: createClient({ chain, account: createAccount(w.privateKey) }), address: w.address };
};

const owner = await load('padv', PASS.padv);
const holder = await load('ppub', PASS.ppub);
const GEN = 10n ** 18n;

const RED_LINE = 'No address may withdraw more than half of what it deposited into this vault '
  + 'within ten minutes. A pattern of repeated withdrawals that empties a holder position '
  + 'faster than that is forbidden and the vault must stop.';

const read = receipt => {
  const leader = receipt?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(leader?.result?.payload?.readable ?? '"{}"')); }
  catch { return { execution: leader?.execution_result }; }
};

// The preview charges for a round and refuses a transaction that offers
// nothing, with FeeValueMustBeNonZero and no further explanation. The amount is
// not something to guess: the release candidate SDK reads the current fee
// policy and works it out, and the stable one has no such method because the
// stable network does not charge. So it is asked for when it exists.
const fees = await owner.client.estimateTransactionFees?.({});
if (fees) say('  fee per transaction ' + (Number(fees.feeValue) / 1e18).toFixed(4) + ' GEN');

// The two SDKs want the wait asked for differently, and the older spelling on
// the newer one comes back with a receipt that has no address in it. Falling
// back to `recipient` there looked like it worked and produced four addresses
// with no contracts behind them, which is a failure worth naming: an address is
// not a deployment, and nothing checked.
const settle = (who, hash) => who.client.waitForTransactionReceipt(
  fees ? { hash, waitUntil: 'finalized', retries: 200, interval: 6000 }
       : { hash, status: 'FINALIZED', retries: 200, interval: 6000 });

async function deploy(who, file, args) {
  const hash = await who.client.deployContract({
    code: fs.readFileSync(path.join(ROOT, file)), args, leaderOnly: false,
    ...(fees ? { fees } : {}) });
  const receipt = await settle(who, hash);
  const at = receipt?.data?.contract_address;
  if (!at) throw new Error('no contract address came back for ' + file);
  return at;
}

async function send(who, address, fn, args, value = 0n) {
  const hash = await who.client.writeContract({
    address, functionName: fn, args, value, ...(fees ? { fees } : {}) });
  return read(await settle(who, hash));
}

say('Standing Halt up on ' + NET);
say('');
say('  owner  ' + owner.address);
say('  holder ' + holder.address);
say('');

const GUARDIAN = await deploy(owner, 'contracts/halt.py', []);
say('  guardian   ' + GUARDIAN);

const PROSECUTOR = await deploy(owner, 'contracts/prosecutor.py', []);
say('  prosecutor ' + PROSECUTOR);

// Two, because the demo invites people to try to stop one. A spare means the
// first person who succeeds does not end the demonstration for everybody after
// them, and that they succeeded is itself worth showing.
const vaults = [];
for (let i = 0; i < 2; i++) {
  const vault = await deploy(owner, 'contracts/vault.py', [GUARDIAN]);
  say('  protocol   ' + vault);
  say('    protect ' + JSON.stringify(
    await send(owner, GUARDIAN, 'protect', [vault, RED_LINE], GEN / 100n)));
  say('    deposit ' + JSON.stringify(
    await send(holder, vault, 'deposit', [], 4n * GEN / 100n)));
  vaults.push(vault);
}

say('');
say('For docs/index.html:');
say('');
say('const GUARDIAN = "' + GUARDIAN + '";');
say('const PROSECUTOR = "' + PROSECUTOR + '";');
say('const TARGETS = [');
for (const v of vaults) say('  "' + v + '",');
say('];');
say('');
say('Explorer: ' + EXPLORER);

fs.mkdirSync(path.join(ROOT, 'results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'results', 'stood_up_' + NET + '.json'), JSON.stringify({
  at: new Date().toISOString(), network: NET, chain_id: chain.id,
  rpc: chain.rpcUrls.default.http[0], explorer: EXPLORER,
  guardian: GUARDIAN, prosecutor: PROSECUTOR, protocols: vaults,
  owner: owner.address, holder: holder.address, red_line: RED_LINE,
}, null, 2));
say('Written to results/stood_up_' + NET + '.json');
