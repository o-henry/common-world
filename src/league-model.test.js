import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaRuleError } from './arena-model.js';
import {
  createLeague, selectFrontier, getRound, eligibleWorks, getEligibility,
  registerLeagueWork, reviseWork, enterFrontier, recordFrontierTrial,
  submitFrontierBallot, finalizeFrontier, openNextRound,
} from './league-model.js';

const graph = (count, edges) => {
  const neighbors = Array.from({ length: count }, () => []);
  for (const [a, b] of edges) { neighbors[a].push(b); neighbors[b].push(a); }
  return neighbors;
};
const fixture = changes => createLeague({
  owners: [0, 1, 0, 3, 0, 1, 3, 0, 0],
  neighbors: graph(9, [[0, 1], [0, 4], [1, 2], [1, 5], [2, 3], [2, 7], [3, 6], [3, 7], [4, 8], [5, 8], [6, 7]]),
  works: [
    { id: 'lumen', title: 'Lumen Hop', cellId: 0, author: 'nari', faction: 'Claude', creationAI: 'Claude', kind: 'game', cover: '/lumen.png', version: 1 },
    { id: 'newcomer', title: 'First Jump', cellId: 4, author: 'you', faction: 'Claude', creationAI: 'Local', kind: 'game', cover: '/first.png', version: 1 },
    { id: 'loop', title: 'Loop', cellId: 2, author: 'mori', faction: 'Claude', creationAI: 'Gemini', kind: 'music', cover: '/loop.png', version: 1 },
    { id: 'op-a', title: 'Moonstep', cellId: 1, author: 'sol', faction: 'OpenAI', creationAI: 'OpenAI', kind: 'game', cover: '/moon.png', version: 1 },
    { id: 'op-b', title: 'Night Loop', cellId: 3, author: 'kai', faction: 'Grok', creationAI: 'Grok', kind: 'music', cover: '/night.png', version: 1 },
  ],
  frontiers: [
    { id: 'jump', title: 'Jump frontier', brief: 'One hand game', kinds: ['game'], homeCell: 0, targetCell: 1, opponentTeam: 1, opponentWorkId: 'op-a' },
    { id: 'rhythm', title: 'Rhythm frontier', brief: 'Make a loop', kinds: ['music'], homeCell: 2, targetCell: 3, opponentTeam: 3, opponentWorkId: 'op-b' },
  ], ...changes,
});
const code = (fn, expected) => assert.throws(fn, error => error instanceof ArenaRuleError && error.code === expected);
function voted(state = fixture(), workId = 'lumen', note = '') {
  let next = enterFrontier(state, workId);
  next = recordFrontierTrial(next, 'A'); next = recordFrontierTrial(next, 'B');
  return submitFrontierBallot(next, 'A', { note });
}

test('two frontiers keep their state while switching the active view', () => {
  let state = enterFrontier(fixture(), 'lumen');
  const firstRound = getRound(state);
  state = selectFrontier(state, 'rhythm');
  assert.equal(getRound(state).phase, 'recruiting');
  assert.equal(state.rounds.jump, firstRound);
  state = enterFrontier(state, 'loop');
  state = selectFrontier(state, 'jump');
  assert.equal(getRound(state).submission.id, 'lumen');
  assert.equal(state.rounds.rhythm.submission.id, 'loop');
  code(() => selectFrontier(state, 'unknown'), 'UNKNOWN_FRONTIER');
});

test('kind and declared faction determine eligibility, never the model used', () => {
  const state = fixture();
  assert.deepEqual(eligibleWorks(state).map(w => w.id), ['lumen', 'newcomer']);
  assert.equal(getEligibility(state, 'loop').eligible, false);
  assert.equal(getEligibility(state, 'op-a').eligible, false);
  assert.equal(getEligibility(state, 'newcomer').eligible, true); // Local AI, Claude faction.
  assert.equal(getEligibility(selectFrontier(state, 'rhythm'), 'loop').eligible, true); // Gemini AI.
  code(() => enterFrontier(state, 'loop'), 'WORK_NOT_ELIGIBLE');
});

test('new work occupies a vacant Claude plot without generating territory', () => {
  const initial = fixture();
  const next = registerLeagueWork(initial, { title: 'A useful app', kind: 'schedule', rights: true, creationAI: 'Local', cover: '/app.png' });
  const work = next.works.at(-1);
  assert.equal(work.cellId, 7);
  assert.equal(work.kind, 'schedule');
  assert.equal(work.creationAI, 'Local');
  assert.equal(work.ai, 'Local');
  assert.equal(work.provenance, 'self-reported');
  assert.deepEqual(next.owners, initial.owners);
  assert.equal(initial.works.length, 5);
  code(() => registerLeagueWork(initial, { title: 'bad', kind: 'unknown', rights: true, creationAI: 'Claude' }), 'INVALID_KIND');
  code(() => registerLeagueWork(initial, { title: 'bad', kind: 'game', creationAI: 'Claude' }), 'RIGHTS_REQUIRED');
});

test('revision preserves creator, AI and plot while frozen entries retain the submitted version', () => {
  const entered = enterFrontier(fixture(), 'lumen');
  const next = reviseWork(entered, 'lumen', { changeNote: '첫 점프 버튼을 더 크게 바꿨습니다.', cover: '/new.png', description: 'Improved input' });
  const work = next.works.find(w => w.id === 'lumen'), snapshot = getRound(next).submission;
  assert.equal(work.version, 2);
  assert.equal(work.changelog[0].version, 2);
  assert.equal(work.changelog[0].changeNote, work.changeNote);
  assert.equal(work.author, 'nari'); assert.equal(work.creationAI, 'Claude'); assert.equal(work.cellId, 0);
  assert.equal(snapshot.version, 1); assert.equal(snapshot.cover, '/lumen.png');
  assert(Object.isFrozen(snapshot));
  code(() => reviseWork(next, 'lumen', { changeNote: 'abc' }), 'CHANGE_NOTE_REQUIRED');
  code(() => reviseWork(next, 'op-a', { changeNote: 'Should not change another faction' }), 'WRONG_FACTION');
});

test('A/B trial, one ballot and fictional aggregate are distinct state transitions', () => {
  const initial = fixture(), entered = enterFrontier(initial, 'lumen');
  assert.equal(getRound(entered).phase, 'submitted');
  assert.equal(getRound(entered).opponent.id, 'op-a');
  code(() => submitFrontierBallot(entered, 'A'), 'TRIALS_REQUIRED');
  code(() => finalizeFrontier(entered, 'claude'), 'BALLOT_REQUIRED');
  const oneTrial = recordFrontierTrial(entered, 'A');
  assert.equal(getRound(oneTrial).phase, 'evaluating');
  code(() => submitFrontierBallot(oneTrial, 'A'), 'TRIALS_REQUIRED');
  const next = submitFrontierBallot(recordFrontierTrial(oneTrial, 'B'), 'neither', { note: '핵심 조작을 비교했습니다.' });
  assert.equal(getRound(next).phase, 'ballot-submitted');
  assert.equal(getRound(next).ballot.role, 'independent-evaluator');
  assert.equal(getRound(next).ballot.fictional, true);
  assert.deepEqual(next.owners, initial.owners);
  assert.equal(next.history.length, 0);
  code(() => submitFrontierBallot(next, 'A'), 'BALLOT_ALREADY_SUBMITTED');
});

for (const outcome of ['claude', 'opponent', 'tie', 'insufficient']) {
  test(`${outcome}: explicit finalization applies at most one cell once and preserves rights`, () => {
    const state = voted(), original = structuredClone(state), next = finalizeFrontier(state, outcome);
    const changed = next.owners.filter((owner, id) => owner !== original.owners[id]);
    assert.equal(changed.length, ['claude', 'opponent'].includes(outcome) ? 1 : 0);
    assert.equal(next.owners.length, original.owners.length);
    assert.deepEqual(next.works, original.works);
    assert.deepEqual(state, original);
    assert.equal(next.history.length, 1);
    assert.equal(next.history[0].submission.author, 'nari');
    assert.equal(next.history[0].submission.creationAI, 'Claude');
    assert.equal(next.history[0].submission.cover, '/lumen.png');
    assert.equal(next.history[0].result.rightsTransferred, false);
    assert.equal(next.history[0].fictional, true);
    assert(Object.isFrozen(next.history[0]));
    assert.equal(finalizeFrontier(next, outcome), next);
    assert.equal(finalizeFrontier(next, outcome === 'claude' ? 'opponent' : 'claude'), next);
  });
}

test('a finished appearance gives the next eligible maker priority on that frontier only', () => {
  const finished = finalizeFrontier(voted(), 'opponent');
  const next = openNextRound(finished);
  assert.equal(getRound(next).number, 2);
  assert.equal(getRound(next).phase, 'recruiting');
  assert.equal(getEligibility(next, 'lumen').eligible, false);
  assert.equal(getEligibility(next, 'lumen').appearances, 1);
  assert.equal(getEligibility(next, 'newcomer').eligible, true);
  assert.deepEqual(eligibleWorks(next).map(w => w.id), ['newcomer']);
  code(() => enterFrontier(next, 'lumen'), 'WORK_NOT_ELIGIBLE');
  const newcomerFinished = finalizeFrontier(voted(next, 'newcomer'), 'tie');
  const third = openNextRound(newcomerFinished);
  assert.equal(getEligibility(third, 'lumen').eligible, true);
  assert.equal(getEligibility(third, 'newcomer').eligible, true);
  assert.equal(getEligibility(selectFrontier(third, 'rhythm'), 'loop').eligible, true);
});

test('priority counts makers, so a veteran cannot bypass it with a new work', () => {
  let next = openNextRound(finalizeFrontier(voted(), 'tie'));
  next = registerLeagueWork(next, { title: 'Another veteran app', kind: 'game', author: 'nari', rights: true, creationAI: 'Claude' });
  const newId = next.selectedWorkId;
  assert.equal(getEligibility(next, newId).eligible, false);
  assert.equal(getEligibility(next, newId).appearances, 1);
  next = reviseWork(next, 'lumen', { changeNote: '판정 피드백을 반영해 버튼을 바꿨습니다.' });
  assert.equal(getEligibility(next, 'lumen').eligible, false);
});

test('a revised work re-enters later with a detached new version and retained history', () => {
  const state = fixture({ works: fixture().works.filter(w => w.id !== 'newcomer') });
  const first = finalizeFrontier(voted(state), 'opponent');
  const second = reviseWork(openNextRound(first), 'lumen', { changeNote: '첫 화면의 조작 방법을 명확히 고쳤습니다.' });
  const entered = enterFrontier(second, 'lumen');
  assert.equal(getRound(entered).submission.version, 2);
  assert.equal(getRound(entered).submission.changeNote, '첫 화면의 조작 방법을 명확히 고쳤습니다.');
  assert.equal(entered.history[0].submission.version, 1);
  assert.equal(entered.history[0].submission.changeNote, undefined);
  assert.equal(entered.history.length, 1);
});

test('next-round stakes follow a current adjacent boundary after win or loss', () => {
  for (const outcome of ['claude', 'opponent', 'tie']) {
    const finished = finalizeFrontier(voted(), outcome), next = openNextRound(finished), round = getRound(next);
    assert.equal(next.owners[round.homeCell], 0);
    assert.equal(next.owners[round.targetCell], 1);
    assert(next.neighbors[round.homeCell].includes(round.targetCell));
    assert.deepEqual(next.owners, finished.owners);
    assert.equal(next.history, finished.history);
    if (outcome === 'claude') assert.deepEqual([round.homeCell, round.targetCell], [1, 5]);
    if (outcome === 'opponent') assert.deepEqual([round.homeCell, round.targetCell], [4, 0]);
  }
  code(() => openNextRound(fixture()), 'ROUND_NOT_FINISHED');
});

test('no remaining frontier fails without granting free land', () => {
  const small = createLeague({
    owners: [0, 1], neighbors: [[1], [0]],
    works: [fixture().works[0], fixture().works.find(w => w.id === 'op-a')],
    frontiers: [fixture().frontiers[0]],
  });
  const finished = finalizeFrontier(voted(small), 'claude');
  code(() => openNextRound(finished), 'NO_FRONTIER');
  assert.deepEqual(finished.owners, [0, 0]);
  assert.equal(finished.history.length, 1);
});

test('one plot cannot be reserved by two simultaneous matches', () => {
  const base = fixture();
  const neighbors = base.neighbors.map(ids => [...ids]); neighbors[0].push(3); neighbors[3].push(0);
  const frontiers = structuredClone(base.frontiers); frontiers[1].homeCell = 0;
  const state = enterFrontier(fixture({ neighbors, frontiers }), 'lumen');
  code(() => enterFrontier({ ...state, activeFrontierId: 'rhythm' }, 'loop'), 'STAKE_RESERVED');
});

test('selecting an unsubmitted frontier refreshes stale stakes after another confirmed result', () => {
  const base = fixture(), neighbors = base.neighbors.map(ids => [...ids]);
  neighbors[0].push(3); neighbors[3].push(0);
  const frontiers = structuredClone(base.frontiers); frontiers[1].homeCell = 0;
  const finished = finalizeFrontier(voted(fixture({ neighbors, frontiers })), 'opponent');
  const oldRound = finished.rounds.rhythm, confirmed = finished.rounds.jump;
  assert.equal(finished.owners[oldRound.homeCell], 1);
  const next = selectFrontier(finished, 'rhythm'), round = getRound(next);
  assert.deepEqual([round.homeCell, round.targetCell], [2, 3]);
  assert.equal(round.id, oldRound.id); assert.equal(round.number, oldRound.number);
  assert.equal(round.phase, 'recruiting'); assert.equal(round.submission, null);
  assert.equal(next.rounds.jump, confirmed);
  assert.equal(next.history, finished.history);
  assert.equal(next.owners, finished.owners);
  assert.equal(next.works, finished.works);
  assert.equal(finished.rounds.rhythm, oldRound);
  assert.equal(oldRound.homeCell, 0);
});

test('selecting a recruiting frontier avoids another unconfirmed round reservation', () => {
  const base = fixture(), neighbors = base.neighbors.map(ids => [...ids]);
  neighbors[0].push(3); neighbors[3].push(0);
  const frontiers = structuredClone(base.frontiers); frontiers[1].homeCell = 0;
  const submitted = enterFrontier(fixture({ neighbors, frontiers }), 'lumen');
  const next = selectFrontier(submitted, 'rhythm'), round = getRound(next);
  assert.deepEqual([round.homeCell, round.targetCell], [2, 3]);
  assert.equal(round.id, submitted.rounds.rhythm.id);
  assert.equal(round.number, 1);
  assert.equal(next.rounds.jump, submitted.rounds.jump);
  assert.doesNotThrow(() => enterFrontier(next, 'loop'));
});

test('selection never rewrites submitted or finalized land snapshots', () => {
  const submitted = enterFrontier(fixture(), 'lumen');
  const changed = { ...submitted, owners: submitted.owners.map((owner, id) => id === 0 ? 1 : owner) };
  const selected = selectFrontier(changed, 'jump');
  assert.equal(getRound(selected), getRound(submitted));
  assert.equal(getRound(selected).homeCell, 0);
  const finished = finalizeFrontier(voted(), 'opponent');
  const afterSelection = selectFrontier(selectFrontier(finished, 'rhythm'), 'jump');
  assert.equal(getRound(afterSelection), getRound(finished));
  assert.equal(afterSelection.history, finished.history);
});

test('selection distinguishes missing frontier from all boundary plots being reserved', () => {
  const base = fixture();
  const small = createLeague({
    owners: [0, 1, 3], neighbors: [[1, 2], [0], [0]],
    works: [base.works[0], base.works.find(w => w.id === 'op-a'),
      { ...base.works.find(w => w.id === 'op-b'), cellId: 2, kind: 'game' }],
    frontiers: [base.frontiers[0], { ...base.frontiers[1], kinds: ['game'], homeCell: 0, targetCell: 2 }],
  });
  const submitted = enterFrontier(small, 'lumen');
  code(() => selectFrontier(submitted, 'rhythm'), 'NO_AVAILABLE_STAKES');
  assert.equal(submitted.rounds.rhythm.number, 1);
  const finished = finalizeFrontier(voted(small), 'opponent');
  code(() => selectFrontier(finished, 'rhythm'), 'NO_FRONTIER');
  assert.deepEqual(finished.owners, [1, 1, 3]);
  assert.equal(finished.history.length, 1);
});

test('separate frontiers finalize without erasing each other and reject stale stakes', () => {
  let state = voted();
  state = voted(selectFrontier(state, 'rhythm'), 'loop');
  state = finalizeFrontier(state, 'claude');
  assert.equal(state.history[0].frontierId, 'rhythm');
  state = finalizeFrontier(selectFrontier(state, 'jump'), 'opponent');
  assert.equal(state.history.length, 2);
  assert.equal(state.rounds.rhythm.applied, true);
  assert.equal(state.rounds.jump.applied, true);
  const stale = voted();
  stale.owners[1] = 3;
  code(() => finalizeFrontier(stale, 'claude'), 'STALE_STAKES');
  code(() => finalizeFrontier(state, 'toString'), 'INVALID_OUTCOME');
});
