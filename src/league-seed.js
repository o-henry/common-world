import {TEAMS} from './world.js';
export function leagueSeed(world){
  const works=world.works.map(w=>({...w,faction:TEAMS[world.cells[w.cellId].owner].name,creationAI:w.ai,changelog:[]}));
  works.push({id:'counterbeat',cellId:12,title:'Counterbeat',author:'iris',ai:'OpenAI',creationAI:'OpenAI',faction:'OpenAI',cover:'/assets/velvet-loop-cover.png',kind:'music',description:'다른 박자로 만나는 작은 리듬.',version:1,changelog:[]});
  return {owners:world.cells.map(c=>c.owner),neighbors:world.cells.map(c=>c.neighbors),works,frontiers:[
    {id:'moonlight',title:'달빛 접경',brief:'키 하나로 즐길 수 있는 브라우저 게임',kinds:['game'],homeCell:world.home,targetCell:world.target,opponentTeam:1,opponentWorkId:'moonstep',criteria:['조작을 바로 이해할 수 있는가','실패 후 바로 다시 시작할 수 있는가']},
    {id:'rhythm',title:'리듬 접경',brief:'처음 방문해도 리듬을 만들 수 있는 음악 도구',kinds:['music'],homeCell:7,targetCell:12,opponentTeam:1,opponentWorkId:'counterbeat',criteria:['설명 없이 첫 소리를 만들 수 있는가','입력의 반응을 분명히 알 수 있는가']},
    {id:'together',title:'약속 접경',brief:'가입 없이 함께 비는 시간을 찾는 일정 도구',kinds:['schedule'],homeCell:40,targetCell:68,opponentTeam:3,opponentWorkId:'together',criteria:['모두 가능한 시간을 찾을 수 있는가','실수를 고치기 쉬운가']},
  ]};
}
