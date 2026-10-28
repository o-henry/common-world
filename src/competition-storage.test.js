import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCompetition,submitCreation,recordCompetitionTrial,castCompetitionBallot,finalizeCompetition,openCompetitionRematch,createCompetitionChallenge,selectCompetition,reviseCreation,getCompetitionRound} from './competition-model.js';
import {COMPETITION_KEY,loadCompetition,saveCompetition} from './competition-storage.js';

function sourceArtifact(text='start') {
  const source=`<html><button>${text}</button></html>`;
  return {source,sha256:createHash('sha256').update(source).digest('hex'),format:'html',sourceKind:'user-upload'};
}
function fresh() {
  return createCompetition({owners:[0,1,0,1,-1],neighbors:[[1,2],[0,3],[0,3],[1,2,4],[3]],
    works:[{id:'a',title:'A',author:'alice',creatorId:'alice-id',cellId:0,faction:'Claude',kind:'game',cover:'/assets/lumen-hop-cover.png',artifact:sourceArtifact('A'),agent:'Codex',modelVersion:'self-reported',humanContribution:'입력 설계',conditions:'로컬 연습'},
      {id:'b',title:'B',author:'bob',creatorId:'bob-id',cellId:1,faction:'OpenAI',kind:'game',cover:'/assets/together-cover.png',artifact:sourceArtifact('B')}],
    frontiers:[{id:'f',title:'같은 과제',brief:'조작을 비교합니다.',homeCell:0,targetCell:1,homeTeam:0,opponentTeam:1,kinds:['game']}],quorum:1,practice:true});
}
function storage(entries=[]) {
  const values=new Map(entries),accesses=[];
  return {values,accesses,getItem(key){accesses.push(['get',key]);return values.get(key)??null;},setItem(key,value){accesses.push(['set',key]);values.set(key,value);},removeItem(key){accesses.push(['remove',key]);values.delete(key);}};
}
const allPass={A:{controls:'pass',restart:'pass',feedback:'pass'},B:{controls:'pass',restart:'pass',feedback:'pass'}};
function finished(state=fresh(),choice='A') {
  state=submitCreation(state,'A','a','alice-id');state=submitCreation(state,'B','b','bob-id');
  state=recordCompetitionTrial(state,'A','local-reviewer');state=recordCompetitionTrial(state,'B','local-reviewer');
  state=castCompetitionBallot(state,{evaluatorId:'local-reviewer',choice,checks:allPass,note:'직접 비교한 연습 의견'});
  return finalizeCompetition(state);
}
function restore(state) { const s=storage();assert.equal(saveCompetition(s,state).ok,true);return loadCompetition(s,fresh); }

test('fresh, one-sided, reviewed, finalized and rematch states restore without changing sources or ownership',()=>{
  let pair=submitCreation(fresh(),'A','a','alice-id');
  for(const state of [fresh(),pair,finished(),openCompetitionRematch(finished())]) {
    const loaded=restore(state);assert.equal(loaded.blocked,false);
    assert.deepEqual(loaded.state.owners,state.owners);assert.deepEqual(loaded.state.works,state.works);assert.deepEqual(loaded.state.rounds,state.rounds);assert.deepEqual(loaded.state.history,state.history);
    assert.equal(loaded.state.owners[4],-1);
  }
});
test('sealed source and author fields survive a newer public revision and reload',()=>{
  let state=finished();const old=getCompetitionRound(state).submission.artifact.sha256;
  state=reviseCreation(state,'a',{changeNote:'다시 시작 버튼을 개선했습니다.',artifact:sourceArtifact('A version two'),rights:true},'alice-id');
  const loaded=restore(state);assert.equal(loaded.blocked,false);
  assert.equal(loaded.state.works[0].version,2);assert.equal(loaded.state.history[0].submission.version,1);
  assert.equal(loaded.state.history[0].submission.artifact.sha256,old);assert.equal(loaded.state.works[0].creatorId,'alice-id');
  assert(Object.isFrozen(loaded.state.history[0]));assert(Object.isFrozen(loaded.state.rounds.f.submission.artifact));
  assert.equal(loaded.state.rounds.f.submission,loaded.state.rounds.f.submissions.A);
});
test('custom challenges remain available after restore and keep the trusted adjacency graph',()=>{
  let state=createCompetitionChallenge(fresh(),{title:'재도전 과제',brief:'반대 방향 접경',homeTeam:1,opponentTeam:0,kinds:['game']});
  const id=state.activeFrontierId;
  const loaded=restore(state);assert.equal(loaded.blocked,false);assert.equal(loaded.state.activeFrontierId,id);assert.equal(loaded.state.frontiers.length,2);
  state=selectCompetition(loaded.state,'f');assert.equal(state.activeFrontierId,'f');assert.deepEqual(state.neighbors,fresh().neighbors);
});
test('old prototype keys are never read, overwritten or cleared by current storage operations',()=>{
  const oldKeys=['common:frontier-league:v1','common:frontier-neighborhood:v1'];
  const s=storage(oldKeys.map(key=>[key,`${key}-kept-verbatim`]));
  assert.equal(COMPETITION_KEY,'common:competition:v1');assert.equal(loadCompetition(s,fresh).blocked,false);
  assert.equal(saveCompetition(s,finished()).ok,true);assert.equal(loadCompetition(s,fresh).blocked,false);
  s.removeItem(COMPETITION_KEY);assert.equal(loadCompetition(s,fresh).blocked,false);
  for(const key of oldKeys)assert.equal(s.values.get(key),`${key}-kept-verbatim`);
  assert(s.accesses.every(([,key])=>key===COMPETITION_KEY));
});
test('quota and missing storage failures keep the active state and prior successful snapshot',()=>{
  const state=fresh(),s=storage();saveCompetition(s,state);const before=s.values.get(COMPETITION_KEY);
  const full={getItem:s.getItem,setItem(){throw new Error('QuotaExceededError');}};
  assert.equal(saveCompetition(full,finished()).ok,false);assert.equal(s.values.get(COMPETITION_KEY),before);
  assert.equal(saveCompetition(null,state).ok,false);assert.deepEqual(state.owners,fresh().owners);
});
test('corrupt JSON and incompatible schema are preserved for explicit recovery',()=>{
  for(const text of ['broken',JSON.stringify({schema:2,state:fresh()}),JSON.stringify({schema:1,state:null})]) {
    const s=storage([[COMPETITION_KEY,text]]);const loaded=loadCompetition(s,fresh);
    assert.equal(loaded.blocked,true);assert.equal(s.values.get(COMPETITION_KEY),text);assert.deepEqual(loaded.state.owners,fresh().owners);
  }
});
test('an empty stored work list is rejected instead of restoring an undefined selected work',()=>{
  const state=fresh();state.works=[];
  const text=JSON.stringify({schema:1,state}),s=storage([[COMPETITION_KEY,text]]),loaded=loadCompetition(s,fresh);
  assert.equal(loaded.blocked,true);assert.equal(s.values.get(COMPETITION_KEY),text);
  assert.equal(loaded.state.works.length,fresh().works.length);assert(loaded.state.works[0]);
});
test('stored custom challenge criteria are a bounded text array, with a safe fallback for missing criteria',()=>{
  const custom=createCompetitionChallenge(fresh(),{title:'새 과제',brief:'반대 진영에서 비교합니다.',homeTeam:1,opponentTeam:0,kinds:['game'],criteria:['핵심 동작을 실행할 수 있는가']});
  for(const criteria of [null,{},'잘못된 배열',[],[{text:'객체 항목 금지'}],[''],['x'.repeat(301)],Array(13).fill('기능 확인')]) {
    const state=structuredClone(custom);state.frontiers.at(-1).criteria=criteria;
    const text=JSON.stringify({schema:1,state}),s=storage([[COMPETITION_KEY,text]]);
    assert.equal(loadCompetition(s,fresh).blocked,true);assert.equal(s.values.get(COMPETITION_KEY),text);
  }
  const missing=structuredClone(custom);delete missing.frontiers.at(-1).criteria;
  const loaded=restore(missing);assert.equal(loaded.blocked,false);
  const restored=loaded.state.frontiers.at(-1);
  assert(Array.isArray(restored.criteria));assert.equal(restored.criteria.length,restored.checkKeys.length);
  assert(restored.criteria.every(value=>typeof value==='string'&&value.length>0));
});
test('typed metadata, source hashes, ballot uniqueness and required checks guard restoration',()=>{
  const mutations=[
    state=>{state.works[0].agent={unexpected:'object'};},
    state=>{state.works[0].modelVersion=['invalid'];},
    state=>{state.works[0].humanContribution=17;},
    state=>{state.works[0].conditions={};},
    state=>{state.works[0].conditions='x'.repeat(1001);},
    state=>{state.works[0].ai={};},
    state=>{state.works[0].artifact.source='<html>changed after seal</html>';},
    state=>{state.rounds.f.ballots.push(structuredClone(state.rounds.f.ballots[0]));},
    state=>{delete state.rounds.f.ballots[0].checks.A.controls;},
    state=>{state.rounds.f.trials['alice-id']={A:true,B:true};},
    state=>{state.works[0].cellId=4;},
    state=>{state.works[1].cellId=0;},
    state=>{state.frontiers[0].quorum=0;},
    state=>{state.quorum=2;},
  ];
  for(const mutate of mutations){
    const state=structuredClone(finished());mutate(state);const text=JSON.stringify({schema:1,state}),s=storage([[COMPETITION_KEY,text]]);
    assert.equal(loadCompetition(s,fresh).blocked,true);assert.equal(s.values.get(COMPETITION_KEY),text);
  }
});
test('ownership must replay exactly from the initial map and recorded ballot-derived results',()=>{
  const mutations=[
    state=>{state.owners[4]=0;},
    state=>{state.owners[2]=1;},
    state=>{state.history=[];},
    state=>{state.history.push(structuredClone(state.history[0]));},
    state=>{state.history[0].result.counts.B=7;},
    state=>{state.history[0].result.previousOwner=5;},
    state=>{state.history[0].homeTeam=5;},
    state=>{state.history[0].feedback='changed';},
    state=>{state.rounds.f.number=3;state.rounds.f.id='f-3';},
  ];
  for(const mutate of mutations){
    const state=structuredClone(finished());mutate(state);const s=storage();saveCompetition(s,state);assert.equal(loadCompetition(s,fresh).blocked,true);
  }
  const noHistory=fresh();noHistory.owners[2]=1;assert.equal(restore(noHistory).blocked,true,'a valid-looking color change needs an actual history record');
});
test('more than 200 legitimate rounds restore without an arbitrary history cap',()=>{
  let state=fresh();
  for(let number=0;number<201;number++){state=finished(state,'tie');if(number<200)state=openCompetitionRematch(state);}
  const loaded=restore(state);assert.equal(loaded.blocked,false);assert.equal(loaded.state.history.length,201);assert.deepEqual(loaded.state.owners,fresh().owners);
});
