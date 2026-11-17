import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssetTransfer, ChunkAssembler } from '../src/net/chunker.js';

test('buildAssetTransfer e ChunkAssembler remontam bytes exatamente iguais', () => {
  const original = new Uint8Array(40 * 1024);
  for (let i = 0; i < original.length; i++) original[i] = i % 251;

  const transfer = buildAssetTransfer('map-1', 'image/webp', original, 8192);
  assert.equal(transfer.chunks.length, 5);

  const assembler = new ChunkAssembler();
  assembler.onStart(transfer.start);
  for (const ch of transfer.chunks) {
    assembler.onChunk(ch);
  }
  const result = assembler.onEnd(transfer.end);
  assert.ok(result);
  assert.equal(result.assetId, 'map-1');
  assert.equal(result.mime, 'image/webp');
  assert.deepEqual(result.bytes, original);
});

test('ChunkAssembler retorna null se faltar chunk', () => {
  const data = new Uint8Array([1, 2, 3, 4, 5]);
  const transfer = buildAssetTransfer('map-2', 'image/png', data, 2);
  const assembler = new ChunkAssembler();
  assembler.onStart(transfer.start);
  assembler.onChunk(transfer.chunks[0]);
  assert.equal(assembler.onEnd(transfer.end), null);
});
