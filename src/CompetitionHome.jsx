import {ArrowRight, ArrowUpRight, Flag, Play, Plus} from '@phosphor-icons/react';
import {TEAMS} from './world.js';
import {getCompetitionRound} from './competition-model.js';

export const competitionPhase = round => round.applied ? '결과 확정' : round.submissions?.A && round.submissions?.B ? '비교 평가' : '양측 출품 모집';

export function CompetitionHome({state, onEnter, onRegister, onChallenge}) {
  const frontier = state.frontiers.find(item => item.id === state.activeFrontierId);
  const round = getCompetitionRound(state);
  const teams = [frontier.homeTeam ?? 0, frontier.opponentTeam];
  const latest = state.history.at(-1);
  return <section className="competition-home" aria-label="AI 대결 전황">
    <div className="competition-kicker"><span className="eyebrow">지금 맞닿은 두 진영</span><span>로컬 연습 · ROUND {round.number}</span></div>
    <h2 className="competition-versus">{TEAMS[teams[0]].name}<em>×</em>{TEAMS[teams[1]].name}</h2>
    <div className="competition-home-status"><span>{competitionPhase(round)}</span><span>양측 1칸 · {Object.values(round.submissions || {}).filter(Boolean).length}/2 출품</span></div>
    <h3 className="competition-task-title">{frontier.brief}</h3>
    <div className="competition-pair">{['A','B'].map((side, index) => {
      const submitted = round.submissions?.[side];
      const candidate = submitted || state.works.find(work => work.faction === TEAMS[teams[index]].name && frontier.kinds.includes(work.kind));
      return <button key={side} className="competition-pair-item" onClick={onEnter} aria-label={`${TEAMS[teams[index]].name} 출품과 결과 보기`}>
        {candidate ? <img src={candidate.cover} alt="참고 게임 표지"/> : <div className="competition-awaiting"><Plus size={24}/></div>}
        <span><i style={{background:TEAMS[teams[index]].color}}/>{TEAMS[teams[index]].name}<small>{submitted ? `출품 v${submitted.version} 고정` : candidate ? '출품 후보 준비' : '출품을 기다립니다'}</small></span>
      </button>;
    })}</div>
    <button className="primary full" onClick={onEnter}><Play size={17} weight="fill"/>{round.applied ? '판정 근거와 탈환전 보기' : round.submissions?.A && round.submissions?.B ? '두 결과물 직접 비교하기' : '양쪽 출품과 경기 보기'}<ArrowRight size={18}/></button>
    <div className="competition-home-actions"><button className="text-link" onClick={onRegister}><Plus size={15}/>내 AI의 결과물 출품</button><button className="text-link" onClick={onChallenge}><Flag size={15}/>다른 접경에 도전</button></div>
    <div className="competition-rules-preview"><span className="eyebrow">같이 겨룰 조건</span><ul>{frontier.criteria.map(criterion => <li key={criterion}>{criterion}</li>)}</ul><p>단일 HTML · 같은 필수 기능 · 제출 버전 고정<br/>기능 확인과 선호 평가를 나누어 판정합니다. 선호 승리는 전체 유효 응답의 과반이 필요합니다.</p></div>
    <div className="competition-evidence"><span>확인할 수 있는 데이터</span><dl><div><dt>현재 경기 평가</dt><dd>{round.ballots.length}건</dd></div><div><dt>이 브라우저의 확정 경기</dt><dd>{state.history.length}건</dd></div><div><dt>독립적으로 검증된 AI 경기</dt><dd>미집계</dd></div></dl></div>
    {latest && <button className="competition-latest" onClick={onEnter}><span><small>최근 판정</small><strong>{latest.result.reason}</strong></span><ArrowUpRight size={18}/></button>}
    <p className="competition-reference-note">기본 두 게임은 같은 Codex 세션에서 만든 참고 구현입니다. 진영 배치는 연습용이며 실제 AI 성능 자료가 아닙니다.</p>
  </section>;
}
