/** Browser-local practice rules. Identities and AI declarations are not verified. */
export const COMPETITION_TEAMS = ['Claude', 'OpenAI', 'Gemini', 'Grok', 'DeepSeek', 'Local'];
export const DEFAULT_COMPETITION_CHECKS = ['controls', 'restart', 'feedback'];
export const MAX_ARTIFACT_BYTES = 256 * 1024;
const KINDS = ['game', 'music', 'code', 'schedule'];
const STATUS = new Set(['pass', 'fail', 'unknown']);
const copy = value => structuredClone(value);
const own = (value, key) => Object.hasOwn(value, key);
export class CompetitionRuleError extends Error {
  constructor(code, message) { super(message); this.name = 'CompetitionRuleError'; this.code = code; }
}
const fail = (code, message) => { throw new CompetitionRuleError(code, message); };
const team = value => Number.isInteger(value) && value >= 0 && value < COMPETITION_TEAMS.length ? value
  : COMPETITION_TEAMS.findIndex(name => name.toLowerCase() === String(value).toLowerCase());
const validCell = (id, owners) => Number.isInteger(id) && id >= 0 && id < owners.length;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,79}$/.test(value)
  && !['constructor', 'prototype', '__proto__'].includes(value);
const validText = (value, max, min = 1) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
const validCover = value => typeof value === 'string' && (/^\/assets\/[a-z0-9-]+\.(png|webp|jpg|jpeg)$/i.test(value)
  || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value));
function frozen(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}

// SHA-256 over UTF-8, available synchronously in browsers and Node without a network or API.
const SHA_K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const rotate = (word, count) => (word >>> count) | (word << (32 - count));
export function hashArtifactSource(source) {
  if (typeof source !== 'string') fail('INVALID_ARTIFACT', 'HTML 소스가 필요합니다.');
  const input = new TextEncoder().encode(source), size = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(size); bytes.set(input); bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer); view.setUint32(size - 8, Math.floor(input.length * 8 / 0x100000000)); view.setUint32(size - 4, input.length * 8);
  const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], words = new Uint32Array(64);
  for (let offset = 0; offset < size; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15], y = words[i - 2];
      words[i] = (words[i - 16] + (rotate(x,7)^rotate(x,18)^(x>>>3)) + words[i - 7] + (rotate(y,17)^rotate(y,19)^(y>>>10))) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let i = 0; i < 64; i++) {
      const one = (h + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + ((e&f)^(~e&g)) + SHA_K[i] + words[i]) >>> 0;
      const two = ((rotate(a,2)^rotate(a,13)^rotate(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0;
      h=g;g=f;f=e;e=(d+one)>>>0;d=c;c=b;b=a;a=(one+two)>>>0;
    }
    for (const [i,value] of [a,b,c,d,e,f,g,h].entries()) hash[i]=(hash[i]+value)>>>0;
  }
  return hash.map(word => word.toString(16).padStart(8,'0')).join('');
}

export function validateCreationArtifact(artifact) {
  if (!artifact || artifact.format !== 'html' || !['platform-reference','user-upload'].includes(artifact.sourceKind)
    || typeof artifact.source !== 'string' || !artifact.source.trim()) fail('ARTIFACT_REQUIRED', '실행할 HTML 소스를 첨부하세요.');
  if (new TextEncoder().encode(artifact.source).length > MAX_ARTIFACT_BYTES) fail('ARTIFACT_TOO_LARGE', 'HTML 소스는 최대 256KiB입니다.');
  if (typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(artifact.sha256)
    || hashArtifactSource(artifact.source) !== artifact.sha256.toLowerCase()) fail('ARTIFACT_HASH_MISMATCH', 'HTML 소스와 SHA-256 기록이 일치하지 않습니다.');
  return {source: artifact.source, sha256: artifact.sha256.toLowerCase(), format: 'html', sourceKind: artifact.sourceKind};
}

function normalizeWork(work, owners, {requiredArtifact = false} = {}) {
  if (!work || !validId(work.id) || !validText(work.title, 80) || !validText(work.author, 80)
    || !validId(work.creatorId || work.author) || !validCell(work.cellId, owners) || owners[work.cellId] === -1
    || !KINDS.includes(work.kind) || team(work.faction) < 0 || !validCover(work.cover)
    || !Number.isInteger(work.version ?? 1) || (work.version ?? 1) < 1) fail('INVALID_WORK', '작품 정보와 전시 자리를 확인하세요.');
  const creationAI = work.creationAI ?? work.ai ?? '신고하지 않음';
  if (!validText(creationAI, 80) || (work.ai !== undefined && !validText(work.ai,80))
    || (work.description !== undefined && (typeof work.description !== 'string'||work.description.length>300))) fail('INVALID_WORK', '제작 신고와 소개 형식을 확인하세요.');
  for(const [field,max]of Object.entries({agent:80,modelVersion:120,humanContribution:1000,conditions:1000})) {
    if(work[field]!==undefined&&(typeof work[field]!=='string'||work[field].length>max))fail('INVALID_WORK','제작 환경 정보의 형식과 길이를 확인하세요.');
  }
  if(work.changelog!==undefined&&(!Array.isArray(work.changelog)||work.changelog.some(change=>!change
    ||!Number.isInteger(change.version)||change.version<2||!Number.isInteger(change.previousVersion)||change.previousVersion<1
    ||!validText(change.changeNote,500,5))))fail('INVALID_WORK','개선 버전의 기록을 확인하세요.');
  return {...copy(work), title: work.title.trim(), author: work.author.trim(), creatorId: work.creatorId || work.author,
    faction: COMPETITION_TEAMS[team(work.faction)], creationAI, ai: work.ai || creationAI, registered: true,
    version: work.version ?? 1, changelog: Array.isArray(work.changelog) ? copy(work.changelog) : [],
    artifact: work.artifact ? validateCreationArtifact(work.artifact) : requiredArtifact ? validateCreationArtifact(null) : null};
}

function normalizeFrontier(frontier) {
  if (!frontier || !validId(frontier.id) || !validText(frontier.title, 100) || !validText(frontier.brief || frontier.title, 500)
    || team(frontier.homeTeam ?? 0) < 0 || team(frontier.opponentTeam) < 0 || team(frontier.homeTeam ?? 0) === team(frontier.opponentTeam)
    || !Array.isArray(frontier.kinds) || !frontier.kinds.length || frontier.kinds.some(kind => !KINDS.includes(kind))) fail('INVALID_FRONTIER', '과제의 두 진영과 작품 유형을 확인하세요.');
  const checkKeys = frontier.checkKeys || DEFAULT_COMPETITION_CHECKS;
  if(frontier.quorum!==undefined&&(!Number.isInteger(frontier.quorum)||frontier.quorum<1||frontier.quorum>1000))fail('INVALID_QUORUM','평가 수 기준은 1~1000 사이여야 합니다.');
  if (!Array.isArray(checkKeys) || !checkKeys.length || checkKeys.length > 12 || checkKeys.some(key => !validId(key))
    || new Set(checkKeys).size !== checkKeys.length) fail('INVALID_CHECKS', '필수 기능 평가 항목을 확인하세요.');
  const criteria=frontier.criteria===undefined?checkKeys.map((key,index)=>({controls:'핵심 조작을 이해하고 실행할 수 있는가',restart:'실패 후 다시 시작할 수 있는가',feedback:'입력 결과를 분명히 확인할 수 있는가'}[key]||`필수 기능 ${index+1} 확인`)):frontier.criteria;
  if(!Array.isArray(criteria)||!criteria.length||criteria.length>12||criteria.some(value=>!validText(value,300)))fail('INVALID_CRITERIA','평가 기준은 1~300자의 문장 1~12개로 입력하세요.');
  return {...copy(frontier), homeTeam: team(frontier.homeTeam ?? 0), opponentTeam: team(frontier.opponentTeam), checkKeys: [...checkKeys],criteria:criteria.map(value=>value.trim())};
}
function frontierFor(state, id = state.activeFrontierId) {
  const frontier = state.frontiers.find(item => item.id === id);
  if (!frontier) fail('UNKNOWN_FRONTIER', '접경전을 찾을 수 없습니다.');
  return frontier;
}
export function getCompetitionRound(state, id = state.activeFrontierId) {
  frontierFor(state, id); return state.rounds[id];
}
const sideTeam = (frontier, side) => side === 'A' ? frontier.homeTeam : frontier.opponentTeam;
function checkSide(side) { if (!['A','B'].includes(side)) fail('INVALID_SIDE', '작품 A 또는 B를 선택하세요.'); }
function validStakes(state, frontier, round) {
  return validCell(round.homeCell,state.owners) && validCell(round.targetCell,state.owners)
    && state.owners[round.homeCell] === frontier.homeTeam && state.owners[round.targetCell] === frontier.opponentTeam
    && state.neighbors[round.homeCell].includes(round.targetCell) && state.neighbors[round.targetCell].includes(round.homeCell);
}
function newRound(frontier, number, homeCell = frontier.homeCell, targetCell = frontier.targetCell) {
  return {id: `${frontier.id}-${number}`, number, homeCell, targetCell, phase: 'recruiting',
    submissions: {A:null,B:null}, submission:null, opponent:null, trials:{}, ballots:[], applied:false, result:null};
}
function replaceRound(state, round) { return {...state, rounds: {...state.rounds, [state.activeFrontierId]: round}}; }
function reservedPlots(state, exceptId) {
  const reserved = new Set();
  for (const [id, round] of Object.entries(state.rounds)) if (id !== exceptId && !round.applied && (round.submissions.A || round.submissions.B)) {
    reserved.add(round.homeCell); reserved.add(round.targetCell);
  }
  return reserved;
}
function nearestBoundary(state, frontier, start) {
  const queue = start.filter(id => validCell(id,state.owners)), visited = new Set(queue), reserved = reservedPlots(state,frontier.id);
  let found = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor];
    for (const neighbor of state.neighbors[id]) {
      const pair = state.owners[id] === frontier.homeTeam && state.owners[neighbor] === frontier.opponentTeam ? [id,neighbor]
        : state.owners[id] === frontier.opponentTeam && state.owners[neighbor] === frontier.homeTeam ? [neighbor,id] : null;
      if (pair) { found = true; if (!pair.some(value => reserved.has(value))) return {homeCell:pair[0],targetCell:pair[1]}; }
      if (!visited.has(neighbor)) {visited.add(neighbor);queue.push(neighbor);}
    }
  }
  fail(found ? 'NO_AVAILABLE_STAKES' : 'NO_FRONTIER', found ? '다른 경기에 걸린 접경입니다. 경기 종료 후 다시 확인하세요.' : '현재 두 진영이 맞닿은 경계가 없습니다. 새 땅은 지급하지 않습니다.');
}
export function createCompetition({owners,neighbors,works = [],frontiers = [],quorum = 1,practice = true} = {}) {
  if (!Array.isArray(owners) || !owners.length || owners.some(owner => !Number.isInteger(owner) || owner < -1 || owner >= COMPETITION_TEAMS.length)) fail('INVALID_OWNERS', '유효한 영토 정보가 필요합니다.');
  if (!Array.isArray(neighbors) || neighbors.length !== owners.length || neighbors.some((ids,id) => !Array.isArray(ids)
    || ids.some(other => !validCell(other,owners) || other === id || !neighbors[other]?.includes(id)))) fail('INVALID_NEIGHBORS', '대칭인 인접 정보가 필요합니다.');
  if (!Number.isInteger(quorum) || quorum < 1 || quorum > 1000) fail('INVALID_QUORUM', '평가 수 기준은 1~1000 사이여야 합니다.');
  if (!Array.isArray(works) || !Array.isArray(frontiers) || !frontiers.length) fail('INVALID_WORLD', '작품과 과제 목록이 필요합니다.');
  const normalized = works.map(work => normalizeWork(work,owners));
  const definitions = frontiers.map(normalizeFrontier);
  if (new Set(normalized.map(work => work.id)).size !== normalized.length || new Set(normalized.map(work => work.cellId)).size !== normalized.length
    || new Set(definitions.map(item => item.id)).size !== definitions.length) fail('DUPLICATE_ID', '작품 ID와 전시 자리, 과제 ID는 겹치지 않아야 합니다.');
  const state = {owners:[...owners],initialOwners:[...owners],neighbors:neighbors.map(ids => [...new Set(ids)]), works:normalized,
    frontiers:definitions,rounds:{},history:[],activeFrontierId:definitions[0].id,quorum,practice:Boolean(practice)};
  for (const frontier of definitions) {
    const round = newRound(frontier,1);
    if (!validStakes(state,frontier,round)) fail('INVALID_STAKES', '현재 맞닿은 두 진영의 칸을 선택하세요.');
    state.rounds[frontier.id] = round;
  }
  return state;
}
export function selectCompetition(state,id) {
  const frontier = frontierFor(state,id), round = getCompetitionRound(state,id), selected = {...state,activeFrontierId:id};
  if (round.applied || round.submissions.A || round.submissions.B) return selected;
  const reserved = reservedPlots(state,id);
  if (validStakes(state,frontier,round) && !reserved.has(round.homeCell) && !reserved.has(round.targetCell)) return selected;
  return replaceRound(selected,{...round,...nearestBoundary(state,frontier,[round.homeCell,round.targetCell])});
}
function candidates(state,frontier,side) { return state.works.filter(work => work.registered && team(work.faction) === sideTeam(frontier,side) && frontier.kinds.includes(work.kind) && work.artifact); }
function appearances(state,creatorId,frontierId) {
  return state.history.filter(record => record.frontierId === frontierId
    && [record.submission,record.opponent].some(work => work?.creatorId === creatorId)).length;
}
export function getCreationEligibility(state,workId,side,actorId) {
  checkSide(side);const frontier=frontierFor(state),round=getCompetitionRound(state),work=state.works.find(item=>item.id===workId);
  if (!work) return {eligible:false,reason:'작품을 먼저 등록하세요.'};
  if (actorId !== undefined && actorId !== work.creatorId) return {eligible:false,reason:'이 작품 제작자의 로컬 역할로만 출전할 수 있습니다.'};
  if (team(work.faction) !== sideTeam(frontier,side)) return {eligible:false,reason:'해당 진영에 등록된 작품을 선택하세요.'};
  if (!frontier.kinds.includes(work.kind)) return {eligible:false,reason:'과제에 맞는 작품 유형이 아닙니다.'};
  if (!work.artifact) return {eligible:false,reason:'실행할 HTML 소스를 먼저 등록하세요.'};
  const count=appearances(state,work.creatorId,frontier.id),minimum=Math.min(...candidates(state,frontier,side).map(item=>appearances(state,item.creatorId,frontier.id)));
  const detail={appearances:count,minAppearances:minimum};
  if (round.applied || round.submissions[side]) return {eligible:false,reason:'이쪽 작품은 이미 제출됐습니다.',...detail};
  if (count>minimum) return {eligible:false,reason:'완료 출전이 더 적은 제작자의 차례입니다.',...detail};
  return {eligible:true,reason:count?'이번 차례 출전 가능':'첫 출전 가능',...detail};
}
export function eligibleCompetitionWorks(state,side,actorId) { checkSide(side);return candidates(state,frontierFor(state),side).filter(work=>getCreationEligibility(state,work.id,side,actorId).eligible); }

export function registerCreation(state,entry,actorId) {
  if (!validId(actorId)) fail('ACTOR_REQUIRED','현재 제작자 역할이 필요합니다.');
  if (!(entry?.rights===true || entry?.copyrightConfirmed===true)) fail('RIGHTS_REQUIRED','작품과 소스를 게시할 권한을 확인하세요.');
  const owner=team(entry.faction);
  if (owner<0) fail('INVALID_FACTION','전시할 진영을 선택하세요.');
  const occupied=new Set(state.works.map(work=>work.cellId));
  const cellId=state.owners.findIndex((value,id)=>value===owner&&!occupied.has(id));
  if (cellId<0) fail('NO_VACANT_PLOT','선택한 진영에 비어 있는 작품 자리가 없습니다.');
  let number=state.works.length+1;while(state.works.some(work=>work.id===`creation-${number}`))number++;
  const artifact=validateCreationArtifact(entry.artifact);
  if (artifact.sourceKind==='platform-reference' && actorId!=='platform-reference') fail('INVALID_ARTIFACT_KIND','사용자 업로드를 플랫폼 예시로 표시할 수 없습니다.');
  const work=normalizeWork({...entry,id:`creation-${number}`,cellId,creatorId:actorId,author:entry.author||actorId,
    version:1,registered:true,copyrightConfirmed:true,changelog:[],artifact},state.owners,{requiredArtifact:true});
  return {...state,works:[...state.works,work],selectedWorkId:work.id};
}
export function reviseCreation(state,workId,changes,actorId) {
  const work=state.works.find(item=>item.id===workId);
  if (!work) fail('UNKNOWN_WORK','작품을 찾을 수 없습니다.');
  if (actorId!==work.creatorId) fail('NOT_CREATOR','제작자 역할에서만 작품을 수정할 수 있습니다.');
  if (!validText(changes?.changeNote,500,5)) fail('CHANGE_NOTE_REQUIRED','바꾼 내용을 5~500자로 남겨주세요.');
  if (changes.artifact && !(changes.rights===true || changes.copyrightConfirmed===true)) fail('RIGHTS_REQUIRED','새 소스를 게시할 권한을 확인하세요.');
  const artifact=changes.artifact?validateCreationArtifact(changes.artifact):work.artifact;
  if (artifact?.sourceKind==='platform-reference'&&actorId!=='platform-reference') fail('INVALID_ARTIFACT_KIND','사용자 업로드를 플랫폼 예시로 표시할 수 없습니다.');
  const version=work.version+1;
  const editable={};
  for(const field of ['title','description','cover','agent','modelVersion','humanContribution','conditions','creationAI']) {
    if(own(changes,field))editable[field]=changes[field];
  }
  if(own(changes,'creationAI'))editable.ai=changes.creationAI;
  const revised=normalizeWork({...work,...editable,version,artifact,changeNote:changes.changeNote.trim(),
    changelog:[...work.changelog,{version,previousVersion:work.version,changeNote:changes.changeNote.trim()}]},state.owners,{requiredArtifact:true});
  return {...state,works:state.works.map(item=>item.id===workId?revised:item),selectedWorkId:workId};
}
export function submitCreation(state,side,workId,actorId) {
  checkSide(side);const frontier=frontierFor(state),round=getCompetitionRound(state);
  const eligibility=getCreationEligibility(state,workId,side,actorId);
  if (!validId(actorId)||!eligibility.eligible) fail('WORK_NOT_ELIGIBLE',eligibility.reason||'제작자 역할을 확인하세요.');
  if (!validStakes(state,frontier,round)) fail('STALE_STAKES','영토가 바뀌었습니다. 현재 접경을 다시 선택하세요.');
  const reserved=reservedPlots(state,frontier.id);
  if (reserved.has(round.homeCell)||reserved.has(round.targetCell)) fail('STAKE_RESERVED','다른 경기에 이미 걸린 칸입니다.');
  const work=state.works.find(item=>item.id===workId);validateCreationArtifact(work.artifact);
  const submissions={...round.submissions,[side]:frozen(copy(work))};
  return replaceRound(state,{...round,submissions,submission:submissions.A,opponent:submissions.B,
    phase:submissions.A&&submissions.B?'submitted':'recruiting'});
}
function requirePair(round) { if (!round.submissions.A||!round.submissions.B) fail('SUBMISSIONS_REQUIRED','양쪽 작품의 제출을 먼저 완료하세요.'); }
function requireEvaluator(round,id) {
  if (!validId(id)) fail('EVALUATOR_REQUIRED','평가자 역할이 필요합니다.');
  if (['A','B'].some(side=>[round.submissions[side].creatorId,round.submissions[side].author].includes(id))) fail('SELF_EVALUATION','자기 작품은 평가할 수 없습니다.');
}
export function recordCompetitionTrial(state,side,evaluatorId) {
  checkSide(side);const round=getCompetitionRound(state);requirePair(round);requireEvaluator(round,evaluatorId);
  if (round.applied) fail('ROUND_FINALIZED','이미 확정된 경기입니다.');
  if (round.ballots.some(ballot=>ballot.evaluatorId===evaluatorId)) fail('DUPLICATE_BALLOT','이미 평가를 제출했습니다.');
  const previous=own(round.trials,evaluatorId)?round.trials[evaluatorId]:{A:false,B:false};
  return replaceRound(state,{...round,phase:'evaluating',trials:{...round.trials,[evaluatorId]:{...previous,[side]:true}}});
}
export function castCompetitionBallot(state,{evaluatorId,choice,checks,note=''}={}) {
  const round=getCompetitionRound(state),frontier=frontierFor(state);requirePair(round);requireEvaluator(round,evaluatorId);
  if (round.applied) fail('ROUND_FINALIZED','이미 확정된 경기입니다.');
  if (round.ballots.some(ballot=>ballot.evaluatorId===evaluatorId)) fail('DUPLICATE_BALLOT','한 평가자는 한 번만 평가할 수 있습니다.');
  const trials=own(round.trials,evaluatorId)?round.trials[evaluatorId]:null;
  if (!trials?.A||!trials?.B) fail('TRIALS_REQUIRED','같은 평가자 역할로 양쪽 작품을 모두 체험하세요.');
  if (!['A','B','tie','neither'].includes(choice)) fail('INVALID_CHOICE','선호 평가를 선택하세요.');
  if (typeof note!=='string'||note.trim().length>500) fail('INVALID_NOTE','의견은 500자 이내로 남겨주세요.');
  const normalized={A:{},B:{}};
  for(const side of ['A','B'])for(const key of frontier.checkKeys){
    if (!checks?.[side]||!own(checks[side],key)||!STATUS.has(checks[side][key])) fail('CHECKS_REQUIRED','양쪽 작품의 모든 필수 기능을 확인하세요.');
    normalized[side][key]=checks[side][key];
  }
  const ballot=frozen({evaluatorId,choice,checks:normalized,note:note.trim(),practice:state.practice});
  return replaceRound(state,{...round,phase:'evaluating',ballots:[...round.ballots,ballot]});
}
function functionalStatus(ballots,side,keys) {
  const statuses=keys.map(key=>{
    const values=ballots.map(ballot=>ballot.checks[side][key]);
    return values.every(value=>value==='pass')?'pass':values.every(value=>value==='fail')?'fail':'review';
  });
  if(statuses.includes('review'))return 'review';
  return statuses.includes('fail')?'fail':'pass';
}
export function deriveCompetitionResult(state,frontier,round) {
  const counts={A:0,B:0,tie:0,neither:0};for(const ballot of round.ballots)counts[ballot.choice]++;
  const valid=round.ballots.length,quorum=frontier.quorum??state.quorum;
  let outcome,reason;
  if(valid<quorum){outcome='insufficient';reason='설정된 연습 평가 수에 도달하지 않았습니다.';}
  else{
    const A=functionalStatus(round.ballots,'A',frontier.checkKeys),B=functionalStatus(round.ballots,'B',frontier.checkKeys);
    if(A==='review'||B==='review'){outcome='review';reason='필수 기능에 미확인 또는 상반된 평가가 있어 승리를 보류합니다.';}
    else if(A==='fail'&&B==='fail'){outcome='neither';reason='양쪽 작품 모두 필수 기능을 충족하지 못했습니다.';}
    else if(A==='pass'&&B==='fail'){outcome='A';reason='A만 모든 필수 기능을 충족했습니다.';}
    else if(B==='pass'&&A==='fail'){outcome='B';reason='B만 모든 필수 기능을 충족했습니다.';}
    else if(counts.neither>valid/2){outcome='neither';reason='전체 유효 평가의 과반이 두 작품 모두 부적합하다고 판단했습니다.';}
    else if(counts.A>valid/2||counts.B>valid/2){outcome=counts.A>valid/2?'A':'B';reason=`필수 기능을 충족한 두 작품 중 ${outcome}가 전체 유효 평가의 과반을 얻었습니다.`;}
    else{outcome='tie';reason='필수 기능은 충족했지만 어느 쪽도 전체 유효 평가의 과반을 얻지 못했습니다.';}
  }
  const winnerTeam=outcome==='A'?frontier.homeTeam:outcome==='B'?frontier.opponentTeam:null;
  const changedCell=outcome==='A'?round.targetCell:outcome==='B'?round.homeCell:null;
  const notes=round.ballots.map(ballot=>ballot.note).filter(Boolean);
  return {outcome,counts,valid,quorum,winnerTeam,changedCell,previousOwner:changedCell===null?null:state.owners[changedCell],
    territoryChanged:changedCell!==null,reason,feedback:notes.length?notes.join('\n'):reason,practice:state.practice,rightsTransferred:false};
}
export function finalizeCompetition(state) {
  const frontier=frontierFor(state),round=getCompetitionRound(state);
  if(round.applied)return state;
  requirePair(round);
  if(!validStakes(state,frontier,round))fail('STALE_STAKES','현재 접경 소유가 달라 결과를 적용할 수 없습니다.');
  const result=frozen(deriveCompetitionResult(state,frontier,round)),owners=[...state.owners];
  if(result.changedCell!==null)owners[result.changedCell]=result.winnerTeam;
  const final={...round,applied:true,phase:'finalized',result};
  const history=frozen(copy({frontierId:frontier.id,roundId:round.id,number:round.number,homeCell:round.homeCell,targetCell:round.targetCell,
    homeTeam:frontier.homeTeam,opponentTeam:frontier.opponentTeam,submission:round.submissions.A,opponent:round.submissions.B,
    submissions:round.submissions,ballots:round.ballots,trials:round.trials,result,feedback:result.feedback,practice:state.practice}));
  return {...replaceRound(state,final),owners,history:[...state.history,history]};
}
export function openCompetitionRematch(state) {
  const frontier=frontierFor(state),round=getCompetitionRound(state);
  if(!round.applied)fail('ROUND_NOT_FINISHED','현재 결과를 먼저 확정하세요.');
  const edge=nearestBoundary(state,frontier,[round.homeCell,round.targetCell]);
  return replaceRound(state,newRound(frontier,round.number+1,edge.homeCell,edge.targetCell));
}
export function createCompetitionChallenge(state,options={}) {
  let id=options.id,number=state.frontiers.length+1;
  if(!id){while(state.frontiers.some(frontier=>frontier.id===`challenge-${number}`))number++;id=`challenge-${number}`;}
  const frontier=normalizeFrontier({...options,id});
  if(state.frontiers.some(item=>item.id===frontier.id))fail('DUPLICATE_ID','이미 존재하는 과제 ID입니다.');
  if(frontier.quorum!==undefined&&(!Number.isInteger(frontier.quorum)||frontier.quorum<1||frontier.quorum>1000))fail('INVALID_QUORUM','평가 수 기준은 1~1000 사이여야 합니다.');
  let round=newRound(frontier,1);
  const reserved=reservedPlots(state,frontier.id);
  if(!validStakes(state,frontier,round)||reserved.has(round.homeCell)||reserved.has(round.targetCell)){
    const start=[options.anchorCellId,...state.owners.flatMap((owner,cell)=>owner===frontier.homeTeam?[cell]:[])];
    round={...round,...nearestBoundary(state,frontier,start)};
  }
  return {...state,frontiers:[...state.frontiers,frontier],rounds:{...state.rounds,[frontier.id]:round},activeFrontierId:frontier.id};
}
export function competitionStats(state) {
  const records=state.history,domains=[...new Set(state.frontiers.flatMap(frontier=>frontier.kinds))];
  const factions=COMPETITION_TEAMS.map((name,id)=>({id,name,matches:records.filter(record=>[record.homeTeam,record.opponentTeam].includes(id)).length,
    wins:records.filter(record=>record.result.winnerTeam===id).length,plots:state.owners.filter(owner=>owner===id).length,
    delta:state.owners.filter(owner=>owner===id).length-state.initialOwners.filter(owner=>owner===id).length}));
  return {completed:records.length,matches:records.length,ballots:records.reduce((sum,record)=>sum+record.result.valid,0),practice:state.practice,
    factions,domains:domains.map(kind=>{const matches=records.filter(record=>state.frontiers.find(frontier=>frontier.id===record.frontierId)?.kinds.includes(kind));
      return {kind,matches:matches.length,ballots:matches.reduce((sum,record)=>sum+record.result.valid,0)};}),
    disclosure:'이 기록은 로컬 역할 연습의 해당 작품·과제 결과이며 AI 전체 성능을 측정하지 않습니다.'};
}

// Storage validation shares source/hash and rule validation without changing state.
export function validateCompetitionSnapshot(snapshot,base) {
  if(!snapshot||!Array.isArray(snapshot.owners)||snapshot.owners.length!==base.owners.length||snapshot.owners.some((owner,id)=>
    !Number.isInteger(owner)||owner< -1||owner>=COMPETITION_TEAMS.length||(base.initialOwners[id]===-1&&owner!==-1)))fail('INVALID_SNAPSHOT','소유 기록을 확인하세요.');
  if(snapshot.quorum!==base.quorum||snapshot.practice!==base.practice)fail('INVALID_SNAPSHOT','연습 기준을 확인하세요.');
  if(!Array.isArray(snapshot.works)||!snapshot.works.length||snapshot.works.length>base.owners.length||!Array.isArray(snapshot.frontiers)||!snapshot.frontiers.length
    ||!snapshot.rounds||typeof snapshot.rounds!=='object'||!Array.isArray(snapshot.history))fail('INVALID_SNAPSHOT','기록 형식을 확인하세요.');
  const works=snapshot.works.map(work=>normalizeWork(work,snapshot.owners)),frontiers=snapshot.frontiers.map(normalizeFrontier);
  if(new Set(works.map(work=>work.id)).size!==works.length||new Set(works.map(work=>work.cellId)).size!==works.length
    ||new Set(frontiers.map(frontier=>frontier.id)).size!==frontiers.length||!frontiers.some(frontier=>frontier.id===snapshot.activeFrontierId)
    ||base.frontiers.some(frontier=>!frontiers.some(item=>item.id===frontier.id&&JSON.stringify(item)===JSON.stringify(frontier))))fail('INVALID_SNAPSHOT','중복, 변경 또는 누락된 기본 과제입니다.');
  const state={...copy(snapshot),works,frontiers,neighbors:copy(base.neighbors),initialOwners:[...base.initialOwners]};
  const seenHistory=new Set(),completed=Object.fromEntries(frontiers.map(frontier=>[frontier.id,0]));
  function validateRound(round,frontier,{history=false}={}) {
    if(!round||!Number.isInteger(round.number)||round.number<1||round.id!==`${frontier.id}-${round.number}`
      ||!validCell(round.homeCell,state.owners)||!validCell(round.targetCell,state.owners)||state.owners[round.homeCell]===-1||state.owners[round.targetCell]===-1
      ||!base.neighbors[round.homeCell].includes(round.targetCell)||!Array.isArray(round.ballots)||!round.trials||typeof round.trials!=='object'
      ||!round.submissions||!own(round.submissions,'A')||!own(round.submissions,'B'))fail('INVALID_SNAPSHOT','경기 기록을 확인하세요.');
    if(!history&&(!['recruiting','submitted','evaluating','finalized'].includes(round.phase)||typeof round.applied!=='boolean'))fail('INVALID_SNAPSHOT','경기 상태를 확인하세요.');
    for(const side of ['A','B'])if(round.submissions[side]){
      const work=normalizeWork(round.submissions[side],state.owners,{requiredArtifact:true});
      if(team(work.faction)!==sideTeam(frontier,side)||!frontier.kinds.includes(work.kind))fail('INVALID_SNAPSHOT','출품 진영과 유형을 확인하세요.');
      round.submissions[side]=frozen(work);
    }
    if(JSON.stringify(round.submission)!==JSON.stringify(round.submissions.A)||JSON.stringify(round.opponent)!==JSON.stringify(round.submissions.B))fail('INVALID_SNAPSHOT','봉인 버전이 일치하지 않습니다.');
    round.submission=round.submissions.A;round.opponent=round.submissions.B;
    if((history||round.applied||round.phase!=='recruiting'||round.ballots.length)&&(!round.submissions.A||!round.submissions.B))fail('INVALID_SNAPSHOT','양쪽 출품 기록이 필요합니다.');
    for(const [evaluator,trial]of Object.entries(round.trials)){
      if(!validId(evaluator)||typeof trial?.A!=='boolean'||typeof trial?.B!=='boolean')fail('INVALID_SNAPSHOT','체험 기록을 확인하세요.');
      if(round.submissions.A&&round.submissions.B)requireEvaluator(round,evaluator);
    }
    const voters=new Set();
    for(const ballot of round.ballots){
      requireEvaluator(round,ballot.evaluatorId);
      if(voters.has(ballot.evaluatorId)||!own(round.trials,ballot.evaluatorId)||!round.trials[ballot.evaluatorId].A||!round.trials[ballot.evaluatorId].B
        ||!['A','B','tie','neither'].includes(ballot.choice)||typeof ballot.note!=='string'||ballot.note.length>500)fail('INVALID_SNAPSHOT','평가 기록을 확인하세요.');
      voters.add(ballot.evaluatorId);
      for(const side of ['A','B'])for(const key of frontier.checkKeys)if(!ballot.checks?.[side]||!own(ballot.checks[side],key)||!STATUS.has(ballot.checks[side][key]))fail('INVALID_SNAPSHOT','기능 평가가 누락됐습니다.');
      frozen(ballot);
    }
    if(history||round.applied){
      if(!round.result)fail('INVALID_SNAPSHOT','확정 결과가 필요합니다.');
      const owners=[...state.owners];owners[round.homeCell]=frontier.homeTeam;owners[round.targetCell]=frontier.opponentTeam;
      const expected=deriveCompetitionResult({...state,owners},frontier,round);
      if(JSON.stringify(round.result)!==JSON.stringify(expected))fail('INVALID_SNAPSHOT','기록된 표와 확정 결과가 일치하지 않습니다.');
      frozen(round.result);
      if(!history&&(round.phase!=='finalized'||!snapshot.history.some(record=>record.roundId===round.id)))fail('INVALID_SNAPSHOT','확정 이력이 필요합니다.');
    }else if(round.result!==null||round.phase==='finalized')fail('INVALID_SNAPSHOT','미확정 결과를 확인하세요.');
  }
  for(const frontier of frontiers)validateRound(state.rounds[frontier.id],frontier);
  const replayed=[...base.initialOwners];
  for(const record of state.history){
    const frontier=frontiers.find(item=>item.id===record.frontierId);
    if(!frontier||seenHistory.has(record.roundId)||record.roundId!==`${record.frontierId}-${record.number}`||typeof record.feedback!=='string'
      ||record.number!==completed[record.frontierId]+1||record.homeTeam!==frontier.homeTeam||record.opponentTeam!==frontier.opponentTeam)fail('INVALID_SNAPSHOT','경기 이력을 확인하세요.');
    seenHistory.add(record.roundId);
    completed[record.frontierId]++;
    validateRound({...record,id:record.roundId},frontier,{history:true});
    if(replayed[record.homeCell]!==frontier.homeTeam||replayed[record.targetCell]!==frontier.opponentTeam)fail('INVALID_SNAPSHOT','경기 순서와 접경 소유가 일치하지 않습니다.');
    const expected=deriveCompetitionResult({...state,owners:replayed},frontier,record);
    if(JSON.stringify(record.result)!==JSON.stringify(expected)||record.feedback!==expected.feedback)fail('INVALID_SNAPSHOT','평가와 경기 이력이 일치하지 않습니다.');
    if(expected.changedCell!==null)replayed[expected.changedCell]=expected.winnerTeam;
    record.submission=record.submissions.A;record.opponent=record.submissions.B;frozen(record);
  }
  if(replayed.some((owner,id)=>owner!==state.owners[id]))fail('INVALID_SNAPSHOT','영토 상태가 경기 이력과 일치하지 않습니다.');
  for(const frontier of frontiers){
    const round=state.rounds[frontier.id];
    if(round.number!==(round.applied?completed[frontier.id]:completed[frontier.id]+1))fail('INVALID_SNAPSHOT','현재 라운드와 완료 이력이 일치하지 않습니다.');
    if(round.applied){
      const record=state.history.find(item=>item.roundId===round.id);
      for(const key of ['submissions','ballots','trials','result'])if(JSON.stringify(round[key])!==JSON.stringify(record[key]))fail('INVALID_SNAPSHOT','확정 경기와 보존 이력이 일치하지 않습니다.');
    }else if((round.submissions.A||round.submissions.B)&&!validStakes(state,frontier,round))fail('INVALID_SNAPSHOT','진행 경기의 접경이 유효하지 않습니다.');
  }
  return state;
}
