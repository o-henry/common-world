// A separate namespace preserves the pre-neighborhood prototype without migration.
export const LEAGUE_KEY='common:frontier-neighborhood:v1';
const phases=new Set(['recruiting','submitted','reviewing','evaluating','ballot-submitted','finalized']);
const validCover=cover=>typeof cover==='string'&&(/^\/assets\/[a-z0-9-]+\.(png|webp|jpg|jpeg)$/i.test(cover)||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(cover));

export function loadLeague(storage,fresh){
  const base=fresh();
  try{
    const text=storage?.getItem(LEAGUE_KEY);if(!text)return {state:base,blocked:false,message:''};
    const saved=JSON.parse(text);const s=saved.state;
    const ids=base.frontiers.map(f=>f.id),cell=n=>Number.isInteger(n)&&n>=0&&n<base.owners.length;
    if(saved.schema!==1||!s||!Array.isArray(s.owners)||s.owners.length!==base.owners.length||s.owners.some(n=>!Number.isInteger(n)||n<-1||n>5))throw Error('ownership');
    const work=w=>w&&typeof w.id==='string'&&w.id&&typeof w.title==='string'&&w.title.trim()&&typeof w.author==='string'&&w.author.trim()&&cell(w.cellId)&&s.owners[w.cellId]!==-1&&validCover(w.cover)&&Number.isInteger(w.version)&&w.version>0&&(!w.changelog||Array.isArray(w.changelog));
    const result=r=>r&&['claude','opponent','tie','insufficient'].includes(r.outcome)&&typeof r.territoryChanged==='boolean'&&(r.changedCell===null||cell(r.changedCell))&&[r.claude,r.opponent,r.valid].every(n=>Number.isInteger(n)&&n>=0)&&r.claude+r.opponent===r.valid;
    if(!Array.isArray(s.works)||!s.works.length||s.works.length>base.owners.length||s.works.some(w=>!work(w)))throw Error('works');
    if(new Set(s.works.map(w=>w.id)).size!==s.works.length||new Set(s.works.map(w=>w.cellId)).size!==s.works.length)throw Error('duplicates');
    if(!ids.includes(s.activeFrontierId)||!s.rounds||ids.some(id=>!s.rounds[id]||!phases.has(s.rounds[id].phase)))throw Error('rounds');
    if(!Array.isArray(s.history)||s.history.some(h=>!h||!ids.includes(h.frontierId)||!Number.isInteger(h.number)||h.number<1||h.roundId!==`${h.frontierId}-${h.number}`||!work(h.submission)||!work(h.opponent)||!result(h.result)||typeof h.feedback!=='string')||new Set(s.history.map(h=>h.roundId)).size!==s.history.length)throw Error('history');
    for(const id of ids){const r=s.rounds[id];
      if(!cell(r.homeCell)||!cell(r.targetCell)||s.owners[r.homeCell]===-1||s.owners[r.targetCell]===-1||!base.neighbors[r.homeCell].includes(r.targetCell)||!Number.isInteger(r.number)||r.number<1||r.id!==`${id}-${r.number}`)throw Error('stakes');
      if(!r.trialed||typeof r.trialed.A!=='boolean'||typeof r.trialed.B!=='boolean'||typeof r.applied!=='boolean')throw Error('trial-state');
      if(r.phase!=='recruiting'&&(!work(r.submission)||!work(r.opponent)))throw Error('submission');
      if(r.ballot&&(!['A','B','tie','neither'].includes(r.ballot.choice)||(r.ballot.note!==undefined&&typeof r.ballot.note!=='string')))throw Error('ballot');
      if(['ballot-submitted','finalized'].includes(r.phase)&&(!r.ballot||!r.trialed.A||!r.trialed.B))throw Error('missing-ballot');
      if(r.applied!==Boolean(r.result)||r.applied!==(r.phase==='finalized'))throw Error('result-state');
      if(r.applied&&(!result(r.result)||!s.history.some(h=>h.roundId===r.id)))throw Error('missing-history');
    }
    return {state:{...s,initialOwners:base.initialOwners,frontiers:base.frontiers,neighbors:base.neighbors},blocked:false,message:'이 브라우저에 저장한 월드 기록을 불러왔습니다.'};
  }catch{return {state:base,blocked:true,message:'저장 기록을 읽지 못해 새 연습 화면을 열었습니다. 이전 저장본은 보존했으며 초기화 전까지 덮어쓰지 않습니다.'};}
}
export function saveLeague(storage,state){
  if(!storage)return {ok:false,message:'브라우저 저장을 사용할 수 없어 현재 세션에서만 유지됩니다.'};
  try{storage?.setItem(LEAGUE_KEY,JSON.stringify({schema:1,state}));return {ok:true,message:''};}
  catch{return {ok:false,message:'브라우저 저장 공간이 부족하거나 저장이 차단됐습니다. 현재 화면은 유지되며 이전 저장본은 보존됩니다.'};}
}
