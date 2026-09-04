// Where the test accounts come from.
//
// These passwords used to sit in every script as string literals, which is fine
// on one machine and not fine in a public repository. They open throwaway
// Studionet keystores that hold testnet balance and nothing else, but a password
// in a repository teaches the wrong habit even when the account is worthless.
//
// Set them once before running anything:
//
//   export HALT_KEYSTORES=/path/to/.genlayer/keystores
//   export HALT_KS_PADV=... HALT_KS_PPUB=...
//
// The two accounts play the two sides of every scenario: padv owns the
// protocols and answers appeals, ppub deposits, withdraws and raises alarms.
import path from 'path';
import os from 'os';

export const KS = process.env.HALT_KEYSTORES
  || path.join(os.homedir(), '.genlayer', 'keystores');

export const PASS = {
  padv: process.env.HALT_KS_PADV || '',
  ppub: process.env.HALT_KS_PPUB || '',
};

if (!PASS.padv || !PASS.ppub) {
  console.error('Set HALT_KS_PADV and HALT_KS_PPUB first. See keys.mjs.');
  process.exit(1);
}
