import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Flag, Plus, Play} from '@phosphor-icons/react';
import {TEAMS} from './world.js';
import {NeighborhoodAtlas} from './NeighborhoodAtlas.jsx';
import {CampaignCompare} from './CampaignCompare.jsx';
import {createCampaign, getCampaignOffers, chooseCampaignOffer, syncCampaignAfterTransition, guardCampaignEntry} from './campaign-model.js';
import {CompetitionPanel} from './CompetitionPanel.jsx';
import {ArtifactPlayer, CompetitionModal} from './ArtifactPlayer.jsx';
import {createReferenceCompetition, competitionWorld} from './competition-seed.js';
import {getCompetitionRound, selectCompetition, registerCreation, reviseCreation,
  recordCompetitionTrial, competitionStats} from './competition-model.js';
import {loadCampaign, saveCampaign, CAMPAIGN_KEY} from './campaign-storage.js';
import {validateArtifactSource, hashArtifactSource} from './artifact-runtime.js';
import './competition-home.css';
import './campaign.css';

const getStorage = () => {try {return window.localStorage;} catch {return null;}};
const teamId = value => typeof value === 'number' ? value : TEAMS.findIndex(team => team.name === value);
const emptyForm = () => ({title:'', faction:0, creationAI:'', agent:'', modelVersion:'', humanContribution:'', conditions:'',
  rights:false, artifact:null, cover:'/assets/lumen-hop-cover.png', note:''});
const readFile = (file, mode = 'text') => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
  if (mode === 'data') reader.readAsDataURL(file); else reader.readAsText(file, 'utf-8');
});

export function CampaignApp() {
  const [loaded, setLoaded] = useState(null), [loadError, setLoadError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    createReferenceCompetition().then(base => {
      if (active) {const campaignBase=createCampaign(base); setLoaded({...loadCampaign(getStorage(), () => campaignBase), base:campaignBase}); setLoadError('');}
    }).catch(error => {if (active) setLoadError(error.message);});
    return () => {active = false;};
  }, [attempt]);
  if (!loaded) return <div className="competition-loading"><span className="wordmark">COMMON</span><p role="status">{loadError || '플레이 가능한 참고 결과물을 준비하고 있습니다.'}</p>
    {loadError && <button className="primary" onClick={() => setAttempt(value => value + 1)}>다시 연결하기</button>}</div>;
  return <CampaignSession loaded={loaded}/>;
}

function CampaignSession({loaded}) {
  const [state, setState] = useState(loaded.state), current = useRef(loaded.state);
  current.current = state;
  const [view, setView] = useState('home'), [selectedId, setSelectedId] = useState(state.works[0]?.id);
  const [actorId, setActorId] = useState('platform-reference'), [focus, setFocus] = useState(null);
  const [modal, setModal] = useState(null), [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(''), [notice, setNotice] = useState(loaded.message || '');
  const [storageBlocked, setStorageBlocked] = useState(loaded.blocked), [saving, setSaving] = useState(false);
  const [storageMessage, setStorageMessage] = useState(loaded.blocked ? loaded.message : '');
  const [previewStakes,setPreviewStakes]=useState([]);
  const [atlasEpoch,setAtlasEpoch]=useState(0);
  const evaluatorId = 'local-reviewer';
  const formSession = useRef(0), artifactRequest = useRef(0), coverRequest = useRef(0);
  const round = getCompetitionRound(state), frontier = state.frontiers.find(item => item.id === state.activeFrontierId);
  const selected = state.works.find(work => work.id === selectedId) || state.works[0];
  const counts = TEAMS.map((_, id) => state.owners.filter(owner => owner === id).length);
  const before = TEAMS.map((_, id) => state.initialOwners.filter(owner => owner === id).length);
  useEffect(() => {
    if (!storageBlocked) setStorageMessage(saveCampaign(getStorage(), state).message || '');
  }, [state, storageBlocked]);

  function transition(operation) {
    try {const next = syncCampaignAfterTransition(current.current, operation(current.current)); current.current = next; setState(next); setError(''); return next;}
    catch (problem) {setError(problem.message); return null;}
  }
  function enter(id = state.activeFrontierId) {
    const next = transition(previous => {guardCampaignEntry(previous, id); return selectCompetition(previous, id);});
    if (next) {setPreviewStakes([]);setView('match'); setFocus({cell:getCompetitionRound(next).homeCell});}
  }
  function choose(id) {setSelectedId(id); setView('work'); setError('');}
  function closeModal() {formSession.current++; artifactRequest.current++; coverRequest.current++; setSaving(false); setModal(null);}
  function prepareRegister(side) {
    formSession.current++; artifactRequest.current++; coverRequest.current++; setSaving(false);
    const faction = side === 'B' ? teamId(frontier.opponentTeam) : teamId(frontier.homeTeam ?? 0);
    setForm({...emptyForm(), faction}); setError(''); setModal({type:'register'});
  }
  function edit(work) {
    formSession.current++; artifactRequest.current++; coverRequest.current++; setSaving(false);
    setForm({...emptyForm(), ...work, faction:teamId(work.faction), note:'', rights:true});
    setError(''); setModal({type:'revise', work});
  }
  async function uploadHtml(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const request = ++artifactRequest.current, session = formSession.current;
    setForm(previous => ({...previous, artifact:null})); setSaving(false);
    if (!/\.html?$/i.test(file.name) || file.size > 256*1024) {setError('단일 HTML 파일, 최대 256KiB를 선택하세요.'); return;}
    setSaving(true);
    try {
      const source = validateArtifactSource(await readFile(file));
      const sha256 = await hashArtifactSource(source);
      if (request !== artifactRequest.current || session !== formSession.current) return;
      setForm(previous => ({...previous, artifact:{format:'html', source, sha256, sourceKind:'user-upload'}})); setError('');
    } catch (problem) {if (request === artifactRequest.current && session === formSession.current) setError(problem.message);} finally {if (request === artifactRequest.current && session === formSession.current) setSaving(false);}
  }
  async function uploadCover(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const request = ++coverRequest.current, session = formSession.current;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5*1024*1024) {setError('PNG·JPEG·WebP 표지, 최대 5MB를 선택하세요.'); return;}
    try {
      const cover = await readFile(file, 'data'), image = new Image(); image.src = cover; await image.decode();
      if (image.width > 8192 || image.height > 8192) throw new Error('표지 한 변은 8,192px 이하여야 합니다.');
      if (request !== coverRequest.current || session !== formSession.current) return;
      setForm(previous => ({...previous, cover})); setError('');
    } catch (problem) {if (request === coverRequest.current && session === formSession.current) setError(problem.message || '표지를 열지 못했습니다.');}
  }
  function storeCreation(event) {
    event.preventDefault();
    const revision = modal.type === 'revise';
    const values = {...form, faction:TEAMS[form.faction].name, kind:'game', author:revision ? modal.work.author : 'you',
      creatorId:revision ? modal.work.creatorId : 'user-local', creationAI:form.creationAI.trim() || '미신고',
      provenance:'self-reported', copyrightConfirmed:form.rights, description:form.conditions};
    const next = transition(previous => revision
      ? reviseCreation(previous, modal.work.id, {...values, changeNote:form.note}, actorId)
      : registerCreation(previous, values, 'user-local'));
    if (next) {
      const work = revision ? next.works.find(item => item.id === modal.work.id) : next.works.find(item => item.id === next.selectedWorkId) || next.works.at(-1);
      setActorId(work.creatorId); setSelectedId(work.id); closeModal(); setFocus({cell:work.cellId});
      setNotice(revision ? '개선 버전을 등록했습니다. 이전 제출 버전은 유지됩니다.' : '자기 진영의 빈 자리에 등록했습니다. 제작 AI 정보는 신고 상태입니다.');
    }
  }
  function openPlayer(work, context = {}) {setModal({type:'play', work, ...context}); setError('');}
  function completePlayer() {
    if (modal.side) {
      const next = transition(previous => {
        if (previous.activeFrontierId !== modal.frontierId || getCompetitionRound(previous).id !== modal.roundId) throw new Error('현재 경기와 다른 체험입니다. 경기에서 다시 열어주세요.');
        return recordCompetitionTrial(previous, modal.side, evaluatorId);
      });
      if (!next) return;
    }
    setModal(null); setNotice('직접 체험 완료를 기록했습니다. 기능 확인과 선호 평가는 별도로 남겨주세요.');
  }
  function reset() {
    try {
      getStorage()?.removeItem(CAMPAIGN_KEY); setState(loaded.base); current.current = loaded.base;
      setPreviewStakes([]);setFocus(null);setActorId('platform-reference');setAtlasEpoch(value=>value+1);
      setStorageBlocked(false); setStorageMessage(''); setView('home'); setSelectedId(loaded.base.works[0].id); setModal(null); setNotice('이 버전의 연습 기록만 초기화했습니다. v007과 이전 버전 기록은 유지됩니다.');
    } catch {setError('브라우저 저장 기록을 초기화하지 못했습니다.');}
  }
  const statistics = competitionStats(state);
  const offers=useMemo(()=>getCampaignOffers(state),[state]);
  const campaignCurrent=state.campaign.current;
  const hasAnchor=Number.isInteger(state.campaign.anchorCell);
  const routeStatus=!hasAnchor ? '도전 가능한 아군 경계가 남아 있지 않습니다.' : state.campaign.log.at(-1)?.outcome==='A' ? '획득한 땅 주변으로 전진했습니다.' : state.campaign.log.at(-1)?.outcome==='B' ? '남은 아군 경계에서 다음 도전을 준비합니다.' : '경계를 유지한 채 다음 도전을 준비합니다.';
  const selectedOfferId=campaignCurrent && !state.rounds[campaignCurrent.frontierId]?.applied ? campaignCurrent.offerId : null;
    function compareOffer(id) {
    const next=transition(previous=>chooseCampaignOffer(previous,id));
    if(next) {setPreviewStakes([]);setView('home'); const item=getCompetitionRound(next); setFocus({cell:item.homeCell}); setNotice('접경을 선택했습니다. 출전하면 양쪽 제출 버전이 고정됩니다.');}
  }
  function focusOffer(offer) {setFocus({cell:offer.homeCell}); setPreviewStakes([offer.homeCell,offer.targetCell]);}
  function compareNext() {setView('home');setPreviewStakes([]);if(Number.isInteger(state.campaign.anchorCell))setFocus({cell:state.campaign.anchorCell});}

  return <div className="app-shell competition-app">
    <header className="site-header"><button className="wordmark" onClick={() => setView('home')}>COMMON</button>
      <nav aria-label="주 메뉴">{[['home','전황'],['match','접경전'],['studio','내 작품']].map(([id,label]) =>
        <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => id === 'match' ? (campaignCurrent ? enter(campaignCurrent.frontierId) : setView('home')) : setView(id)}>{label}</button>)}</nav>
      <div className="header-actions"><span className="prototype-label">LOCAL PRACTICE</span><button className="primary add" onClick={() => prepareRegister()}><Plus size={18}/>결과물 출품</button></div>
    </header>
    <div className="competition-scope"><span>Claude 진영의 국지전 · 두 접경 중 한 곳에 출전 · 로컬 연습</span><label>제작자 역할<select aria-label="제작자 역할" value={actorId} onChange={event => setActorId(event.target.value)}><option value="platform-reference">참고 구현 제작자</option><option value="user-local">내 출품작 제작자</option></select></label></div>
    <main className="world-layout atlas-layout competition-layout">
      <section className="world-panel" aria-label="AI 경쟁 월드"><div className="world-heading"><h1>월드 전황</h1><span>LOCAL SEASON</span></div>
        <NeighborhoodAtlas key={atlasEpoch} world={competitionWorld} state={state} selected={selected} onSelect={choose} visibleFrontierIds={campaignCurrent ? [campaignCurrent.frontierId] : []}
          onEmpty={cell => setNotice(`${TEAMS[state.owners[cell]]?.name || '미점유'} · 전시된 작품이 없는 자리입니다.`)}
          onError={problem => setNotice(problem.message)} focus={focus} frontier={previewStakes.length ? previewStakes : campaignCurrent ? [round.homeCell,round.targetCell] : []} onSelectFrontier={enter}/>
        <div className="faction-legend" aria-label="진영별 영토">{TEAMS.map((team,id) => <div key={team.name}><i style={{background:team.color}}/><span>{team.name}</span><b>{counts[id]}<small>{counts[id] === before[id] ? '' : ` ${counts[id] > before[id] ? '+' : '−'}${Math.abs(counts[id] - before[id])}`}</small></b></div>)}</div>
        <section className="competition-standings" aria-label="로컬 진영 기록"><div className="competition-section-heading"><h2>이곳에서 쌓인 전적</h2><span>연습 기록 · AI 전체 성능 순위 아님</span></div>
          <table><thead><tr><th>진영</th><th>경기</th><th>승</th><th>패</th><th>최근 결과</th></tr></thead><tbody>{TEAMS.map((team,id) => {
            const item = statistics.factions.find(row => row.id === id);
            const losses = state.history.filter(record => [record.homeTeam,record.opponentTeam].includes(id) && record.result.winnerTeam !== null && record.result.winnerTeam !== id).length;
            return <tr key={team.name}><th><i style={{background:team.color}}/>{team.name}</th><td>{item?.played ?? item?.matches ?? 0}</td><td>{item?.wins ?? 0}</td><td>{losses}</td><td>{(item?.played ?? item?.matches ?? 0) ? '판정 기록 확인' : '미집계'}</td></tr>;
          })}</tbody></table>
        </section>
        <label className="work-picker">작품 바로 선택<select value={selected.id} onChange={event => {choose(event.target.value); setFocus({cell:state.works.find(work => work.id === event.target.value).cellId});}}>{state.works.map(work => <option key={work.id} value={work.id}>{work.title} · {work.author}</option>)}</select></label>
      </section>
      <aside className="inspector" aria-label="대결과 작품 상세">
        {view === 'home' && <CampaignCompare state={state} offers={offers} selectedOfferId={selectedOfferId} onSelect={compareOffer} onEnter={()=>enter()} onFocus={focusOffer} onRegister={()=>prepareRegister()} onResume={()=>enter()} onReviewLast={()=>setModal({type:'record',record:state.history.at(-1)})}/>}
        {view === 'match' && campaignCurrent && <CompetitionPanel campaignMode onNextChallenge={compareNext} nextChallengeSummary={<div className="campaign-after-result"><strong>{routeStatus}</strong><p>{hasAnchor ? `현재 실제 경계에서 도전 가능한 접경 ${offers.length}곳 · 기준 칸 #${state.campaign.anchorCell}` : '전시 작품과 지난 판정은 계속 볼 수 있습니다.'}</p></div>} state={state} selectedId={selected.id} actorId={actorId} evaluatorId={evaluatorId}
          onTransition={transition} onSelectWork={setSelectedId} onPlay={openPlayer} onEdit={edit} onRegister={prepareRegister}
          onBack={()=>{setPreviewStakes([]);setView('home');}} onSelectFrontier={enter} onFocus={cell => setFocus({cell})}/>}
        {view === 'work' && <section><button className="back-link" onClick={() => setView('home')}><ArrowLeft size={15}/>전황으로</button><span className="eyebrow">선택한 결과물</span><h2 className="work-title">{selected.title}<span className="version-tag">v{selected.version}</span></h2>
          <div className="byline">by <strong>{selected.author}</strong></div><img className="work-cover competition-selected-cover" src={selected.cover} alt={`${selected.title} 표지`}/>
          <button className="primary full" onClick={() => openPlayer(selected)}><Play size={17}/>실행 결과 직접 보기 <ArrowUpRight size={17}/></button>
          <dl className="work-meta">{[['출전 진영',selected.faction],['제작 AI 신고',selected.creationAI],['제작 에이전트',selected.agent || '미신고'],['모델 버전',selected.modelVersion || '미신고'],['출처 상태',selected.artifact.sourceKind === 'platform-reference' ? '같은 Codex 세션의 참고 구현' : '제작자 신고 · 독립 검증 전'],['사람 개입',selected.humanContribution || '미신고'],['제출 식별',selected.artifact.sha256.slice(0,12)]].map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
          {selected.creatorId === actorId && <button className="text-link" onClick={() => edit(selected)}>새 버전과 수정 내용 등록 <ArrowRight size={16}/></button>}
          <button className="text-link" onClick={()=>setView('home')}>이 결과물로 도전할 접경 비교 <Flag size={16}/></button>
        </section>}
        {view === 'studio' && <section><span className="eyebrow">내 AI의 출품작</span><h2 className="section-title">다음 승부를<br/>준비하는 곳.</h2><p className="lede">내가 등록한 파일과 버전입니다. 제출된 경기 버전은 따로 유지됩니다.</p>
          {state.works.filter(work => work.creatorId === 'user-local').map(work => <button className="studio-work" key={work.id} onClick={() => choose(work.id)}><img src={work.cover} alt=""/><span>{work.title}<small>{work.faction} · {work.agent || '에이전트 미신고'} · v{work.version}</small></span><ArrowUpRight size={17}/></button>)}
          {!state.works.some(work => work.creatorId === 'user-local') && <div className="empty-state"><p>아직 등록한 결과물이 없습니다.</p><button className="primary" onClick={() => prepareRegister()}><Plus size={17}/>첫 HTML 결과물 등록</button></div>}
          {state.history.length > 0 && <div className="studio-record"><h3>판정과 재대결 기록</h3>{[...state.history].reverse().map(record => <button className="history-row" key={record.roundId} onClick={()=>setModal({type:'record',record})}><strong>ROUND {record.number} · {record.result.reason}</strong><span>{record.result.valid}건 평가 · {record.result.territoryChanged ? '인접 1칸 이전' : '경계 유지'}</span></button>)}</div>}
        </section>}
        {error && <p className="error" role="alert">{error}</p>}
      </aside>
    </main>
    <footer className="local-note" aria-live="polite"><span>{storageMessage || notice || '실제 사람·AI 사용 인증과 다중 사용자 서버는 연결되지 않은 로컬 연습입니다.'}</span><button className="text-link" onClick={() => setModal({type:'reset'})}>연습 기록 초기화</button></footer>

    {modal?.type === 'play' && <ArtifactPlayer work={modal.work} side={modal.side} onClose={closeModal} onComplete={completePlayer}/>}
    {modal?.type === 'record' && modal.record && <CompetitionModal title="지난 경기 판정 근거" onClose={closeModal}><div className="record-body">
      <p>{modal.record.result.reason}</p><p>유효 평가 {modal.record.result.valid}건 · {modal.record.result.territoryChanged ? `#${modal.record.result.changedCell} 한 칸 이전` : '경계 유지'}</p>
      {['A','B'].map(side=>{const work=modal.record.submissions[side];return <section key={side}><h3>작품 {side} · {work.title} · v{work.version}</h3><p>{work.author} · 제작 AI 신고: {work.creationAI}</p><p className="fine-print">제출 파일 {work.artifact.sha256.slice(0,12)} · 이 경기의 제출 버전은 보존됩니다.</p></section>;})}
      {modal.record.ballots.map((ballot,index)=><section key={ballot.evaluatorId}><h3>평가 {index+1} · {{A:'A 선호',B:'B 선호',tie:'선호 동률',neither:'둘 다 부적합'}[ballot.choice]}</h3><p>{ballot.note || '별도 의견 없음'}</p><dl className="work-meta">{['A','B'].map(side=><div key={side}><dt>작품 {side}</dt><dd>{Object.entries(ballot.checks[side]).map(([key,value])=>`${{controls:'조작',restart:'재시작',feedback:'진행 피드백'}[key]||key}: ${{pass:'충족',fail:'미충족',unknown:'판단 보류'}[value]}`).join(' · ')}</dd></div>)}</dl></section>)}
    </div></CompetitionModal>}
    {['register','revise'].includes(modal?.type) && <CompetitionModal title={modal.type === 'revise' ? '개선 버전 등록' : 'AI 결과물 출품 준비'} onClose={closeModal}>
      <form className="upload-form competition-upload" onSubmit={storeCreation}>
        <label>작품 이름<input required maxLength={80} value={form.title} onChange={event => setForm({...form,title:event.target.value})}/></label>
        <label>출전 진영<select value={form.faction} disabled={modal.type === 'revise'} onChange={event => setForm({...form,faction:Number(event.target.value)})}>{TEAMS.map((team,id) => <option key={team.name} value={id}>{team.name}</option>)}</select></label>
        <label>제작에 사용한 AI · 신고<input maxLength={80} value={form.creationAI || ''} placeholder="출전 진영과 별도로 실제 사용한 AI를 적어주세요" onChange={event => setForm({...form,creationAI:event.target.value})}/></label>
        <div className="competition-upload-pair"><label>제작 에이전트<input maxLength={80} value={form.agent} placeholder="예: Codex, Claude Code, 직접 구성" onChange={event => setForm({...form,agent:event.target.value})}/></label><label>모델과 버전<input maxLength={120} value={form.modelVersion} placeholder="모르면 미신고" onChange={event => setForm({...form,modelVersion:event.target.value})}/></label></div>
        <label>사람이 직접 수정·선택한 부분<textarea maxLength={500} value={form.humanContribution} onChange={event => setForm({...form,humanContribution:event.target.value})}/></label>
        <label>제작 조건과 현재 한계<textarea maxLength={500} value={form.conditions} onChange={event => setForm({...form,conditions:event.target.value})}/></label>
        <label>실행할 단일 HTML · 최대 256KiB<input type="file" accept=".html,.htm,text/html" onChange={uploadHtml}/></label>
        {form.artifact && <p className="competition-artifact-ready">HTML 준비됨 · SHA-256 {form.artifact.sha256.slice(0,12)}…</p>}
        <label>작품 표지 · 선택<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadCover}/></label>
        {modal.type === 'revise' && <label>무엇을 고쳤나요?<textarea required minLength={5} maxLength={500} value={form.note} onChange={event => setForm({...form,note:event.target.value})}/></label>}
        <label className="rights-check"><input type="checkbox" checked={form.rights} onChange={event => setForm({...form,rights:event.target.checked})}/>이 결과물과 표지를 게시할 권한이 있습니다.</label>
        <p className="fine-print">AI·제작 조건은 신고 정보입니다. 소스·프롬프트를 공개 저장소에 올리지 않으며 이 브라우저에 보관합니다. 등록만으로 영토가 늘어나지 않습니다.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary full" disabled={!form.rights || !form.title.trim() || !form.artifact || saving}>{saving ? '파일 확인 중' : modal.type === 'revise' ? '개선 버전 저장' : '결과물 등록'}</button>
      </form>
    </CompetitionModal>}
    {modal?.type === 'reset' && <CompetitionModal title="이 버전의 연습 기록 초기화" onClose={closeModal}><div className="record-body"><p>현재 접경 선택·업로드·평가·영토 기록만 초기화합니다. v007과 이전 버전 기록은 보존합니다.</p><button className="primary full" onClick={reset}>이 연습 기록만 초기화</button></div></CompetitionModal>}
  </div>;
}
