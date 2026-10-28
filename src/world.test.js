import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWorld, cellAtNormal, TEAMS } from './world.js';

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


test('higher detail preserves a closed 642-cell world and the legacy default', () => {
  const detailed=createWorld({detail:7});
  assert.equal(detailed.cells.length,642);
  assert.equal(detailed.cells.filter(c=>c.corners.length===5).length,12);
  for(const cell of detailed.cells){
    for(const adjacent of cell.neighbors)assert(detailed.cells[adjacent].neighbors.includes(cell.id));
    assert.equal(cellAtNormal(detailed.cells,cell.normal),cell.id);
  }
  assert.equal(createWorld().cells.length,92);
  for(const detail of [-1,0,1.5,11,Infinity])assert.throws(()=>createWorld({detail}),RangeError);
});

test('unmeshed surface picking resolves the actual spherical polygon at centers and near corners', () => {
  const detailed=createWorld({detail:7});
  for(const cell of detailed.cells){
    for(let i=0;i<cell.corners.length;i++){
      const corner=cell.corners[i],next=cell.corners[(i+1)%cell.corners.length];
      const interior=cell.normal.clone().multiplyScalar(.12).addScaledVector(corner,.69).addScaledVector(next,.19).normalize();
      assert.equal(cellAtNormal(detailed.cells,interior),cell.id,`Interior of ${cell.id}`);
    }
  }
  assert.equal(cellAtNormal(detailed.cells,new THREE.Vector3()),undefined);
  assert.equal(cellAtNormal([],new THREE.Vector3(0,0,1)),undefined);
});

// The actual renderer controller runs against a DOM/renderer boundary double.
// Three geometry, camera and ray intersection remain real; no WebGL/visual claim.
function controllerFixture({deferTextures=false}={}){
  const listeners=new Map(),loaded=[],pending=[],renderers=[];
  const canvas={setAttribute(){},addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name){listeners.delete(name);},getBoundingClientRect(){return {left:0,top:0,width:600,height:600};},setPointerCapture(){},hasPointerCapture(){return false;},releasePointerCapture(){},remove(){this.removed=true;}};
  class Renderer{
    constructor(){this.domElement=canvas;this.capabilities={getMaxAnisotropy:()=>4};renderers.push(this);}
    setPixelRatio(){}setClearColor(){}setSize(){}
    render(scene,camera){this.scene=scene;this.camera=camera;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);}
    dispose(){this.disposed=true;}
  }
  class Loader{
    load(url,onLoad){const texture=new THREE.Texture({width:1600,height:900});loaded.push(texture);if(deferTextures)pending.push(()=>onLoad(texture));else onLoad(texture);return texture;}
  }
  const observer={disconnected:false};
  class Observer{observe(){}disconnect(){observer.disconnected=true;}}
  const mountSource=source.slice(source.indexOf('export function mountWorld')).replace('export function','function');
  const mount=new Function('THREE','window','ResizeObserver','cellAtNormal','capGeometry','TEAMS',`${mountSource};return mountWorld;`)({...THREE,WebGLRenderer:Renderer,TextureLoader:Loader},{devicePixelRatio:1},Observer,cellAtNormal,capGeometry,TEAMS);
  const container={appendChild(){},getBoundingClientRect(){return {width:600,height:600};}};
  const detailed=createWorld({detail:7});
  const front=detailed.cells.reduce((best,c)=>c.normal.z>best.normal.z?c:best,detailed.cells[0]);
  const work=detailed.works[0];work.cellId=front.id;
  detailed.works=[work];detailed.home=front.id;
  for(const cell of detailed.cells)cell.owner=-1;
  front.owner=0;
  const chosen=[],empty=[],errors=[];
  const api=mount(container,detailed,{onSelect:id=>chosen.push(id),onEmpty:id=>empty.push(id),onError:e=>errors.push(e)});
  const renderer=renderers[0],group=renderer.scene.children.find(child=>child.isGroup);
  const eventAt=point=>{const p=point.clone().applyMatrix4(group.matrixWorld).project(renderer.camera);return {button:0,pointerId:1,clientX:(p.x+1)*300,clientY:(1-p.y)*300};};
  const click=normal=>{const e=eventAt(normal.clone().multiplyScalar(2.584));listeners.get('pointerdown')(e);listeners.get('pointerup')(e);};
  return {api,detailed,front,renderer,group,chosen,empty,errors,canvas,listeners,observer,loaded,pending,click};
}

test('neutral plots stay unmeshed and front surface clicks retain the same cell identity', () => {
  const f=controllerFixture();
  const plotMeshes=()=>f.group.children.filter(o=>o.isMesh&&o.userData.cellId!==undefined&&o.material.color.getHexString()!=='ffffff');
  assert.equal(plotMeshes().length,1);
  f.click(f.front.normal);assert.deepEqual(f.chosen,['lumen']);
  const neutral=f.detailed.cells.find(c=>c.owner===-1&&c.normal.z>.8&&c.id!==f.front.id);
  f.click(neutral.normal);assert.deepEqual(f.empty,[neutral.id]);
  const owners=f.detailed.cells.map(c=>c.owner);owners[neutral.id]=1;f.api.updateOwners(owners);
  assert.equal(plotMeshes().length,2);
  owners[neutral.id]=-1;f.api.updateOwners(owners);
  assert.equal(plotMeshes().filter(o=>o.visible).length,1);
  f.click(neutral.normal);assert.equal(f.empty.at(-1),neutral.id);
  assert.equal(f.errors.length,0);
  f.api.dispose();
});

test('backside work cannot intercept a front-facing neutral cell and controller releases its resources', () => {
  const f=controllerFixture({deferTextures:true});
  const backside=f.detailed.cells.reduce((best,c)=>c.normal.z<best.normal.z?c:best,f.front);
  f.api.setWorks([{...f.detailed.works[0],cellId:backside.id,id:'backside'}],'backside');
  f.click(f.front.normal);assert.equal(f.chosen.length,0);assert.equal(f.empty.at(-1),f.front.id);
  const disposals=new Map();
  f.renderer.scene.traverse(o=>{for(const item of [o.geometry,...(o.material?Array.isArray(o.material)?o.material:[o.material]:[])])if(item&&!disposals.has(item)){disposals.set(item,0);item.addEventListener('dispose',()=>disposals.set(item,disposals.get(item)+1));}});
  const textureDisposals=f.loaded.map(texture=>{const counter={count:0};texture.addEventListener('dispose',()=>counter.count++);return counter;});
  f.api.dispose();
  assert(f.canvas.removed&&f.renderer.disposed&&f.observer.disconnected);
  assert.equal(f.listeners.size,0);
  assert([...disposals.values()].every(count=>count===1));
  f.pending.forEach(resolve=>resolve());
  assert(textureDisposals.every(counter=>counter.count===1),'pending textures disposed once, without attachment after unmount');
  assert.equal(f.errors.length,0);
});
