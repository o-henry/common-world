import * as THREE from 'three';

/** Project a bounded neighbourhood of the actual globe, keeping every cell ID.
 * Gnomonic projection keeps the sphere's shared edges on matching straight lines.
 * This is a local work board, not a second territory graph or a geographic map.
 */
export function projectNeighborhood(world, anchorCellId, {radius = .72, scale = 760} = {}) {
  const anchor = world?.cells?.[anchorCellId];
  if (!anchor || anchor.id !== anchorCellId) throw new RangeError('존재하는 작품 영역을 선택하세요.');
  if (!Number.isFinite(radius) || radius < .2 || radius > 1.4
    || !Number.isFinite(scale) || scale <= 0) throw new RangeError('지역 확대 범위가 올바르지 않습니다.');
  const {normal, right, top} = anchor;
  const project = vector => {
    const depth = vector.dot(normal);
    return [vector.dot(right) / depth * scale, -vector.dot(top) / depth * scale];
  };
  const cells = [];
  for (const cell of world.cells) {
    const depth = cell.normal.dot(normal);
    if (depth <= 0) continue;
    const [x, y] = project(cell.normal);
    if (Math.hypot(x, y) > radius * scale) continue;
    // A visible centre must never introduce a horizon-crossing polygon.
    if (cell.corners.some(corner => corner.dot(normal) <= 0)) continue;
    cells.push({id: cell.id, owner: cell.owner, x, y,
      points: cell.corners.map(project), neighbors: [...cell.neighbors]});
  }
  const padding = 56;
  const extent = radius * scale + padding;
  return {
    anchorCellId, radius, scale,
    center: {x: 0, y: 0},
    viewBox: [-extent, -extent, extent * 2, extent * 2],
    cells,
  };
}

/** Match a board point to the same plot used by the globe and league rules. */
export function pickNeighborhoodCell(neighborhood, point) {
  const x = Array.isArray(point) ? point[0] : point?.x;
  const y = Array.isArray(point) ? point[1] : point?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const cell of neighborhood.cells) {
    let inside = false;
    for (let i = 0, j = cell.points.length - 1; i < cell.points.length; j = i++) {
      const [ax, ay] = cell.points[i], [bx, by] = cell.points[j];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    if (inside) return cell.id;
  }
  return null;
}

/** Same local coordinates back on the unit sphere; useful for precise zoom/pick. */
export function neighborhoodPointToNormal(world, anchorCellId, point, scale = 760) {
  const anchor = world?.cells?.[anchorCellId];
  const x = Array.isArray(point) ? point[0] : point?.x;
  const y = Array.isArray(point) ? point[1] : point?.y;
  if (!anchor || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('지역 좌표가 올바르지 않습니다.');
  }
  return new THREE.Vector3().copy(anchor.normal)
    .addScaledVector(anchor.right, x / scale)
    .addScaledVector(anchor.top, -y / scale).normalize();
}
