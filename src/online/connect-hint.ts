import { plainStatus } from './status-copy.js';
/** A status that already tells the player what to do; the boot card hides the header, so it must show these verbatim. */
const ACTIONABLE=/reload this page|newer tab|incompatible|damaged|room ended/i;
/** Boot-card copy while a room links up: plain progress first, then the network hint once ICE has failed or plainly stalled. */
export function connectHint(status:string,elapsedMs:number):string{
 if(ACTIONABLE.test(status))return status;
 // The link is up and the room is syncing: the network advice would be wrong, however long it takes.
 const plain=plainStatus(status);if(plain.tone==='ok'||plain.text.startsWith('Connected'))return 'Connected — syncing the arena…';
 if(/ICE failed|NAT|relay|unreachable/i.test(status)||elapsedMs>=20000)
  return 'No link to the host yet. This phone is probably on a different network — join the host’s Wi-Fi, then reload.';
 if(elapsedMs>=6000)return 'Still reaching the host…';
 return 'Warming up the arena…';
}
