import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessage, MSG, parseMessage, PROTOCOL_VERSION } from '../src/net/protocol.js';

test('createMessage e parseMessage preservam envelope do protocolo', () => {
  const msg = createMessage(MSG.DICE_ROLL, { total: 20 }, 'gm');
  assert.equal(msg.v, PROTOCOL_VERSION);
  assert.equal(msg.type, MSG.DICE_ROLL);
  assert.equal(msg.senderId, 'gm');

  const decoded = parseMessage(JSON.stringify(msg));
  assert.deepEqual(decoded, msg);
});

test('parseMessage rejeita payloads inválidos', () => {
  assert.throws(() => parseMessage('{}'), /inválida/);
});
