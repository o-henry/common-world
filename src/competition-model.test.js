import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  createCompetition, getCompetitionRound, selectCompetition, registerCreation, reviseCreation,
  submitCreation, recordCompetitionTrial, castCompetitionBallot, finalizeCompetition,
  openCompetitionRematch, createCompetitionChallenge, competitionStats, eligibleCompetitionWorks,
  getCreationEligibility, hashArtifactSource, validateCreationArtifact, MAX_ARTIFACT_BYTES,
} from './competition-model.js';

const graph = (count,edges) => { const out=Array.from({length:count},()=>[]);for(const [a,b]of edges){out[a].push(b);out[b].push(a);}return out; };
const artifact = (text='one',sourceKind='user-upload') => {
  const source=`<!doctype html><html lang="ko"><button>${text}</button></html>`;
  return {source,sha256:createHash('sha256').update(source).digest('hex'),format:'html',sourceKind};
};
const works = () => [
  {id:'one',title:'One',author:'nari',creatorId:'alpha',faction:'Gemini',creationAI:'Claude',kind:'game',cover:'/assets/lumen-hop-cover.png',cellId:0,version:1,artifact:artifact('하나'),agent:'Codex',modelVersion:'self-reported',humanContribution:'아이디어',conditions:'로컬 연습'},
  {id:'two',title:'Two',author:'sol',creatorId:'beta',faction:'Local',creationAI:'OpenAI',kind:'game',cover:'/assets/together-cover.png',cellId:1,version:1,artifact:artifact('둘')},
];
export function competitionFixture(changes={}) {
  return createCompetition({owners:[2,5,2,5,2,5,-1,0,1,0,3,1],
    neighbors:graph(12,[[0,1],[0,2],[1,3],[2,3],[2,4],[3,5],[4,5],[5,6],[7,8],[7,9],[9,10],[10,11]]),
    works:works(),frontiers:[{id:'duel',title:'한 손 게임',brief:'조작과 재시작을 비교합니다.',homeTeam:2,opponentTeam:5,homeCell:0,targetCell:1,kinds:['game']}],
    quorum:1,practice:true,...changes});
}
const error = (fn,code) => assert.throws(fn,value=>value.code===code);
const checks = (A='pass',B='pass') => ({A:{controls:A,restart:A,feedback:A},B:{controls:B,restart:B,feedback:B}});
function submitted(state=competitionFixture()) { state=submitCreation(state,'A','one','alpha');return submitCreation(state,'B','two','beta'); }
function voted(state=submitted(),choice='A',functional=checks(),evaluatorId='jury-1') {
  state=recordCompetitionTrial(state,'A',evaluatorId);state=recordCompetitionTrial(state,'B',evaluatorId);
  return castCompetitionBallot(state,{evaluatorId,choice,checks:functional,note:'두 작품을 직접 비교한 로컬 연습 의견'});
}

test('SHA-256 matches Node crypto for UTF-8, block padding boundaries and maximum source size',()=>{
  for(const source of ['', 'abc', '한글과 emoji 🌕 🚀', '\u0000\ud800', ...[55,56,63,64,65,127,128,1024,MAX_ARTIFACT_BYTES].map(n=>'a'.repeat(n))]) {
    assert.equal(hashArtifactSource(source),createHash('sha256').update(source).digest('hex'));
  }
});
test('artifact requires exact source hash, HTML metadata and a UTF-8 byte limit',()=>{
  assert.deepEqual(validateCreationArtifact(artifact()),artifact());
  for(const bad of [{...artifact(),sha256:'a'.repeat(64)},{...artifact(),sha256:'not-a-hash'}])error(()=>validateCreationArtifact(bad),'ARTIFACT_HASH_MISMATCH');
  for(const bad of [null,{...artifact(),format:'js'},{...artifact(),sourceKind:'verified-provider'},{...artifact(),source:''}])error(()=>validateCreationArtifact(bad),'ARTIFACT_REQUIRED');
  const source='🌕'.repeat(MAX_ARTIFACT_BYTES/4+1);
  error(()=>validateCreationArtifact({...artifact(),source,sha256:hashArtifactSource(source)}),'ARTIFACT_TOO_LARGE');
  const boundary='a'.repeat(MAX_ARTIFACT_BYTES);assert.equal(validateCreationArtifact({...artifact(),source:boundary,sha256:hashArtifactSource(boundary)}).source.length,MAX_ARTIFACT_BYTES);
});
test('the league is symmetric for any two factions and leaves neutral land unclaimed',()=>{
  const input=works(),state=competitionFixture({works:input});input[0].artifact.source='changed elsewhere';
  assert.equal(state.frontiers[0].homeTeam,2);assert.equal(state.frontiers[0].opponentTeam,5);
  assert.equal(state.owners[6],-1);assert.notEqual(state.works[0].artifact.source,input[0].artifact.source);
  assert.equal(getCreationEligibility(state,'one','A','alpha').eligible,true);
  assert.equal(getCreationEligibility(state,'two','B','beta').eligible,true);
  assert.equal(getCreationEligibility(state,'one','B','alpha').eligible,false);
  assert.equal(getCreationEligibility(state,'one','A','beta').eligible,false);
  assert.deepEqual(eligibleCompetitionWorks(state,'A').map(work=>work.id),['one']);
  assert.deepEqual(eligibleCompetitionWorks(state,'B','alpha'),[]);
});
test('registration validates ownership, rights and artifacts instead of granting neutral plots',()=>{
  const state=competitionFixture(),entry={title:'새 작품',author:'new',kind:'game',faction:'Local',creationAI:'Local',rights:true,cover:'/assets/quiet-code-cover.png',artifact:artifact('upload')};
  const next=registerCreation(state,{...entry,creatorId:'forged-author'},'user-local'),work=next.works.at(-1);
  assert.equal(work.creatorId,'user-local');assert.equal(work.cellId,3);assert.equal(work.faction,'Local');assert.deepEqual(next.owners,state.owners);
  error(()=>registerCreation(state,{...entry,rights:false},'user-local'),'RIGHTS_REQUIRED');
  error(()=>registerCreation(state,{...entry,artifact:null},'user-local'),'ARTIFACT_REQUIRED');
  error(()=>registerCreation(state,{...entry,artifact:artifact('claimed reference','platform-reference')},'user-local'),'INVALID_ARTIFACT_KIND');
  error(()=>registerCreation(state,{...entry,faction:-1},'user-local'),'INVALID_FACTION');
  error(()=>registerCreation(state,{...entry,title:'x'.repeat(81)},'user-local'),'INVALID_WORK');
  let full=state;while(full.owners.some((owner,id)=>owner===5&&!full.works.some(w=>w.cellId===id)))full=registerCreation(full,entry,'user-local');
  error(()=>registerCreation(full,entry,'user-local'),'NO_VACANT_PLOT');assert.equal(full.owners[6],-1);
});
test('each creator alone may submit or revise their own source while the sealed artifact stays immutable',()=>{
  let state=competitionFixture();error(()=>submitCreation(state,'A','one','beta'),'WORK_NOT_ELIGIBLE');
  state=submitCreation(state,'A','one','alpha');assert.equal(getCompetitionRound(state).phase,'recruiting');
  const snapshot=getCompetitionRound(state).submissions.A;
  assert(Object.isFrozen(snapshot.artifact));
  const changes={changeNote:'재시작 버튼을 더 분명하게 개선했습니다.',artifact:artifact('v2'),rights:true};
  error(()=>reviseCreation(state,'one',changes,'beta'),'NOT_CREATOR');
  error(()=>reviseCreation(state,'one',{...changes,rights:false},'alpha'),'RIGHTS_REQUIRED');
  const next=reviseCreation(state,'one',changes,'alpha');
  assert.equal(next.works[0].version,2);assert.equal(snapshot.version,1);assert.equal(snapshot.artifact.source,artifact('하나').source);
  assert.equal(next.works[0].creatorId,'alpha');assert.equal(next.works[0].author,'nari');assert.equal(next.works[0].agent,'Codex');
  assert.equal(next.works[0].modelVersion,'self-reported');assert.equal(next.works[0].humanContribution,'아이디어');assert.equal(next.works[0].conditions,'로컬 연습');
  assert.equal(next.works[0].cellId,0);assert.equal(next.works[0].faction,'Gemini');
  error(()=>submitCreation(next,'A','one','alpha'),'WORK_NOT_ELIGIBLE');
});
test('same-source platform examples can occupy both sides but cannot evaluate themselves',()=>{
  const example=works().map(work=>({...work,creatorId:'platform-reference',artifact:{...work.artifact,sourceKind:'platform-reference'}}));
  let state=competitionFixture({works:example});state=submitCreation(state,'A','one','platform-reference');state=submitCreation(state,'B','two','platform-reference');
  error(()=>recordCompetitionTrial(state,'A','platform-reference'),'SELF_EVALUATION');
  error(()=>recordCompetitionTrial(state,'A','nari'),'SELF_EVALUATION');
  error(()=>recordCompetitionTrial(state,'B','sol'),'SELF_EVALUATION');
  assert.doesNotThrow(()=>voted(state,'A',checks(),'local-reviewer'));
});
test('revision updates all allowed presentation and self-reported creation metadata without rewriting ownership or sealed history',()=>{
  const original=submitted(),old=getCompetitionRound(original).submission;
  const next=reviseCreation(original,'one',{
    title:'One, revised',description:'수정한 작품 소개',agent:'Local editor',modelVersion:'declared-v2',
    humanContribution:'조작을 직접 검수하고 고쳤습니다.',conditions:'동일한 과제·로컬 환경',creationAI:'Local',
    changeNote:'첫 화면의 조작 안내와 재시작을 바꿨습니다.',artifact:artifact('새 source'),rights:true,
    creatorId:'forged',author:'someone else',faction:'Grok',cellId:6,
  },'alpha');
  const work=next.works.find(item=>item.id==='one');
  assert.equal(work.title,'One, revised');assert.equal(work.description,'수정한 작품 소개');assert.equal(work.agent,'Local editor');
  assert.equal(work.modelVersion,'declared-v2');assert.equal(work.humanContribution,'조작을 직접 검수하고 고쳤습니다.');
  assert.equal(work.conditions,'동일한 과제·로컬 환경');assert.equal(work.creationAI,'Local');assert.equal(work.ai,'Local');
  assert.equal(work.creatorId,'alpha');assert.equal(work.author,'nari');assert.equal(work.faction,'Gemini');assert.equal(work.cellId,0);
  assert.equal(work.artifact.sourceKind,'user-upload');assert.equal(work.version,2);
  assert.equal(old.title,'One');assert.equal(old.agent,'Codex');assert.equal(old.creationAI,'Claude');
  assert.equal(old.artifact.source,artifact('하나').source);assert.equal(old.version,1);
  assert.equal(getCompetitionRound(next).submission,old);
  for(const bad of [{agent:{}},{modelVersion:'x'.repeat(121)},{conditions:[]},{humanContribution:17},{title:''},{creationAI:{}}]){
    error(()=>reviseCreation(original,'one',{...bad,changeNote:'타입과 길이 검사 확인입니다.'},'alpha'),'INVALID_WORK');
  }
  const references=works().map(work=>({...work,creatorId:'platform-reference',artifact:{...work.artifact,sourceKind:'platform-reference'}}));
  const reference=reviseCreation(competitionFixture({works:references}),'one',{title:'Reference revised',changeNote:'플랫폼 예시 설명을 고쳤습니다.'},'platform-reference');
  assert.equal(reference.works[0].artifact.sourceKind,'platform-reference');
});
test('both submissions and both trials by the same evaluator are required',()=>{
  error(()=>recordCompetitionTrial(competitionFixture(),'A','jury-1'),'SUBMISSIONS_REQUIRED');
  let state=submitted();state=recordCompetitionTrial(state,'A','jury-1');state=recordCompetitionTrial(state,'B','jury-2');
  error(()=>castCompetitionBallot(state,{evaluatorId:'jury-1',choice:'A',checks:checks()}),'TRIALS_REQUIRED');
  error(()=>recordCompetitionTrial(state,'A','constructor'),'EVALUATOR_REQUIRED');
  const ready=recordCompetitionTrial(state,'B','jury-1');
  error(()=>castCompetitionBallot(ready,{evaluatorId:'jury-1',choice:'A',checks:{A:{controls:'pass'},B:{controls:'pass'}}}),'CHECKS_REQUIRED');
  error(()=>castCompetitionBallot(ready,{evaluatorId:'jury-1',choice:'bogus',checks:checks()}),'INVALID_CHOICE');
  error(()=>castCompetitionBallot(ready,{evaluatorId:'jury-1',choice:'A',checks:checks(),note:'a'.repeat(501)}),'INVALID_NOTE');
});
test('one evaluator casts once and a ballot never moves territory',()=>{
  const before=submitted(),after=voted(before);assert.deepEqual(after.owners,before.owners);assert.equal(after.history.length,0);
  assert.equal(getCompetitionRound(after).ballots.length,1);
  error(()=>castCompetitionBallot(after,{evaluatorId:'jury-1',choice:'B',checks:checks()}),'DUPLICATE_BALLOT');
  error(()=>recordCompetitionTrial(after,'B','jury-1'),'DUPLICATE_BALLOT');
});
for(const choice of ['A','B','tie','neither'])test(`real ${choice} ballot determines the result without a fictional aggregate`,()=>{
  const before=voted(submitted(),choice),next=finalizeCompetition(before),result=getCompetitionRound(next).result;
  assert.equal(result.outcome,choice);assert.equal(result.valid,1);assert.equal(result.quorum,1);assert.equal(result.counts[choice],1);
  const changed=next.owners.flatMap((owner,id)=>owner!==before.owners[id]?[id]:[]);
  assert.deepEqual(changed,choice==='A'?[1]:choice==='B'?[0]:[]);
  assert.equal(result.winnerTeam,choice==='A'?2:choice==='B'?5:null);assert.equal(next.owners[6],-1);
  assert.deepEqual(next.works,before.works);assert.equal(next.history.length,1);assert.equal(result.rightsTransferred,false);
  assert.equal(next.history[0].submission.artifact.sha256,artifact('하나').sha256);assert.equal(next.history[0].opponent.author,'sol');
  assert.equal(finalizeCompetition(next),next);assert(Object.isFrozen(result));
});
test('functional requirements gate a win separately from preference votes',()=>{
  const onlyA=finalizeCompetition(voted(submitted(),'B',checks('pass','fail')));
  assert.equal(getCompetitionRound(onlyA).result.outcome,'A');
  const neither=finalizeCompetition(voted(submitted(),'A',checks('fail','fail')));
  assert.equal(getCompetitionRound(neither).result.outcome,'neither');assert.deepEqual(neither.owners,competitionFixture().owners);
  const unknown=finalizeCompetition(voted(submitted(),'A',checks('pass','unknown')));
  assert.equal(getCompetitionRound(unknown).result.outcome,'review');assert.deepEqual(unknown.owners,competitionFixture().owners);
  let mixed=voted(submitted(),'A',checks(),'jury-1');mixed=voted(mixed,'A',checks('fail','pass'),'jury-2');
  assert.equal(getCompetitionRound(finalizeCompetition(mixed)).result.outcome,'review');
});
test('actual submitted ballots are counted and insufficient samples leave land intact',()=>{
  let state=voted(submitted(competitionFixture({quorum:3})),'A',checks(),'jury-1');
  const insufficient=finalizeCompetition(state);assert.equal(getCompetitionRound(insufficient).result.outcome,'insufficient');assert.deepEqual(insufficient.owners,state.owners);
  state=voted(state,'B',checks(),'jury-2');state=voted(state,'A',checks(),'jury-3');
  const result=getCompetitionRound(finalizeCompetition(state)).result;assert.deepEqual(result.counts,{A:2,B:1,tie:0,neither:0});assert.equal(result.valid,3);assert.equal(result.outcome,'A');
  const empty=finalizeCompetition(submitted());assert.equal(getCompetitionRound(empty).result.outcome,'insufficient');assert.equal(getCompetitionRound(empty).result.valid,0);
});
test('preference winners need a strict majority of all valid ballots, including ties and neither votes',()=>{
  const cases=[
    {choices:['A','tie','tie'],outcome:'tie',counts:{A:1,B:0,tie:2,neither:0}},
    {choices:['A','B','tie'],outcome:'tie',counts:{A:1,B:1,tie:1,neither:0}},
    {choices:['neither','neither','A'],outcome:'neither',counts:{A:1,B:0,tie:0,neither:2}},
    {choices:['A','A','A','B','tie'],outcome:'A',counts:{A:3,B:1,tie:1,neither:0}},
    {choices:['B','B','B','A','neither'],outcome:'B',counts:{A:1,B:3,tie:0,neither:1}},
    {choices:['A','A','B','tie','tie'],outcome:'tie',counts:{A:2,B:1,tie:2,neither:0}},
    {choices:['A','A','B','B'],outcome:'tie',counts:{A:2,B:2,tie:0,neither:0}},
  ];
  for(const {choices,outcome,counts}of cases){
    let state=submitted();for(const [index,choice]of choices.entries())state=voted(state,choice,checks(),`jury-${index+1}`);
    const finalized=finalizeCompetition(state),result=getCompetitionRound(finalized).result;
    assert.equal(result.outcome,outcome,choices.join('/'));assert.equal(result.valid,choices.length);assert.deepEqual(result.counts,counts);
    assert.equal(result.territoryChanged,['A','B'].includes(outcome));
    if(['A','B'].includes(outcome))assert(result.counts[outcome]>result.valid/2);
    else assert.deepEqual(finalized.owners,state.owners);
  }
});
test('custom required checks are enforced and stale stakes cannot be settled',()=>{
  const base=competitionFixture(),frontiers=base.frontiers.map(frontier=>({...frontier,checkKeys:['firstAction']}));
  const state=submitted(competitionFixture({frontiers}));
  const tested=recordCompetitionTrial(recordCompetitionTrial(state,'A','jury'),'B','jury');
  error(()=>castCompetitionBallot(tested,{evaluatorId:'jury',choice:'A',checks:checks()}),'CHECKS_REQUIRED');
  const accepted=castCompetitionBallot(tested,{evaluatorId:'jury',choice:'A',checks:{A:{firstAction:'pass'},B:{firstAction:'pass'}}});
  const stale={...accepted,owners:accepted.owners.map((owner,id)=>id===1?-1:owner)};
  error(()=>finalizeCompetition(stale),'STALE_STAKES');
});
test('a rematch follows the current two-team border and keeps prior versions and history',()=>{
  for(const choice of ['A','B','tie']){
    const finished=finalizeCompetition(voted(submitted(),choice)),next=openCompetitionRematch(finished),round=getCompetitionRound(next);
    assert.equal(round.number,2);assert.equal(next.owners[round.homeCell],2);assert.equal(next.owners[round.targetCell],5);
    assert(next.neighbors[round.homeCell].includes(round.targetCell));assert.deepEqual(next.owners,finished.owners);assert.equal(next.history,finished.history);
  }
  error(()=>openCompetitionRematch(submitted()),'ROUND_NOT_FINISHED');
  const finished=finalizeCompetition(voted());
  error(()=>openCompetitionRematch({...finished,owners:finished.owners.map(owner=>owner===5?2:owner)}),'NO_FRONTIER');
});
test('new creators get their turn symmetrically and a veteran cannot bypass priority with a new work',()=>{
  let state=openCompetitionRematch(finalizeCompetition(voted()));
  const entry={title:'New',author:'newcomer',kind:'game',faction:'Gemini',creationAI:'Local',rights:true,cover:'/assets/quiet-code-cover.png',artifact:artifact('new')};
  state=registerCreation(state,entry,'newcomer');assert.equal(getCreationEligibility(state,'one','A','alpha').eligible,false);
  assert.equal(getCreationEligibility(state,state.selectedWorkId,'A','newcomer').eligible,true);
  state=registerCreation(state,{...entry,title:'Another',author:'nari'},'alpha');assert.equal(getCreationEligibility(state,state.selectedWorkId,'A','alpha').eligible,false);
});
test('challenge creation finds a free boundary for arbitrary factions without granting land',()=>{
  const before=competitionFixture();
  const next=createCompetitionChallenge(before,{title:'반대편 도전',brief:'같은 두 진영의 새 과제',homeTeam:5,opponentTeam:2,kinds:['game']});
  const frontier=next.frontiers.at(-1),round=getCompetitionRound(next);
  assert.equal(next.owners[round.homeCell],5);assert.equal(next.owners[round.targetCell],2);
  assert(next.neighbors[round.homeCell].includes(round.targetCell));assert.deepEqual(next.owners,before.owners);assert.equal(next.frontiers.length,2);
  const reserved=submitCreation(before,'A','one','alpha');
  const free=createCompetitionChallenge(reserved,{title:'새 접경',brief:'예약한 땅을 피합니다.',homeTeam:2,opponentTeam:5,kinds:['game']});
  assert(![getCompetitionRound(free).homeCell,getCompetitionRound(free).targetCell].some(id=>[0,1].includes(id)));
  assert.equal(selectCompetition(free,'duel').activeFrontierId,'duel');
});
test('stats derive only recorded task outcomes and actual ballot sample sizes',()=>{
  const initial=competitionFixture(),before=competitionStats(initial);assert.equal(before.completed,0);assert.equal(before.ballots,0);
  const next=finalizeCompetition(voted()),stats=competitionStats(next);
  assert.equal(stats.completed,1);assert.equal(stats.ballots,1);assert.equal(stats.factions[2].wins,1);assert.equal(stats.factions[2].delta,1);
  assert.deepEqual(stats.domains,[{kind:'game',matches:1,ballots:1}]);assert.match(stats.disclosure,/AI 전체 성능/);
});
