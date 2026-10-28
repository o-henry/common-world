import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWorld } from './world.js';

// Exercise the real private geometry builder without constructing a WebGL renderer.
// No duplicated geometry implementation and no browser/visual claims are involved.
const source = readFileSync(new URL('./world.js', import.meta.url), 'utf8');
const start = source.indexOf('function capGeometry(');
const end = source.indexOf('\nexport function mountWorld', start);
assert(start >= 0 && end > start, 'Expected the actual capGeometry implementation');
const capGeometry = new Function('THREE', `${source.slice(start, end)}; return capGeometry;`)(THREE);
const key = v => v.toArray().map(n => n.toFixed(6)).join(',');
const edgeKey = (a, b) => [key(a), key(b)].sort().join('|');
const world = createWorld();

test('dual icosphere has 12 pentagons, 80 hexagons and symmetric adjacency', () => {
  assert.equal(world.cells.length, 92);
  assert.equal(world.cells.filter(c => c.corners.length === 5).length, 12);
  assert.equal(world.cells.filter(c => c.corners.length === 6).length, 80);
  for (const cell of world.cells) {
    assert.equal(cell.neighbors.length, cell.corners.length);
    assert.equal(new Set(cell.neighbors).size, cell.neighbors.length);
    assert(!cell.neighbors.includes(cell.id));
    assert(Math.abs(cell.normal.length() - 1) < 1e-9);
    assert(Math.abs(cell.right.dot(cell.normal)) < 1e-9);
    assert(Math.abs(cell.top.dot(cell.normal)) < 1e-9);
    for (const id of cell.neighbors) assert(world.cells[id].neighbors.includes(cell.id));
  }
});

test('dual boundary network closes with two faces per edge and Euler characteristic 2', () => {
  const vertices = new Map(), edges = new Map();
  for (const cell of world.cells) {
    cell.corners.forEach((corner, i) => {
      const v = key(corner);
      if (!vertices.has(v)) vertices.set(v, []);
      vertices.get(v).push(cell.id);
      const edge = edgeKey(corner, cell.corners[(i + 1) % cell.corners.length]);
      if (!edges.has(edge)) edges.set(edge, []);
      edges.get(edge).push(cell.id);
    });
  }
  assert.equal(vertices.size, 180);
  assert.equal(edges.size, 270);
  assert.equal(vertices.size - edges.size + world.cells.length, 2);
  for (const ids of vertices.values()) assert.equal(ids.length, 3);
  for (const ids of edges.values()) {
    assert.equal(ids.length, 2);
    assert(world.cells[ids[0]].neighbors.includes(ids[1]));
  }
});

test('six factions have unequal nonempty territories and opposing stakes share a border', () => {
  const counts = world.cells.reduce((a, c) => (a[c.owner]++, a), [0, 0, 0, 0, 0, 0]);
  assert(counts.every(n => n > 0));
  assert(new Set(counts).size > 1);
  assert.equal(counts.reduce((a, b) => a + b, 0), world.cells.length);
  assert.equal(world.cells[world.home].owner, 0);
  assert.equal(world.cells[world.target].owner, 1);
  assert(world.cells[world.home].neighbors.includes(world.target));
  const homeCorners = new Set(world.cells[world.home].corners.map(key));
  assert.equal(world.cells[world.target].corners.filter(v => homeCorners.has(key(v))).length, 2);
  assert.equal(new Set(world.works.map(w => w.cellId)).size, world.works.length);
  for (const work of world.works) assert(world.cells[work.cellId]);
});

test('actual curved caps have outward winding, radial normals, valid UVs and no degenerates', () => {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cross = new THREE.Vector3();
  for (const cell of world.cells) {
    const geometry = capGeometry(cell, 2.6);
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    assert.equal(position.count, cell.corners.length * 16 * 3);
    for (let i = 0; i < position.count; i++) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(normal, i);
      assert(Math.abs(a.length() - 2.6) < 3e-7);
      assert(a.clone().normalize().dot(b) > 0.999999);
      assert(uv.getX(i) >= 0 && uv.getX(i) <= 1);
      assert(uv.getY(i) >= 0 && uv.getY(i) <= 1);
    }
    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      c.fromBufferAttribute(position, i + 2);
      ab.subVectors(b, a); ac.subVectors(c, a); cross.crossVectors(ab, ac);
      assert(cross.length() > 1e-8, `Nondegenerate triangle on cell ${cell.id}`);
      assert(cross.dot(a) > 0, `Outward FrontSide winding on cell ${cell.id}`);
    }
    geometry.dispose();
  }
});

test('Three Raycaster selects every cap from outside using FrontSide material', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  const meshes = world.cells.map(cell => {
    const mesh = new THREE.Mesh(capGeometry(cell, 2.6), material);
    mesh.userData.cellId = cell.id;
    mesh.updateMatrixWorld(true);
    return mesh;
  });
  const ray = new THREE.Raycaster();
  for (const cell of world.cells) {
    // Avoid a fan vertex/edge itself so this checks an interior point.
    const direction = cell.normal.clone().addScaledVector(cell.right, .013).addScaledVector(cell.top, .007).normalize();
    ray.set(direction.clone().multiplyScalar(10), direction.clone().negate());
    const hits = ray.intersectObjects(meshes, false);
    assert(hits.length > 0, `Cell ${cell.id} is selectable`);
    assert.equal(hits[0].object.userData.cellId, cell.id);
    assert(Math.abs(hits[0].point.length() - 2.6) < .004);
  }
  meshes.forEach(mesh => mesh.geometry.dispose());
  material.dispose();
});

test('camera projection and group focus preserve the front-facing work target', () => {
  const camera = new THREE.OrthographicCamera(-3.2, 3.2, 3.2, -3.2, .1, 50);
  camera.position.set(0, .1, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  for (const cell of world.cells) {
    const mesh = new THREE.Mesh(capGeometry(cell, 2.6), material);
    mesh.userData.cellId = cell.id; group.add(mesh);
  }
  const ray = new THREE.Raycaster();
  for (const id of [world.home, world.target, ...world.works.map(w => w.cellId)]) {
    const cell = world.cells[id];
    group.quaternion.setFromUnitVectors(cell.normal, new THREE.Vector3(.12, .04, 1).normalize());
    group.updateMatrixWorld(true);
    const point = cell.normal.clone().addScaledVector(cell.right, .013).normalize().multiplyScalar(2.6).applyQuaternion(group.quaternion);
    const projected = point.project(camera);
    ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
    const hits = ray.intersectObjects(group.children, false);
    assert(hits.length > 0);
    assert.equal(hits[0].object.userData.cellId, id);
  }
  group.children.forEach(mesh => mesh.geometry.dispose());
  material.dispose();
});
