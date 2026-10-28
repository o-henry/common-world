# Design QA — COMMON v004

- source visual truth: docs/reference/arena-world-home-v004.png
- source dimensions: 1586 × 992 px (viewed directly)
- implementation: http://127.0.0.1:4173/
- implementation screenshot: unavailable
- target viewport/state: 1586 × 992 CSS px, world home, Lumen Hop selected, DPR 1
- implementation pixels / CSS size / density normalization: not captured; no normalization or image comparison performed

## Blocker

The earlier browser URL-policy denial prohibited reaching the local preview through an alternate browser/protocol or indirect automation. No attempt was made to bypass it. Shell loopback readback also encountered sandbox EPERM; the same read-only HTTP check was then authorized through the normal escalation mechanism and returned 200. This verifies serving only, not browser behavior or visuals.

## Required surfaces

- Fonts/typography: source inspected; implementation screenshot absent, not assessed visually.
- Spacing/layout/radii: source inspected; responsive CSS exists, actual layout not measured.
- Colors/tokens/shadows: inferred from source; actual WebGL material and display output not compared.
- Asset fidelity: four generated cover files exist; image generation outputs were visually inspected by asset workers. Same file bound to curved/flat representations. Rendered crop/quality unverified.
- Copy/content: selected source and React copy read; this is not rendered comparison evidence.

## Other evidence

- 18 Node model/Three geometry tests passed.
- 7 React component interactions passed in jsdom, with renderer mocked. Both trials, ballot then explicit aggregate finalization, four outcomes, registration, original-author preservation and ineligible entry correction covered.
- Build and 4 packaging tests passed.
- Actual browser/WebGL runtime, E2E, console errors, touch/keyboard exploratory inspection and screenshot comparison remain unverified.

## Comparison history

No source-plus-implementation comparison could be performed. No passing fidelity judgement or invented design score.

## Remaining gate

Capture actual desktop and narrow runtime states using an authorized browser surface; compare source and implementation at the same viewport/state, fix visible issues, and rerun the relevant checks. User visual feedback is separate from automated checks.

final result: blocked


## v005 update — 2026-10-28

Source stays the same v004 image. Added three task/state flows, revisions, persisted local history, actual cumulative deltas and refreshed adjacent stakes. Existing artwork assets reused; no new image-generation task. Browser/visual comparison remains unavailable and was not attempted through another surface.

Read-only independent review found and code-fixed cumulative-delta labels, incomplete restore validation, and ambiguous example-author revision. Component/model/storage checks are separate evidence, not screenshots. Same-view desktop/mobile capture, actual WebGL, keyboard/touch exploratory checks and performance remain open.

final result: blocked

## v006 — neighborhood implementation

The existing selected image remains the palette/inspector reference. The new local-map composition is an implemented candidate, not a screenshot-matched visual approval. No new image generation was used.

Read-only independent review found three code-level issues: distant neutral locations did not focus an off-map frontier, SVG letterboxing distorted pointer coordinates, and region camera state was lost through globe navigation. These were corrected with corresponding math/component checks. This is source/behavior evidence with a mocked WebGL renderer, not a rendered visual comparison.

Browser/E2E, actual WebGL, desktop/narrow screenshots, keyboard/touch exploratory review and device performance remain unverified under the prior browser-policy restriction. No alternative browser/protocol was used to bypass it.

final result: blocked

## v007 — bilateral output competition

Built on the existing palette/globe/flat inspector. Home now presents a matchup and actual local submission/ballot states. Two reference HTML games execute in an allow-scripts sandbox. They are same-session examples with illustrative faction assignments, not evidence of independent providers' capabilities.

Source-level independent review identified standings API mismatch, lost revision metadata, AI-declaration/faction conflation and stale asynchronous upload races. These were corrected. Unit/Node-VM/component behavior checks are recorded separately. No browser-policy workaround or runtime screenshot was used. Real iframe/CSP enforcement, WebGL, visual fidelity, desktop/mobile/touch, process/resource isolation and multiuser authorization remain unverified.

final result: blocked
