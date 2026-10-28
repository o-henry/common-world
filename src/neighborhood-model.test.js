import test from 'node:test';
import assert from 'node:assert/strict';
import {createNeighborhoodWorld, leagueForNeighborhood} from './neighborhood-seed.js';
import {projectNeighborhood, pickNeighborhoodCell, neighborhoodPointToNormal} from './neighborhood-model.js';

const world = createNeighborhoodWorld();

test('the settlement has only six fictional works and leaves most of its world neutral', () => {
  assert.equal(world.cells.length, 642);
  assert.equal(world.works.length, 6);
  assert.deepEqual(world.works.map(work => work.id).sort(), ['counterbeat', 'lumen', 'moonstep', 'quiet', 'together', 'velvet']);
  assert.equal(new Set(world.works.map(work => work.cellId)).size, 6);
  const claimed = world.cells.filter(cell => cell.owner >= 0);
  assert(claimed.length < world.cells.length / 8);
  for (let owner = 0; owner < 6; owner++) assert(claimed.some(cell => cell.owner === owner));
  const reached = new Set([claimed[0].id]), pending = [claimed[0].id];
  while (pending.length) for (const id of world.cells[pending.shift()].neighbors) {
    if (world.cells[id].owner >= 0 && !reached.has(id)) { reached.add(id); pending.push(id); }
  }
  assert.equal(reached.size, claimed.length, 'the occupied area is one connected neighbourhood');
});

test('all three task frontiers use distinct adjacent stakes and the matching opponent work', () => {
  const seed = leagueForNeighborhood(world), stakes = [];
  for (const frontier of seed.frontiers) {
    assert.equal(seed.owners[frontier.homeCell], 0);
    assert.equal(seed.owners[frontier.targetCell], frontier.opponentTeam);
    assert(seed.neighbors[frontier.homeCell].includes(frontier.targetCell));
    const opponent = seed.works.find(work => work.id === frontier.opponentWorkId);
    assert.equal(opponent.cellId, frontier.targetCell);
    assert(frontier.kinds.includes(opponent.kind));
    stakes.push(frontier.homeCell, frontier.targetCell);
  }
  assert.equal(new Set(stakes).size, 6);
  const lumen = seed.works.find(work => work.id === 'lumen'), velvet = seed.works.find(work => work.id === 'velvet');
  assert.equal(lumen.cellId, seed.frontiers[0].homeCell);
  assert.equal(velvet.cellId, seed.frontiers[1].homeCell);
  assert.equal(lumen.author, 'nari'); assert.equal(velvet.creationAI, 'Gemini');
});

test('seed copies are detached from world ownership and editable work records', () => {
  const seed = leagueForNeighborhood(world), before = world.cells[world.home].owner;
  seed.owners[world.home] = 1;
  seed.works[0].title = 'changed';
  seed.frontiers[0].kinds.push('schedule');
  assert.equal(world.cells[world.home].owner, before);
  assert.equal(world.works[0].title, 'Lumen Hop');
  assert.equal(world.frontiers[0].kinds.length, 1);
});

test('the local board has a finite bounded projection, including neutral land', () => {
  const board = projectNeighborhood(world, world.home);
  assert(board.cells.length >= 40 && board.cells.length <= 90);
  assert(board.cells.some(cell => cell.owner === -1));
  assert(board.cells.some(cell => cell.id === world.home));
  assert.equal(new Set(board.cells.map(cell => cell.id)).size, board.cells.length);
  assert(board.viewBox.every(Number.isFinite));
  for (const cell of board.cells) {
    assert(Number.isFinite(cell.x) && Number.isFinite(cell.y));
    assert.equal(cell.points.length, world.cells[cell.id].corners.length);
    assert(cell.points.flat().every(Number.isFinite));
    assert.deepEqual(cell.neighbors, world.cells[cell.id].neighbors);
    assert.equal(pickNeighborhoodCell(board, {x: cell.x, y: cell.y}), cell.id);
    assert(neighborhoodPointToNormal(world, world.home, cell, board.scale).distanceTo(world.cells[cell.id].normal) < 1e-12);
  }
});

test('the settlement overview anchor includes every original work in one local board', () => {
  assert.equal(world.neighborhood.anchorCellId, world.centerCellId);
  const board = projectNeighborhood(world, world.centerCellId);
  const visible = new Set(board.cells.map(cell => cell.id));
  for (const work of world.works) assert(visible.has(work.cellId), `${work.title} belongs to the visible neighbourhood`);
  assert(board.cells.length >= 40 && board.cells.length <= 90);
});

test('neighbour boundaries remain shared in the flat board, rather than becoming separate tiles', () => {
  const board = projectNeighborhood(world, world.home), byId = new Map(board.cells.map(cell => [cell.id, cell]));
  const key = point => point.map(value => value.toFixed(7)).join(',');
  for (const cell of board.cells) for (const id of cell.neighbors) if (byId.has(id)) {
    const points = new Set(cell.points.map(key));
    assert.equal(byId.get(id).points.filter(point => points.has(key(point))).length, 2);
  }
});

test('recentering keeps cell identity, all work metadata and the original globe unchanged', () => {
  const before = world.cells.map(cell => cell.owner), works = structuredClone(world.works);
  for (const work of world.works) {
    const board = projectNeighborhood(world, work.cellId);
    const selected = board.cells.find(cell => cell.id === work.cellId);
    assert(Math.hypot(selected.x, selected.y) < 1e-10);
    assert.equal(pickNeighborhoodCell(board, [0, 0]), work.cellId);
  }
  assert.deepEqual(world.cells.map(cell => cell.owner), before);
  assert.deepEqual(world.works, works);
});

test('invalid anchors, projection parameters and empty picks fail without changing the world', () => {
  assert.throws(() => projectNeighborhood(world, -1), RangeError);
  assert.throws(() => projectNeighborhood(world, world.cells.length), RangeError);
  assert.throws(() => projectNeighborhood(world, world.home, {radius: 10}), RangeError);
  assert.throws(() => projectNeighborhood(world, world.home, {scale: NaN}), RangeError);
  const board = projectNeighborhood(world, world.home);
  assert.equal(pickNeighborhoodCell(board, {x: 1e6, y: 1e6}), null);
  assert.equal(pickNeighborhoodCell(board, {x: NaN, y: 0}), null);
  assert.throws(() => neighborhoodPointToNormal(world, world.home, {x: Infinity, y: 0}), RangeError);
});
