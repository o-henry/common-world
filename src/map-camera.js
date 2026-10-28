const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const initialMapCamera = () => ({zoom: 1, x: 0, y: 0});

export function mapViewBox(base, camera) {
  const [x, y, width, height] = base;
  return [x + width / 2 - width / camera.zoom / 2 + camera.x,
    y + height / 2 - height / camera.zoom / 2 + camera.y,
    width / camera.zoom, height / camera.zoom];
}

export function constrainMapCamera(camera, base) {
  return {zoom: clamp(camera.zoom, .85, 3),
    x: clamp(camera.x, -base[2] * .48, base[2] * .48),
    y: clamp(camera.y, -base[3] * .48, base[3] * .48)};
}

// Keep the point under the cursor stationary while zooming, except at map limits.
export function zoomMap(camera, base, factor, point = [.5, .5]) {
  const before = mapViewBox(base, camera);
  const zoom = clamp(camera.zoom * factor, .85, 3);
  const after = mapViewBox(base, {...camera, zoom});
  return constrainMapCamera({...camera, zoom,
    x: camera.x + before[0] + before[2] * point[0] - after[0] - after[2] * point[0],
    y: camera.y + before[1] + before[3] * point[1] - after[1] - after[3] * point[1]}, base);
}

export function panMap(camera, base, dx, dy) {
  return constrainMapCamera({...camera, x: camera.x + dx, y: camera.y + dy}, base);
}

// SVG xMidYMid/meet adds letterboxing. Both axes must use the same fitted scale.
export function mapPointer(bounds, viewBox, clientX, clientY) {
  const scale = Math.min(bounds.width / viewBox[2], bounds.height / viewBox[3]);
  if (!(scale > 0)) return null;
  const width = viewBox[2] * scale, height = viewBox[3] * scale;
  return {point: [(clientX - bounds.left - (bounds.width - width) / 2) / width,
    (clientY - bounds.top - (bounds.height - height) / 2) / height], scale};
}
