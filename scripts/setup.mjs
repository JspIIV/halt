// Make the two accounts every other script here needs, and say what to do next.
//
// Written because the four commands in the README did not work on a machine that
// had just cloned this repository. They assumed two GenLayer keystores already
// existed, which is true on the machine this was built on and on no other. A
// project asking to be checked has to be runnable by whoever is checking it.
//
//   node scripts/setup.mjs
//
// Safe to run twice: it will not overwrite a pair that already exists, because
// the second run would otherwise throw away accounts holding testnet balance.
import { Wallet } from 'ethers';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import url from 'url';

// Worked out here rather than imported from keys.mjs, because keys.mjs stops
// with an explanation when there are no accounts, and being run before there
// are any is this script's entire job.
const LOCAL = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', '.halt', 'keystores');

const ROLES = {
  padv: 'owns the protocols and answers appeals',
  ppub: 'deposits, withdraws and raises alarms',
};

fs.mkdirSync(LOCAL, { recursive: true });
const passwordFile = path.join(LOCAL, 'how-to-open.json');

let passwords = {};
try { passwords = JSON.parse(fs.readFileSync(passwordFile, 'utf8')); } catch {}

const made = [];
for (const role of Object.keys(ROLES)) {
  const file = path.join(LOCAL, role + '.json');
  if (fs.existsSync(file) && passwords[role]) {
    const w = await Wallet.fromEncryptedJson(fs.readFileSync(file, 'utf8'), passwords[role]);
    made.push([role, w.address, false]);
    continue;
  }
  const wallet = Wallet.createRandom();
  passwords[role] = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(file, await wallet.encrypt(passwords[role]));
  made.push([role, wallet.address, true]);
}
fs.writeFileSync(passwordFile, JSON.stringify(passwords, null, 2));

console.log('Accounts, in ' + path.relative(process.cwd(), LOCAL) + ':\n');
for (const [role, address, fresh] of made)
  console.log('  ' + role.padEnd(6), address, ' ' + (fresh ? 'new' : 'already there')
              + ', ' + ROLES[role]);

// Whether they can actually do anything is a separate question from whether
// they exist, and it is the one that stops people.
console.log('\nBalances on Studionet:\n');
const c = createClient({ chain: studionet, account: createAccount(Wallet.createRandom().privateKey) });
let broke = 0;
for (const [role, address] of made) {
  let balance = null;
  try { balance = await c.getBalance({ address }); } catch (e) {
    console.log('  ' + role.padEnd(6), 'could not be read:', String(e.details || e.message).slice(0, 60));
    continue;
  }
  const gen = Number(balance) / 1e18;
  if (gen <= 0) broke++;
  console.log('  ' + role.padEnd(6), gen.toFixed(4), 'GEN' + (gen <= 0 ? '   <- needs funding' : ''));
}

if (broke) {
  console.log([
    '',
    'Both accounts need testnet GEN before anything here will run. Deploying a',
    'contract, funding a bounty and putting a deposit behind an alarm all move',
    'value, and a run of the four commands in the README spends about 0.1 GEN.',
    '',
    'Fund the two addresses above from https://studio.genlayer.com, which holds',
    'accounts with balance and can send to an address, and then run this again to',
    'check it arrived.',
    '',
    'If you would rather use accounts you already have, this directory can be',
    'ignored entirely:',
    '    export HALT_KEYSTORES=~/.genlayer/keystores',
    '    export HALT_KS_PADV=... HALT_KS_PPUB=...',
  ].join('\n'));
} else {
  console.log([
    '',
    'Both funded. Nothing else to set: every script here reads this directory.',
    '',
    'The shortest run that proves the path works, about four minutes:',
    '    node scripts/deploy.mjs contracts/halt.py',
    '    node scripts/deploy.mjs contracts/vault.py <guardian>',
    '    node scripts/breach.mjs <guardian> <vault>',
    '    node scripts/raise.mjs <guardian> <vault> scenarios/b_plain.txt "a true breach"',
  ].join('\n'));
}
