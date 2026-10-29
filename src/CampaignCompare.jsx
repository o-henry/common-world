import {ArrowRight, ArrowUpRight, Check, MapPin, Plus} from '@phosphor-icons/react';
import {TEAMS} from './world.js';
import './campaign.css';

const teamIndex = value => typeof value === 'number' ? value : TEAMS.findIndex(team => team.name === value);
const teamName = value => TEAMS[teamIndex(value)]?.name || '진영 미확인';
const plot = value => Number.isInteger(value) ? `#${value}` : '위치 미확인';

function availableWorks(state, team, offer) {
  const kinds = offer.kinds || ['game'];
  return (state.works || []).filter(work => work.registered && work.artifact
    && teamIndex(work.faction) === teamIndex(team) && kinds.includes(work.kind));
}

function RoutePreview({label, preview, currentCell}) {
  const next = preview?.offers || [];
  return <div className="campaign-route">
    <dt>{label}</dt>
    <dd><span className="campaign-route-anchor">{plot(preview?.anchorCell)}에서 {next.length ? '다음 접경' : '접경 없음'}</span>
      {next.length ? <ul>{next.map(offer => <li key={offer.id}>
        <span>{teamName(offer.opponentTeam)}</span><span>{plot(offer.homeCell)}<ArrowRight size={10} aria-hidden="true"/>{plot(offer.targetCell)}</span>
      </li>)}</ul> : <span className="campaign-route-empty">이 위치 주변에는 도전할 경계가 없습니다.</span>}
      {preview?.anchorCell === currentCell && <span className="campaign-route-stay">현재 위치 유지</span>}
    </dd>
  </div>;
}

function WorkPreview({state, offer}) {
  if (!offer) return null;
  return <div className="campaign-work-pair" aria-label="현재 준비된 출품 후보">
    {[offer.homeTeam, offer.opponentTeam].map((team, index) => {
      const works = availableWorks(state, team, offer), work = works[0];
      return <div className="campaign-work" key={`${team}-${index}`}>
        {work ? <img src={work.cover} alt={`${work.title} 표지`}/> : <div className="campaign-work-empty"><Plus size={19}/></div>}
        <span><i style={{background:TEAMS[teamIndex(team)]?.color}}/>{teamName(team)}<small>{works.length ? `${works.length}개 출품 후보` : '출품을 기다립니다'}</small></span>
      </div>;
    })}
  </div>;
}

/** The parent owns all selection, submission and result transitions. */
export function CampaignCompare({state, offers = [], selectedOfferId, onSelect, onEnter, onFocus, onRegister, onResume, onReviewLast}) {
  const campaign = state.campaign || {}, current = campaign.current;
  const round = current ? state.rounds?.[current.frontierId] : null;
  const frontier = current ? state.frontiers?.find(item => item.id === current.frontierId) : null;
  const locked = Boolean(round && !round.applied && Object.values(round.submissions || {}).some(Boolean));
  const selectedId = selectedOfferId ?? current?.offerId;
  const selected = offers.find(offer => offer.id === selectedId);
  const latest = state.history?.at(-1);
  const resultAfter = Boolean(round?.applied);
  const heading = locked ? '이 접경에서 승부 중' : latest ? '달라진 경계, 다음 승부' : '어느 접경에 출전할까';

  return <section className="campaign-compare" aria-label="접경 비교와 출전">
    <div className="competition-kicker"><span className="eyebrow">{teamName(campaign.team ?? 0)}의 다음 선택</span><span>로컬 연습 · TURN {campaign.turn ?? 1}</span></div>
    <h2 className="campaign-title">{heading}</h2>

    {latest && <div className="campaign-last-result" aria-label="직전 경기 결과">
      <span className="campaign-last-label">직전 판정</span>
      <p>{latest.result.reason}</p>
      <div><span>{latest.result.territoryChanged ? `${plot(latest.result.changedCell)} · ${teamName(latest.result.winnerTeam)} 점유` : '영토 변화 없음'}</span>
        <button className="text-link" onClick={() => onReviewLast(latest)}>판정 근거<ArrowUpRight size={13}/></button></div>
    </div>}

    {locked ? <div className="campaign-current" role="status">
      <div className="campaign-current-label"><span>{round.submissions?.A && round.submissions?.B ? '비교 평가' : '양측 출품 모집'}</span><span>{Object.values(round.submissions || {}).filter(Boolean).length}/2 출품</span></div>
      <h3>{frontier?.title || '선택한 접경'}</h3>
      <p>{frontier?.brief}</p>
      <div className="campaign-current-stakes">{plot(round.homeCell)}<ArrowRight size={14} aria-hidden="true"/>{plot(round.targetCell)}<span>양측 한 칸</span></div>
      <p className="campaign-muted">첫 출품이 고정되어 이번 판정 전에는 다른 접경으로 옮길 수 없습니다.</p>
      <button className="primary full" onClick={onResume}>현재 경기로 돌아가기<ArrowRight size={17}/></button>
    </div> : <>
      <p className="campaign-intro">{offers.length > 1 ? '과제와 승패 뒤의 경계를 비교해 한 곳을 고르세요.' : offers.length === 1 ? '지금 이 위치에서 도전할 수 있는 접경은 한 곳입니다.' : '지금 이 위치 주변에는 도전할 접경이 없습니다.'}</p>
      <WorkPreview state={state} offer={selected || offers[0]}/>
      <div className="campaign-options" aria-label="도전 가능한 접경">
        {offers.map((offer, index) => {
          const picked = offer.id === selected?.id;
          return <article className={`campaign-option${picked ? ' is-selected' : ''}`} key={offer.id} aria-label={offer.title}>
            <div className="campaign-option-heading"><span className="campaign-option-number">0{index + 1}</span>
              <h3>{offer.title}</h3><span className="campaign-opponent"><i style={{background:TEAMS[teamIndex(offer.opponentTeam)]?.color}}/>{teamName(offer.opponentTeam)}</span></div>
            <p className="campaign-brief">{offer.brief}</p>
            <div className="campaign-stakes"><span>우리 {plot(offer.homeCell)}</span><ArrowRight size={13} aria-hidden="true"/><span>상대 {plot(offer.targetCell)}</span><span className="campaign-stake-unit">양측 한 칸</span></div>
            <ul className="campaign-criteria">{offer.criteria.map(criterion => <li key={criterion}>{criterion}</li>)}</ul>
            <dl className="campaign-routes">
              <RoutePreview label="이기면" preview={offer.win} currentCell={campaign.anchorCell}/>
              <RoutePreview label="지면" preview={offer.loss} currentCell={campaign.anchorCell}/>
            </dl>
            <div className="campaign-option-actions">
              <button className="campaign-select" aria-pressed={picked} aria-label={`${offer.title} 선택`} onClick={() => onSelect(offer.id)}>{picked ? <><Check size={14}/>선택한 접경</> : <>이 접경 선택<ArrowRight size={14}/></>}</button>
              <button className="text-link campaign-location" aria-label={`${offer.title} 지도에서 위치 보기`} onClick={() => onFocus(offer)}><MapPin size={13}/>지도에서 위치 보기</button>
            </div>
          </article>;
        })}
      </div>
      {!offers.length && <div className="campaign-empty"><MapPin size={23}/><p>새 땅을 자동으로 지급하지 않습니다.<br/>남아 있는 작품과 지난 판정은 계속 볼 수 있습니다.</p></div>}
      {offers.length > 0 && <div className="campaign-entry">
        <button className="primary full" disabled={!selected} onClick={onEnter}>선택한 접경에 출전<ArrowRight size={17}/></button>
        <p role="status">{selected ? `${selected.title} · ${plot(selected.homeCell)} → ${plot(selected.targetCell)}` : '먼저 접경 하나를 선택하세요.'}</p>
      </div>}
      {resultAfter && !offers.length && <button className="primary full" onClick={onResume}>마지막 판정과 작품 보기<ArrowRight size={17}/></button>}
    </>}

    <div className="campaign-footnotes"><button className="text-link" onClick={onRegister}><Plus size={14}/>새 결과물 등록</button>
      <p>한 번에 한 접경 · 경기 조건은 양측 동일<br/>영토가 바뀌어도 작품과 원작자의 권리는 유지됩니다.</p>
      <p className="competition-reference-note">기본 두 게임은 같은 Codex 세션의 참고 구현입니다. 진영 배치는 연습용이며 실제 AI 성능 자료가 아닙니다.</p>
    </div>
  </section>;
}
