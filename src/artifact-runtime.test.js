import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {ARTIFACT_CSP, ARTIFACT_SOURCE_LIMIT, validateArtifactSource, hashArtifactSource, buildArtifactDocument} from './artifact-runtime.js';

const sources = ['moon-hop', 'orbit-run'].map(name => ({name,
  source: readFileSync(new URL(`../public/entries/${name}.html`, import.meta.url), 'utf8')}));

function loadGame(source) {
  const elements = new Map(), windowEvents = new Map(), documentEvents = new Map(), frames = new Map();
  const gradient = {addColorStop() {}};
  const context = new Proxy({}, {get(target, key) {
    if (key in target) return target[key];
    if (key === 'createLinearGradient') return () => gradient;
    return () => {};
  }});
  function element(id) {
    if (!elements.has(id)) elements.set(id, {textContent: '', events: new Map(),
      addEventListener(name, fn) {this.events.set(name, fn);}, focus() {}, getContext: () => context});
    return elements.get(id);
  }
  const document = {hidden: false, getElementById: element,
    addEventListener(name, fn) {documentEvents.set(name, fn);}};
  const window = {addEventListener(name, fn) {windowEvents.set(name, fn);}};
  let serial = 0;
  const scope = vm.createContext({window, document, Math, Object, String, Number,
    requestAnimationFrame(callback) {const id = ++serial; frames.set(id, callback); return id;},
    cancelAnimationFrame(id) {frames.delete(id);}});
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1, 'Execute the one actual inline game script');
  vm.runInContext(scripts[0][1], scope, {timeout: 1000});
  return {api: window.__COMMON_GAME_TEST__, elements, frames, document,
    key() {windowEvents.get('keydown')({code: 'Space', repeat: false, preventDefault() {}});},
    touch() {element('game').events.get('pointerdown')({preventDefault() {}});},
    button() {element('action').events.get('click')();},
    hide() {document.hidden = true; documentEvents.get('visibilitychange')();},
    unload() {windowEvents.get('pagehide')();}};
}

test('source validation measures UTF-8 bytes, preserves originals, and rejects empty or oversized entries', () => {
  const original = '<!doctype html><p>작품</p>';
  assert.equal(validateArtifactSource(original), original);
  assert.equal(validateArtifactSource('x'.repeat(ARTIFACT_SOURCE_LIMIT)).length, ARTIFACT_SOURCE_LIMIT);
  for (const value of [null, undefined, 42, '', '  ', '<p>\0</p>']) assert.throws(() => validateArtifactSource(value), TypeError);
  assert.throws(() => validateArtifactSource('x'.repeat(ARTIFACT_SOURCE_LIMIT + 1)), RangeError);
  assert.throws(() => validateArtifactSource('가'.repeat(Math.ceil(ARTIFACT_SOURCE_LIMIT / 3))), RangeError);
});

test('source hashes match independent SHA-256 and change with the exact source bytes', async () => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', {value: webcrypto, configurable: true});
  for (const {source} of sources) assert.equal(await hashArtifactSource(source), createHash('sha256').update(source, 'utf8').digest('hex'));
  assert.notEqual(await hashArtifactSource('<p>A</p>'), await hashArtifactSource('<p>A</p>\n'));
});

test('the preview policy precedes executable source and restricts resource and form capabilities', () => {
  const hostile = '<html><head><meta http-equiv="Content-Security-Policy" content="default-src *"><meta http-equiv="refresh" content="0;url=https://example.invalid/"></head><body><script>window.location="https://example.invalid/"</script></body></html>';
  const built = buildArtifactDocument(hostile);
  const expected = `<meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}">`;
  assert.equal(built.indexOf(expected), '<!doctype html><html><head>'.length);
  assert(built.indexOf(expected) < built.indexOf(hostile));
  for (const policy of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "worker-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'", 'img-src data: blob:']) assert(ARTIFACT_CSP.includes(policy));
  assert(!ARTIFACT_CSP.includes('unsafe-eval'));
  // Deliberately retain these strings: this builder is not a sanitizer and CSP
  // does not promise to block iframe self-navigation/meta-refresh everywhere.
  assert(built.includes(hostile));
});

for (const {name, source} of sources) {
  test(`${name}: actual standalone game starts, fails, and immediately restarts by the same button`, () => {
    const game = loadGame(source);
    assert.equal(game.api.snapshot().phase, 'ready');
    assert.equal(game.frames.size, 0, 'No continuous animation while idle');
    game.button();
    assert.equal(game.api.snapshot().phase, 'running');
    game.api.tick(4);
    const failed = game.api.snapshot();
    assert.equal(failed.phase, 'failed');
    assert(failed.score > 0, 'Travel/progress produces a visible score');
    assert.equal(game.frames.size, 0, 'Failure cancels the animation');
    game.button();
    assert.equal(game.api.snapshot().phase, 'running');
    assert.equal(game.api.snapshot().score, 0);
    game.api.reset();
    assert.equal(game.frames.size, 0);
  });
  test(`${name}: keyboard/touch input works and hidden/unloaded frames stop scheduling`, () => {
    const game = loadGame(source);
    game.key();
    assert.equal(game.api.snapshot().phase, 'running');
    game.touch();
    const after = game.api.snapshot();
    if (name === 'moon-hop') assert.equal(after.onGround, false);
    else assert.equal(after.lane, 0);
    game.hide();
    assert.equal(game.api.snapshot().phase, 'paused');
    assert.equal(game.frames.size, 0);
    game.button();
    assert.equal(game.api.snapshot().phase, 'running');
    assert.equal(game.frames.size, 1);
    game.unload();
    assert.equal(game.frames.size, 0);
  });
  test(`${name}: source has no network, parent messages or external asset dependency`, () => {
    validateArtifactSource(source);
    assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|postMessage)\s*\(/.test(source));
    assert(!/https?:\/\/|<iframe\b|<form\b|<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(source));
  });
}

test('Lumen Hop: a timed jump clears an actual collision obstacle and beats idle play', () => {
  const game = loadGame(sources[0].source);
  game.api.start();game.api.tick(1.4);game.api.act();game.api.tick(.75);
  const state = game.api.snapshot();
  assert.equal(state.phase, 'running');
  assert(state.cleared >= 1);
  assert(state.score > 35);
});

test('Moonstep: changing the actual lane avoids collisions and completes a full orbit', () => {
  const game = loadGame(sources[1].source);
  game.api.start();
  for (let i = 0; i < 170; i++) {
    const state = game.api.snapshot();
    if (state.nextHazard.distance < .35 && state.nextHazard.lane === state.lane) game.api.act();
    game.api.tick(.04);
  }
  const state = game.api.snapshot();
  assert.equal(state.phase, 'running');
  assert(state.passed >= 4);
  assert(state.travel > Math.PI * 2);
  assert(state.score >= 90);
});
