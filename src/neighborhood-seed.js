import * as THREE from 'three';
import {createWorld, TEAMS} from './world.js';

const direction = values => new THREE.Vector3(...values).normalize();

/** Six disclosed fictional works share one small settlement; most land is neutral.
 * Territory remains a league stake, not a fabricated population or work count.
 */
export function createNeighborhoodWorld() {
  const original = createWorld({detail: 7});
  if (original.cells.length !== 642) throw new Error('지역 월드는 detail 7 구체를 사용해야 합니다.');
  const seeds = [
    [-.13, 0, 1], [.14, .13, 1], [-.3, .24, 1],
    [.15, -.12, 1], [-.3, -.24, 1], [0, -.45, 1],
  ].map(direction);
  const cells = original.cells.map(cell => {
    const scores = seeds.map((seed, index) => cell.normal.dot(seed) + (index === 0 ? .02 : 0));
    const owner = cell.normal.z < .84 ? -1 : scores.indexOf(Math.max(...scores));
    return {...cell, owner};
  });
  const reserved = new Set();
  function boundary(opponent, preferred) {
    const desired = direction(preferred);
    const candidates = cells.filter(cell => cell.owner === 0 && !reserved.has(cell.id))
      .flatMap(home => home.neighbors.filter(id => cells[id].owner === opponent && !reserved.has(id))
        .map(id => ({home, target: cells[id]})))
      .sort((a, b) => b.home.normal.dot(desired) - a.home.normal.dot(desired)
        || a.home.id - b.home.id || a.target.id - b.target.id);
    const edge = candidates[0];
    if (!edge) throw new Error('작품 군락에 맞닿은 접경 영역이 부족합니다.');
    reserved.add(edge.home.id); reserved.add(edge.target.id);
    return {homeCell: edge.home.id, targetCell: edge.target.id};
  }
  const moonlight = boundary(1, [-.03, .08, 1]);
  const rhythm = boundary(1, [-.12, .23, 1]);
  const together = boundary(3, [-.02, -.15, 1]);
  const nearest = (wanted, owner) => cells.filter(cell => cell.owner === owner && !reserved.has(cell.id))
    .sort((a, b) => b.normal.dot(direction(wanted)) - a.normal.dot(direction(wanted)))[0];
  const quiet = nearest([-.3, -.23, 1], 4);
  if (!quiet) throw new Error('개발 도구를 전시할 영역이 없습니다.');
  const workData = new Map(original.works.map(work => [work.id, work]));
  const works = [
    {...workData.get('lumen'), cellId: moonlight.homeCell},
    {...workData.get('velvet'), cellId: rhythm.homeCell},
    {...workData.get('quiet'), cellId: quiet.id},
    {...workData.get('together'), cellId: together.targetCell},
    {...workData.get('moonstep'), cellId: moonlight.targetCell},
    {id: 'counterbeat', cellId: rhythm.targetCell, title: 'Counterbeat', author: 'iris', ai: 'OpenAI',
      cover: '/assets/velvet-loop-cover.png', kind: 'music', version: 1,
      description: '다른 박자로 만나는 작은 리듬.'},
  ].map(work => ({...work, faction: TEAMS[cells[work.cellId].owner].name,
    creationAI: work.ai, changelog: []}));
  const frontiers = [
    {id: 'moonlight', title: '달빛 접경', brief: '키 하나로 즐길 수 있는 브라우저 게임', kinds: ['game'],
      ...moonlight, opponentTeam: 1, opponentWorkId: 'moonstep',
      criteria: ['조작을 바로 이해할 수 있는가', '실패 후 바로 다시 시작할 수 있는가']},
    {id: 'rhythm', title: '리듬 접경', brief: '처음 방문해도 리듬을 만들 수 있는 음악 도구', kinds: ['music'],
      ...rhythm, opponentTeam: 1, opponentWorkId: 'counterbeat',
      criteria: ['설명 없이 첫 소리를 만들 수 있는가', '입력의 반응을 분명히 알 수 있는가']},
    {id: 'together', title: '약속 접경', brief: '가입 없이 함께 비는 시간을 찾는 일정 도구', kinds: ['schedule'],
      ...together, opponentTeam: 3, opponentWorkId: 'together',
      criteria: ['모두 가능한 시간을 찾을 수 있는가', '실수를 고치기 쉬운가']},
  ];
  const centerCellId = cells.reduce((best, cell) => cell.normal.z > best.normal.z ? cell : best, cells[0]).id;
  return {...original, cells, works, frontiers, home: moonlight.homeCell, target: moonlight.targetCell, centerCellId,
    neighborhood: {title: '달빛 군락', anchorCellId: centerCellId, radius: .72}};
}

export function leagueForNeighborhood(world) {
  return {owners: world.cells.map(cell => cell.owner), neighbors: world.cells.map(cell => [...cell.neighbors]),
    works: world.works.map(work => ({...work, changelog: [...(work.changelog || [])]})),
    frontiers: world.frontiers.map(frontier => ({...frontier,
      kinds: [...frontier.kinds], criteria: [...frontier.criteria]}))};
}
