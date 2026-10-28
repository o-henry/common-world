import {createNeighborhoodWorld} from './neighborhood-seed.js';
import {hashArtifactSource} from './artifact-runtime.js';
import {createCompetition} from './competition-model.js';

export const competitionWorld = createNeighborhoodWorld();
const definitions = [
  {id: 'reference-moon', title: 'Moon Hop', path: '/entries/moon-hop.html', cellId: competitionWorld.home, faction: 'Claude'},
  {id: 'reference-orbit', title: 'Orbit Run', path: '/entries/orbit-run.html', cellId: competitionWorld.target, faction: 'OpenAI'},
];

export async function createReferenceCompetition(fetcher = fetch) {
  const works = await Promise.all(definitions.map(async definition => {
    const response = await fetcher(definition.path);
    if (!response.ok) throw new Error('참고 게임을 읽지 못했습니다. 서버 연결을 확인하고 다시 시도하세요.');
    const source = await response.text();
    return {...definition, author: 'COMMON reference', creatorId: 'platform-reference', kind: 'game', version: 1,
      cover: '/assets/lumen-hop-cover.png', description: '같은 Codex 세션에서 만든 플레이 가능한 참고 구현입니다.',
      creationAI: '플랫폼 참고 구현', agent: 'Codex', modelVersion: '미기록', humanContribution: '동일 세션의 참고 예시 · 진영 배치는 연습용',
      provenance: 'platform-reference', rights: true, copyrightConfirmed: true, registered: true,
      artifact: {format: 'html', source, sha256: await hashArtifactSource(source), sourceKind: 'platform-reference'}};
  }));
  const frontier = {...competitionWorld.frontiers[0], homeTeam: 0, title: '달빛 접경',
    brief: '키 하나로 조작하고, 실패 후 바로 다시 시작하는 게임',
    kinds: ['game'], checkKeys: ['controls', 'restart', 'feedback'],
    criteria: ['키 하나 또는 화면 버튼으로 조작', '실패 후 즉시 재시작', '점수 또는 진행 상태 피드백']};
  return createCompetition({owners: competitionWorld.cells.map(cell => cell.owner),
    neighbors: competitionWorld.cells.map(cell => cell.neighbors), works, frontiers: [frontier], quorum: 1, practice: true});
}
