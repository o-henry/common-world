import { ArenaRuleError, registerWork } from './arena-model.js';

// Local, fictional league: no identity verification, real judging or AI benchmark.
const TEAMS = ['Claude', 'OpenAI', 'Gemini', 'Grok', 'DeepSeek', 'Local'];
const KINDS = ['game', 'music', 'code', 'schedule'];
const SCORES = {
  claude: { claude: 8, opponent: 4, valid: 12 },
  opponent: { claude: 4, opponent: 8, valid: 12 },
  tie: { claude: 6, opponent: 6, valid: 12 },
  insufficient: { claude: 4, opponent: 3, valid: 7 },
};
const fail = (code, message) => { throw new ArenaRuleError(code, message); };
const copy = value => structuredClone(value);
const team = value => Number.isInteger(value) && value >= 0 && value < TEAMS.length
  ? value : TEAMS.findIndex(name => name.toLowerCase() === String(value).toLowerCase());
const validOwner = value => value === -1 || team(value) >= 0;
const validCell = (id, owners) => Number.isInteger(id) && id >= 0 && id < owners.length;
function frozen(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

function frontierFor(state, id = state.activeFrontierId) {
  const frontier = state.frontiers.find(item => item.id === id);
  if (!frontier) fail('UNKNOWN_FRONTIER', '접경전을 찾을 수 없습니다.');
  return frontier;
}

export function getRound(state, id = state.activeFrontierId) {
  frontierFor(state, id);
  return state.rounds[id];
}

function newRound(frontier, number, homeCell = frontier.homeCell, targetCell = frontier.targetCell) {
  return {
    id: `${frontier.id}-${number}`, number, phase: 'recruiting',
    homeCell, targetCell, submission: null, opponent: null,
    trialed: { A: false, B: false }, ballot: null, result: null, applied: false,
    fictional: true,
  };
}

function stakesValid(state, frontier, round) {
  return validCell(round.homeCell, state.owners) && validCell(round.targetCell, state.owners)
    && team(state.owners[round.homeCell]) === 0
    && team(state.owners[round.targetCell]) === team(frontier.opponentTeam)
    && state.neighbors[round.homeCell].includes(round.targetCell)
    && state.neighbors[round.targetCell].includes(round.homeCell);
}

function replaceRound(state, round, id = state.activeFrontierId) {
  return { ...state, rounds: { ...state.rounds, [id]: round } };
}

function requireInProgress(round) {
  if (round.applied) fail('MATCH_FINALIZED', '이미 확정된 경기입니다.');
  if (!round.submission) fail('NOT_ENTERED', '출품작이 아직 정해지지 않았습니다.');
}

export function createLeague({ owners, neighbors, works = [], frontiers = [] } = {}) {
  if (!Array.isArray(owners) || !owners.length || owners.some(owner => !validOwner(owner))) {
    fail('INVALID_OWNERS', '유효한 영토 정보가 필요합니다.');
  }
  if (!Array.isArray(neighbors) || neighbors.length !== owners.length
    || neighbors.some((ids, id) => !Array.isArray(ids) || ids.some(n => !validCell(n, owners) || n === id))) {
    fail('INVALID_NEIGHBORS', '유효한 인접 정보가 필요합니다.');
  }
  for (let id = 0; id < neighbors.length; id++) {
    if (neighbors[id].some(n => !neighbors[n].includes(id))) fail('INVALID_NEIGHBORS', '인접 관계가 대칭이어야 합니다.');
  }
  if (!Array.isArray(works) || works.some(work => typeof work.id !== 'string' || !work.id
    || !validCell(work.cellId, owners) || team(owners[work.cellId]) < 0) || new Set(works.map(work => work.id)).size !== works.length
    || new Set(works.map(work => work.cellId)).size !== works.length) {
    fail('INVALID_WORKS', '작품 ID와 전시 자리는 서로 겹치지 않아야 합니다.');
  }
  if (!Array.isArray(frontiers) || !frontiers.length || new Set(frontiers.map(f => f.id)).size !== frontiers.length) {
    fail('INVALID_FRONTIERS', '고유한 접경전 정보가 필요합니다.');
  }
  const state = {
    owners: [...owners], initialOwners: [...owners], neighbors: neighbors.map(ids => [...new Set(ids)]),
    works: works.map(work => ({ registered: true, version: 1, faction: TEAMS[team(owners[work.cellId])], ...copy(work) })),
    frontiers: copy(frontiers), activeFrontierId: frontiers[0].id, rounds: {}, history: [],
  };
  for (const frontier of state.frontiers) {
    if (typeof frontier.id !== 'string' || !frontier.id || ![1, 3].includes(team(frontier.opponentTeam))
      || !Array.isArray(frontier.kinds) || !frontier.kinds.length || frontier.kinds.some(kind => !KINDS.includes(kind))) {
      fail('INVALID_FRONTIERS', '접경전의 진영과 과제 유형을 확인하세요.');
    }
    const opponent = state.works.find(work => work.id === frontier.opponentWorkId);
    if (!opponent || !frontier.kinds.includes(opponent.kind)) fail('INVALID_OPPONENT', '과제에 맞는 상대 출품작이 필요합니다.');
    const round = newRound(frontier, 1);
    if (!stakesValid(state, frontier, round)) fail('INVALID_STAKES', '현재 맞닿은 두 진영의 칸을 선택하세요.');
    state.rounds[frontier.id] = round;
  }
  return state;
}

export function selectFrontier(state, id) {
  const frontier = frontierFor(state, id), round = getRound(state, id);
  const selected = { ...state, activeFrontierId: id };
  // Only an unsubmitted recruiting round may refresh its provisional stakes.
  // Submitted/finalized snapshots keep the exact land and version they recorded.
  if (round.phase !== 'recruiting' || round.submission) return selected;
  const reserved = reservedPlots(state, id);
  if (stakesValid(state, frontier, round) && !reserved.has(round.homeCell) && !reserved.has(round.targetCell)) return selected;
  const boundary = requireBoundary(state, frontier, round);
  return replaceRound(selected, { ...round, ...boundary }, id);
}

function candidates(state, frontier) {
  return state.works.filter(work => work.registered && team(work.faction) === 0 && frontier.kinds.includes(work.kind));
}
function appearances(state, author, frontierId) {
  return state.history.filter(entry => entry.frontierId === frontierId && entry.submission.author === author).length;
}

export function getEligibility(state, workId, id = state.activeFrontierId) {
  const frontier = frontierFor(state, id), round = getRound(state, id);
  const work = state.works.find(item => item.id === workId);
  if (!work?.registered) return { eligible: false, reason: '먼저 작품을 등록하세요.' };
  if (team(work.faction) !== 0) return { eligible: false, reason: 'Claude 진영에 등록한 작품으로 출전하세요.' };
  if (!frontier.kinds.includes(work.kind)) return { eligible: false, reason: '이 접경전의 과제 유형과 다른 작품입니다.' };
  const count = appearances(state, work.author, id);
  const minimum = Math.min(...candidates(state, frontier).map(item => appearances(state, item.author, id)));
  const detail = { appearances: count, minAppearances: minimum };
  if (round.phase !== 'recruiting') return { eligible: false, reason: '이번 경기의 출품은 마감됐습니다.', ...detail };
  if (count > minimum) return { eligible: false, reason: '이 전선에 출전한 횟수가 더 적은 제작자에게 먼저 기회가 돌아갑니다.', ...detail };
  return { eligible: true, reason: count === 0 ? '이 전선의 첫 출전을 기다리는 작품입니다.' : '이번 경기의 출전 대상입니다.', ...detail };
}

export function eligibleWorks(state, id = state.activeFrontierId) {
  const frontier = frontierFor(state, id);
  return candidates(state, frontier).filter(work => getEligibility(state, work.id, id).eligible);
}

export function registerLeagueWork(state, entry = {}) {
  if (!KINDS.includes(entry.kind)) fail('INVALID_KIND', '게임·음악·코드·일정 중 작품 유형을 선택하세요.');
  const frontier = frontierFor(state);
  const registered = registerWork({ ...state, homeCell: getRound(state).homeCell }, entry);
  const works = registered.works.map(work => work.id === registered.selectedWorkId
    ? { ...work, kind: entry.kind, ai: work.creationAI, changelog: [] } : work);
  return { ...state, works, selectedWorkId: registered.selectedWorkId };
}

export function reviseWork(state, workId, { changeNote, cover, description } = {}) {
  const work = state.works.find(item => item.id === workId);
  if (!work) fail('UNKNOWN_WORK', '작품을 찾을 수 없습니다.');
  if (team(work.faction) !== 0) fail('WRONG_FACTION', 'Claude 진영의 작품만 수정할 수 있습니다.');
  const note = typeof changeNote === 'string' ? changeNote.trim() : '';
  if (note.length < 5 || note.length > 500) fail('CHANGE_NOTE_REQUIRED', '무엇을 바꿨는지 5~500자로 남겨주세요.');
  if (cover !== undefined && (typeof cover !== 'string' || /^\s*(javascript|vbscript):/i.test(cover))) {
    fail('INVALID_COVER', '표지 이미지 형식이 올바르지 않습니다.');
  }
  if (description !== undefined && typeof description !== 'string') fail('INVALID_DESCRIPTION', '작품 설명 형식을 확인하세요.');
  const version = (Number.isInteger(work.version) ? work.version : 1) + 1;
  const revised = {
    ...work, version, changeNote: note,
    ...(cover !== undefined ? { cover } : {}),
    ...(description !== undefined ? { description: description.trim().slice(0, 300) } : {}),
    changelog: [...(work.changelog || []), { version, previousVersion: work.version || 1, changeNote: note, note }],
  };
  return { ...state, works: state.works.map(item => item.id === workId ? revised : item), selectedWorkId: workId };
}

export function enterFrontier(state, workId) {
  const frontier = frontierFor(state), round = getRound(state);
  if (round.phase !== 'recruiting') fail('ALREADY_ENTERED', '이번 경기에는 이미 작품을 제출했습니다.');
  if (!stakesValid(state, frontier, round)) fail('STALE_STAKES', '접경 소유가 바뀌었습니다. 현재 전선을 다시 확인하세요.');
  const eligibility = getEligibility(state, workId);
  if (!eligibility.eligible) fail('WORK_NOT_ELIGIBLE', eligibility.reason);
  for (const [id, other] of Object.entries(state.rounds)) {
    if (id !== state.activeFrontierId && other.submission && !other.applied
      && [round.homeCell, round.targetCell].some(cell => cell === other.homeCell || cell === other.targetCell)) {
      fail('STAKE_RESERVED', '이 칸은 다른 접경전에 이미 걸려 있습니다.');
    }
  }
  const submission = frozen(copy(state.works.find(work => work.id === workId)));
  const opponent = frozen(copy(state.works.find(work => work.id === frontier.opponentWorkId)));
  return replaceRound(state, {
    ...round, phase: 'submitted', submission, opponent,
    stakeOwners: { home: state.owners[round.homeCell], target: state.owners[round.targetCell] },
  });
}

export function recordFrontierTrial(state, side) {
  const round = getRound(state); requireInProgress(round);
  if (!['A', 'B'].includes(side)) fail('INVALID_SIDE', '작품 A 또는 B를 선택하세요.');
  if (round.ballot) fail('BALLOT_ALREADY_SUBMITTED', '이미 평가를 제출했습니다.');
  return replaceRound(state, { ...round, phase: 'evaluating', trialed: { ...round.trialed, [side]: true } });
}

export function submitFrontierBallot(state, choice, { note = '' } = {}) {
  const round = getRound(state); requireInProgress(round);
  if (round.ballot) fail('BALLOT_ALREADY_SUBMITTED', '이미 평가를 제출했습니다.');
  if (!round.trialed.A || !round.trialed.B) fail('TRIALS_REQUIRED', '양쪽 작품을 모두 체험하세요.');
  if (!['A', 'B', 'tie', 'neither'].includes(choice)) fail('INVALID_BALLOT', '평가 항목을 선택하세요.');
  if (typeof note !== 'string' || note.trim().length > 500) fail('INVALID_NOTE', '평가 메모는 500자 이내로 남겨주세요.');
  return replaceRound(state, {
    ...round, phase: 'ballot-submitted',
    ballot: { choice, note: note.trim(), role: 'independent-evaluator', fictional: true },
  });
}

export function finalizeFrontier(state, outcome) {
  const frontier = frontierFor(state), round = getRound(state);
  if (!Object.hasOwn(SCORES, outcome)) fail('INVALID_OUTCOME', '유효한 가상 결과를 선택하세요.');
  if (round.applied) return state;
  requireInProgress(round);
  if (!round.ballot) fail('BALLOT_REQUIRED', '평가 접수 후 확정 결과를 확인하세요.');
  if (!stakesValid(state, frontier, round)) fail('STALE_STAKES', '접경 소유가 바뀌어 결과를 적용할 수 없습니다.');
  const owners = [...state.owners];
  const changedCell = outcome === 'claude' ? round.targetCell : outcome === 'opponent' ? round.homeCell : null;
  if (changedCell !== null) owners[changedCell] = outcome === 'claude' ? round.stakeOwners.home : round.stakeOwners.target;
  const feedback = round.ballot.note
    ? `가상 경기 평가 메모: ${round.ballot.note}`
    : outcome === 'opponent'
      ? '예시 피드백: 첫 화면에서 핵심 동작까지의 단계를 줄이는 개선을 검토해보세요. 실제 작품을 검증한 평가는 아닙니다.'
      : outcome === 'claude'
        ? '예시 피드백: 공통 과제의 핵심 동작을 더 명확히 드러내는 방향을 다음 버전에서도 확인해보세요. 실제 작품을 검증한 평가는 아닙니다.'
        : '예시 피드백: 이번 집계로는 승자를 확정하지 않습니다. 실제 평가 이유를 모으는 다음 기회가 필요합니다.';
  const result = frozen({
    outcome, ...SCORES[outcome], quorum: 12, changedCell,
    territoryChanged: changedCell !== null, feedback, fictional: true, rightsTransferred: false,
  });
  const finalized = { ...round, phase: 'finalized', applied: true, result };
  const record = frozen(copy({
    frontierId: frontier.id, roundId: round.id, number: round.number,
    homeCell: round.homeCell, targetCell: round.targetCell,
    submission: round.submission, opponent: round.opponent, ballot: round.ballot,
    result, feedback, fictional: true,
  }));
  return { ...replaceRound(state, finalized), owners, history: [...state.history, record] };
}

function reservedPlots(state, exceptId) {
  const reserved = new Set();
  for (const [id, round] of Object.entries(state.rounds)) {
    if (id !== exceptId && round.submission && !round.applied) {
      reserved.add(round.homeCell); reserved.add(round.targetCell);
    }
  }
  return reserved;
}

/** BFS from the former stake pair; never fabricate an island or grant new land. */
function nearestBoundary(state, frontier, oldRound) {
  const queue = [...new Set([oldRound.homeCell, oldRound.targetCell])], visited = new Set(queue);
  const reserved = reservedPlots(state, frontier.id);
  let hasBoundary = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor], owner = team(state.owners[id]);
    for (const neighbor of state.neighbors[id]) {
      const other = team(state.owners[neighbor]), opponent = team(frontier.opponentTeam);
      const boundary = owner === 0 && other === opponent ? { homeCell: id, targetCell: neighbor }
        : owner === opponent && other === 0 ? { homeCell: neighbor, targetCell: id } : null;
      if (boundary) {
        hasBoundary = true;
        if (!reserved.has(boundary.homeCell) && !reserved.has(boundary.targetCell)) return { boundary, hasBoundary };
      }
    }
    for (const neighbor of state.neighbors[id]) if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
  }
  return { boundary: null, hasBoundary };
}

function requireBoundary(state, frontier, oldRound) {
  const { boundary, hasBoundary } = nearestBoundary(state, frontier, oldRound);
  if (boundary) return boundary;
  if (hasBoundary) fail('NO_AVAILABLE_STAKES', '현재 접경의 칸이 다른 경기에 걸려 있습니다. 해당 경기 확정 후 다시 확인하세요.');
  fail('NO_FRONTIER', '현재 두 진영이 맞닿은 경계가 없습니다. 새 땅은 부여하지 않습니다.');
}

export function openNextRound(state) {
  const frontier = frontierFor(state), round = getRound(state);
  if (!round.applied || round.phase !== 'finalized') fail('ROUND_NOT_FINISHED', '현재 경기 결과를 먼저 확정하세요.');
  const boundary = requireBoundary(state, frontier, round);
  return replaceRound(state, newRound(frontier, round.number + 1, boundary.homeCell, boundary.targetCell));
}
