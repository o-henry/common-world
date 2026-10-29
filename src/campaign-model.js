import {CompetitionRuleError, createCompetitionChallenge, getCompetitionRound,
  validateCompetitionSnapshot} from './competition-model.js';

const copy = value => structuredClone(value);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const fail = (code, message) => {throw new CompetitionRuleError(code, message);};
const profiles = [
  {profileId:'retry', title:'재도전 접경', brief:'키 하나로 조작하고 실패 후 바로 다시 시작하는 게임',
    checkKeys:['controls','restart'], criteria:['키 하나 또는 화면 버튼으로 조작','실패 후 바로 다시 시작']},
  {profileId:'feedback', title:'피드백 접경', brief:'입력과 진행 상태를 분명하게 보여주는 한 버튼 게임',
    checkKeys:['controls','feedback'], criteria:['키 하나 또는 화면 버튼으로 조작','점수 또는 진행 상태가 입력 결과를 보여줌']},
];

function initialAnchor(state, team) {
  const frontier = state.frontiers.find(item => item.homeTeam === team);
  return frontier && state.owners[frontier.homeCell] === team ? frontier.homeCell
    : state.owners.findIndex(owner => owner === team);
}

export function createCampaign(base, {team = 0} = {}) {
  if (!Number.isInteger(team) || team < 0 || team > 5) fail('INVALID_CAMPAIGN_TEAM', '참가 진영을 확인하세요.');
  if (base.history.length) fail('FRESH_CAMPAIGN_REQUIRED', '새 연습 기록에서 접경 선택을 시작하세요.');
  const anchor = initialAnchor(base, team);
  return {...copy(base), campaign:{schema:1, team, anchorCell:anchor < 0 ? null : anchor,
    turn:1, current:null, log:[]}};
}

// A local front is the anchor and its directly connected friendly plots.
// Neutral plots and remote territory never create a route or a reward.
function smallOffers(state, anchorCell, turn) {
  const team = state.campaign.team;
  if (anchorCell === null || state.owners[anchorCell] !== team) return [];
  const homes = [anchorCell, ...state.neighbors[anchorCell].filter(cell => state.owners[cell] === team).sort((a,b) => a-b)];
  const pairs = homes.flatMap((homeCell, distance) => state.neighbors[homeCell]
    .filter(targetCell => state.owners[targetCell] >= 0 && state.owners[targetCell] !== team)
    .map(targetCell => ({homeCell, targetCell, distance:distance === 0 ? 0 : 1})));
  pairs.sort((a,b) => a.distance-b.distance || a.homeCell-b.homeCell || a.targetCell-b.targetCell);
  return pairs.slice(0,2).map((pair,index) => ({...copy(profiles[index]),
    id:`route-${turn}-${pair.homeCell}-${pair.targetCell}-${profiles[index].profileId}`,
    homeCell:pair.homeCell, targetCell:pair.targetCell, homeTeam:team,
    opponentTeam:state.owners[pair.targetCell], kinds:['game']}));
}

function routeAfter(state, offer, outcome) {
  const owners = [...state.owners], team = state.campaign.team;
  let anchorCell = state.campaign.anchorCell;
  if (outcome === 'A') {owners[offer.targetCell] = team; anchorCell = offer.targetCell;}
  if (outcome === 'B') {
    owners[offer.homeCell] = offer.opponentTeam;
    anchorCell = state.neighbors[offer.homeCell].filter(cell => owners[cell] === team).sort((a,b) => a-b)[0] ?? null;
  }
  return {owners, anchorCell};
}

export function getCampaignOffers(state) {
  const campaign = state.campaign;
  if (!campaign) fail('CAMPAIGN_REQUIRED', '접경 선택 기록이 필요합니다.');
  return smallOffers(state, campaign.anchorCell, campaign.turn).map(offer => {
    const previews = {};
    for (const [key,outcome] of [['win','A'],['loss','B'],['hold','tie']]) {
      const route = routeAfter(state, offer, outcome);
      const offers = smallOffers({...state, owners:route.owners}, route.anchorCell, campaign.turn + 1);
      previews[key] = {anchorCell:route.anchorCell, offers, available:offers.length};
    }
    return {...offer, ...previews};
  });
}

export function guardCampaignEntry(state, frontierId = state.activeFrontierId) {
  if (!state.campaign?.current || frontierId !== state.campaign.current.frontierId)
    fail('CAMPAIGN_SELECTION_REQUIRED', '두 접경을 비교한 뒤 출전할 곳을 먼저 선택하세요.');
  return state;
}

export function chooseCampaignOffer(state, offerId) {
  const campaign = state.campaign;
  if (!campaign) fail('CAMPAIGN_REQUIRED', '접경 선택 기록이 필요합니다.');
  const current = campaign.current;
  const round = current ? getCompetitionRound(state, current.frontierId) : null;
  if (round && !round.applied && (round.submissions.A || round.submissions.B))
    fail('CAMPAIGN_ENTRY_LOCKED', '이미 출품한 접경의 판정을 마친 뒤 다음 접경을 선택하세요.');
  const offer = getCampaignOffers(state).find(item => item.id === offerId);
  if (!offer) fail('STALE_CAMPAIGN_OFFER', '현재 영토에서 도전할 수 있는 접경을 다시 선택하세요.');
  let prepared = state;
  if (current && !round.applied) {
    const rounds = {...state.rounds}; delete rounds[current.frontierId];
    prepared = {...state, frontiers:state.frontiers.filter(item => item.id !== current.frontierId), rounds};
  }
  const frontierId = `campaign-${campaign.turn}`;
  const {win, loss, hold, ...definition} = offer;
  const next = createCompetitionChallenge(prepared, {...definition, id:frontierId, campaignOfferId:offer.id});
  return {...next, campaign:{...campaign, current:{turn:campaign.turn, offerId:offer.id, frontierId,
    homeCell:offer.homeCell, targetCell:offer.targetCell, profileId:offer.profileId,
    anchorBefore:campaign.anchorCell}}};
}

export function syncCampaignAfterTransition(previous, next) {
  if (!previous.campaign || !next.campaign) fail('CAMPAIGN_REQUIRED', '접경 선택 기록이 필요합니다.');
  // Choosing a front is the only action allowed to replace the current route.
  if (!equal(previous.campaign, next.campaign)) {
    const offerId = next.campaign.current?.offerId;
    if (!offerId || !equal(chooseCampaignOffer(previous, offerId), next))
      fail('INVALID_CAMPAIGN_TRANSITION', '접경 선택 기록이 일치하지 않습니다.');
    return next;
  }
  const current = previous.campaign.current;
  if (!equal(previous.frontiers, next.frontiers)) fail('CAMPAIGN_SELECTION_REQUIRED', '접경 비교에서 다음 도전을 선택하세요.');
  if (!current) {
    if (!equal(previous.rounds,next.rounds) || !equal(previous.history,next.history) || !equal(previous.owners,next.owners))
      fail('CAMPAIGN_SELECTION_REQUIRED', '출전할 접경을 먼저 선택하세요.');
    return next;
  }
  guardCampaignEntry(next);
  const before = getCompetitionRound(previous, current.frontierId), after = getCompetitionRound(next, current.frontierId);
  if (before.id !== after.id) fail('CAMPAIGN_NEXT_REQUIRED', '재대결도 현재 영토의 두 접경을 비교한 뒤 선택하세요.');
  for (const [id,round] of Object.entries(previous.rounds)) if (id !== current.frontierId && !equal(round,next.rounds[id]))
    fail('CAMPAIGN_ENTRY_LOCKED', '다른 접경에 동시에 출품할 수 없습니다.');
  if (next.history.length === previous.history.length) {
    if (!equal(next.history,previous.history) || !equal(next.owners,previous.owners))
      fail('INVALID_CAMPAIGN_TRANSITION', '판정 없이 영토나 이력을 바꿀 수 없습니다.');
    return next;
  }
  const record = next.history.at(-1);
  if (before.applied || !after.applied || next.history.length !== previous.history.length + 1
    || !equal(next.history.slice(0,-1),previous.history) || record.roundId !== before.id)
    fail('INVALID_CAMPAIGN_TRANSITION', '확정 경기의 순서를 확인하세요.');
  const frontier = next.frontiers.find(item => item.id === current.frontierId);
  const route = routeAfter(previous, {...current, opponentTeam:frontier.opponentTeam}, record.result.outcome);
  if (!equal(route.owners,next.owners)) fail('INVALID_CAMPAIGN_TRANSITION', '승패와 실제 영토 변경이 일치하지 않습니다.');
  const log = {...current, anchorAfter:route.anchorCell, outcome:record.result.outcome, roundId:record.roundId};
  return {...next, campaign:{...previous.campaign, anchorCell:route.anchorCell,
    turn:previous.campaign.turn + 1, log:[...previous.campaign.log,log]}};
}

export function validateCampaignSnapshot(snapshot, base) {
  const state = validateCompetitionSnapshot(snapshot, base), saved = state.campaign;
  if (!saved || saved.schema !== 1 || saved.team !== base.campaign.team || !Array.isArray(saved.log)
    || saved.log.length !== state.history.length)
    fail('INVALID_CAMPAIGN_SNAPSHOT', '접경 선택과 판정 이력을 확인하세요.');
  let replay = createCampaign({...copy(base), works:state.works}, {team:saved.team});
  for (let index = 0; index < saved.log.length; index++) {
    const log = saved.log[index], record = state.history[index];
    const chosen = chooseCampaignOffer(replay, log.offerId);
    if (record.frontierId !== chosen.activeFrontierId) fail('INVALID_CAMPAIGN_SNAPSHOT', '선택한 접경과 판정이 다릅니다.');
    const owners = [...chosen.owners];
    if (record.result.changedCell !== null) owners[record.result.changedCell] = record.result.winnerTeam;
    const after = {...chosen, owners, history:[...chosen.history,record], rounds:{...chosen.rounds,
      [record.frontierId]:{...copy(record), id:record.roundId, applied:true, phase:'finalized'}}};
    replay = syncCampaignAfterTransition(chosen,after);
    if (!equal(replay.campaign.log.at(-1),log)) fail('INVALID_CAMPAIGN_SNAPSHOT', '승패 뒤 이동 경계가 일치하지 않습니다.');
  }
  if (!equal(saved.current,replay.campaign.current)) {
    if (!saved.current?.offerId) fail('INVALID_CAMPAIGN_SNAPSHOT', '현재 출전 접경을 확인하세요.');
    replay = chooseCampaignOffer(replay,saved.current.offerId);
  }
  if (!equal(saved,replay.campaign) || state.activeFrontierId !== replay.activeFrontierId
    || !equal(state.frontiers,replay.frontiers)
    || !equal(Object.keys(state.rounds).sort(),state.frontiers.map(item => item.id).sort()))
    fail('INVALID_CAMPAIGN_SNAPSHOT', '현재 영토에서 선택 가능한 접경 기록이 아닙니다.');
  for (const frontier of base.frontiers) if (!equal(state.rounds[frontier.id],base.rounds[frontier.id]))
    fail('INVALID_CAMPAIGN_SNAPSHOT', '비교에서 선택하지 않은 경기 기록이 있습니다.');
  return state;
}
