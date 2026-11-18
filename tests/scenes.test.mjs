import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneManager } from '../src/rpg/scenes.js';

test('SceneManager cria, alterna, limpa mapa e remove cenas', () => {
  const mgr = new SceneManager();
  assert.equal(mgr.list().length, 1);

  const tavern = mgr.createScene('Taverna', 'map-100');
  mgr.switchScene(tavern.id);
  assert.equal(mgr.getActive().name, 'Taverna');
  assert.equal(mgr.getActive().mapAssetId, 'map-100');

  mgr.clearSceneMap(tavern.id);
  assert.equal(mgr.getActive().mapAssetId, null);

  assert.equal(mgr.removeScene(tavern.id), true);
  assert.equal(mgr.list().length, 1);
  // Não remove a última cena restante
  assert.equal(mgr.removeScene(mgr.activeSceneId), false);
});

test('SceneManager serializa e restaura múltiplas cenas', () => {
  const mgr = new SceneManager();
  const dungeon = mgr.createScene('Masmorra', 'map-200');
  mgr.switchScene(dungeon.id);
  const data = mgr.serialize();

  const clone = new SceneManager();
  clone.restore(data);
  assert.equal(clone.list().length, 2);
  assert.equal(clone.getActive().name, 'Masmorra');
});
