/**
 * The runtime reports link state in engineering terms ("direct link connected — waiting for gameplay probe
 * acknowledgements"). A player needs three things: are we connected, are we still trying, or is something
 * wrong that they can act on. The raw text stays available for diagnostics; this is what the header shows.
 */
export type StatusTone = 'ok' | 'busy' | 'bad';
export interface PlainStatus { tone: StatusTone; text: string; /** True when a page reload is the sensible player action. */ retry: boolean }

const ACTIONABLE = /reload this page|newer tab|incompatible|damaged|room ended|out of sync/i;
const BAD = /failed|interrupted|error|unreachable|expired|NAT|relay|disconnected/i;
const OK = /^connected\b|authority confirmed|peer link connected|link connected|phone controls|direct game link/i;

export function plainStatus(raw: string): PlainStatus {
  const text = raw.trim();
  if (!text) return { tone: 'busy', text: '', retry: false };
  if (ACTIONABLE.test(text)) return { tone: 'bad', text, retry: /reload this page|out of sync|incompatible|damaged/i.test(text) };
  if (/paused|rebuilding|waiting for riders/i.test(text)) return { tone: 'busy', text, retry: false };
  if (BAD.test(text)) return { tone: 'bad', text: 'Connection trouble — retrying', retry: true };
  // A probe still in flight after the link is up is progress, not a fault.
  if (/waiting for direct connection/i.test(text) && /connected/i.test(text)) return { tone: 'busy', text: 'Connected — syncing the arena…', retry: false };
  if (OK.test(text)) return { tone: 'ok', text: 'Connected', retry: false };
  if (/waiting|connecting|reaching/i.test(text)) return { tone: 'busy', text: 'Connecting…', retry: false };
  return { tone: 'busy', text, retry: false };
}
