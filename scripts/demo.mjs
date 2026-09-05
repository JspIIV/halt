// The scenes, arranged so they can be filmed.
//
//   node scripts/demo.mjs setup <scene>     off camera: deploys and prepares
//   node scripts/demo.mjs <scene>           on camera: sends, waits, holds
//
// Filming a consensus round is filming forty seconds of nothing. So each scene
// splits in two and the waiting falls between the takes:
//
//   1. Start recording, run the scene. It sends the transaction, prints the
//      hash, and tells you it is safe to stop.
//   2. Stop recording and go away. The script keeps waiting, and when the
//      answer arrives it does NOT print it. It holds it.
//   3. Come back, start recording again, press enter. The verdict appears.
//
// Nothing here is staged: the answer genuinely arrived from the network and is
// genuinely being shown for the first time. What has been cut is the part where
// a person watches a spinner.
//
// While nobody is watching, the round is polled every fifteen seconds rather
// than every four, which costs a third of the requests. Studionet rations thirty
// a minute and five hundred an hour, and a day of filming will meet both.
import { Wallet } from 'ethers';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { KS, PASS } from './keys.mjs';

const GEN = 10n ** 18n;
const HERE = 'results/demo';
const load = async (n, p) => {
  const w = await Wallet.fromEncryptedJson(fs.readFileSync(`${KS}/${n}.json`, 'utf8'), p);
  return createClient({ chain: studionet, account: createAccount(w.privateKey) });
};

const read = r => {
  const l = r?.consensus_data?.leader_receipt?.[0];
  try { return JSON.parse(JSON.parse(l?.result?.payload?.readable ?? '"{}"')); }
  catch { return {}; }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

/** Big enough to read on a recording that somebody will watch at half size. */
const rule = () => console.log('\n' + '─'.repeat(78) + '\n');
const say = (...s) => console.log(...s);
const wrap = (s, at = 74) => String(s).replace(new RegExp('(.{' + at + '}\\s)', 'g'), '$1\n');

async function send(c, address, fn, args, value = 0n, quiet = true) {
  const hash = await c.writeContract({ address, functionName: fn, args, value });
  const r = await c.waitForTransactionReceipt(
    { hash, status: 'FINALIZED', retries: 200, interval: quiet ? 15000 : 6000 });
  return { ...read(r), _tx: hash };
}

async function deploy(file, args) {
  const hash = await owner.deployContract({ code: fs.readFileSync(file), args, leaderOnly: false });
  const r = await owner.waitForTransactionReceipt(
    { hash, status: 'FINALIZED', retries: 200, interval: 15000 });
  return r?.data?.contract_address ?? r?.contract_address;
}

// The guardian as it was before it read balances for itself. Still deployed,
// still immutable, still wrong in the way it was wrong, which is the only
// honest way to show the fault: on the contract that had it.
const GUARD_BEFORE = '0x2E3F18f16b590D1952ec865D337A33E59412e517';
const GUARD_NOW = '0x280eff6e765C5d72C97F8ee406ED838257C89DfB';

const NUMERIC = 'No address may withdraw more than half of what it deposited into this vault '
  + 'inside any ten minute window.';
const ACTOR = 'Addresses acting together are one actor in this vault, and no actor may take out '
  + 'more than a third of everything the vault holds inside ten minutes, however many separate '
  + 'addresses it spreads itself across. Positions funded within a few minutes of each other for '
  + 'amounts of the same size, and then drawn on in the same order they were funded, are to be '
  + 'read as one actor rather than as several.';

/**
 * Each scene knows how to prepare itself off camera and what single transaction
 * to send on camera. Nothing on camera takes more than one send, because every
 * send is another forty seconds of somebody watching a cursor.
 */
const SCENES = {
  fooled: {
    what: 'A protocol reports false figures, and the guard believes it',
    guard: GUARD_BEFORE,
    async setup() {
      const vault = await deploy('contracts/quiet_vault.py', [GUARD_BEFORE]);
      await send(owner, GUARD_BEFORE, 'protect', [vault, NUMERIC], GEN / 100n);
      await send(other, vault, 'deposit', [], 4n * GEN / 100n);
      const gone = await send(other, vault, 'withdraw', [String(3n * GEN / 100n)]);
      return { vault, withdrew: gone.withdrew, guard: GUARD_BEFORE };
    },
    before: s => [
      'The vault really paid out. Three quarters of a position, inside the window:',
      '',
      '    withdrew ' + s.withdrew + ' wei',
      '',
      'And this is what it says about itself when the guard asks:',
      '',
      '    "withdrawn": "0"',
      '',
      'An alarm is now raised on it, truthfully, with a deposit behind it.',
    ],
    scenario: 'true_breach',
    expect: 'REFUSED',
    after: [
      'The claim was true. The round was still right: on that record, refusing is',
      'the only defensible answer. The guard read the protocol\'s own account of',
      'itself, and the protocol wrote it.',
    ],
  },

  fixed: {
    what: 'The same lie, told to a guard that reads the chain itself',
    guard: GUARD_NOW,
    async setup() {
      const vault = await deploy('contracts/quiet_vault.py', [GUARD_NOW]);
      await send(owner, GUARD_NOW, 'protect', [vault, NUMERIC], GEN / 100n);
      await send(other, vault, 'deposit', [], 4n * GEN / 100n);
      const gone = await send(other, vault, 'withdraw', [String(3n * GEN / 100n)]);
      return { vault, withdrew: gone.withdrew, guard: GUARD_NOW };
    },
    before: () => [
      'Same protocol, same lie, same claim. One line is different in the guard:',
      '',
      '    gl.get_contract_at(address).balance',
      '',
      'It reads what the protocol holds from the chain rather than from the report.',
      'A protocol can write anything it likes. It cannot hold money it does not have.',
    ],
    scenario: 'true_breach',
    expect: 'UPHELD',
    after: [
      'The report claimed 40000000000000000 wei was still owed to somebody.',
      'The chain says the protocol holds 10000000000000000. The report cannot be true,',
      'and a false report is not weak evidence for the protocol. It is none.',
    ],
  },

  actor: {
    what: 'A red line no contract could evaluate',
    guard: GUARD_NOW,
    async setup() {
      const vault = await deploy('contracts/vault.py', [GUARD_NOW]);
      await send(owner, GUARD_NOW, 'protect', [vault, ACTOR], GEN / 100n);
      await send(owner, vault, 'deposit', [], 4n * GEN / 100n);
      await send(other, vault, 'deposit', [], 4n * GEN / 100n);
      await send(owner, vault, 'withdraw', [String(16n * GEN / 1000n)]);
      await send(other, vault, 'withdraw', [String(16n * GEN / 1000n)]);
      return { vault, guard: GUARD_NOW };
    },
    before: () => [
      'Two addresses. Each deposited 0.04 GEN and each took 0.016 back out.',
      'Forty percent of its own position, twice, and every per address limit',
      'anybody could write is satisfied. Twice.',
      '',
      'This project\'s own threshold agent was pointed at this exact state and',
      'reported nothing out of line, three times.',
      '',
      'The line says addresses acting together are one actor.',
    ],
    scenario: 'k_plain',
    expect: 'UPHELD',
    after: [
      'An actor is not a field in any ledger. The round read the funding and the',
      'withdrawal timing out of the protocol\'s own record, decided the two',
      'addresses were one actor, and applied the ordinary number to that actor.',
    ],
  },

  turkish: {
    what: 'The same claim, in another language',
    guard: GUARD_NOW,
    async setup() {
      const vault = await deploy('contracts/vault.py', [GUARD_NOW]);
      await send(owner, GUARD_NOW, 'protect', [vault, NUMERIC], GEN / 100n);
      await send(other, vault, 'deposit', [], 4n * GEN / 100n);
      await send(other, vault, 'withdraw', [String(3n * GEN / 100n)]);
      return { vault, guard: GUARD_NOW };
    },
    before: () => [
      'The red line is in English. The evidence about to be sent is in Turkish,',
      'and nothing in the guard translates it or knows it is a different language.',
    ],
    scenario: 'x_turkish',
    expect: 'UPHELD',
    after: [
      'Validators read what a claim means rather than matching its strings.',
      'That is not a feature this project added. It is the network underneath it.',
    ],
  },
};

// ---------------------------------------------------------------- the filming

function keypress(prompt) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

const [command, name] = process.argv.slice(2);
const scene = SCENES[name] || SCENES[command];

if (!scene) {
  say('Scenes: ' + Object.keys(SCENES).join(', '));
  say('\n  node scripts/demo.mjs setup <scene>   off camera, prepares it');
  say('  node scripts/demo.mjs <scene>         on camera, films it');
  process.exit(1);
}

// Opened only once a scene has been named, so that asking for the list of
// scenes does not first demand two keystores.
const owner = await load('padv', PASS.padv);
const other = await load('ppub', PASS.ppub);

fs.mkdirSync(HERE, { recursive: true });
const stateFile = path.join(HERE, (name || command) + '.json');

if (command === 'setup') {
  say('Preparing "' + scene.what + '". This is the part nobody films.');
  const state = await scene.setup();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  say('\nReady. Vault ' + state.vault);
  say('Film it with:  node scripts/demo.mjs ' + (name || command));
  process.exit(0);
}

let state;
try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
catch {
  say('Nothing prepared yet. Run this first, off camera:');
  say('\n  node scripts/demo.mjs setup ' + (name || command));
  process.exit(1);
}

const evidence = fs.readFileSync('scenarios/' + scene.scenario + '.txt', 'utf8').trim();

console.clear();
rule();
say('  ' + scene.what.toUpperCase());
rule();
for (const l of (typeof scene.before === 'function' ? scene.before(state) : scene.before)) say('  ' + l);
say('');
say('  guardian  ' + state.guard);
say('  protocol  ' + state.vault);
rule();
say('  THE CLAIM\n');
say(wrap(evidence).split('\n').map(l => '  ' + l).join('\n'));
rule();

await keypress('  press enter to send it  ');

const started = Date.now();
const hash = await other.writeContract({
  address: state.guard, functionName: 'raise_alarm',
  args: [state.vault, evidence], value: GEN / 500n,
});

say('');
say('  sent, with 0.002 GEN staked behind it');
say('  ' + hash);
say('');
say('  The validators are reading it now. Stop recording; this will wait, and it');
say('  will not print the answer until you ask it to.');
say('');

const receipt = await other.waitForTransactionReceipt(
  { hash, status: 'FINALIZED', retries: 200, interval: 15000 });
const out = read(receipt);
const seconds = Math.round((Date.now() - started) / 1000);

process.stdout.write('');
await keypress('  the answer is in. press enter to see it  ');

rule();
say('  ' + (out.outcome || 'no verdict') + (out.outcome === scene.expect ? '' : '   (not what we expected)'));
say('');
say(wrap(out.why || out.error || '').split('\n').map(l => '  ' + l).join('\n'));
say('');
say('  ' + seconds + ' seconds, ' + hash);
rule();
for (const l of scene.after) say('  ' + l);
say('');

fs.writeFileSync(stateFile, JSON.stringify(
  { ...state, filmed: { outcome: out.outcome, why: out.why, seconds, tx: hash } }, null, 2));
