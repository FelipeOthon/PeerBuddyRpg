import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSignal, encodeSignal } from '../src/net/signaling.js';

test('encodeSignal e decodeSignal preservam role travada, peerId e playerName', async () => {
  const code = await encodeSignal(
    { type: 'offer', sdp: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\n' },
    { role: 'player', peerId: 'player-abc', playerName: 'Aragorn' }
  );
  assert.ok(code.startsWith('CV1:') || code.startsWith('CV0:'));

  const decoded = await decodeSignal(code);
  assert.equal(decoded.type, 'offer');
  assert.equal(decoded.role, 'player');
  assert.equal(decoded.peerId, 'player-abc');
  assert.equal(decoded.playerName, 'Aragorn');
});
