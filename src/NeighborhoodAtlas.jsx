import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Globe, Minus, Plus, CornersOut, MapTrifold} from '@phosphor-icons/react';
import {mountWorld, TEAMS} from './world.js';
import {projectNeighborhood} from './neighborhood-model.js';
import {initialMapCamera, mapViewBox, zoomMap, panMap, mapPointer} from './map-camera.js';
import './neighborhood.css';

const phase = round => round.applied ? '결과 확정' : round.submission ? '평가 중' : '출전 모집';
const pointsText = points => points.map(point => point.join(',')).join(' ');
const teamName = owner => TEAMS[owner]?.name || '미점유';

function RegionMap({world, state, selected, anchor, stakes, changedCell, before, onSelect, onEmpty, camera, setCamera}) {
  const projection = useMemo(() => projectNeighborhood(world, anchor), [world, anchor]);
  const svg = useRef(null), drag = useRef(null), suppressClick = useRef(false);
  const latest = state.history.at(-1);
  const workAt = new Map(state.works.map(work => [work.cellId, work]));
  const owners = [...state.owners];
  if (before && latest?.result.territoryChanged) {
    const owner = latest.result.outcome === 'claude'
      ? state.frontiers.find(frontier => frontier.id === latest.frontierId).opponentTeam : 0;
    owners[latest.result.changedCell] = owner;
  }
  useEffect(() => setCamera(initialMapCamera()), [anchor]);
  useEffect(() => {
    const element = svg.current;
    const wheel = event => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      setCamera(current => {
        const position = mapPointer(bounds, mapViewBox(projection.viewBox, current), event.clientX, event.clientY);
        return position ? zoomMap(current, projection.viewBox, event.deltaY < 0 ? 1.12 : 1 / 1.12, position.point) : current;
      });
    };
    element.addEventListener('wheel', wheel, {passive: false});
    return () => element.removeEventListener('wheel', wheel);
  }, [projection]);
  const viewBox = mapViewBox(projection.viewBox, camera);
  const activate = cell => {
    if (suppressClick.current) return;
    const work = workAt.get(cell.id);
    if (work) onSelect(work.id); else onEmpty(cell.id);
  };
  function down(event) {
    if (event.button !== 0) return;
    suppressClick.current = false;
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY};

  }
  function move(event) {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > 5) {suppressClick.current = true; event.currentTarget.setPointerCapture?.(event.pointerId);}
    if (suppressClick.current) {
      const bounds = svg.current.getBoundingClientRect();
      if (bounds.width && bounds.height) {
        const position = mapPointer(bounds, viewBox, event.clientX, event.clientY);
        if (position) setCamera(current => panMap(current, projection.viewBox,
          -(event.clientX - active.x) / position.scale,
          -(event.clientY - active.y) / position.scale));
      }
    }
    active.x = event.clientX; active.y = event.clientY;
  }
  function release(event) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keys(event) {
    const moves = {ArrowLeft: [-60, 0], ArrowRight: [60, 0], ArrowUp: [0, -60], ArrowDown: [0, 60]};
    if (moves[event.key]) {event.preventDefault(); setCamera(current => panMap(current, projection.viewBox, ...moves[event.key]));}
    if (['+', '=', '-'].includes(event.key)) {event.preventDefault(); setCamera(current => zoomMap(current, projection.viewBox, event.key === '-' ? 1 / 1.2 : 1.2));}
  }
  return <div className="region-surface">
    <svg ref={svg} className="region-map" viewBox={viewBox.join(' ')} preserveAspectRatio="xMidYMid meet"
      aria-label="지역 작품 지도" role="group" tabIndex={0} onKeyDown={keys}
      onPointerDown={down} onPointerMove={move} onPointerUp={release} onPointerCancel={release}>
      <defs>{projection.cells.filter(cell => workAt.has(cell.id)).map(cell =>
        <clipPath id={`work-plot-${cell.id}`} key={cell.id}><polygon points={pointsText(cell.points)}/></clipPath>)}</defs>
      {projection.cells.map(cell => {
        const work = workAt.get(cell.id), owner = owners[cell.id];
        const picked = selected.cellId === cell.id, staked = stakes.includes(cell.id), changed = changedCell === cell.id;
        const xs = cell.points.map(point => point[0]), ys = cell.points.map(point => point[1]);
        const minX = Math.min(...xs), minY = Math.min(...ys), width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
        return <g key={cell.id} className={`map-plot ${work ? 'has-work' : ''} ${picked ? 'picked' : ''} ${changed ? 'changed' : ''}`}
          role={work ? 'button' : undefined} tabIndex={work ? 0 : undefined} aria-label={work ? `지도 작품 ${work.title} · ${work.author}` : undefined}
          data-cell-id={cell.id} data-owner={owner} data-changed={changed || undefined}
          onClick={() => activate(cell)} onKeyDown={event => {
            if (work && ['Enter', ' '].includes(event.key)) {event.preventDefault(); suppressClick.current = false; activate(cell);}
          }}>
          <title>{work ? `${work.title} · ${work.author}` : `${teamName(owner)} · 빈 자리`}</title>
          <polygon className="map-ground" points={pointsText(cell.points)} fill={TEAMS[owner]?.color || '#f3eee5'}/>
          {work && <image href={work.cover} x={minX + 6} y={minY + 6} width={width - 12} height={height - 12}
            preserveAspectRatio="xMidYMid slice" clipPath={`url(#work-plot-${cell.id})`} opacity=".97"/>}
          {(staked || picked || changed) && <polygon className={`map-selection ${staked ? 'staked' : ''} ${picked ? 'selected' : ''} ${changed ? 'changed' : ''}`}
            points={pointsText(cell.points)} fill="none"/>}
          {work && <circle cx={cell.x + width * .24} cy={cell.y - height * .27} r="7" className="work-presence"/>}
        </g>;
      })}
      {projection.cells.filter(cell => workAt.has(cell.id)).map(cell => {
        const work = workAt.get(cell.id);
        return <g className="map-work-caption" key={cell.id} pointerEvents="none" transform={`translate(${cell.x},${cell.y + 59})`}>
          <text textAnchor="middle">{work.title}</text>
        </g>;
      })}
    </svg>
    <div className="map-scale-controls" aria-label="지도 확대와 이동">
      <button aria-label="지역 지도 축소" onClick={() => setCamera(current => zoomMap(current, projection.viewBox, 1 / 1.2))}><Minus size={17}/></button>
      <span>{Math.round(camera.zoom * 100)}%</span>
      <button aria-label="지역 지도 확대" onClick={() => setCamera(current => zoomMap(current, projection.viewBox, 1.2))}><Plus size={17}/></button>
      <button aria-label="지역 지도 위치 초기화" onClick={() => setCamera(initialMapCamera())}><CornersOut size={17}/></button>
    </div>
    <span className="map-drag-note">드래그로 이동 · 스크롤로 확대</span>
  </div>;
}

export function NeighborhoodAtlas({world, state, selected, onSelect, onEmpty, onError, focus, frontier = [], onSelectFrontier}) {
  const host = useRef(null), api = useRef(null), handlers = useRef({onSelect, onEmpty, onError});
  const [mode, setMode] = useState('globe'), [anchor, setAnchor] = useState(world.centerCellId);
  const [camera, setCamera] = useState(initialMapCamera);
  const [before, setBefore] = useState(false);
  const latest = state.history.at(-1), changedCell = latest?.result.changedCell ?? null;
  handlers.current = {onSelect, onEmpty, onError, works: state.works};
  function enterRegion(cell) {if (cell !== undefined) setAnchor(cell); setMode('region'); setBefore(false);}
  useEffect(() => {
    api.current = mountWorld(host.current, world, {
      onSelect: id => {
        handlers.current.onSelect(id);
        const work = handlers.current.works.find(item => item.id === id);
        enterRegion(work?.cellId ?? world.centerCellId);
      },
      onEmpty: cell => {handlers.current.onEmpty(cell); enterRegion(cell);},
      onError: error => handlers.current.onError(error),
    });
    return () => api.current?.dispose();
  }, [world]);
  useEffect(() => api.current?.updateOwners(state.owners), [state.owners]);
  useEffect(() => api.current?.setWorks(state.works, selected.id), [state.works, selected.id]);
  useEffect(() => api.current?.select(selected.cellId, false), [selected.cellId]);
  useEffect(() => api.current?.borders(frontier), [frontier.join('|')]);
  useEffect(() => {
    if (focus?.cell === undefined) return;
    api.current?.select(focus.cell, true);
    // Keep the same local coordinates after a result so the changed boundary is recognizable.
    if (!projectNeighborhood(world, anchor).cells.some(cell => cell.id === focus.cell)) setAnchor(focus.cell);
    setMode('region'); setBefore(false);
  }, [focus]);
  useEffect(() => setBefore(false), [latest?.roundId]);
  const localWorks = state.works.length;
  const projectedIds = useMemo(() => new Set(projectNeighborhood(world, anchor).cells.map(cell => cell.id)), [world, anchor]);
  const visibleWorks = state.works.filter(work => projectedIds.has(work.cellId));
  const emptyRegion = visibleWorks.length === 0;
  const regionName = emptyRegion ? '미점유 지역' : '달빛 지구';
  const nearbyFrontiers = state.frontiers.filter(item => projectedIds.has(state.rounds[item.id].homeCell) || projectedIds.has(state.rounds[item.id].targetCell));
  return <div className="neighborhood-atlas" data-mode={mode}>
    <div className="atlas-toolbar">
      <div className="atlas-breadcrumb"><button onClick={() => setMode('globe')}>월드</button>{mode === 'region' && <><span>/</span><strong>{regionName}</strong></>}</div>
      <div className="atlas-mode" aria-label="월드 보기 방식">
        <button aria-pressed={mode === 'globe'} onClick={() => setMode('globe')}><Globe size={16}/>구체</button>
        <button aria-pressed={mode === 'region'} onClick={() => enterRegion()}><MapTrifold size={16}/>지역</button>
      </div>
    </div>
    <div hidden={mode !== 'globe'} className="atlas-globe-container">
      <div className="globe-stage" ref={host} data-testid="world-stage"/>
      <div className="settlement-entry"><span><strong>달빛 지구</strong><small>{localWorks}개의 작품 · {state.frontiers.length}개의 접경전</small></span>
        <button className="primary" onClick={() => enterRegion(world.centerCellId)}>이곳 둘러보기 <ArrowUpRight size={17}/></button></div>
      <div className="rotation"><button onClick={() => api.current?.turn(-1)} aria-label="왼쪽 회전"><ArrowLeft size={16}/></button><span>작품이 모인 곳을 찾아보세요.</span><button onClick={() => api.current?.turn(1)} aria-label="오른쪽 회전"><ArrowRight size={16}/></button></div>
    </div>
    <div hidden={mode !== 'region'} className="atlas-region-container">
      <div className="region-heading"><div><span className="eyebrow">{emptyRegion ? 'UNCLAIMED' : 'NEIGHBORHOOD 01'}</span><h2>{regionName}</h2></div><p>{emptyRegion ? '아직 작품이 등록되지 않은 곳입니다.' : `${visibleWorks.length}개의 작품이 이곳을 만들고 있습니다.`}</p></div>
      {emptyRegion && <button className="text-link settlement-return" onClick={() => enterRegion(world.centerCellId)}>작품이 모인 곳으로 <ArrowRight size={15}/></button>}
      <RegionMap world={world} state={state} selected={selected} anchor={anchor} stakes={frontier}
        changedCell={changedCell} before={before} onSelect={onSelect} onEmpty={onEmpty} camera={camera} setCamera={setCamera}/>
      {latest && !emptyRegion && <div className="map-result" aria-live="polite"><span><strong>{latest.result.territoryChanged ? '이 경계가 달라졌습니다.' : '이번 경계는 유지됐습니다.'}</strong><small>{state.frontiers.find(item => item.id === latest.frontierId)?.title} · ROUND {latest.number}</small></span>
        {latest.result.territoryChanged && <div className="map-time-toggle" aria-label="최근 경기 전후 비교"><button aria-pressed={before} onClick={() => setBefore(true)}>경기 전</button><button aria-pressed={!before} onClick={() => setBefore(false)}>현재</button></div>}</div>}
      <div className="neighborhood-frontiers" aria-label="지도 주변 접경전">{nearbyFrontiers.map(item =>
        <button key={item.id} onClick={() => onSelectFrontier(item.id)}><span className="boundary-colors"><i style={{background:TEAMS[0].color}}/><i style={{background:TEAMS[item.opponentTeam].color}}/></span><span><strong>{item.title}</strong><small>{phase(state.rounds[item.id])}</small></span><ArrowUpRight size={16}/></button>)}</div>
    </div>
  </div>;
}
