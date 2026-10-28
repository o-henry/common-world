import {test} from 'node:test';import assert from 'node:assert/strict';
import {loadLeague,saveLeague,LEAGUE_KEY} from './league-storage.js';
const initial={owners:[0,1],initialOwners:[0,1],neighbors:[[1],[0]],works:[{id:'w',cellId:0,title:'one',author:'nari',cover:'/assets/lumen-hop-cover.png',version:1}],frontiers:[{id:'f'}],activeFrontierId:'f',rounds:{f:{id:'f-1',number:1,phase:'recruiting',trialed:{A:false,B:false},ballot:null,result:null,homeCell:0,targetCell:1,applied:false}},history:[]};
const fresh=()=>structuredClone(initial);
function store(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('roundtrip restores local state without granting new land',()=>{const s=store();assert.equal(saveLeague(s,initial).ok,true);const restored=loadLeague(s,fresh);assert.equal(restored.blocked,false);assert.deepEqual(restored.state.owners,[0,1]);assert.equal(restored.state.rounds.f.id,'f-1');});
test('corrupt or incompatible record is preserved and automatic writes can be blocked',()=>{const s=store();s.setItem(LEAGUE_KEY,'broken');assert.equal(loadLeague(s,fresh).blocked,true);assert.equal(s.getItem(LEAGUE_KEY),'broken');});
test('quota failure leaves prior successful snapshot intact',()=>{const s=store();saveLeague(s,initial);const old=s.getItem(LEAGUE_KEY);const full={getItem:s.getItem,setItem(){throw Error('QuotaExceededError')}};assert.equal(saveLeague(full,{...initial,owners:[1,1]}).ok,false);assert.equal(s.getItem(LEAGUE_KEY),old);});
test('duplicate history and ownership-invalid records are rejected',()=>{for(const state of [{...fresh(),owners:[9,1]},{...fresh(),history:[{roundId:'f-1'},{roundId:'f-1'}]},{...fresh(),works:[{...initial.works[0],cover:'javascript:bad'}]}]){const s=store();s.setItem(LEAGUE_KEY,JSON.stringify({schema:1,state}));assert.equal(loadLeague(s,fresh).blocked,true);}});
test('empty works and incomplete round/history structures are preserved as invalid instead of crashing the UI',()=>{
 for(const mutation of [s=>{s.works=[]},s=>{delete s.rounds.f.trialed},s=>{s.rounds.f.applied=true;s.rounds.f.phase='finalized';s.history=[{roundId:'f-1'}]},s=>{s.history=[{frontierId:'f',roundId:'f-1',number:1}]}]){
  const s=store(),state=fresh();mutation(state);const text=JSON.stringify({schema:1,state});s.setItem(LEAGUE_KEY,text);assert.equal(loadLeague(s,fresh).blocked,true);assert.equal(s.getItem(LEAGUE_KEY),text);
 }
});
test('more than 200 legitimate history entries are not discarded by an arbitrary restore cap',()=>{
 const state=fresh(),work=structuredClone(state.works[0]);state.rounds.f.number=202;state.rounds.f.id='f-202';
 state.history=Array.from({length:201},(_,i)=>({frontierId:'f',roundId:`f-${i+1}`,number:i+1,submission:work,opponent:work,feedback:'가상 동률',result:{outcome:'tie',territoryChanged:false,changedCell:null,claude:6,opponent:6,valid:12}}));
 const s=store();saveLeague(s,state);const restored=loadLeague(s,fresh);assert.equal(restored.blocked,false);assert.equal(restored.state.history.length,201);
});
