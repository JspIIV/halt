// Which GenLayer to talk to.
//
//   HALT_NET=studionet    the stable hosted Studio, and where the record,
//                         the video and every measurement here came from
//   HALT_NET=studionext   the release candidate preview, studio-dev.genlayer.com
//
// Studionet stays the default because the numbers on the page were measured
// there and moving them would mean re-measuring rather than re-pointing.
//
// The preview is not a second SDK network. The documentation is explicit that
// `studio-next.genlayer.com` is a browser alias and that the canonical target is
// `studio-dev.genlayer.com/api`, so that is what this uses.
//
// **The preview resets.** GenLayer says so in as many words: state and
// availability are not guaranteed across deployments. Anything deployed there
// is a demonstration that may be gone tomorrow, and nothing durable should
// point at it without saying so.
//
// The clone was the first attempt and it does not work: the preview runs the
// next consensus stack, and a transaction built by the stable SDK reverts at
// the consensus contract without saying why. The chain configuration was never
// the difficulty. So each network is served by the SDK that matches it, side by
// side, and `genlayer-rc` in package.json is genlayer-js 2.0.0-rc.1 under
// another name so that installing it cannot disturb the scripts that work.
import { studionet } from 'genlayer-js/chains';
import { studioDevnet } from 'genlayer-rc/chains';
import * as stable from 'genlayer-js';
import * as candidate from 'genlayer-rc';

export const studionext = {
  ...studioDevnet,
  blockExplorers: {
    default: { name: 'GenLayer Explorer', url: 'https://explorer-studio-dev.genlayer.com' },
  },
};

const WHICH = {
  studionet,
  studionext,
  'studio-dev': studionext,
  'studio-next': studionext,
};

export const NET = process.env.HALT_NET || 'studionet';
export const chain = WHICH[NET] || studionet;
// The SDK that matches the network, so a caller never has to know there are two.
export const { createClient, createAccount } = chain.id === studionext.id ? candidate : stable;
export const EXPLORER = NET === 'studionet'
  ? 'https://explorer-studio.genlayer.com'
  : 'https://explorer-studio-dev.genlayer.com';

/** The preview hands out its own money over the RPC, which the stable network
 *  does not: there the faucet is a button in the Studio account selector. */
export async function fund(address, gen) {
  const answer = await fetch(chain.rpcUrls.default.http[0], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'sim_fundAccount',
      params: [address, Number(BigInt(gen) * 10n ** 18n)],
    }),
  });
  const said = await answer.json();
  if (said.error) throw new Error(JSON.stringify(said.error).slice(0, 200));
  return said.result;
}
