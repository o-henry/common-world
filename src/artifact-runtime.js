export const ARTIFACT_SOURCE_LIMIT = 256 * 1024;

// Validate the transport boundary, not the safety or quality of executable HTML.
// This is deliberately not a regex sanitizer. Only open it in the separately
// sandboxed iframe; never insert the returned document into the parent DOM.
export function validateArtifactSource(source) {
  if (typeof source !== 'string' || !source.trim() || source.includes('\0')) {
    throw new TypeError('비어 있지 않은 HTML 소스가 필요합니다.');
  }
  if (new TextEncoder().encode(source).byteLength > ARTIFACT_SOURCE_LIMIT) {
    throw new RangeError('HTML 소스는 UTF-8 기준 256KiB 이하여야 합니다.');
  }
  return source;
}

export async function hashArtifactSource(source) {
  validateArtifactSource(source);
  if (!globalThis.crypto?.subtle) throw new Error('이 환경에서 소스 해시를 계산할 수 없습니다.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const ARTIFACT_CSP = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'",
  'img-src data: blob:', "connect-src 'none'", "frame-src 'none'",
  "child-src 'none'", "worker-src 'none'", "object-src 'none'",
  "form-action 'none'", "base-uri 'none'", "font-src 'none'", "media-src 'none'",
].join('; ');

export function buildArtifactDocument(source) {
  validateArtifactSource(source);
  // A later CSP can add restrictions but cannot relax this first policy.
  // Opaque-origin allow-scripts sandbox and this CSP constrain the preview.
  // They are NOT complete network isolation: iframe self-navigation (including
  // location changes, links and meta refresh) is a residual browser limitation.
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${source}</body></html>`;
}
