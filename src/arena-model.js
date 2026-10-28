/** Local prototype rules. Ballots, identities and results are fictional, not verified. */
export class ArenaRuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ArenaRuleError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new ArenaRuleError(code, message); };
const clone = value => structuredClone(value);
const isClaude = value => value === 0 || value === 'Claude' || value === 'claude';
const isOpenAI = value => value === 1 || value === 'OpenAI' || value === 'openai';
const outcomes = {
  claude: { claude: 8, openai: 4, valid: 12 },
  openai: { claude: 4, openai: 8, valid: 12 },
  tie: { claude: 6, openai: 6, valid: 12 },
  insufficient: { claude: 4, openai: 3, valid: 7 },
};

function validCell(cell, owners) {
  return Number.isInteger(cell) && cell >= 0 && cell < owners.length;
}

function requireOpen(state) {
  if (state.match.applied) fail('MATCH_FINALIZED', '이미 확정된 경기입니다.');
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

/** neighbors may be a list of home-cell neighbor IDs or a full adjacency list. */
export function createArenaState({ owners, homeCell, targetCell, works = [], neighbors } = {}) {
  if (!Array.isArray(owners) || !owners.length) fail('INVALID_OWNERS', '영토 정보가 필요합니다.');
  if (!validCell(homeCell, owners) || !validCell(targetCell, owners) || homeCell === targetCell) {
    fail('INVALID_STAKES', '서로 다른 두 접경 칸이 필요합니다.');
  }
  if (!isClaude(owners[homeCell]) || !isOpenAI(owners[targetCell])) {
    fail('INVALID_FACTIONS', 'Claude와 OpenAI의 접경 칸을 선택하세요.');
  }
  if (neighbors !== undefined) {
    const adjacent = Array.isArray(neighbors[homeCell]) ? neighbors[homeCell] : neighbors;
    if (!Array.isArray(adjacent) || !adjacent.includes(targetCell)) {
      fail('NON_ADJACENT_STAKES', '맞닿은 접경 칸만 걸 수 있습니다.');
    }
  }
  if (!Array.isArray(works)) fail('INVALID_WORKS', '작품 목록 형식이 올바르지 않습니다.');
  const ids = works.map(work => work.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    fail('INVALID_WORK_IDS', '작품마다 고유한 ID가 필요합니다.');
  }
  return {
    owners: [...owners],
    initialOwners: [...owners],
    homeCell,
    targetCell,
    adjacencyVerified: neighbors !== undefined,
    works: works.map(work => ({ registered: true, version: 1, ...clone(work) })),
    selectedWorkId: ids[0] ?? null,
    match: {
      id: 'frontier-12',
      status: 'open',
      role: 'creator',
      evaluatorRole: 'independent-evaluator',
      fictional: true,
      submission: null,
      trialed: { A: false, B: false },
      ballot: null,
      result: null,
      applied: false,
    },
  };
}

export function registerWork(state, entry = {}) {
  const title = typeof entry.title === 'string' ? entry.title.trim() : '';
  if (!title || title.length > 80) fail('INVALID_TITLE', '작품 이름은 1~80자로 입력하세요.');
  if (!(entry.copyrightConfirmed === true || entry.rights === true)) {
    fail('RIGHTS_REQUIRED', '작품과 표지를 게시할 권한을 확인하세요.');
  }
  const creationAI = entry.creationAI ?? entry.ai;
  if (typeof creationAI !== 'string' || !creationAI.trim() || creationAI.length > 80) {
    fail('INVALID_AI', '사용한 AI를 직접 신고하세요.');
  }
  const cover = entry.cover ?? '';
  if (typeof cover !== 'string' || /^\s*(javascript|vbscript):/i.test(cover)) {
    fail('INVALID_COVER', '표지 이미지 형식이 올바르지 않습니다.');
  }
  const occupied = new Set(state.works.map(work => work.cellId));
  const cellId = state.owners.findIndex((owner, id) => isClaude(owner) && !occupied.has(id));
  if (cellId < 0) fail('NO_VACANT_PLOT', 'Claude 영역에 비어 있는 작품 자리가 없습니다.');
  let suffix = state.works.length + 1;
  while (state.works.some(work => work.id === `work-${suffix}`)) suffix++;
  const work = {
    id: `work-${suffix}`,
    title,
    description: typeof entry.description === 'string' ? entry.description.trim().slice(0, 300) : '',
    author: typeof entry.author === 'string' && entry.author.trim() ? entry.author.trim().slice(0, 80) : 'you',
    creationAI: creationAI.trim(),
    faction: 'Claude',
    provenance: 'self-reported',
    copyrightConfirmed: true,
    registered: true,
    version: 1,
    cover,
    cellId,
  };
  return { ...state, works: [...state.works, work], selectedWorkId: work.id };
}

export function enterMatch(state, workId) {
  requireOpen(state);
  if (state.match.submission) fail('ALREADY_ENTERED', '이 경기에는 이미 작품을 제출했습니다.');
  const work = state.works.find(item => item.id === workId);
  if (!work?.registered) fail('WORK_NOT_REGISTERED', '등록한 작품을 선택하세요.');
  if (work.faction && !isClaude(work.faction)) fail('WRONG_FACTION', 'Claude 진영의 작품으로 출전하세요.');
  const submission = freezeDeep(clone(work));
  return {
    ...state,
    selectedWorkId: workId,
    match: { ...state.match, status: 'entered', submission },
  };
}

export function recordTrial(state, side) {
  requireOpen(state);
  if (!state.match.submission) fail('NOT_ENTERED', '출품작이 아직 정해지지 않았습니다.');
  if (side !== 'A' && side !== 'B') fail('INVALID_SIDE', '작품 A 또는 B를 선택하세요.');
  return {
    ...state,
    match: {
      ...state.match,
      role: 'independent-evaluator',
      status: state.match.ballot ? 'ballot-submitted' : 'evaluating',
      trialed: { ...state.match.trialed, [side]: true },
    },
  };
}

export function submitBallot(state, choice) {
  requireOpen(state);
  if (!state.match.submission) fail('NOT_ENTERED', '출품작이 아직 정해지지 않았습니다.');
  if (!state.match.trialed.A || !state.match.trialed.B) fail('TRIALS_REQUIRED', '양쪽 작품을 모두 체험하세요.');
  if (!['A', 'B', 'tie', 'neither'].includes(choice)) fail('INVALID_BALLOT', '평가 항목을 선택하세요.');
  if (state.match.ballot) fail('BALLOT_ALREADY_SUBMITTED', '이 평가자는 이미 평가를 제출했습니다.');
  return {
    ...state,
    match: {
      ...state.match,
      role: 'independent-evaluator',
      status: 'ballot-submitted',
      ballot: { choice, role: 'independent-evaluator', fictional: true },
    },
  };
}

export function finalizeMatch(state, outcome) {
  if (!Object.hasOwn(outcomes, outcome)) fail('INVALID_OUTCOME', '유효한 결과 사례를 선택하세요.');
  // A final match cannot be applied twice or switched to another winner.
  if (state.match.applied) return state;
  if (!state.match.submission) fail('NOT_ENTERED', '출품작이 아직 정해지지 않았습니다.');
  if (!state.match.ballot) fail('BALLOT_REQUIRED', '평가 접수 후 확정 결과를 확인하세요.');
  const nextOwners = [...state.owners];
  let changedCell = null;
  if (outcome === 'claude') {
    changedCell = state.targetCell;
    nextOwners[changedCell] = state.initialOwners[state.homeCell];
  } else if (outcome === 'openai') {
    changedCell = state.homeCell;
    nextOwners[changedCell] = state.initialOwners[state.targetCell];
  }
  return {
    ...state,
    owners: nextOwners,
    match: {
      ...state.match,
      status: 'finalized',
      role: 'spectator',
      applied: true,
      result: {
        outcome,
        ...outcomes[outcome],
        quorum: 12,
        changedCell,
        territoryChanged: changedCell !== null,
        fictional: true,
        rightsTransferred: false,
      },
    },
  };
}
