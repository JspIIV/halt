// Does reading the protocol's own book change what the round decides?
//
//   node scripts/prove_record.mjs
//
// The guard used to be handed a summary the protocol wrote about itself. A
// summary can say the vault still holds roughly what it should; it cannot say
// who moved what, in what order, how close together. So a claim naming an
// address and three withdrawals had nothing to be checked against, and this
// project has the failure on record: a **true** alarm was refused because the
// protocol reported only totals.
//
// Now the guardian also reads `entries`, the protocol's own movement record,
// and a protocol may name a witness that does arithmetic over the same book.
// Both were asked for by reviewers, in as many words, on the GenLayer call of
// 8 September.
//
// Two questions here, and the second matters as much as the first:
//
//   a true claim, naming an address and figures the book bears out
//     -> upheld, and the reason should name the movements
//
//   an invented claim, written to be believed, against a protocol where
//   nothing happened
//     -> refused, and the reason should say the book does not show it
//
// A change that only made the first one work would be a change that made the
// guard easier to fool.
import { Wallet } from 'ethers';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { KS, PASS } from './keys.mjs';
import { chain, NET, EXPLORER, createClient, createAccount } from './network.mjs';

const ROOT = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..');
// The preview runs executor v0.3 and takes the ported contracts. Same code,
// same comments, the differences are in scripts/port_to_v03.py.
const SRC = NET === 'studionet' ? 'contracts' : 'contracts/next';
const out = [];
const say = line => { console.log(line); out.push(line); };

const load = async (who, password) => {
  const w = await Wallet.fromEncryptedJson(
    fs.readFileSync(`${KS}/${who}.json`, 'utf8'), password);
  return { client: createClient({ chain, account: createAccount(w.privateKey) }),
           address: w.address };
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
  catch { return {}; }
};

const fees = await owner.client.estimateTransactionFees?.({});
const settle = (who, hash) => who.client.waitForTransactionReceipt(
  fees ? { hash, waitUntil: 'finalized', retries: 200, interval: 6000 }
       : { hash, status: 'FINALIZED', retries: 200, interval: 6000 });

async function deploy(who, file, args) {
  const hash = await who.client.deployContract({
    code: fs.readFileSync(path.join(ROOT, SRC, file)), args, leaderOnly: false,
    ...(fees ? { fees } : {}) });
  const receipt = await settle(who, hash);
  const at = receipt?.data?.contract_address;
  if (!at) throw new Error('no contract address for ' + file);
  return at;
}

// A write that pays an address or calls another contract emits an internal
// message, and on the preview the transaction's fee has to reserve budget for
// it or the whole call reverts with `fee no_matching_allocation`. The plain
// estimate does not know what a call will emit; this one simulates the call and
// comes back with the allocations. On the stable network there is no fee at all
// and this returns nothing, so the generic path is kept as the fallback.
async function feesFor(who, address, fn, args, value) {
  if (!fees) return undefined;
  try {
    return await who.client.estimateTransactionFeesForWrite({
      account: who.client.account, address, functionName: fn, args, value });
  } catch { return fees; }
}

async function send(who, address, fn, args, value = 0n) {
  const perCall = await feesFor(who, address, fn, args, value);
  const hash = await who.client.writeContract({
    address, functionName: fn, args, value, ...(perCall ? { fees: perCall } : {}) });
  return { said: read(await settle(who, hash)), hash };
}

const reader = createClient({ chain });
const view = (address, fn, args = []) =>
  reader.readContract({ address, functionName: fn, args });

say('Does the protocol\'s own book change the answer?');
say('');
say('  network ' + NET);
say('  owner   ' + owner.address);
say('  holder  ' + holder.address);
say('');

const GUARDIAN = await deploy(owner, 'halt.py', []);
say('  guardian ' + GUARDIAN);
const MONITOR = await deploy(owner, 'monitor.py', []);
say('  witness  ' + MONITOR);

// ------------------------------------------------- the protocol being emptied

const DRAINED = await deploy(owner, 'vault.py', [GUARDIAN]);
say('  protocol being emptied ' + DRAINED);
await send(owner, GUARDIAN, 'protect', [DRAINED, RED_LINE], GEN / 100n);
await send(owner, GUARDIAN, 'name_witness', [DRAINED, MONITOR]);
await send(holder, DRAINED, 'deposit', [], 4n * GEN / 100n);

say('');
say('The holder takes most of its position out, in three goes, minutes apart.');
for (const amount of ['8000000000000000', '9000000000000000', '7000000000000000']) {
  const { said } = await send(holder, DRAINED, 'withdraw', [amount]);
  say('  withdrew ' + amount + ' -> ' + JSON.stringify(said).slice(0, 90));
}

const witnessSays = String(await view(MONITOR, 'report', [DRAINED]));
say('');
say('What the protocol\'s own witness reports, unprompted:');
for (const line of witnessSays.split('\n')) say('    ' + line);

// ------------------------------------------------------ the untouched protocol

const UNTOUCHED = await deploy(owner, 'vault.py', [GUARDIAN]);
say('');
say('  untouched protocol ' + UNTOUCHED);
await send(owner, GUARDIAN, 'protect', [UNTOUCHED, RED_LINE], GEN / 100n);
await send(owner, GUARDIAN, 'name_witness', [UNTOUCHED, MONITOR]);
await send(holder, UNTOUCHED, 'deposit', [], 4n * GEN / 100n);

// ------------------------------------------------------------------ the alarms

const TRUE_CLAIM =
  'Address ' + holder.address + ' has withdrawn 0.024 GEN from this vault in three '
  + 'transactions a few minutes apart, out of the 0.04 GEN it deposited. That is sixty '
  + 'percent of its position taken out inside the window, and the withdrawals are in the '
  + 'vault\'s own ledger.';

const INVENTED_CLAIM =
  'Address ' + holder.address + ' has withdrawn 0.031 GEN from this vault in three '
  + 'transactions over the last eight minutes, out of the 0.04 GEN it deposited. That is '
  + 'seventy eight percent of its position taken out inside the window, and the position '
  + 'is nearly empty.';

async function alarm(where, claim, label) {
  say('');
  say(label);
  const started = Date.now();
  const { said, hash } = await send(holder, GUARDIAN, 'raise_alarm', [where, claim], GEN / 500n);
  const seconds = Math.round((Date.now() - started) / 1000);
  const outcome = said.outcome ?? (said.error ? 'error: ' + said.error : 'unreadable');
  say('  ' + outcome + ' in ' + seconds + 's');
  if (said.why) say('  "' + said.why + '"');
  return { outcome, why: said.why ?? null, seconds, hash, claim };
}

const upheld = await alarm(DRAINED, TRUE_CLAIM,
  'A true claim against the protocol that really is being emptied.');
const refused = await alarm(UNTOUCHED, INVENTED_CLAIM,
  'The same shape of claim, precise and invented, against the one where nothing happened.');

const mentions = (text, words) =>
  words.some(w => String(text || '').toLowerCase().includes(w));

const checks = [
  ['the true claim is upheld, which the summary alone could not support',
    upheld.outcome === 'UPHELD'],
  ['and the reason rests on what the protocol recorded rather than on the claim',
    mentions(upheld.why, ['ledger', 'record', 'withdraw', 'movement', 'book', 'entries'])],
  ['the invented claim is refused', refused.outcome === 'REFUSED'],
  ['and the reason says the record does not show it',
    mentions(refused.why, ['no ', 'not', 'does not', 'record', 'ledger', 'movement'])],
  ['the witness reports figures rather than an opinion',
    witnessSays.includes('percent of what it put in')],
  ['the halted protocol is halted', (await view(GUARDIAN, 'halted', [DRAINED])) === true],
  ['and the untouched one is not', (await view(GUARDIAN, 'halted', [UNTOUCHED])) === false],
];

say('');
for (const [label, ok] of checks) say((ok ? '  ok   ' : ' FAIL  ') + label);
const failed = checks.filter(([, ok]) => !ok);
say('');
say(failed.length
  ? `${failed.length} of ${checks.length} checks failed`
  : `${checks.length} checks. The round is checking a claim rather than weighing a story.`);

fs.mkdirSync(path.join(ROOT, 'results'), { recursive: true });
const OUTFILE = NET === 'studionet' ? 'record.json' : 'record_' + NET + '.json';
fs.writeFileSync(path.join(ROOT, 'results', OUTFILE), JSON.stringify({
  proved_at: new Date().toISOString(), network: NET, explorer: EXPLORER,
  guardian: GUARDIAN, witness: MONITOR, drained: DRAINED, untouched: UNTOUCHED,
  witness_report: witnessSays, upheld, refused,
  checks: checks.map(([label, ok]) => ({ label, ok })), transcript: out,
}, null, 2));
say('');
say('Written to results/record.json');
process.exit(failed.length ? 1 : 0);
