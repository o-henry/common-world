import test from 'node:test';
import assert from 'node:assert/strict';
import {initialMapCamera, mapViewBox, zoomMap, panMap, mapPointer} from './map-camera.js';

const base = [-600, -600, 1200, 1200];
test('zoom keeps the world point under the pointer and clamps its scale', () => {
  const camera = initialMapCamera(), point = [.7, .3];
  const before = mapViewBox(base, camera), after = mapViewBox(base, zoomMap(camera, base, 1.5, point));
  for (let axis = 0; axis < 2; axis++) {
    assert(Math.abs(before[axis] + before[axis + 2] * point[axis]
      - after[axis] - after[axis + 2] * point[axis]) < 1e-9);
  }
  assert.equal(zoomMap(camera, base, 100).zoom, 3);
  assert.equal(zoomMap(camera, base, .001).zoom, .85);
});
test('panning is bounded and returns new state without changing the source', () => {
  const camera = initialMapCamera();
  assert.deepEqual(panMap(camera, base, 1e8, -1e8), {zoom: 1, x: 576, y: -576});
  assert.deepEqual(camera, {zoom: 1, x: 0, y: 0});
});
test('letterboxed wide and tall SVGs map the same content position with uniform drag scale', () => {
  const wide = mapPointer({left:10,top:20,width:800,height:400}, base, 510,120);
  const tall = mapPointer({left:10,top:20,width:400,height:800}, base, 310,320);
  assert.deepEqual(wide.point, [.75,.25]);
  assert.deepEqual(tall.point, [.75,.25]);
  assert.equal(wide.scale, tall.scale);
  assert.equal(100 / wide.scale, 300);
  assert.equal(mapPointer({width:0,height:0},base,0,0),null);
});
