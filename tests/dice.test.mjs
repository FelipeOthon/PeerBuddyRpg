import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRollSummary, parseAndRoll } from '../src/rpg/dice.js';

test('parseAndRoll soma dados e modificadores corretamente', () => {
  const fixedRng = () => 0.5; // floor(0.5 * 20) + 1 = 11, floor(0.5 * 6) + 1 = 4
  const res = parseAndRoll('1d20+2d6-3', fixedRng);
  assert.equal(res.total, 11 + 8 - 3);
  assert.equal(res.terms.length, 3);
  assert.match(formatRollSummary(res), /= 16$/);
});

test('parseAndRoll suporta vantagem (kh1) e desvantagem (kl1)', () => {
  const seq = [0.1, 0.9]; // -> 3 e 19 no d20
  let i = 0;
  const adv = parseAndRoll('2d20kh1', () => seq[i++]);
  assert.equal(adv.total, 19);

  i = 0;
  const dis = parseAndRoll('2d20kl1', () => seq[i++]);
  assert.equal(dis.total, 3);
});

test('parseAndRoll rejeita expressões inválidas', () => {
  assert.throws(() => parseAndRoll(''), /vazia/);
  assert.throws(() => parseAndRoll('1d20+abc'), /inválida/);
  assert.throws(() => parseAndRoll('200d6'), /1 e 100/);
});
