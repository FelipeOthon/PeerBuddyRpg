import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChatCommand } from '../src/rpg/chat.js';

test('parseChatCommand interpreta /me, /ooc, /w e texto padrão', () => {
  assert.deepEqual(parseChatCommand('/me saca a espada', 'Aragorn'), {
    mode: 'action',
    speaker: 'Aragorn',
    body: 'saca a espada',
  });
  assert.deepEqual(parseChatCommand('/ooc vou pegar água', 'Felipe'), {
    mode: 'ooc',
    speaker: 'Felipe',
    body: 'vou pegar água',
  });
  assert.deepEqual(parseChatCommand('/w achei uma armadilha', 'Ladino'), {
    mode: 'whisper',
    speaker: 'Ladino',
    body: 'achei uma armadilha',
  });
  assert.deepEqual(parseChatCommand('Olá taverna!', 'Bardo'), {
    mode: 'ic',
    speaker: 'Bardo',
    body: 'Olá taverna!',
  });
  assert.equal(parseChatCommand('   '), null);
});
