import {useEffect, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Check, Flag, LockSimple, PencilSimple, Play, Plus} from '@phosphor-icons/react';
import {TEAMS} from './world.js';
import {getCompetitionRound, getCreationEligibility, eligibleCompetitionWorks, submitCreation,
  castCompetitionBallot, finalizeCompetition, openCompetitionRematch} from './competition-model.js';
import './competition.css';

const SIDES = ['A', 'B'];
const checkNames = {controls: '조작 입력이 반영됨', restart: '실패 후 다시 시작', feedback: '진행·결과 피드백'};
const checkChoices = {unknown: '판단하지 못함', pass: '충족함', fail: '충족하지 못함'};
const preferenceNames = {A: 'A가 더 좋음', B: 'B가 더 좋음', tie: '차이를 고르기 어려움', neither: '둘 다 부적합'};
const actorNames = {'platform-reference': '플랫폼 예시 제작자', 'user-local': '내 업로드 제작자'};
const version = work => `v${work?.version ?? 1}.0`;
const teamId = value => typeof value === 'number' ? value : TEAMS.findIndex(team => team.name === value);
const teamFor = (frontier, side) => TEAMS[side === 'A' ? frontier.homeTeam ?? 0 : frontier.opponentTeam];
const emptyChecks = keys => Object.fromEntries(SIDES.map(side => [side, Object.fromEntries(keys.map(key => [key, 'unknown']))]));
const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.filter(item => typeof item === 'string').join('\n') : '';
const phaseName = round => round.applied ? '결과 확정' : round.submissions?.A && round.submissions?.B ? '직접 비교 평가' : '양측 출품 모집';

function metadata(work) {
  return [
    ['제작자', work.author || work.creatorId || '미신고'],
    ['제작 AI', work.creationAI || work.ai || '미신고'],
    ['모델 버전', work.modelVersion || '미신고'],
    ['에이전트', work.agent || '미신고'],
    ['사람의 개입', work.humanContribution || '미신고'],
    ['제작 조건', work.conditions || '미신고'],
  ];
}

function WorkRecord({work, latest, team}) {
  return <div className="cp-work-record">
    <div className="cp-work-record-title"><span><i style={{background: team.color}}/>{team.name}</span><strong>{work.title} <small>{version(work)}</small></strong></div>
    <dl>{metadata(work).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {work.artifact?.sha256 && <p className="cp-hash">제출 파일 식별값 <code>{work.artifact.sha256.slice(0, 12)}</code><span>AI 출처를 증명하는 값은 아닙니다.</span></p>}
    {latest?.version > work.version && <p className="cp-latest">전시 최신 {version(latest)} · 이 경기의 {version(work)}은 그대로 유지됩니다.</p>}
  </div>;
}

export function CompetitionPanel({state, selectedId, actorId, evaluatorId, onTransition, onSelectWork,
  onPlay, onEdit, onRegister, onBack, onSelectFrontier, onFocus, onActorChange}) {
  const frontier = state.frontiers.find(item => item.id === state.activeFrontierId) || state.frontiers[0];
  const round = getCompetitionRound(state);
  const keys = frontier.checkKeys || ['controls', 'restart', 'feedback'];
  const keyString = keys.join('|');
  const roundKey = `${frontier.id}:${round.id}`;
  const allCandidates = side => state.works.filter(work => teamId(work.faction) ===
    (side === 'A' ? frontier.homeTeam ?? 0 : frontier.opponentTeam) && frontier.kinds.includes(work.kind));
  const initialEntry = side => {
    const candidates = allCandidates(side), eligible = eligibleCompetitionWorks(state, side, actorId);
    return eligible.some(work => work.id === selectedId) ? selectedId : eligible[0]?.id || candidates[0]?.id || '';
  };
  const [entries, setEntries] = useState(() => ({A: initialEntry('A'), B: initialEntry('B')}));
  const [side, setSide] = useState('A');
  const [checks, setChecks] = useState(() => emptyChecks(keys));
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState('');
  const submissions = round.submissions || {A: round.submission, B: round.opponent};
  const displayedWorks = SIDES.map(item => submissions[item] || state.works.find(work => work.id === entries[item]));
  const referenceCount = displayedWorks.filter(work => work?.artifact?.sourceKind === 'platform-reference' || work?.sourceKind === 'platform-reference').length;
  const bothSubmitted = Boolean(submissions.A && submissions.B);
  const final = Boolean(round.applied);
  const ballot = round.ballots.find(item => item.evaluatorId === evaluatorId);
  const trials = round.trials?.[evaluatorId] || {A: false, B: false};
  const result = round.result;
  const selfEvaluation = SIDES.some(item => submissions[item] &&
    [submissions[item].creatorId, submissions[item].author].includes(evaluatorId));
  const history = (state.history || []).filter(item => item.frontierId === frontier.id).slice().reverse();
  const counts = result?.counts || round.ballots.reduce((totals, item) => {
    if (Object.hasOwn(totals, item.choice)) totals[item.choice]++;
    return totals;
  }, {A: 0, B: 0, tie: 0, neither: 0});

  useEffect(() => {
    setEntries({A: initialEntry('A'), B: initialEntry('B')});
    setSide('A'); setChecks(emptyChecks(keys)); setChoice(''); setNote(''); setLocalError('');
  }, [roundKey, keyString]);
  useEffect(() => {
    setEntries(previous => Object.fromEntries(SIDES.map(item => {
      const candidates = allCandidates(item), eligible = eligibleCompetitionWorks(state, item, actorId);
      if (eligible.some(work => work.id === selectedId)) return [item, selectedId];
      if (eligible.some(work => work.id === previous[item])) return [item, previous[item]];
      return [item, eligible[0]?.id || candidates.find(work => work.id === previous[item])?.id || candidates[0]?.id || ''];
    })));
  }, [actorId, selectedId, state.works, roundKey]);
  useEffect(() => {
    setChecks(ballot?.checks || emptyChecks(keys)); setChoice(ballot?.choice || ''); setNote(ballot?.note || ''); setLocalError('');
  }, [roundKey, evaluatorId, ballot?.evaluatorId]);

  function apply(transform) {
    try { setLocalError(''); return onTransition(transform); }
    catch (error) { setLocalError(error.message || '현재 경기 상태를 다시 확인하세요.'); return null; }
  }
  function selectEntry(item, id) {
    setEntries(previous => ({...previous, [item]: id})); onSelectWork?.(id);
  }
  function play(item) {
    onPlay(submissions[item], {side: item, roundId: round.id, frontierId: frontier.id});
  }
  function confirmResult() {
    const next = apply(current => finalizeCompetition(current));
    if (next) onFocus?.(getCompetitionRound(next).result?.changedCell ?? round.homeCell);
  }
  function rematch() {
    const next = apply(current => openCompetitionRematch(current));
    if (next) onFocus?.(getCompetitionRound(next).homeCell);
  }
  function resultName(record) {
    if (record?.outcome === 'A' || record?.outcome === 'B') return `${teamFor(frontier, record.outcome)?.name || '진영'} 승리`;
    return {tie: '선호 동률', neither: '양쪽 부적합', insufficient: '평가 부족', review: '기능 확인 보류'}[record?.outcome] || '판정 대기';
  }

  return <section className="cp-panel" aria-label="AI 대결">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/>전황으로 돌아가기</button>
    {state.frontiers.length > 1 && <div className="cp-frontiers" aria-label="대결 선택">{state.frontiers.map(item => <button key={item.id}
      aria-pressed={item.id === frontier.id} onClick={() => onSelectFrontier(item.id)}>
      <span><strong>{item.title}</strong><small>{TEAMS[item.homeTeam ?? 0]?.name} × {TEAMS[item.opponentTeam]?.name}</small></span><ArrowRight size={15}/>
    </button>)}</div>}
    <div className="cp-round"><span className="eyebrow">ROUND {round.number} · 로컬 연습</span><span>{phaseName(round)}</span></div>
    <h2 className="cp-versus">{teamFor(frontier, 'A')?.name}<em>×</em>{teamFor(frontier, 'B')?.name}</h2>
    <p className="cp-task">{frontier.brief}</p>
    <div className="cp-criteria"><span className="eyebrow">같이 겨룰 조건</span><ul>{frontier.criteria?.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul><p>같은 필수 기능 · 단일 HTML · 제출 버전 고정</p></div>
    <button className="cp-stakes" onClick={() => onFocus?.(round.homeCell)} aria-label="이번 경기의 접경 영역 보기">
      {SIDES.map(item => <span key={item}><i style={{background: teamFor(frontier, item)?.color}}/>{teamFor(frontier, item)?.name}<small>인접한 1칸</small></span>)}<ArrowUpRight size={17}/>
    </button>
    <p className="cp-reference">{referenceCount > 0
      ? referenceCount === 2
        ? '플랫폼 예시 · 진영 배치는 연습용입니다. 기본 두 게임은 같은 Codex 세션의 참고 구현이며, 다른 AI의 실제 출품이나 성능 자료가 아닙니다.'
        : '이번 대결에는 Codex 세션에서 만든 플랫폼 참고 구현이 포함되어 있습니다. 이 예시의 진영 배치는 연습용이며 다른 AI의 실제 출품이나 성능 자료가 아닙니다.'
      : '제작 AI와 제작 조건은 제작자 신고이며 독립 검증 전입니다. 이 과제의 결과물 비교를 모델 자체 성능으로 일반화하지 않습니다.'}</p>

    {!bothSubmitted && <>
      <div className="cp-section-heading"><h3>양쪽 결과물 출품</h3><span>{Object.values(submissions).filter(Boolean).length}/2 제출</span></div>
      <div className="cp-role"><span>현재 제작자 역할 <strong>{actorNames[actorId] || actorId}</strong></span>
        {onActorChange && <label>제작자 역할 선택<select value={actorId} onChange={event => onActorChange(event.target.value)}>
          {[...new Set([actorId, ...state.works.map(work => work.creatorId || work.author)])].map(id => <option key={id} value={id}>{actorNames[id] || id}</option>)}
        </select></label>}
        <p>로컬 역할 시연입니다. 실사용자 인증이나 다른 제작자의 수정 권한을 부여하지 않습니다.</p>
      </div>
      {SIDES.map(item => {
        const team = teamFor(frontier, item), sealed = submissions[item], candidates = allCandidates(item);
        const entry = state.works.find(work => work.id === entries[item]);
        const eligibility = entry ? getCreationEligibility(state, entry.id, item, actorId) : {eligible: false, reason: '과제에 맞는 실행 가능한 작품을 등록하세요.'};
        return <section className="cp-entry" key={item} aria-label={`${team?.name} 출품`}>
          <div className="cp-entry-label"><span><i style={{background: team?.color}}/>{team?.name}</span><small>{sealed ? '제출 버전 고정' : '출품 준비'}</small></div>
          {sealed ? <><div className="cp-sealed"><LockSimple size={17}/><span>{sealed.title} <small>{version(sealed)}</small></span><Check size={17}/></div><p className="cp-muted">전시 작품을 수정해도 이 제출 파일과 버전은 그대로 유지됩니다.</p></> : <>
            {entry && <><img className="cp-entry-cover" src={entry.cover} alt={`${entry.title} 출품 후보 표지`}/><div className="cp-entry-title"><h4>{entry.title}</h4><span>{version(entry)}</span></div>
              <p className="cp-build">{entry.author} · {entry.agent || '에이전트 미신고'} · {entry.modelVersion || '모델 버전 미신고'}</p>
              <details className="cp-build-details"><summary>제작 조건과 사용 AI 신고</summary><dl>{metadata(entry).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>제작자 신고이며 단일 AI 사용을 자동 증명하지 않습니다.</p></details>
            </>}
            <label className="cp-picker">{team?.name} 출품 후보<select value={entries[item]} onChange={event => selectEntry(item, event.target.value)} disabled={!candidates.length}>
              {!candidates.length && <option value="">출품 후보 없음</option>}
              {candidates.map(work => {const available = getCreationEligibility(state, work.id, item, actorId); return <option key={work.id} value={work.id} disabled={!available.eligible}>{work.title} · {version(work)}{available.eligible ? '' : ` — ${available.reason}`}</option>;})}
            </select></label>
            {!eligibility.eligible && <p className="cp-unavailable">{eligibility.reason}</p>}
            {Number.isFinite(eligibility.appearances) && <p className="cp-muted">이 과제의 완료 출전 {eligibility.appearances}회 · 완료 출전이 적은 제작자를 우선합니다.</p>}
            <button className="primary full" disabled={!entry || !eligibility.eligible} onClick={() => apply(current => submitCreation(current, item, entry.id, actorId))}><Flag size={16}/>{team?.name} 이 버전 출품 <ArrowRight size={16}/></button>
            <div className="cp-entry-actions">{entry && <button className="text-link" disabled={(entry.creatorId || entry.author) !== actorId} onClick={() => onEdit?.(entry)}><PencilSimple size={14}/>새 버전 만들기</button>}
              <button className="text-link" onClick={() => onRegister?.(item, frontier.kinds[0])}><Plus size={14}/>이 진영의 작품 등록</button></div>
          </>}
        </section>;
      })}
    </>}

    {bothSubmitted && !final && <>
      <div className="cp-locked"><LockSimple size={17}/><span>양쪽 제출 파일과 버전이 고정됐습니다.</span></div>
      <div className="cp-section-heading"><h3>직접 해보고 비교하세요.</h3><span>정보 숨김 비교</span></div>
      <p className="cp-muted">작품명·제작자·AI 신고를 숨긴 로컬 평가 화면입니다. 이미 본 작품이나 실행 화면의 신원을 완전히 숨기는 블라인드 검증은 아닙니다.</p>
      <div className="cp-side-tabs" aria-label="비교할 작품">{SIDES.map(item => <button key={item} aria-pressed={side === item} onClick={() => setSide(item)}><strong>작품 {item}</strong><small>{trials[item] ? '체험 완료' : '직접 체험 전'}</small></button>)}</div>
      <div className="cp-anonymous-preview"><span className="cp-anonymous-letter" aria-hidden="true">{side}</span><span>키 하나로 시작하는 게임</span><button className="primary" onClick={() => play(side)}><Play size={17} weight="fill"/>작품 {side} 실행하기 <ArrowUpRight size={17}/></button></div>
      <div className="cp-reviewer"><strong>별도 평가자 역할 · {evaluatorId}</strong><p>이 브라우저의 로컬 평가입니다. 한 사람이 역할을 바꿀 수 있으며 실제 독립 평가자 수를 인증하지 않습니다.</p></div>
      {selfEvaluation && <p className="cp-unavailable" role="alert">제출한 작품의 제작자는 이 경기를 평가할 수 없습니다. 별도 평가자 역할로 진행하세요.</p>}
      <form className="cp-ballot-form" onSubmit={event => {event.preventDefault(); apply(current => castCompetitionBallot(current, {evaluatorId, choice, checks, note}));}}>
        <h3 className="cp-form-title">기능 확인</h3><p className="cp-muted">직접 조작해 확인한 항목만 충족으로 표시하세요. 선호 투표와 분리해 판정합니다.</p>
        {SIDES.map(item => <fieldset className="cp-checks" key={item} disabled={Boolean(ballot) || selfEvaluation}><legend>작품 {item} 기능 확인 <span>{trials[item] ? '체험 완료' : '체험 전'}</span></legend>{keys.map(key => <label key={key}><span>{checkNames[key] || key}</span><select value={checks[item]?.[key] || 'unknown'} aria-label={`작품 ${item} ${checkNames[key] || key}`} onChange={event => setChecks(previous => ({...previous, [item]: {...previous[item], [key]: event.target.value}}))}>{Object.entries(checkChoices).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</fieldset>)}
        <fieldset className="cp-preference" disabled={Boolean(ballot) || selfEvaluation}><legend>어느 결과를 더 선택하고 싶나요?</legend>{Object.entries(preferenceNames).map(([value, label]) => <label key={value}><input type="radio" name={`preference-${round.id}`} value={value} checked={choice === value} onChange={() => setChoice(value)}/>{label}</label>)}</fieldset>
        <label className="cp-note">선택 이유와 개선할 점 <span>선택 · 500자 이내</span><textarea maxLength={500} rows={3} value={note} disabled={Boolean(ballot) || selfEvaluation} onChange={event => setNote(event.target.value)} placeholder="실제로 확인한 장점과 다음 버전에 바라는 점을 남겨주세요."/></label>
        <button className="primary full" disabled={!trials.A || !trials.B || !choice || Boolean(ballot) || selfEvaluation}>{ballot ? <><Check size={16}/>이 평가자의 응답 접수 완료</> : <>기능 확인과 선호 평가 제출 <ArrowRight size={17}/></>}</button>
      </form>
      <div className="cp-tally"><span className="eyebrow">현재 접수된 응답</span><strong>{round.ballots.length}건 <small>이 브라우저의 로컬 기록</small></strong><dl>{Object.entries(preferenceNames).map(([value, label]) => <div key={value}><dt>{label}</dt><dd>{counts[value] || 0}</dd></div>)}</dl></div>
      <button className="primary full cp-finalize" disabled={round.ballots.length === 0} onClick={confirmResult}>평가·조건 확인 후 결과 확정 <ArrowRight size={17}/></button>
      <p className="cp-muted">연습 정족수 {state.quorum ?? frontier.quorum ?? 1}건입니다. 실제 공개 대회 기준이 아닙니다. 필수 기능을 충족하지 못한 쪽은 승리할 수 없습니다. 판단 보류·동률·평가 부족은 경계를 유지합니다.</p>
    </>}

    {final && <>
      <div className="cp-section-heading cp-result-heading"><span className="eyebrow">판정 결과</span><span>로컬 연습 기록</span></div>
      <h3 className="cp-verdict">{resultName(result)}</h3>
      <div className="cp-result-count"><strong>{counts.A || 0}<em>:</em>{counts.B || 0}</strong><span>A 선택 : B 선택<br/>유효 평가 {result?.valid ?? round.ballots.length}건 · 연습 정족수 {result?.quorum ?? 1}건</span></div>
      <p className="cp-verdict-reason">{text(result?.reason)}</p>
      <div className="cp-territory"><strong>{result?.territoryChanged ? `${TEAMS[result.winnerTeam]?.name || '승리 진영'}의 경계가 한 칸 넓어졌습니다.` : '이번 경기의 경계는 유지됩니다.'}</strong><p>작품·표지·원작자와 제작 기록은 영토 결과로 바뀌지 않습니다.</p><button className="text-link" onClick={() => onFocus?.(result?.changedCell ?? round.homeCell)}>결과가 반영된 접경지 보기 <ArrowUpRight size={15}/></button></div>
      <div className="cp-section-heading"><h3>이 결과를 만든 제출 버전</h3><span>평가 후 정보 공개</span></div>
      {SIDES.map(item => <div className="cp-revealed" key={item}><span className="cp-revealed-side">작품 {item}</span><WorkRecord work={submissions[item]} latest={state.works.find(work => work.id === submissions[item].id)} team={teamFor(frontier, item)}/></div>)}
      <div className="cp-section-heading"><h3>평가 근거</h3><span>기능 확인과 선호 구분</span></div>
      {round.ballots.map((record, index) => <div className="cp-evidence" key={record.evaluatorId || index}><strong>평가 {index + 1} · {preferenceNames[record.choice]}</strong><dl>{SIDES.map(item => <div key={item}><dt>작품 {item}</dt><dd>{keys.map(key => `${checkNames[key] || key}: ${checkChoices[record.checks?.[item]?.[key]] || '판단하지 못함'}`).join(' · ')}</dd></div>)}</dl>{record.note && <p>{record.note}</p>}</div>)}
      {text(result?.feedback) && <p className="cp-feedback">{text(result.feedback)}</p>}
      <button className="primary full cp-rematch" onClick={rematch}>{result?.territoryChanged ? '개선해서 다음 접경에 다시 도전' : '조건을 보완하고 재대결 준비'}<ArrowRight size={17}/></button>
      <div className="cp-revision-links">{SIDES.map(item => {const work = state.works.find(entry => entry.id === submissions[item].id); return work && <button className="text-link" key={item} disabled={(work.creatorId || work.author) !== actorId} onClick={() => onEdit?.(work)}><PencilSimple size={14}/>{teamFor(frontier, item)?.name} 피드백 반영한 새 버전</button>;})}</div>
      <p className="cp-muted">현재 제작자 역할과 일치하는 작품만 수정합니다. 새 버전을 등록한 뒤에도 이전 경기의 제출 파일·평가·판정은 보존됩니다.</p>
    </>}
    {localError && <p className="cp-error" role="alert">{localError}</p>}
    {history.length > 0 && <details className="cp-history"><summary>이 접경의 경기·재대결 기록 <span>{history.length}회</span></summary>{history.map(record => <div key={record.roundId}><strong>ROUND {record.number} · {resultName(record.result)}</strong><span>{record.submissions?.A?.title || record.submission?.title} {version(record.submissions?.A || record.submission)} × {record.submissions?.B?.title || record.opponent?.title} {version(record.submissions?.B || record.opponent)}</span><p>{text(record.result?.reason)}</p><small>유효 평가 {record.result?.valid ?? 0}건 · {record.result?.territoryChanged ? '인접 1칸 이전' : '경계 유지'}</small></div>)}</details>}
  </section>;
}
