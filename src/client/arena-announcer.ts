import { COUNTDOWN_TICKS, OVERTIME_START_TICK, ROUND_DRAW_TICK, TICK_HZ } from '../shared/game.js';
import type { GameEvent } from '../shared/protocol.js';
import type { ViewSnapshot } from './snapshot-stream.js';

/**
 * Pure text model for the in-arena announcements the online screen renders: countdown, round result with
 * placements, overtime, the final result, plus the elimination feed. The LAN TV keeps its own copy of this
 * logic in `main.ts`; this module exists so the online room, solo and the phone read the same moments.
 */
export type Announcement =
  | { kind: 'hidden' }
  | { kind: 'countdown'; round: number; count: string; hint: string }
  | { kind: 'overtime'; text: string }
  | { kind: 'round'; round: number; title: string; placements: string[]; next: string }
  | { kind: 'final'; title: string; subtitle: string };

const points = (units: number): string => { const value = units / 60; return Number.isInteger(value) ? String(value) : value.toFixed(1); };

export function announcementFor(snapshot: ViewSnapshot, selfId: string, touch: boolean): Announcement {
  const left = snapshot.phaseEndsAtTick === undefined ? 0 : Math.max(0, snapshot.phaseEndsAtTick - snapshot.tick);
  if (snapshot.phase === 'countdown') {
    const seconds = Math.ceil(left / TICK_HZ);
    return { kind: 'countdown', round: snapshot.round, count: seconds > 0 ? String(seconds) : 'GO!', hint: touch ? 'HOLD LEFT / RIGHT TO STEER · HOLD THE MIDDLE TO CHARGE, RELEASE TO FIRE' : '← → OR A / D TO STEER · HOLD SPACE TO CHARGE, RELEASE TO FIRE' };
  }
  if (snapshot.phase === 'playing') {
    const elapsed = snapshot.roundStartedTick === undefined ? 0 : snapshot.tick - snapshot.roundStartedTick;
    if (elapsed >= OVERTIME_START_TICK) return { kind: 'overtime', text: `OVERTIME // WALLS CLOSING · DRAW IN ${Math.max(0, Math.ceil((ROUND_DRAW_TICK - elapsed) / TICK_HZ))}s` };
    return { kind: 'hidden' };
  }
  if (snapshot.phase === 'roundOver') {
    const winner = snapshot.players.find(player => player.id === snapshot.roundWinnerId);
    const title = !winner ? 'DRAW' : winner.id === selfId ? 'YOU WIN THE ROUND' : `${winner.name} WINS`;
    const placements = snapshot.roundPlacements.map(entry => `#${entry.place} ${entry.playerId === selfId ? 'YOU' : entry.name}  +${points(entry.scoreUnits)}`);
    return { kind: 'round', round: snapshot.round, title, placements, next: left > 0 ? `NEXT ROUND IN ${Math.ceil(left / TICK_HZ)}` : 'NEXT ROUND' };
  }
  if (snapshot.phase === 'matchOver') {
    const winner = snapshot.players.find(player => player.id === snapshot.matchWinnerId);
    return { kind: 'final', title: !winner ? 'MATCH COMPLETE' : winner.id === selfId ? 'YOU RULE THE GRID' : `${winner.name} WINS!`, subtitle: left > 0 ? 'FINAL ROUND' : 'MATCH COMPLETE' };
  }
  return { kind: 'hidden' };
}

/** "ROUND 2 · 01:12" for the header chip; the clock counts down to the draw, mirroring the LAN TV timer. */
export function roundClock(snapshot: ViewSnapshot): string {
  if (snapshot.phase === 'lobby') return '';
  const remaining = snapshot.phase === 'playing' && snapshot.roundStartedTick !== undefined
    ? Math.max(0, ROUND_DRAW_TICK - (snapshot.tick - snapshot.roundStartedTick))
    : snapshot.phase === 'countdown' ? Math.min(COUNTDOWN_TICKS, Math.max(0, (snapshot.phaseEndsAtTick ?? snapshot.tick) - snapshot.tick)) : undefined;
  if (remaining === undefined) return `ROUND ${snapshot.round}`;
  const seconds = Math.ceil(remaining / TICK_HZ);
  return `ROUND ${snapshot.round} · ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const CAUSES = { wall: 'hit the wall', trail: 'clipped a trail', explosion: 'caught a blast', rider: 'rammed a rider' } as const;

/** One line for the elimination feed, or undefined for events that are not eliminations. */
export function eliminationLine(event: GameEvent, players: ReadonlyArray<{ id: string; name: string }>, selfId: string): string | undefined {
  if (event.type !== 'playerEliminated') return undefined;
  const name = event.playerId === selfId ? 'YOU' : players.find(player => player.id === event.playerId)?.name ?? 'A rider';
  return `${name} ${CAUSES[event.cause]}`;
}
