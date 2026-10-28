# COMMON — persistent frontier prototype v005

The selected v004 shell, artwork and local URL are retained. Source folder stays `prototype-v004` to preserve existing links. The pre-change code/docs are preserved in `output/before-league-v005/`.

## Run and try

```sh
npm install
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

Open http://127.0.0.1:4173/ on this Mac. No public deployment.

1. Pick a creation on the 3D world or with the keyboard-accessible work picker.
2. Choose **접경전** or one of the three home invitations: 달빛(game), 리듬(music), 약속(schedule). Each has its own task, criteria, stakes and round state.
3. Choose an eligible work, submit the current version or register a revised version first. If no suitable work exists, **이 과제의 작품 올리기** preselects the required work kind.
4. Both mock experiences must be completed from the separately labeled evaluator view before submitting an evaluation/feedback.
5. Choose a fictional aggregate scenario and explicitly confirm it. The local ballot alone never transfers land. A win transfers one adjacent staked cell; tie/insufficient votes keeps it.
6. Read the outcome and feedback. Register an improvement with a real change note; the public gallery gets v2 while the old sealed entry remains v1.
7. Choose **탈환전 준비하기 / 다음 접경전 열기**. The next stakes are selected from current ownership and adjacency. History survives. The least-used eligible creators on that task have priority; making another work under the same author does not bypass it.
8. Reload to restore the world, revisions and history saved in this browser. **연습 기록 초기화** opens a confirmation dialog before clearing this prototype's key.

## Roles and limits

All works, tasks and aggregate scenarios are fictional local examples. An example work can be revised only through a modal explicitly labeled as that author's creator-role simulation. Registering/revising does not transfer authorship or validate AI attribution. **내 작품** contains only the local `you` author's creations, not other authors' revised examples.

The experience view is a local interaction preview, not a sandbox running uploaded applications. No account/authentication, real jury, real votes, remote upload storage, verified provider attribution or production security. Human+AI-assisted work outcomes are not provider benchmarks. No evidence yet that these mechanics produce enjoyment or return visits.

## Local data

Local state uses `common:frontier-league:v1` in browser localStorage. Uploaded PNG/JPEG/WebP <=5MB is decoded locally; one side must be <=8192px. Data URLs enable local restore and are not sent to a backend. Large images can exceed browser storage quota: the UI warns, keeps the active session, and does not overwrite the prior successful snapshot. Corrupt/incompatible snapshots are preserved, automatic writes blocked, and an explicit reset is available. This is a browser-local prototype, not a durable backup system or a multiuser ledger.

## Checks and evidence

```sh
npm test
npm run build
npm run test:sites
```

Model/geometry/storage integration checks use real Three math and the actual 92-cell world. React component flows run in jsdom with WebGL mocked. Browser/WebGL runtime, screenshots, visual fidelity, E2E, device performance and exploratory user testing are not verified; [design-qa.md](design-qa.md) remains **blocked** under the earlier browser policy restriction. HTTP 200 is serving evidence only.

Current execution receipts and logs: `output/league-v005-*`. The initial implementation receipt remains unchanged as historical evidence. Separate source artists/assets remain preserved; no new raster assets were generated for v005.

## Assets and technical source

- [lumen-hop-cover.png](public/assets/lumen-hop-cover.png)
- [velvet-loop-cover.png](public/assets/velvet-loop-cover.png)
- [together-cover.png](public/assets/together-cover.png)
- [quiet-code-cover.png](public/assets/quiet-code-cover.png)

[Selected source image](docs/reference/arena-world-home-v004.png), [Three Raycaster](https://threejs.org/docs/pages/Raycaster.html), [IcosahedronGeometry](https://threejs.org/docs/pages/IcosahedronGeometry.html).
