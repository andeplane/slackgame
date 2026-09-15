import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POWERUP_PRESETS, rarityOf, weightFor } from '../src/online/powerup-rarity.js';
import { defaultRoomSettings } from '../src/shared/room-settings.js';

const defaults = defaultRoomSettings().weights;

test('rarity chips scale each power-up around its default weight and round-trip', () => {
  const blast = defaults.blast!;
  assert.equal(weightFor('blast', 'normal', defaults), blast);
  assert.equal(weightFor('blast', 'off', defaults), 0);
  assert.equal(weightFor('blast', 'rare', defaults), Math.round(blast / 3));
  assert.equal(weightFor('blast', 'common', defaults), Math.min(10000, blast * 3));
  for (const rarity of ['off', 'rare', 'normal', 'common'] as const) assert.equal(rarityOf('blast', weightFor('blast', rarity, defaults), defaults), rarity);
});

test('star has no default weight, so its rarities come from the median of the enabled defaults', () => {
  assert.equal(defaults.star ?? 0, 0);
  assert.ok(weightFor('star', 'normal', defaults) > 0);
  assert.equal(rarityOf('star', 0, defaults), 'off');
  assert.equal(rarityOf('star', weightFor('star', 'common', defaults), defaults), 'common');
});

test('a hand-typed weight lights the nearest chip', () => {
  const blast = defaults.blast!;
  assert.equal(rarityOf('blast', Math.round(blast * 1.2), defaults), 'normal');
  assert.equal(rarityOf('blast', Math.round(blast * 2.6), defaults), 'common');
  assert.equal(rarityOf('blast', Math.round(blast / 2.5), defaults), 'rare');
});

test('presets: classic restores defaults, chaos makes everything common, no power-ups zeroes all', () => {
  assert.equal(POWERUP_PRESETS['CLASSIC']!('blast', defaults), defaults.blast);
  assert.equal(POWERUP_PRESETS['CLASSIC']!('star', defaults), 0);
  assert.equal(POWERUP_PRESETS['CHAOS']!('star', defaults), weightFor('star', 'common', defaults));
  assert.equal(POWERUP_PRESETS['NO POWER-UPS']!('blast', defaults), 0);
});
