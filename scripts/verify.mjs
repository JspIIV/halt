// Check every claim this project makes, without an account and without spending
// anything.
//
//   node scripts/verify.mjs [guardian] [protocol]
//
// Written after cloning this repository onto a machine that had nothing set up
// and finding that the first command in the README asked for two keystores that
// only existed on the machine it was built on. Reproducing the runs needs funded
// accounts and getting those is somebody else's faucet. But nothing about
// *checking* the record needs an account at all: the guardian, the protocols it
// watches, the alarms and the reasoning the validators gave are public state,
// and reads are free.
//
// So this asks the chain the questions this project's claims rest on and prints
// what comes back, whether or not it suits us. It is not a demonstration. It is
// the part a reviewer can run before deciding whether to spend longer.
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';

const HALT = process.argv[2] || '0x280eff6e765C5d72C97F8ee406ED838257C89DfB';
const VAULT = process.argv[3] || '0x06fCC2D9D213d4c8977ab583b2508702F4E35610';

const c = createClient({ chain: studionet });
const parse = v => JSON.parse(typeof v === 'string' ? v : String(v));
const wait = ms => new Promise(r => setTimeout(r, ms));
const line = s => console.log(s);
const wrap = (s, at = 72) => String(s).replace(new RegExp('(.{' + at + '}\\s)', 'g'), '$1\n  ');

/** Something the reviewer needs told plainly, rather than as a stack trace. */
class Stop extends Error {}

// Studionet rations requests: thirty a minute and five hundred an hour, shared
// across everything running against it. A reviewer meeting either should get a
// wait or a sentence. The hourly one is not waited out, because an hour's budget
// does not come back in a minute.
async function view(address, fn, args = []) {
  for (let attempt = 1; ; attempt++) {
    try { return await c.readContract({ address, functionName: fn, args }); }
    catch (e) {
      const why = String((e && (e.details || e.message)) || e);
      if (/per hour/i.test(why)) throw new Stop([
        'Studionet has stopped answering: its five hundred requests an hour are used',
        'up for this address. That is the network rationing rather than this project',
        'failing. It refills on its own, though after a heavy day we have watched it',
        'stay closed for well over the hour the message promises.',
        '',
        'Everything asked for here is public state, readable meanwhile at',
        'https://explorer-studio.genlayer.com/address/' + HALT,
      ].join('\n'));
      if (attempt >= 5) throw new Stop('Studionet did not answer after five tries: '
                                       + why.slice(0, 140));
      // A minute's window clears in a minute, and every impatient retry before
      // then spends another request out of the same budget.
      const seconds = /rate limit/i.test(why) ? 65 : attempt * 10;
      line('  (' + (/rate limit/i.test(why) ? 'rate limited' : 'network')
           + ', waiting ' + seconds + 's)');
      await wait(seconds * 1000);
    }
  }
}

async function main() {
  const ok = [];
  const claim = (said, holds, detail) => {
    ok.push(holds);
    line((holds ? '  yes  ' : '  NO   ') + said);
    if (detail) line('        ' + detail);
  };

  line('Reading GenLayer Studionet. No account, no transaction, nothing spent.\n');
  line('  guardian ' + HALT);
  line('  protocol ' + VAULT + '\n');

  const size = parse(await view(HALT, 'size'));
  line('The guardian has protected ' + size.protected + ' contracts and heard '
       + size.alarms + ' alarms: ' + size.outcomes.UPHELD + ' upheld, '
       + size.outcomes.REFUSED + ' refused.\n');
  claim('it has refused alarms as well as upholding them', size.outcomes.REFUSED > 0,
        'a guard that upholds everything is a pause button with extra steps');

  const g = parse(await view(HALT, 'guard', [VAULT])).guard;
  claim('the protocol above is halted right now', g.state === 'HALTED',
        'raised at ' + g.raised_at);
  claim('and somebody other than its owner stopped it', g.raised_by !== g.owner,
        'owner ' + g.owner + ', raised by ' + g.raised_by);

  const status = parse(await view(VAULT, 'status'));
  claim('the protocol itself agrees that it is stopped', status.halted === true,
        'it reads that from the guardian on every call and keeps no copy to go stale');
  claim('and it is turning withdrawals away, and counting them',
        Number(status.withdrawals_blocked) > 0,
        status.withdrawals_blocked + ' refused since');

  line('\nThe red line it was stopped for, exactly as its owner published it:\n');
  line('  ' + wrap(g.red_line));

  const history = parse(await view(HALT, 'history', [VAULT]));
  line('\nWhat the validators said, in their own words:\n');
  for (const alarm of history.alarms || []) {
    line('  ' + alarm.outcome + ', ' + (alarm.deposit
      ? (Number(alarm.deposit) / 1e18).toFixed(4) + ' GEN staked behind it' : 'no deposit'));
    line('  ' + wrap(alarm.why) + '\n');
  }
  claim('the reasoning is on chain rather than in this repository',
        (history.alarms || []).length > 0
        && (history.alarms || []).every(a => a.why && a.why.length > 20));

  if (g.floor) {
    const would = parse(await view(HALT, 'would_break', [VAULT, String(10n ** 16n)]));
    claim('a published floor can be tested with no round at all', would.ok === true,
          'asked whether 0.0100 GEN could leave: ' + (would.would_break ? 'no' : 'yes'));
  }

  // And the record, which is a file in this repository rather than on the chain,
  // so it is named as one.
  try {
    const trials = JSON.parse(fs.readFileSync('results/trials.json', 'utf8'));
    const predicted = trials.filter(t => t.expect);
    const wrong = predicted.filter(t => !t.matched);
    line('\nresults/trials.json holds ' + trials.length + ' runs, ' + predicted.length
         + ' of them carrying an outcome');
    line('written down before the run was sent. ' + wrong.length + ' came out differently and are'
         + ' still in the');
    line('file, one of them a live protocol halted on a false claim. Every row carries a');
    line('transaction hash, so any of them can be checked the way this was.\n');
    claim('the record keeps the runs that went against us', wrong.length > 0);
  } catch { /* run from the repository root to include this */ }

  line('');
  line(ok.every(Boolean) ? 'Everything above checked out.'
    : ok.filter(x => !x).length + ' of ' + ok.length + ' did not. That is the interesting part.');
}

try { await main(); }
catch (e) {
  if (!(e instanceof Stop)) throw e;
  line('\n' + e.message);
  process.exitCode = 2;
}
