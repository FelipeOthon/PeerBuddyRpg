import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditSheet, createDefaultSheet } from '../src/rpg/sheets.js';

test('canEditSheet restringe edição ao Mestre ou ao dono da ficha', () => {
  const sheet = createDefaultSheet('pdf', 'Aragorn', { ownerId: 'player-1', pdfAssetId: 'sheetpdf-1' });
  assert.equal(canEditSheet(sheet, 'gm', 'gm'), true);
  assert.equal(canEditSheet(sheet, 'player', 'player-1'), true);
  assert.equal(canEditSheet(sheet, 'player', 'player-2'), false);
});
