import {useEffect, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Check, Flag, PencilSimple, Play, Plus} from '@phosphor-icons/react';
import {TEAMS} from './world.js';
import {getRound, eligibleWorks, getEligibility, enterFrontier, submitFrontierBallot, finalizeFrontier, openNextRound} from './league-model.js';
import './frontier.css';

const phaseNames={recruiting:'출전 모집',submitted:'평가 준비',evaluating:'비교 평가','ballot-submitted':'집계 대기',finalized:'결과 확정'};
const choiceNames={A:'A가 더 좋음',B:'B가 더 좋음',tie:'동률',neither:'둘 다 부적합'};
const version=w=>`v${w?.version??1}.0`;
const scoreFor=outcome=>outcome==='claude'?[8,4]:outcome==='opponent'?[4,8]:outcome==='tie'?[6,6]:[4,3];
const latestNote=work=>work?.changeNote||work?.changelog?.at(-1)?.changeNote||work?.changelog?.at(-1)?.note||'';

export function FrontierPanel({state,selectedId,onChooseWork,onTransition,onExperience,onRevise,onRegister,onSelectFrontier,onFocus,onBack}){
  const frontier=state.frontiers.find(item=>item.id===state.activeFrontierId)||state.frontiers[0];
  const round=getRound(state);
  const eligible=eligibleWorks(state);
  const eligibleIds=eligible.map(work=>work.id);
  const initialId=eligibleIds.includes(selectedId)?selectedId:eligibleIds[0]||'';
  const [entryId,setEntryId]=useState(initialId);
  const [side,setSide]=useState('A');
  const [choice,setChoice]=useState('');
  const [note,setNote]=useState('');
  const [outcome,setOutcome]=useState('claude');
  const activeKey=`${frontier?.id}:${round?.number}`;

  useEffect(()=>{
    setEntryId(eligibleIds.includes(selectedId)?selectedId:eligibleIds[0]||'');
    setSide('A');setChoice('');setNote('');setOutcome('claude');
  },[activeKey]);
  useEffect(()=>{
    if(round?.phase==='recruiting'){
      if(eligibleIds.includes(selectedId))setEntryId(selectedId);
      else if(!eligibleIds.includes(entryId))setEntryId(eligibleIds[0]||'');
    }
  },[selectedId,eligibleIds.join('|'),round?.phase]);

  if(!frontier||!round)return <section className="fp-panel"><button className="back-link" onClick={onBack}><ArrowLeft size={15}/>작품으로 돌아가기</button><h2 className="section-title">열린 접경전이 없습니다.</h2><p className="lede">현재 맞닿은 다른 진영의 영역이 생기면 새로운 경기를 열 수 있습니다.</p></section>;

  const opponentTeam=TEAMS[frontier.opponentTeam]||TEAMS[1];
  const entry=state.works.find(work=>work.id===entryId);
  const submission=round.submission;
  const latestSubmission=submission&&state.works.find(work=>work.id===submission.id);
  const opponent=round.opponent||state.works.find(work=>work.id===frontier.opponentWorkId);
  const evaluation=side==='A'?submission:opponent;
  const history=(state.history||[]).filter(item=>item.frontierId===frontier.id).reverse();
  const final=round.phase==='finalized'||round.applied;
  const hasBallot=Boolean(round.ballot);
  const result=round.result;
  const preview=scoreFor(outcome);
  const claudeScore=result?.claude??preview[0],opponentScore=result?.opponent??preview[1];
  const candidates=state.works.filter(work=>work.faction==='Claude'||work.author==='you');
  const nextLabel=result?.outcome==='opponent'?'탈환전 준비하기':result?.outcome==='claude'?'다음 접경전 열기':'같은 과제에 다시 도전';
  const canReview=Boolean(submission&&opponent);

  function chooseEntry(id){setEntryId(id);onChooseWork?.(id);}
  function enter(){if(entryId)onTransition(s=>enterFrontier(s,entryId));}
  function nextRound(){const next=onTransition(s=>openNextRound(s));if(next){const upcoming=getRound(next);onFocus?.(upcoming?.homeCell);}}
  function focusStakes(){onFocus?.(round.homeCell);}

  return <section className="fp-panel" aria-label="접경전 참여">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/>작품으로 돌아가기</button>
    <div className="fp-frontiers" aria-label="과제별 접경전 선택">
      {state.frontiers.map(item=>{
        const itemRound=state.rounds[item.id];
        return <button key={item.id} className="fp-frontier-option" aria-pressed={item.id===frontier.id} onClick={()=>onSelectFrontier(item.id)}>
          <span><strong>{item.title}</strong><small>Claude × {(TEAMS[item.opponentTeam]||TEAMS[1]).name}</small></span>
          <em>{phaseNames[itemRound?.phase]||'준비 중'}</em><ArrowRight size={15}/>
        </button>;
      })}
    </div>

    <div className="fp-round-heading"><span className="eyebrow">ROUND {round.number} · 로컬 모의 경기</span><span>{phaseNames[round.phase]||round.phase}</span></div>
    <h2 className="fp-title">{frontier.title}</h2>
    <p className="fp-brief">{frontier.brief}</p>
    {frontier.criteria?.length>0&&<div className="fp-criteria"><span>이번 과제의 평가 기준</span><ul>{frontier.criteria.map((criterion,index)=><li key={index}>{criterion}</li>)}</ul></div>}
    <button className="fp-stakes" onClick={focusStakes} aria-label="이번 경기의 접경 영역 보기">
      <span><i style={{background:TEAMS[0].color}}/><strong>Claude</strong><small>우리의 1칸</small></span>
      <em>×</em>
      <span><i style={{background:opponentTeam.color}}/><strong>{opponentTeam.name}</strong><small>상대의 1칸</small></span>
      <ArrowUpRight size={17}/>
    </button>

    {!submission&&<>
      <div className="fp-section-label"><span className="eyebrow">출전할 작품</span><small>제작자 시점</small></div>
      {entry?<>
        <img className="fp-entry-cover" src={entry.cover} alt={`${entry.title} 출전 후보 표지`}/>
        <div className="fp-entry-heading"><h3>{entry.title}</h3><span>{version(entry)}</span></div>
        <p className="fp-author">{entry.author} · {entry.creationAI||entry.ai} · 제작자 신고</p>
        {latestNote(entry)&&<p className="fp-change-note">이번 버전 · {latestNote(entry)}</p>}
      </>:<div className="fp-empty"><p>이번 차례에 출전할 수 있는 작품이 없습니다. 과제에 맞는 작품을 등록하거나 아래 후보의 제한 사유를 확인하세요.</p>{onRegister&&<button className="primary full" onClick={()=>onRegister(frontier.kinds[0])}><Plus size={17}/>이 과제의 작품 올리기 <ArrowRight size={17}/></button>}</div>}
      <label className="fp-entry-picker">출전 후보 선택
        <select value={entryId} onChange={event=>chooseEntry(event.target.value)} disabled={!eligible.length}>
          {!eligible.length&&<option value="">출전 가능한 작품 없음</option>}
          {candidates.map(work=>{
            const eligibility=getEligibility(state,work.id);
            return <option key={work.id} value={work.id} disabled={!eligibility.eligible}>{work.title} · {version(work)}{eligibility.eligible?'':` — ${eligibility.reason}`}</option>;
          })}
        </select>
      </label>
      <details className="fp-candidate-details"><summary>후보별 출전 조건과 순서</summary>
        <div className="fp-candidate-list">{candidates.map(work=>{
          const eligibility=getEligibility(state,work.id);
          return <div key={work.id}><strong>{work.title} <small>{version(work)}</small></strong><span>{eligibility.eligible?'이번 차례 출전 가능':eligibility.reason}</span><small>완료 출전 {eligibility.appearances??0}회{Number.isFinite(eligibility.minAppearances)?` · 우선 기준 ${eligibility.minAppearances}회`:''}</small></div>;
        })}</div>
      </details>
      <button className="primary full" disabled={!entry||!getEligibility(state,entry.id).eligible} onClick={enter}><Flag size={17}/>이 버전으로 출전하기 <ArrowRight size={17}/></button>
      {entry&&<button className="text-link fp-revise" onClick={()=>onRevise(entry)}><PencilSimple size={15}/>출전 전에 새 버전 만들기</button>}
      <p className="fine-print">제출하면 작품·표지·버전이 고정됩니다. 같은 제작자의 반복 출전보다 완료 출전이 적은 제작자의 차례를 우선합니다.</p>
    </>}

    {canReview&&!hasBallot&&!final&&<>
      <div className="fp-submission"><Check size={17}/><div><strong>{submission.title} · {version(submission)}</strong><span>출전 버전 고정{latestSubmission?.version>submission.version?` · 전시 최신 ${version(latestSubmission)}와 별개`:''}</span></div></div>
      <div className="fp-section-label"><span className="eyebrow">두 작품을 체험하고 비교</span><small>별도의 평가자 시점</small></div>
      <div className="fp-side-tabs" aria-label="평가할 작품">
        {['A','B'].map(item=><button key={item} aria-pressed={side===item} onClick={()=>setSide(item)}><span>작품 {item}</span><small>{round.trialed[item]?'체험 완료':'체험 전'}</small></button>)}
      </div>
      {evaluation&&<><img className="fp-entry-cover" src={evaluation.cover} alt={`평가 작품 ${side} 표지`}/><div className="fp-evaluation-title"><strong>{evaluation.title}</strong><span>{version(evaluation)}</span></div><button className="primary full" onClick={()=>onExperience(evaluation,side)}><Play size={16} weight="fill"/>작품 {side} 체험하기 <ArrowUpRight size={17}/></button></>}
      <fieldset className="fp-ballots"><legend>어느 작품이 과제를 더 잘 해결했나요?</legend>{Object.entries(choiceNames).map(([value,label])=><label key={value}><input type="radio" name={`frontier-ballot-${round.id}`} checked={choice===value} onChange={()=>setChoice(value)}/>{label}</label>)}</fieldset>
      <label className="fp-note">좋았던 점 또는 개선할 점 <span>선택 · 500자 이내</span><textarea value={note} maxLength={500} rows={3} onChange={event=>setNote(event.target.value)} placeholder="제작자가 다음 버전에 반영할 수 있는 의견을 남겨주세요."/></label>
      <button className="primary full" disabled={!(round.trialed.A&&round.trialed.B&&choice)} onClick={()=>onTransition(s=>submitFrontierBallot(s,choice,{note}))}>평가 제출 <ArrowRight size={17}/></button>
      <p className="fine-print">양쪽 작품을 체험한 뒤 평가합니다. 실제 서비스의 자기 작품 평가는 제외되며, 여기서는 별도 평가자의 흐름을 시연합니다.</p>
    </>}

    {(hasBallot||final)&&<>
      <div className="fp-submission"><Check size={17}/><div><strong>{final?'집계·검토 후 결과 확정':'내 평가 접수 완료'}</strong><span>{final?'월드에 경기 기록이 남았습니다.':'이번 평가 접수로는 영토가 바뀌지 않았습니다.'}</span></div></div>
      <h3 className="fp-result-title">{final?(result?.territoryChanged?'경계가 바뀌었습니다.':'이번 경계는 그대로입니다.'):'평가가 모이면, 월드가 바뀝니다.'}</h3>
      <label className="fp-scenario">가상 집계 결과<select disabled={final} value={result?.outcome||outcome} onChange={event=>setOutcome(event.target.value)}><option value="claude">Claude 승리</option><option value="opponent">{opponentTeam.name} 승리</option><option value="tie">동률</option><option value="insufficient">평가 부족</option></select></label>
      <div className="fp-score"><strong>{claudeScore} : {opponentScore}</strong><span>Claude : {opponentTeam.name}<br/>가상 평가 수 · 최소 {result?.quorum??12}개</span></div>
      {final?<>
        <div className="fp-territory-result"><strong>{result?.outcome==='claude'?`Claude +1 / ${opponentTeam.name} −1`:result?.outcome==='opponent'?`Claude −1 / ${opponentTeam.name} +1`:'영토 변동 없음'}</strong><p>작품 표지·원작자·제작 이력은 유지됩니다.</p></div>
        {result?.feedback&&<div className="fp-feedback"><span className="eyebrow">다음 버전으로 이어지는 피드백</span><p>{result.feedback}</p></div>}
        {round.ballot?.note&&<div className="fp-jury-note"><span>평가자가 남긴 의견</span><p>{round.ballot.note}</p></div>}
        <div className="fp-frozen-work"><span>이번 출품작</span><strong>{submission?.title} · {version(submission)}</strong>{latestSubmission?.version>submission?.version&&<small>전시 최신 버전은 {version(latestSubmission)}</small>}</div>
        <button className="primary full" onClick={nextRound}>{nextLabel} <ArrowRight size={17}/></button>
        {latestSubmission&&<button className="text-link fp-revise" onClick={()=>onRevise(latestSubmission)}><PencilSimple size={15}/>피드백 반영한 새 버전 만들기</button>}
        <button className="text-link fp-map-link" onClick={()=>onFocus?.(result?.changedCell??round.homeCell)}>결과가 반영된 접경지 보기 <ArrowUpRight size={16}/></button>
        <p className="fine-print">다음 경기는 현재 점유와 실제 인접 관계에서 접경지를 다시 정합니다.</p>
      </>:<><button className="primary full" onClick={()=>{const next=onTransition(s=>finalizeFrontier(s,outcome));if(next)onFocus?.(getRound(next)?.result?.changedCell??round.homeCell);}}>집계·검토 완료 → 결과 확정 <ArrowRight size={17}/></button><p className="fine-print">내 한 표가 즉시 땅을 바꾸지 않습니다. 이 화면은 가상 집계의 확정 과정을 보여줍니다. 동률·평가 부족에서는 영토를 유지합니다.</p></>}
    </>}

    {history.length>0&&<details className="fp-history"><summary>이 접경전의 지난 기록 <span>{history.length}</span></summary>{history.map(item=><div key={item.roundId}><strong>ROUND {item.number} · {item.result?.outcome==='claude'?'Claude 승리':item.result?.outcome==='opponent'?`${opponentTeam.name} 승리`:item.result?.outcome==='tie'?'동률':'평가 부족'}</strong><span>{item.submission?.title} · {version(item.submission)}</span>{item.feedback&&<p>{item.feedback}</p>}</div>)}</details>}
  </section>;
}
