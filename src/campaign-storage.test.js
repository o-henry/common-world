import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaign, getCampaignOffers, chooseCampaignOffer} from './campaign-model.js';
import {createCompetition,hashArtifactSource} from './competition-model.js';
import {CAMPAIGN_KEY,loadCampaign,saveCampaign} from './campaign-storage.js';

function fresh() {
  const source='<p>Reference</p>',artifact={format:'html',source,sha256:hashArtifactSource(source),sourceKind:'platform-reference'};
  const works=['Claude','OpenAI'].map((faction,cellId)=>({id:`work-${cellId}`,title:faction,author:'reference',creatorId:'platform-reference',cellId,
    faction,kind:'game',cover:'/assets/lumen-hop-cover.png',artifact}));
  return createCampaign(createCompetition({owners:[0,1],neighbors:[[1],[0]],works,
    frontiers:[{id:'base',title:'기준',homeCell:0,targetCell:1,homeTeam:0,opponentTeam:1,kinds:['game']}]}));
}
function storage(values={}) {
  const map=new Map(Object.entries(values)),calls=[];
  return {map,calls,getItem(key){calls.push(['get',key]);return map.get(key)??null;},
    setItem(key,value){calls.push(['set',key]);map.set(key,value);}};
}
test('new campaign storage never reads, migrates or writes earlier prototype records',()=>{
  const old={'common:competition:v1':'v007','common:frontier-neighborhood:v1':'v006','common:frontier-league:v1':'v005'};
  const store=storage(old),loaded=loadCampaign(store,fresh);
  assert.equal(loaded.blocked,false);assert.equal(saveCampaign(store,loaded.state).ok,true);
  assert.ok(store.calls.every(([,key])=>key===CAMPAIGN_KEY));
  for(const [key,value]of Object.entries(old))assert.equal(store.map.get(key),value);
});
test('selected route roundtrips through only the isolated campaign key',()=>{
  const store=storage(),initial=fresh(),state=chooseCampaignOffer(initial,getCampaignOffers(initial)[0].id);
  saveCampaign(store,state);const result=loadCampaign(store,fresh);
  assert.equal(result.blocked,false);assert.deepEqual(result.state,state);
});
for(const text of ['broken','null',JSON.stringify({schema:2,state:{}}),JSON.stringify({schema:1,state:{}})])
  test(`invalid saved record stays intact: ${text.slice(0,24)}`,()=>{
    const store=storage({[CAMPAIGN_KEY]:text}),result=loadCampaign(store,fresh);
    assert.equal(result.blocked,true);assert.equal(store.map.get(CAMPAIGN_KEY),text);
    assert.equal(store.calls.filter(([kind])=>kind==='set').length,0);
    assert.equal(result.state.campaign.current,null);
  });
test('quota failures retain the current session and the previous good saved snapshot',()=>{
  const store=storage(),state=fresh();saveCampaign(store,state);const before=store.map.get(CAMPAIGN_KEY);
  const current=chooseCampaignOffer(state,getCampaignOffers(state)[0].id);
  store.setItem=()=>{throw new Error('QuotaExceededError');};
  assert.equal(saveCampaign(store,current).ok,false);
  assert.equal(store.map.get(CAMPAIGN_KEY),before);assert.ok(current.campaign.current);
});
test('missing or unreadable storage has an explicit bounded result',()=>{
  assert.equal(loadCampaign(null,fresh).blocked,false);assert.equal(saveCampaign(null,fresh()).ok,false);
  assert.equal(loadCampaign({getItem(){throw new Error('SecurityError');}},fresh).blocked,true);
});
