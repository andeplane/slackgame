import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainStatus } from '../src/online/status-copy.js';

test('link status collapses to connected / connecting / trouble', () => {
  assert.deepEqual(plainStatus('Direct peer link connected'), { tone: 'ok', text: 'Connected', retry: false });
  assert.deepEqual(plainStatus('Room authority confirmed'), { tone: 'ok', text: 'Connected', retry: false });
  assert.deepEqual(plainStatus('Connected · phone controls'), { tone: 'ok', text: 'Connected', retry: false });
  assert.deepEqual(plainStatus('Waiting for the host…'), { tone: 'busy', text: 'Connecting…', retry: false });
  assert.deepEqual(plainStatus('Waiting for direct connection — no offer received from host — signalling never delivered the offer'), { tone: 'busy', text: 'Connecting…', retry: false });
  assert.deepEqual(plainStatus('Waiting for direct connection — direct link connected — waiting for gameplay probe acknowledgements'), { tone: 'busy', text: 'Connected — syncing the arena…', retry: false });
  assert.deepEqual(plainStatus('Direct connection failed · retrying'), { tone: 'bad', text: 'Connection trouble — retrying', retry: true });
  assert.deepEqual(plainStatus('ICE failed — likely symmetric NAT/CGNAT on one side'), { tone: 'bad', text: 'Connection trouble — retrying', retry: true });
  assert.deepEqual(plainStatus('Signalling disconnected · retrying'), { tone: 'bad', text: 'Connection trouble — retrying', retry: true });
  assert.equal(plainStatus('Waiting for room authority — try again when connected').text, 'Connecting…');
  assert.deepEqual(plainStatus(''), { tone: 'busy', text: '', retry: false });
});

test('a status that tells the player what to do is shown verbatim', () => {
  assert.deepEqual(plainStatus('This host tab was replaced — use the newer tab'), { tone: 'bad', text: 'This host tab was replaced — use the newer tab', retry: false });
  assert.deepEqual(plainStatus('Simulation out of sync — reload this page'), { tone: 'bad', text: 'Simulation out of sync — reload this page', retry: true });
  assert.equal(plainStatus('Recovered game paused — waiting for riders to rejoin, or reset to main menu').tone, 'busy');
});
