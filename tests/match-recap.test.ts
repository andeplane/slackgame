import assert from 'node:assert/strict';
import test from 'node:test';
import { durationText as sharedDurationText } from '../src/shared/duration-text.js';
import type { MatchPlayerStats } from '../src/shared/match-stats.js';
import {
  AWARD_DEFINITIONS,
  COMPARISON_COLUMNS,
  buildMatchRecap,
  comparisonRows,
  distanceText,
  durationText,
  matchAwards,
  matchTotals,
  podiumOrder,
  recapSignature,
} from '../src/shared/match-recap.js';

function rider(overrides: Partial<MatchPlayerStats> & { playerId: string; slot: number; matchPlacement: number }): MatchPlayerStats {
  return {
    name: overrides.playerId.toUpperCase(), color: `#00000${overrides.slot}`, roundsPlayed: 0, roundWins: 0, roundsDrawn: 0,
    survivalTicks: 0, longestSurvivalTicks: 0, distanceUnits: 0, bombsPlaced: 0, bombsExploded: 0, eliminations: 0,
    deathsByCause: { wall: 0, trail: 0, explosion: 0, rider: 0 }, pickupsCollected: 0, blastPickups: 0, starPickups: 0,
    beerPickups: 0, inkPickups: 0, triplePickups: 0, fivePickups: 0, targetPickups: 0, shieldPickups: 0, portalPickups: 0,
    portalTransits: 0, invulnerableTicks: 0, wallBounces: 0, earlyExits: 0,
    ...overrides,
  };
}

test('distances render as whole arena units and durations reuse the shared formatter', () => {
  assert.equal(distanceText(0), '0');
  assert.equal(distanceText(1234.6), '1235');
  assert.equal(distanceText(-3), '0');
  // durationText is re-exported from src/shared/duration-text.ts; tests/duration-text.test.ts owns its cases.
  assert.equal(durationText, sharedDurationText);
});

test('empty statistics produce an empty recap with no placeholder awards or totals', () => {
  const recap = buildMatchRecap([]);
  assert.deepEqual(recap, { signature: '', podium: [], awards: [], totals: [], comparison: [] });
});

test('a single rider stands alone as champion, wins every non-zero award and fills the table', () => {
  const solo = rider({ playerId: 'a', slot: 2, matchPlacement: 1, roundsPlayed: 2, roundWins: 2, survivalTicks: 400, longestSurvivalTicks: 260, distanceUnits: 512.4, bombsPlaced: 3, bombsExploded: 2 });
  const recap = buildMatchRecap([solo]);
  assert.deepEqual(recap.podium.map((entry) => [entry.playerId, entry.placement, entry.champion, entry.placeLabel, entry.winsLabel]), [['a', 1, true, '♛  #1', '2 ROUND WINS']]);
  assert.deepEqual(recap.awards.map((award) => [award.id, award.winnerText, award.detail]), [
    ['demolition', 'A', '2 BOMBS BOOMED'],
    ['trailblazer', 'A', '512 TRAVELLED'],
    ['untouchable', 'A', '20s ALIVE'],
    ['lastStand', 'A', '13s BEST ROUND'],
  ]);
  assert.equal(recap.comparison.length, 1);
  const row = recap.comparison[0]!;
  assert.equal(row.riderLabel, '#1 A');
  assert.equal(row.riderNote, '0 BOUNCE · 0 EXIT');
  assert.deepEqual(COMPARISON_COLUMNS.map((column) => row[column.key]), ['2', '20s', '13s', '512', '2/3', '0', '—', '—', '—']);
});

test('podium centres champions, keeps side places in seat order and excludes placements beyond third', () => {
  const stats = [
    rider({ playerId: 'fourth', slot: 0, matchPlacement: 4 }),
    rider({ playerId: 'third', slot: 4, matchPlacement: 3, roundWins: 1 }),
    rider({ playerId: 'second', slot: 3, matchPlacement: 2, roundWins: 2 }),
    rider({ playerId: 'first', slot: 1, matchPlacement: 1, roundWins: 3 }),
    rider({ playerId: 'fifth', slot: 2, matchPlacement: 5 }),
  ];
  assert.deepEqual(podiumOrder(stats).map((entry) => `${entry.placement}:${entry.playerId}`), ['2:second', '1:first', '3:third']);
  assert.deepEqual(podiumOrder(stats).map((entry) => entry.placeLabel), ['#2', '♛  #1', '#3']);
  assert.equal(podiumOrder(stats)[2]!.winsLabel, '1 ROUND WIN');
});

test('a tied first place shows every champion in the centre and no second place', () => {
  const stats = [
    rider({ playerId: 'b', slot: 1, matchPlacement: 1, roundWins: 1 }),
    rider({ playerId: 'a', slot: 0, matchPlacement: 1, roundWins: 1 }),
    rider({ playerId: 'c', slot: 2, matchPlacement: 3 }),
    rider({ playerId: 'd', slot: 3, matchPlacement: 3 }),
  ];
  assert.deepEqual(podiumOrder(stats).map((entry) => `${entry.placement}:${entry.playerId}`), ['3:c', '1:a', '1:b', '3:d']);
  assert.ok(podiumOrder(stats).filter((entry) => entry.champion).every((entry) => entry.placeLabel === '♛  #1'));
});

test('a match where nobody won any round places everyone on the podium as champions', () => {
  const stats = [0, 1, 2, 3, 4].map((slot) => rider({ playerId: `p${slot}`, slot, matchPlacement: 1, roundsPlayed: 1, roundsDrawn: 1 }));
  assert.equal(podiumOrder(stats).length, 5);
  assert.ok(podiumOrder(stats).every((entry) => entry.champion && entry.winsLabel === '0 ROUND WINS'));
  assert.equal(matchTotals(stats)[0]!.value, '1 · 1 DRAWN');
});

test('awards share ties by joining names in placement order and skip counters nobody raised', () => {
  const stats = [
    rider({ playerId: 'b', slot: 1, matchPlacement: 2, bombsExploded: 4, eliminations: 2, portalTransits: 1 }),
    rider({ playerId: 'a', slot: 0, matchPlacement: 1, bombsExploded: 4, eliminations: 3, distanceUnits: 0.4 }),
    rider({ playerId: 'c', slot: 2, matchPlacement: 3, bombsExploded: 1, wallBounces: 0 }),
  ];
  const awards = matchAwards(stats);
  assert.deepEqual(awards.map((award) => [award.id, award.winnerText, award.value, award.detail]), [
    ['demolition', 'A + B', 4, '4 BOMBS BOOMED'],
    ['trailblazer', 'A', 0.4, '0 TRAVELLED'],
    ['headhunter', 'A', 3, '3 RIDERS TAKEN OUT'],
    ['gateCrasher', 'B', 1, '1 PORTAL JUMP'],
  ]);
  assert.deepEqual(awards[0]!.winners.map((winner) => winner.playerId), ['a', 'b']);
  assert.deepEqual(awards[0]!.winners.map((winner) => winner.color), ['#000000', '#000001']);
});

test('all-zero statistics yield no awards while the podium and table still render', () => {
  const stats = [rider({ playerId: 'a', slot: 0, matchPlacement: 1 }), rider({ playerId: 'b', slot: 1, matchPlacement: 1 })];
  assert.deepEqual(matchAwards(stats), []);
  assert.equal(podiumOrder(stats).length, 2);
  assert.equal(comparisonRows(stats).length, 2);
  assert.deepEqual(matchTotals(stats).map((total) => total.value), ['0', '2', '0/0', '0', '0', '0', '0', '0']);
});

test('singular award details read naturally', () => {
  const stats = [rider({ playerId: 'a', slot: 0, matchPlacement: 1, bombsExploded: 1, pickupsCollected: 1, eliminations: 1, wallBounces: 1, portalTransits: 1 })];
  assert.deepEqual(matchAwards(stats).map((award) => award.detail), ['1 BOMB BOOMED', '1 POWER-UP', '1 RIDER TAKEN OUT', '1 PORTAL JUMP', '1 WALL BOUNCE']);
  assert.equal(AWARD_DEFINITIONS.find((definition) => definition.id === 'wallRider')!.detail(2), '2 WALL BOUNCES');
});

test('comparison rows order by placement then seat and format every recorded counter', () => {
  const stats = [
    rider({ playerId: 'late', slot: 3, matchPlacement: 2, roundWins: 1, survivalTicks: 1300, longestSurvivalTicks: 700, distanceUnits: 99.5, bombsPlaced: 5, bombsExploded: 4, eliminations: 2, pickupsCollected: 9, blastPickups: 1, starPickups: 2, beerPickups: 1, inkPickups: 1, triplePickups: 1, fivePickups: 1, targetPickups: 1, shieldPickups: 1, portalPickups: 1, portalTransits: 2, invulnerableTicks: 45, wallBounces: 3, earlyExits: 1, deathsByCause: { wall: 1, trail: 2, explosion: 3, rider: 4 } }),
    rider({ playerId: 'early', slot: 1, matchPlacement: 2, roundWins: 1 }),
    rider({ playerId: 'champ', slot: 4, matchPlacement: 1, roundWins: 2 }),
  ];
  const rows = comparisonRows(stats);
  assert.deepEqual(rows.map((row) => row.riderLabel), ['#1 CHAMP', '#2 EARLY', '#2 LATE']);
  const late = rows[2]!;
  assert.equal(late.riderNote, '3 BOUNCE · 1 EXIT');
  assert.equal(late.survived, '1m 5s');
  assert.equal(late.best, '35s');
  assert.equal(late.distance, '100');
  assert.equal(late.bombs, '4/5');
  assert.equal(late.eliminations, '2');
  assert.equal(late.pickups, '9 · blast 1 · star 2 · beer 1 · ink 1 · triple 1 · five 1 · target 1 · shield 1 · portal 1 · 2 jumps');
  assert.match(comparisonRows([{ ...stats[0]!, portalTransits: 1 }])[0]!.pickups, /· 1 jump$/);
  assert.equal(late.star, '2.3s');
  assert.equal(late.deaths, 'wall 1 · trail 2 · blast 3 · rider 4');
});

test('match totals sum the recorded counters across riders', () => {
  const stats = [
    rider({ playerId: 'a', slot: 0, matchPlacement: 1, roundsPlayed: 3, roundWins: 2, bombsPlaced: 4, bombsExploded: 3, eliminations: 2, distanceUnits: 100.2, pickupsCollected: 4, portalTransits: 1, deathsByCause: { wall: 1, trail: 0, explosion: 0, rider: 0 } }),
    rider({ playerId: 'b', slot: 1, matchPlacement: 2, roundsPlayed: 3, roundWins: 1, bombsPlaced: 2, bombsExploded: 1, eliminations: 1, distanceUnits: 50.3, pickupsCollected: 1, portalTransits: 2, deathsByCause: { wall: 0, trail: 1, explosion: 1, rider: 0 } }),
  ];
  assert.deepEqual(matchTotals(stats), [
    { label: 'ROUNDS', value: '3' },
    { label: 'RIDERS', value: '2' },
    { label: 'BOMBS', value: '4/6' },
    { label: 'KOs', value: '3' },
    { label: 'CRASHES', value: '3' },
    { label: 'DISTANCE', value: '151' },
    { label: 'POWER-UPS', value: '5' },
    { label: 'PORTAL JUMPS', value: '3' },
  ]);
});

test('the signature changes with any rendered figure and is order independent', () => {
  const a = rider({ playerId: 'a', slot: 0, matchPlacement: 1, roundWins: 1 });
  const b = rider({ playerId: 'b', slot: 1, matchPlacement: 2 });
  assert.equal(recapSignature([a, b]), recapSignature([b, a]));
  assert.notEqual(recapSignature([a, b]), recapSignature([a, { ...b, deathsByCause: { ...b.deathsByCause, rider: 1 } }]));
  assert.notEqual(recapSignature([a, b]), recapSignature([a, { ...b, longestSurvivalTicks: 5 }]));
  assert.notEqual(recapSignature([a, b]), recapSignature([a, { ...b, roundsPlayed: 1 }]));
  assert.notEqual(recapSignature([a, b]), recapSignature([a]));
});

test('recap ignores riders with an unset placement rather than inventing a podium slot', () => {
  const stats = [rider({ playerId: 'a', slot: 0, matchPlacement: 0 }), rider({ playerId: 'b', slot: 1, matchPlacement: 1 })];
  assert.deepEqual(podiumOrder(stats).map((entry) => entry.playerId), ['b']);
  assert.equal(comparisonRows(stats).length, 2);
});
