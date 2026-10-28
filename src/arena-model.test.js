import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ArenaRuleError, createArenaState, registerWork, enterMatch,
  recordTrial, submitBallot, finalizeMatch,
} from './arena-model.js';

const fixture = overrides => createArenaState({
  owners: [0, 1, 2, 3, 0, 1], homeCell: 0, targetCell: 1,
  neighbors: [[1, 4], [0, 5], [], [], [0], [1]],
  works: [{ id: 'lumen', cellId: 0, title: 'Lumen Hop', author: 'nari', faction: 'Claude',
    creationAI: 'Claude', provenance: 'self-reported', cover: '/assets/lumen.png', version: 3 }],
  ...overrides,
});
const entered = () => enterMatch(fixture(), 'lumen');
const evaluated = () => submitBallot(recordTrial(recordTrial(entered(), 'A'), 'B'), 'A');
const errorCode = (fn, code) => assert.throws(fn, error => error instanceof ArenaRuleError && error.code === code);

test('valid adjacent factions are accepted and external input is isolated', () => {
  const owners = [0, 1];
  const state = fixture({ owners, neighbors: [1] });
  owners[0] = 5;
  assert.equal(state.owners[0], 0);
  assert.equal(state.adjacencyVerified, true);
});

test('invalid or non-adjacent stakes fail instead of silently creating a match', () => {
  errorCode(() => fixture({ homeCell: 1 }), 'INVALID_STAKES');
  errorCode(() => fixture({ targetCell: 9 }), 'INVALID_STAKES');
  errorCode(() => fixture({ owners: [1, 0] }), 'INVALID_FACTIONS');
  errorCode(() => fixture({ neighbors: [4] }), 'NON_ADJACENT_STAKES');
  errorCode(() => fixture({ works: [{ id: 'same' }, { id: 'same' }] }), 'INVALID_WORK_IDS');
});

test('registration requires a title, rights acknowledgement and AI declaration', () => {
  const state = fixture();
  errorCode(() => registerWork(state, { title: ' ' , rights: true }), 'INVALID_TITLE');
  errorCode(() => registerWork(state, { title: 'New' }), 'RIGHTS_REQUIRED');
  errorCode(() => registerWork(state, { title: 'New', rights: true }), 'INVALID_AI');
  errorCode(() => registerWork(state, { title: 'New', rights: true, creationAI: '' }), 'INVALID_AI');
  errorCode(() => registerWork(state, { title: 'New', rights: true, creationAI: 'Claude', cover: 'javascript:alert(1)' }), 'INVALID_COVER');
  const next = registerWork(state, { title: ' New ', rights: true, creationAI: 'Local', provenance: 'verified', author: 'henry', cover: '/new.png' });
  assert.deepEqual(next.owners, state.owners);
  assert.equal(state.works.length, 1);
  assert.equal(next.works.at(-1).title, 'New');
  assert.equal(next.works.at(-1).provenance, 'self-reported');
  assert.equal(next.selectedWorkId, next.works.at(-1).id);
  assert.equal(next.works.at(-1).cellId, 4);
});

test('registration fills only an existing vacant Claude plot and never overlays a work', () => {
  const state = fixture();
  const next = registerWork(state, { title: 'New', rights: true, creationAI: 'Claude' });
  const cellIds = next.works.map(work => work.cellId);
  assert.equal(new Set(cellIds).size, cellIds.length);
  assert.equal(next.owners[next.works.at(-1).cellId], 0);
  assert.equal(next.owners.length, state.owners.length);
  assert.deepEqual(next.owners, state.owners);
  errorCode(() => registerWork(next, { title: 'Overflow', rights: true, creationAI: 'Claude' }), 'NO_VACANT_PLOT');
  assert.equal(next.works.length, 2);
  assert.equal(state.works.length, 1);
});

test('vacant plot allocation uses current ownership after a territory result', () => {
  const state = evaluated();
  const won = finalizeMatch(state, 'claude');
  const next = registerWork(won, { title: 'On new land', rights: true, creationAI: 'Claude' });
  assert.equal(next.works.at(-1).cellId, 1);
  assert.deepEqual(next.owners, won.owners);
  const full = fixture({ owners: [0, 1], neighbors: [1] });
  errorCode(() => registerWork(full, { title: 'No room', rights: true, creationAI: 'Claude' }), 'NO_VACANT_PLOT');
});

test('entry freezes a detached submission without changing territory', () => {
  const state = fixture();
  const next = enterMatch(state, 'lumen');
  state.works[0].cover = '/later.png';
  state.works[0].version = 4;
  assert.equal(next.match.submission.cover, '/assets/lumen.png');
  assert.equal(next.match.submission.version, 3);
  assert(Object.isFrozen(next.match.submission));
  assert.deepEqual(next.owners, state.owners);
  errorCode(() => enterMatch(next, 'lumen'), 'ALREADY_ENTERED');
  errorCode(() => enterMatch(fixture(), 'missing'), 'WORK_NOT_REGISTERED');
});

test('a separate evaluator must try both sides; one ballot never changes land', () => {
  const state = entered();
  errorCode(() => submitBallot(state, 'A'), 'TRIALS_REQUIRED');
  const tried = recordTrial(recordTrial(state, 'A'), 'B');
  errorCode(() => submitBallot(tried, 'invalid'), 'INVALID_BALLOT');
  const next = submitBallot(tried, 'neither');
  assert.equal(next.match.ballot.role, 'independent-evaluator');
  assert.deepEqual(next.owners, state.owners);
  assert.equal(next.match.applied, false);
  errorCode(() => submitBallot(next, 'A'), 'BALLOT_ALREADY_SUBMITTED');
});

for (const [outcome, expected] of [
  ['claude', [0, 0, 2, 3, 0, 1]], ['openai', [1, 1, 2, 3, 0, 1]],
  ['tie', [0, 1, 2, 3, 0, 1]], ['insufficient', [0, 1, 2, 3, 0, 1]],
]) {
  test(`explicit ${outcome} finalization conserves cells and preserves creator rights`, () => {
    const state = evaluated(), originalWorks = structuredClone(state.works);
    const next = finalizeMatch(state, outcome);
    assert.deepEqual(next.owners, expected);
    assert.equal(next.owners.length, state.owners.length);
    assert.deepEqual(next.works, originalWorks);
    assert.equal(next.match.result.rightsTransferred, false);
    assert.equal(next.match.submission.author, 'nari');
    assert.equal(next.match.submission.creationAI, 'Claude');
    assert.equal(next.match.submission.cover, '/assets/lumen.png');
    assert.equal(finalizeMatch(next, outcome), next);
    assert.equal(finalizeMatch(next, outcome === 'claude' ? 'openai' : 'claude'), next);
    assert.deepEqual(state.owners, [0, 1, 2, 3, 0, 1]);
  });
}

test('finalization needs an entered match and ballot; invalid outcome is rejected', () => {
  errorCode(() => finalizeMatch(fixture(), 'claude'), 'NOT_ENTERED');
  errorCode(() => finalizeMatch(entered(), 'claude'), 'BALLOT_REQUIRED');
  errorCode(() => finalizeMatch(evaluated(), 'unknown'), 'INVALID_OUTCOME');
  errorCode(() => finalizeMatch(evaluated(), 'toString'), 'INVALID_OUTCOME');
  errorCode(() => recordTrial(finalizeMatch(evaluated(), 'claude'), 'A'), 'MATCH_FINALIZED');
});
