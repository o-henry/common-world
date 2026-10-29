import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createReferenceCompetition} from './competition-seed.js';
import {createCompetition, submitCreation, recordCompetitionTrial, castCompetitionBallot,
  finalizeCompetition, openCompetitionRematch, selectCompetition, createCompetitionChallenge,
  hashArtifactSource, reviseCreation} from './competition-model.js';
import {createCampaign, getCampaignOffers, chooseCampaignOffer, syncCampaignAfterTransition,
  guardCampaignEntry, validateCampaignSnapshot} from './campaign-model.js';

const source = '<!doctype html><button>Start</button>';
const artifact = {format:'html',source,sha256:hashArtifactSource(source),sourceKind:'platform-reference'};
const work = (id,cellId,faction) => ({id,cellId,faction,title:id,author:'reference',creatorId:'platform-reference',
  kind:'game',cover:'/assets/lumen-hop-cover.png',version:1,artifact,registered:true,creationAI:'플랫폼 참고 구현'});
export function tinyCampaign(owners=[0,1],neighbors=[[1],[0]]) {
  return createCampaign(createCompetition({owners,neighbors,works:[work('left',0,'Claude'),work('right',1,'OpenAI')],
    frontiers:[{id:'base',title:'기준 접경',homeCell:0,targetCell:1,homeTeam:0,opponentTeam:1,kinds:['game']}]}));
}
const referenceBase = await createReferenceCompetition(async path => ({ok:true,text:async()=>readFile(new URL(`../public${path}`,import.meta.url),'utf8')}));
const fresh = () => createCampaign(referenceBase);
const step = (state,action) => syncCampaignAfterTransition(state,action(state));
const pick = (state,index=0) => step(state,current=>chooseCampaignOffer(current,getCampaignOffers(current)[index].id));
const active = state => state.rounds[state.activeFrontierId];
const points = offers => offers.map(offer=>[offer.homeCell,offer.targetCell]);

function pair(state) {
  const frontier=state.frontiers.find(item=>item.id===state.activeFrontierId);
  for(const [side,team] of [['A',frontier.homeTeam],['B',frontier.opponentTeam]]) {
    const faction=['Claude','OpenAI','Gemini','Grok','DeepSeek','Local'][team];
    const item=state.works.find(entry=>entry.faction===faction);
    assert.ok(item,'test match has a real reference entry for both factions');
    state=step(state,current=>submitCreation(current,side,item.id,item.creatorId));
  }
  return state;
}
function ballot(state,choice='A',status='pass') {
  for(const side of ['A','B'])state=step(state,current=>recordCompetitionTrial(current,side,'local-reviewer'));
  const keys=state.frontiers.find(item=>item.id===state.activeFrontierId).checkKeys;
  const checks=Object.fromEntries(['A','B'].map(side=>[side,Object.fromEntries(keys.map(key=>[key,status]))]));
  return step(state,current=>castCompetitionBallot(current,{evaluatorId:'local-reviewer',choice,checks,note:'직접 확인한 결과'}));
}
function finish(state,choice='A',status='pass') {
  return step(ballot(pair(state),choice,status),finalizeCompetition);
}

test('real 642-plot world offers two actual local borders with different fixed checks',()=>{
  const state=fresh(),before=structuredClone(state),offers=getCampaignOffers(state);
  assert.equal(state.owners.length,642);
  assert.deepEqual(points(offers),[[232,225],[232,552]]);
  assert.deepEqual(offers.map(item=>item.checkKeys),[['controls','restart'],['controls','feedback']]);
  for(const offer of offers) {
    assert.equal(state.owners[offer.homeCell],0);assert.equal(state.owners[offer.targetCell],offer.opponentTeam);
    assert.ok(state.neighbors[offer.homeCell].includes(offer.targetCell));
    for(const scenario of ['win','loss','hold'])for(const next of offer[scenario].offers)
      assert.equal(Object.hasOwn(next,'win'),false,'previews stop after one step');
  }
  assert.deepEqual(state,before);
});

test('A win and B win produce the promised different next selectable borders from actual ownership',()=>{
  const initial=fresh(),offer=getCampaignOffers(initial)[0];
  const won=finish(pick(initial),'A'),lost=finish(pick(initial),'B');
  assert.deepEqual(points(getCampaignOffers(won)),[[225,217],[225,218]]);
  assert.deepEqual(points(getCampaignOffers(lost)),[[226,218],[226,219]]);
  assert.deepEqual(getCampaignOffers(won).map(item=>item.id),offer.win.offers.map(item=>item.id));
  assert.deepEqual(getCampaignOffers(lost).map(item=>item.id),offer.loss.offers.map(item=>item.id));
  assert.notDeepEqual(points(getCampaignOffers(won)),points(getCampaignOffers(lost)));
  assert.equal(won.campaign.anchorCell,225);assert.equal(lost.campaign.anchorCell,226);
  for(const result of [won,lost]) {
    assert.equal(result.owners.filter((owner,id)=>owner!==initial.owners[id]).length,1);
    assert.deepEqual(result.works,initial.works);
    for(const item of getCampaignOffers(result)) {
      assert.equal(result.owners[item.homeCell],0);
      assert.equal(result.owners[item.targetCell],item.opponentTeam);
      assert.ok(result.neighbors[item.homeCell].includes(item.targetCell));
    }
    assert.equal(result.owners.filter(owner=>owner===-1).length,initial.owners.filter(owner=>owner===-1).length);
  }
});

test('choosing a different offer before submission replaces the empty selection without moving territory',()=>{
  let state=fresh();const offers=getCampaignOffers(state),owners=[...state.owners];
  state=pick(state);state=step(state,current=>chooseCampaignOffer(current,offers[1].id));
  assert.equal(state.frontiers.length,referenceBase.frontiers.length+1);
  assert.equal(state.campaign.current.offerId,offers[1].id);
  assert.deepEqual(active(state).submissions,{A:null,B:null});
  assert.deepEqual(state.owners,owners);assert.equal(state.history.length,0);
});

test('the first sealed submission locks simultaneous routes and generic frontier entry',()=>{
  let state=pick(fresh());const other=getCampaignOffers(state)[1];
  state=step(state,current=>submitCreation(current,'A','reference-moon','platform-reference'));
  assert.throws(()=>chooseCampaignOffer(state,other.id),{code:'CAMPAIGN_ENTRY_LOCKED'});
  assert.throws(()=>step(state,current=>selectCompetition(current,referenceBase.activeFrontierId)),{code:'CAMPAIGN_SELECTION_REQUIRED'});
  assert.throws(()=>guardCampaignEntry(state,referenceBase.activeFrontierId),{code:'CAMPAIGN_SELECTION_REQUIRED'});
  assert.equal(guardCampaignEntry(state),state);
  const before=fresh();
  assert.throws(()=>step(before,current=>submitCreation(current,'A','reference-moon','platform-reference')),{code:'CAMPAIGN_SELECTION_REQUIRED'});
});

test('an unselected or stale offer cannot allocate a border or create a generic parallel challenge',()=>{
  const state=pick(fresh());
  assert.throws(()=>chooseCampaignOffer(state,'route-999-0-1-retry'),{code:'STALE_CAMPAIGN_OFFER'});
  const original=state.frontiers[0];
  assert.throws(()=>step(state,current=>createCompetitionChallenge(current,{...original,id:'extra'})),{code:'CAMPAIGN_SELECTION_REQUIRED'});
});

for(const [choice,status,outcome] of [['tie','pass','tie'],['neither','pass','neither'],['A','unknown','review']])
  test(`${outcome} retains ownership and the promised hold routes`,()=>{
    const state=pick(fresh()),expected=getCampaignOffers(state)[0].hold.offers;
    const final=finish(state,choice,status);
    assert.equal(final.history[0].result.outcome,outcome);
    assert.deepEqual(final.owners,state.owners);assert.equal(final.campaign.anchorCell,state.campaign.anchorCell);
    assert.deepEqual(getCampaignOffers(final).map(item=>item.id),expected.map(item=>item.id));
  });

test('insufficient evaluation does not mint land and finalization is idempotent',()=>{
  const paired=pair(pick(fresh()));
  const final=step(paired,finalizeCompetition);
  assert.equal(final.history[0].result.outcome,'insufficient');
  assert.deepEqual(final.owners,paired.owners);
  assert.deepEqual(step(final,finalizeCompetition),final);
  assert.equal(final.campaign.log.length,1);
  assert.throws(()=>step(final,openCompetitionRematch),{code:'CAMPAIGN_NEXT_REQUIRED'});
});

test('one actual border yields one offer; defeat with no friendly retreat yields no route',()=>{
  const initial=tinyCampaign();assert.equal(getCampaignOffers(initial).length,1);
  const final=finish(pick(initial),'B');
  assert.equal(final.campaign.anchorCell,null);assert.deepEqual(getCampaignOffers(final),[]);
  assert.deepEqual(final.owners,[1,1]);
});

test('sealing keeps source, author and version while live entries can be revised',()=>{
  let state=pair(pick(fresh()));const sealed=structuredClone(active(state).submissions.A);
  state=step(state,current=>reviseCreation(current,'reference-moon',{changeNote:'개선한 다음 버전을 별도로 보존합니다.'},'platform-reference'));
  assert.equal(state.works[0].version,2);assert.deepEqual(active(state).submissions.A,sealed);
  assert.equal(Object.isFrozen(active(state).submissions.A),true);
});

test('fresh, selected, partial, evaluated and completed snapshots restore without changing routes',()=>{
  const initial=fresh(),chosen=pick(initial),partial=step(chosen,current=>submitCreation(current,'A','reference-moon','platform-reference'));
  const evaluated=ballot(pair(chosen)),final=step(evaluated,finalizeCompetition);
  const next=pick(final),two=finish(next,'B');
  for(const state of [initial,chosen,partial,evaluated,final,next,two]) {
    const restored=validateCampaignSnapshot(JSON.parse(JSON.stringify(state)),fresh());
    assert.deepEqual(restored.campaign,state.campaign);
    assert.deepEqual(restored.owners,state.owners);
    assert.deepEqual(getCampaignOffers(restored),getCampaignOffers(state));
  }
});

test('snapshot replay rejects forged anchors, choices, turns, future conditions and unselected rounds',()=>{
  const final=finish(pick(fresh()));
  const mutations=[
    state=>{state.campaign.anchorCell=226;},
    state=>{state.campaign.turn=99;},
    state=>{state.campaign.log[0].offerId='route-1-232-552-feedback';},
    state=>{state.campaign.current.profileId='feedback';},
    state=>{state.activeFrontierId=referenceBase.activeFrontierId;},
    state=>{state.frontiers.find(item=>item.id==='campaign-1').checkKeys=['feedback'];},
    state=>{state.campaign.log=[];},
    state=>{state.rounds.injected=structuredClone(state.rounds['campaign-1']);},
    state=>{state.rounds[referenceBase.activeFrontierId].trials.foreign={A:true,B:false};},
  ];
  for(const mutation of mutations) {
    const forged=structuredClone(final);mutation(forged);
    assert.throws(()=>validateCampaignSnapshot(forged,fresh()),undefined,mutation.toString());
  }
});

test('non-final transitions cannot mutate owners, prior results or route metadata',()=>{
  const state=pick(fresh());
  const changed=structuredClone(state);changed.owners[changed.campaign.current.targetCell]=0;
  assert.throws(()=>syncCampaignAfterTransition(state,changed),{code:'INVALID_CAMPAIGN_TRANSITION'});
  const altered=structuredClone(state);altered.campaign.anchorCell=225;
  assert.throws(()=>syncCampaignAfterTransition(state,altered),{code:'INVALID_CAMPAIGN_TRANSITION'});
});
