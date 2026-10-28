import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld} from './world.js';
import {leagueSeed} from './league-seed.js';
import {createNeighborhoodWorld, leagueForNeighborhood} from './neighborhood-seed.js';
import {
  createLeague, selectFrontier, getRound, eligibleWorks, registerLeagueWork,
  enterFrontier, recordFrontierTrial, submitFrontierBallot, finalizeFrontier, openNextRound,
} from './league-model.js';
import {LEAGUE_KEY, loadLeague, saveLeague} from './league-storage.js';

const world = createNeighborhoodWorld();
const fresh = () => createLeague(leagueForNeighborhood(world));
const neutralCells = world.cells.filter(cell => cell.owner === -1).map(cell => cell.id);
const factionCount = (state, owner) => state.owners.filter(value => value === owner).length;

function memoryStorage(entries = []) {
  const values = new Map(entries), accesses = [];
  return {
    values, accesses,
    getItem(key) { accesses.push(['get', key]); return values.get(key) ?? null; },
    setItem(key, value) { accesses.push(['set', key]); values.set(key, value); },
    removeItem(key) { accesses.push(['remove', key]); values.delete(key); },
  };
}

function ballotFor(state) {
  const frontier = state.frontiers.find(item => item.id === state.activeFrontierId);
  if (!eligibleWorks(state).length) {
    const opponent = state.works.find(work => work.id === frontier.opponentWorkId);
    state = registerLeagueWork(state, {
      title: `${frontier.title}의 새 출품작`, author: 'you', creationAI: 'Local',
      kind: frontier.kinds[0], cover: opponent.cover, rights: true,
    });
  }
  const beforeEntry = structuredClone(state.owners);
  state = enterFrontier(state, eligibleWorks(state)[0].id);
  state = recordFrontierTrial(state, 'A');
  state = recordFrontierTrial(state, 'B');
  state = submitFrontierBallot(state, 'A', {note: '두 예시 작품의 조작을 비교한 연습 의견입니다.'});
  assert.deepEqual(state.owners, beforeEntry, 'submission, trials and a ballot cannot transfer territory');
  return state;
}

for (const frontier of world.frontiers) {
  for (const outcome of ['claude', 'opponent', 'tie', 'insufficient']) {
    test(`actual neighborhood ${frontier.id}/${outcome}: ownership, rights, restore and next boundary remain consistent`, () => {
      let state = selectFrontier(fresh(), frontier.id);
      state = ballotFor(state);
      const before = structuredClone(state), oldRound = getRound(before);
      const finalized = finalizeFrontier(state, outcome);
      const changed = finalized.owners.flatMap((owner, id) => owner === before.owners[id] ? [] : [id]);
      const expectedChanged = outcome === 'claude' ? [oldRound.targetCell]
        : outcome === 'opponent' ? [oldRound.homeCell] : [];
      assert.deepEqual(changed, expectedChanged, 'only the losing staked plot may move');
      assert.equal(finalized.owners.length, world.cells.length);
      assert(neutralCells.length > world.cells.length / 2, 'the actual world starts mostly unclaimed');
      for (const id of neutralCells) assert.equal(finalized.owners[id], -1, `neutral plot ${id} is not a reward`);
      const delta = outcome === 'claude' ? 1 : outcome === 'opponent' ? -1 : 0;
      assert.equal(factionCount(finalized, 0), factionCount(before, 0) + delta);
      assert.equal(factionCount(finalized, frontier.opponentTeam), factionCount(before, frontier.opponentTeam) - delta);
      assert.deepEqual(finalized.works, before.works, 'land movement never rewrites authors, covers or versions');
      assert.deepEqual(state, before, 'finalization leaves the prior state unchanged');
      assert.equal(finalized.history.length, 1);
      assert.deepEqual(finalized.history[0].submission, oldRound.submission);
      assert.deepEqual(finalized.history[0].opponent, oldRound.opponent);
      assert.equal(finalized.history[0].result.rightsTransferred, false);
      assert.equal(finalizeFrontier(finalized, outcome), finalized, 'reapplying the result is harmless');

      const storage = memoryStorage();
      assert.equal(saveLeague(storage, finalized).ok, true);
      assert.deepEqual([...storage.values.keys()], [LEAGUE_KEY]);
      const restored = loadLeague(storage, fresh);
      assert.equal(restored.blocked, false);
      assert.deepEqual(restored.state.owners, finalized.owners);
      assert.deepEqual(restored.state.works, finalized.works);
      assert.deepEqual(restored.state.history, finalized.history);
      const next = openNextRound(restored.state), nextRound = getRound(next);
      assert.equal(nextRound.number, oldRound.number + 1);
      assert.equal(nextRound.phase, 'recruiting');
      assert.equal(next.owners[nextRound.homeCell], 0);
      assert.equal(next.owners[nextRound.targetCell], frontier.opponentTeam);
      assert(next.neighbors[nextRound.homeCell].includes(nextRound.targetCell));
      assert(next.neighbors[nextRound.targetCell].includes(nextRound.homeCell));
      assert.deepEqual(next.owners, finalized.owners, 'opening the next round does not grant land');
      assert.deepEqual(next.history, finalized.history);
    });
  }
}

test('actual settlement registration fills only vacant Claude plots and cannot spill into neutral land', () => {
  let state = fresh();
  const originalOwners = [...state.owners];
  const initiallyOccupied = new Set(state.works.map(work => work.cellId));
  const vacantClaude = new Set(state.owners.flatMap((owner, id) => owner === 0 && !initiallyOccupied.has(id) ? [id] : []));
  assert(vacantClaude.size > 0, 'the real seed has an entry opportunity');
  const registeredCells = new Set();
  for (let index = 0; index < vacantClaude.size; index++) {
    const beforeOccupied = new Set(state.works.map(work => work.cellId));
    state = registerLeagueWork(state, {
      title: `새 제작자의 작품 ${index + 1}`, kind: 'game', author: `maker-${index}`,
      creationAI: 'Local', rights: true, cover: '/assets/lumen-hop-cover.png',
    });
    const work = state.works.find(item => item.id === state.selectedWorkId);
    assert(vacantClaude.has(work.cellId));
    assert(!beforeOccupied.has(work.cellId));
    assert.equal(state.owners[work.cellId], 0);
    registeredCells.add(work.cellId);
    assert.deepEqual(state.owners, originalOwners);
  }
  assert.deepEqual(registeredCells, vacantClaude);
  assert.throws(() => registerLeagueWork(state, {
    title: '중립 땅 무상 점령 금지', kind: 'game', rights: true, creationAI: 'Claude',
    cover: '/assets/lumen-hop-cover.png',
  }), error => error.code === 'NO_VACANT_PLOT');
  assert.deepEqual(state.owners, originalOwners);
  for (const id of neutralCells) assert.equal(state.owners[id], -1);
});

test('actual v005 records survive neighborhood load, result save, reload and current-key reset byte-for-byte', () => {
  const oldKey = 'common:frontier-league:v1';
  const oldRecord = JSON.stringify({schema: 1, state: createLeague(leagueSeed(createWorld()))});
  const storage = memoryStorage([[oldKey, oldRecord]]);
  const loaded = loadLeague(storage, fresh);
  assert.equal(loaded.blocked, false, 'the different old geometry is not parsed as the current world');
  assert.equal(loaded.state.owners.length, world.cells.length);
  const finalized = finalizeFrontier(ballotFor(loaded.state), 'claude');
  assert.equal(saveLeague(storage, finalized).ok, true);
  const restored = loadLeague(storage, fresh);
  assert.equal(restored.blocked, false);
  assert.deepEqual(restored.state.history, finalized.history);
  assert.deepEqual(restored.state.owners, finalized.owners);
  storage.removeItem(LEAGUE_KEY);
  const reset = loadLeague(storage, fresh);
  assert.equal(reset.blocked, false);
  assert.equal(reset.state.history.length, 0);
  assert.deepEqual(reset.state.owners, fresh().owners);
  assert.equal(storage.values.get(oldKey), oldRecord);
  assert(storage.accesses.every(([, key]) => key === LEAGUE_KEY), 'current flows never access the old key');
});
