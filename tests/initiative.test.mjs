import test from 'node:test';
import assert from 'node:assert/strict';
import { InitiativeTracker } from '../src/rpg/initiative.js';

test('InitiativeTracker ordena, avança turnos e incrementa rodadas', () => {
  const tracker = new InitiativeTracker();
  tracker.add('Goblin', 8, true);
  tracker.add('Maga', 18, false);
  tracker.add('Guerreiro', 14, false);

  assert.deepEqual(
    tracker.entries.map((e) => e.name),
    ['Maga', 'Guerreiro', 'Goblin']
  );
  assert.equal(tracker.round, 1);
  assert.equal(tracker.activeIndex, 0);

  tracker.nextTurn();
  assert.equal(tracker.activeIndex, 1);
  tracker.nextTurn();
  assert.equal(tracker.activeIndex, 2);
  tracker.nextTurn();
  assert.equal(tracker.activeIndex, 0);
  assert.equal(tracker.round, 2);
});

test('InitiativeTracker restaura estado serializado', () => {
  const tracker = new InitiativeTracker();
  tracker.add('Dragão', 22, true);
  const snapshot = tracker.getState();

  const clone = new InitiativeTracker();
  clone.setState(snapshot);
  assert.equal(clone.entries.length, 1);
  assert.equal(clone.entries[0].name, 'Dragão');
});
