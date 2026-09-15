import { durationText } from './duration-text.js';
import type { MatchPlayerStats } from './match-stats.js';

/**
 * Pure end-of-match presentation model shared by the LAN TV and the online UI.
 * It only reads authoritative `MatchPlayerStats`; it never invents or rescores data.
 * Durations use the formatter added by #55, relocated from `src/client/` to `src/shared/` so this
 * module — which `src/online/` renders too — keeps one implementation without importing client code.
 */
export { durationText };
export const RECAP_KICKER = 'MATCH COMPLETE // AFTER ACTION REPORT';
export const RECAP_TITLE = 'Grid legends';
export const RECAP_EMPTY_MESSAGE = 'Compiling the after action report…';
export const COMPARISON_KEY = 'BOMBS = EXPLODED / PLACED   ·   DISTANCE IN ARENA UNITS   ·   — = NONE';
export const PODIUM_PLACES = 3;

export function distanceText(units: number): string {
  return String(Math.round(Math.max(0, units)));
}

/** Only the non-zero counters, as words: "blast 1 · star 2"; an em dash when nothing was recorded. */
export function countList(entries: ReadonlyArray<readonly [label: string, count: number]>): string {
  const listed = entries.filter(([, count]) => count > 0).map(([label, count]) => `${label} ${count}`);
  return listed.length ? listed.join(' · ') : '—';
}

/** Placement first, then seat order, so ties keep a stable, explainable order. */
export function orderedStats(stats: ReadonlyArray<MatchPlayerStats>): MatchPlayerStats[] {
  return [...stats].sort((a, b) => a.matchPlacement - b.matchPlacement || a.slot - b.slot || a.playerId.localeCompare(b.playerId));
}

/** Changes whenever any rendered figure changes; renderers use it to skip identical rebuilds. */
export function recapSignature(stats: ReadonlyArray<MatchPlayerStats>): string {
  return orderedStats(stats).map((entry) => [entry.playerId, entry.matchPlacement, entry.roundsPlayed, entry.roundWins, entry.roundsDrawn, entry.survivalTicks,
    entry.longestSurvivalTicks, entry.distanceUnits, entry.bombsPlaced, entry.bombsExploded, entry.eliminations, entry.pickupsCollected,
    entry.invulnerableTicks, entry.wallBounces, entry.earlyExits, entry.blastPickups, entry.starPickups, entry.beerPickups, entry.inkPickups,
    entry.triplePickups, entry.fivePickups, entry.targetPickups, entry.shieldPickups, entry.portalPickups, entry.portalTransits,
    entry.deathsByCause.wall, entry.deathsByCause.trail, entry.deathsByCause.explosion, entry.deathsByCause.rider].join(':')).join('|');
}

export interface PodiumEntry {
  playerId: string;
  name: string;
  color: string;
  placement: number;
  roundWins: number;
  champion: boolean;
  placeLabel: string;
  winsLabel: string;
}

/**
 * Riders placed 1..3 in display order: champions (every rider sharing placement 1) sit in the
 * centre, remaining podium places split evenly to either side. Placements are authoritative and
 * already share ties (1, 1, 3), so a tied first shows two champions and no second place.
 */
export function podiumOrder(stats: ReadonlyArray<MatchPlayerStats>): PodiumEntry[] {
  const placed = orderedStats(stats).filter((entry) => entry.matchPlacement >= 1 && entry.matchPlacement <= PODIUM_PLACES);
  const champions = placed.filter((entry) => entry.matchPlacement === 1);
  const runners = placed.filter((entry) => entry.matchPlacement !== 1);
  const centerAt = Math.ceil(runners.length / 2);
  return [...runners.slice(0, centerAt), ...champions, ...runners.slice(centerAt)].map((entry) => ({
    playerId: entry.playerId,
    name: entry.name,
    color: entry.color,
    placement: entry.matchPlacement,
    roundWins: entry.roundWins,
    champion: entry.matchPlacement === 1,
    placeLabel: entry.matchPlacement === 1 ? '♛  #1' : `#${entry.matchPlacement}`,
    winsLabel: `${entry.roundWins} ROUND ${entry.roundWins === 1 ? 'WIN' : 'WINS'}`,
  }));
}

export type AwardId = 'demolition' | 'trailblazer' | 'untouchable' | 'collector' | 'headhunter' | 'lastStand' | 'gateCrasher' | 'wallRider';

export interface AwardDefinition {
  id: AwardId;
  title: string;
  icon: string;
  value(entry: MatchPlayerStats): number;
  detail(value: number): string;
}

/** Every award reads one recorded counter; nothing here is derived from presentation state. */
export const AWARD_DEFINITIONS: ReadonlyArray<AwardDefinition> = [
  { id: 'demolition', title: 'DEMOLITION EXPERT', icon: '✹', value: (entry) => entry.bombsExploded, detail: (value) => `${value} ${value === 1 ? 'BOMB' : 'BOMBS'} BOOMED` },
  { id: 'trailblazer', title: 'TRAILBLAZER', icon: '⌁', value: (entry) => entry.distanceUnits, detail: (value) => `${distanceText(value)} TRAVELLED` },
  { id: 'untouchable', title: 'UNTOUCHABLE', icon: '✦', value: (entry) => entry.survivalTicks, detail: (value) => `${durationText(value)} ALIVE` },
  { id: 'collector', title: 'COLLECTOR', icon: '◆', value: (entry) => entry.pickupsCollected, detail: (value) => `${value} ${value === 1 ? 'POWER-UP' : 'POWER-UPS'}` },
  { id: 'headhunter', title: 'HEADHUNTER', icon: '☠', value: (entry) => entry.eliminations, detail: (value) => `${value} ${value === 1 ? 'RIDER' : 'RIDERS'} TAKEN OUT` },
  { id: 'lastStand', title: 'LAST STAND', icon: '⏱', value: (entry) => entry.longestSurvivalTicks, detail: (value) => `${durationText(value)} BEST ROUND` },
  { id: 'gateCrasher', title: 'GATE CRASHER', icon: '◎', value: (entry) => entry.portalTransits, detail: (value) => `${value} PORTAL ${value === 1 ? 'JUMP' : 'JUMPS'}` },
  { id: 'wallRider', title: 'WALL RIDER', icon: '⟁', value: (entry) => entry.wallBounces, detail: (value) => `${value} WALL ${value === 1 ? 'BOUNCE' : 'BOUNCES'}` },
];

export interface MatchAward {
  id: AwardId;
  title: string;
  icon: string;
  /** Every rider whose counter equals the best value, in placement order; joined with ' + ' for display. */
  winners: ReadonlyArray<{ playerId: string; name: string; color: string }>;
  winnerText: string;
  value: number;
  detail: string;
}

/**
 * Awards whose best value is above zero, in definition order. Ties share the award (all tied riders
 * are winners). Empty statistics and all-zero counters produce no awards rather than a placeholder.
 */
export function matchAwards(stats: ReadonlyArray<MatchPlayerStats>): MatchAward[] {
  const ordered = orderedStats(stats);
  if (!ordered.length) return [];
  const awards: MatchAward[] = [];
  for (const definition of AWARD_DEFINITIONS) {
    const best = Math.max(...ordered.map((entry) => definition.value(entry)));
    if (!(best > 0)) continue;
    const winners = ordered.filter((entry) => definition.value(entry) === best).map((entry) => ({ playerId: entry.playerId, name: entry.name, color: entry.color }));
    awards.push({ id: definition.id, title: definition.title, icon: definition.icon, winners, winnerText: winners.map((winner) => winner.name).join(' + '), value: best, detail: definition.detail(best) });
  }
  return awards;
}

export interface ComparisonRow {
  playerId: string;
  name: string;
  color: string;
  placement: number;
  riderLabel: string;
  riderNote: string;
  wins: string;
  survived: string;
  best: string;
  distance: string;
  bombs: string;
  eliminations: string;
  pickups: string;
  star: string;
  deaths: string;
}

export type ComparisonColumnKey = Exclude<keyof ComparisonRow, 'playerId' | 'name' | 'color' | 'placement' | 'riderLabel' | 'riderNote'>;

export const COMPARISON_COLUMNS: ReadonlyArray<{ key: ComparisonColumnKey; label: string }> = [
  { key: 'wins', label: 'WINS' },
  { key: 'survived', label: 'SURVIVED' },
  { key: 'best', label: 'BEST' },
  { key: 'distance', label: 'DISTANCE' },
  { key: 'bombs', label: 'BOMBS' },
  { key: 'eliminations', label: 'KOs' },
  { key: 'pickups', label: 'PICKUPS' },
  { key: 'star', label: 'STAR' },
  { key: 'deaths', label: 'DEATHS' },
];

export function comparisonRows(stats: ReadonlyArray<MatchPlayerStats>): ComparisonRow[] {
  return orderedStats(stats).map((entry) => {
    const deaths = entry.deathsByCause;
    return {
      playerId: entry.playerId,
      name: entry.name,
      color: entry.color,
      placement: entry.matchPlacement,
      riderLabel: `#${entry.matchPlacement} ${entry.name}`,
      riderNote: `${entry.wallBounces} BOUNCE · ${entry.earlyExits} EXIT`,
      wins: String(entry.roundWins),
      survived: durationText(entry.survivalTicks),
      best: durationText(entry.longestSurvivalTicks),
      distance: distanceText(entry.distanceUnits),
      bombs: `${entry.bombsExploded}/${entry.bombsPlaced}`,
      eliminations: String(entry.eliminations),
      pickups: entry.pickupsCollected ? `${entry.pickupsCollected} · ${countList([['blast', entry.blastPickups], ['star', entry.starPickups], ['beer', entry.beerPickups], ['ink', entry.inkPickups], ['triple', entry.triplePickups], ['five', entry.fivePickups], ['target', entry.targetPickups], ['shield', entry.shieldPickups], ['portal', entry.portalPickups]])}${entry.portalTransits ? ` · ${entry.portalTransits} ${entry.portalTransits === 1 ? 'jump' : 'jumps'}` : ''}` : '—',
      star: entry.invulnerableTicks ? durationText(entry.invulnerableTicks) : '—',
      deaths: countList([['wall', deaths.wall], ['trail', deaths.trail], ['blast', deaths.explosion], ['rider', deaths.rider]]),
    };
  });
}

export interface MatchTotal {
  label: string;
  value: string;
}

/** Whole-match totals summed from the recorded counters; empty statistics give no totals. */
export function matchTotals(stats: ReadonlyArray<MatchPlayerStats>): MatchTotal[] {
  if (!stats.length) return [];
  const sum = (pick: (entry: MatchPlayerStats) => number) => stats.reduce((total, entry) => total + pick(entry), 0);
  const rounds = Math.max(...stats.map((entry) => entry.roundsPlayed));
  const draws = Math.max(...stats.map((entry) => entry.roundsDrawn));
  const deaths = sum((entry) => entry.deathsByCause.wall + entry.deathsByCause.trail + entry.deathsByCause.explosion + entry.deathsByCause.rider);
  return [
    { label: 'ROUNDS', value: draws > 0 ? `${rounds} · ${draws} DRAWN` : String(rounds) },
    { label: 'RIDERS', value: String(stats.length) },
    { label: 'BOMBS', value: `${sum((entry) => entry.bombsExploded)}/${sum((entry) => entry.bombsPlaced)}` },
    { label: 'KOs', value: String(sum((entry) => entry.eliminations)) },
    { label: 'CRASHES', value: String(deaths) },
    { label: 'DISTANCE', value: distanceText(sum((entry) => entry.distanceUnits)) },
    { label: 'POWER-UPS', value: String(sum((entry) => entry.pickupsCollected)) },
    { label: 'PORTAL JUMPS', value: String(sum((entry) => entry.portalTransits)) },
  ];
}

export interface MatchRecap {
  signature: string;
  podium: PodiumEntry[];
  awards: MatchAward[];
  totals: MatchTotal[];
  comparison: ComparisonRow[];
}

export function buildMatchRecap(stats: ReadonlyArray<MatchPlayerStats>): MatchRecap {
  return { signature: recapSignature(stats), podium: podiumOrder(stats), awards: matchAwards(stats), totals: matchTotals(stats), comparison: comparisonRows(stats) };
}
