import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMacroToSheet,
  calcDndMod,
  createDefaultSheet,
  formatMod,
  removeMacroFromSheet,
} from '../src/rpg/sheets.js';

test('calcDndMod e formatMod calculam modificadores D&D 5e corretamente', () => {
  assert.equal(calcDndMod(10), 0);
  assert.equal(calcDndMod(16), 3);
  assert.equal(calcDndMod(8), -1);
  assert.equal(formatMod(3), '+3');
  assert.equal(formatMod(-1), '-1');
});

test('createDefaultSheet e macros funcionam para D&D 5e e Genérica', () => {
  const dnd = createDefaultSheet('dnd5e', 'Mestre');
  assert.equal(dnd.template, 'dnd5e');
  assert.ok(dnd.macros.length >= 3);

  const m = addMacroToSheet(dnd, 'Bola de Fogo', '8d6');
  assert.ok(dnd.macros.some((x) => x.id === m.id));
  removeMacroFromSheet(dnd, m.id);
  assert.ok(!dnd.macros.some((x) => x.id === m.id));

  const gen = createDefaultSheet('generic', 'Jogador');
  assert.equal(gen.template, 'generic');
  assert.ok(Array.isArray(gen.customFields));
});
