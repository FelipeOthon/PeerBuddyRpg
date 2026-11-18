import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVisibilityPolygon, raySegmentIntersect } from '../src/rpg/vtt.js';

test('raySegmentIntersect detecta parede bloqueando o raio', () => {
  // Raio da origem (0,0) indo para +X (dx=1, dy=0) encontra parede em x=50
  const t = raySegmentIntersect(0, 0, 1, 0, 50, -20, 50, 20);
  assert.equal(t, 50);

  // Raio indo para -X não atinge parede em x=50
  const miss = raySegmentIntersect(0, 0, -1, 0, 50, -20, 50, 20);
  assert.equal(miss, null);
});

test('computeVisibilityPolygon limita raios ao encontrar parede', () => {
  const walls = [{ x1: 40, y1: -100, x2: 40, y2: 100 }];
  const poly = computeVisibilityPolygon(0, 0, 200, walls, 8);
  assert.equal(poly.length, 8);
  // Raio 0 (ângulo 0 = direção +X) deve parar em x = 40
  assert.ok(Math.abs(poly[0].x - 40) < 1e-6);
  // Raio 4 (ângulo PI = direção -X) deve ir até o raio máximo 200
  assert.ok(Math.abs(poly[4].x + 200) < 1e-6);
});
