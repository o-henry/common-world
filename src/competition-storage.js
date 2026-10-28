import {validateCompetitionSnapshot} from './competition-model.js';

// Deliberately does not read or migrate any earlier prototype key.
export const COMPETITION_KEY = 'common:competition:v1';
export function loadCompetition(storage,fresh) {
  const base=fresh();
  try {
    const text=storage?.getItem(COMPETITION_KEY);
    if(!text)return {state:base,blocked:false,message:''};
    const saved=JSON.parse(text);
    if(saved.schema!==1)throw new Error('schema');
    return {state:validateCompetitionSnapshot(saved.state,base),blocked:false,message:'이 브라우저의 작품·연습 경기 기록을 불러왔습니다.'};
  }catch {
    return {state:base,blocked:true,message:'저장 기록을 읽지 못해 새 연습 화면을 열었습니다. 이전 저장본은 보존했으며 초기화 전까지 덮어쓰지 않습니다.'};
  }
}
export function saveCompetition(storage,state) {
  if(!storage)return {ok:false,message:'브라우저 저장을 사용할 수 없어 현재 세션에서만 유지됩니다.'};
  try {storage.setItem(COMPETITION_KEY,JSON.stringify({schema:1,state}));return {ok:true,message:''};}
  catch {return {ok:false,message:'브라우저 저장 공간이 부족하거나 저장이 차단됐습니다. 현재 화면은 유지되며 이전 저장본은 보존됩니다.'};}
}
