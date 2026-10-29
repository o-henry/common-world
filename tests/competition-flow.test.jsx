import {describe, it, expect, beforeAll, beforeEach, afterEach, vi} from 'vitest';
import React from 'react';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {webcrypto} from 'node:crypto';
import {act, render, screen, within, cleanup, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../src/world.js', async original => {
  const module = await original();
  return {...module, mountWorld:vi.fn(() => ({select:vi.fn(),borders:vi.fn(),updateOwners:vi.fn(),setWorks:vi.fn(),turn:vi.fn(),dispose:vi.fn()}))};
});
import {CompetitionApp as App} from '../src/CompetitionApp.jsx';
import {COMPETITION_KEY} from '../src/competition-storage.js';

const source = name => readFileSync(resolve(process.cwd(),'public','entries',name), 'utf8');
const saved = () => JSON.parse(localStorage.getItem(COMPETITION_KEY)).state;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function(){this.open=true;};
  HTMLDialogElement.prototype.close = function(){this.open=false;};
});
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('crypto',webcrypto);
  vi.stubGlobal('fetch',vi.fn(async path => ({ok:true,text:async () => source(String(path).split('/').at(-1))})));
});
afterEach(() => {cleanup();vi.unstubAllGlobals();});
async function start() {const user=userEvent.setup();render(<App/>);await screen.findByRole('region',{name:'AI 대결 전황'});return user;}
async function submitBoth(user) {
  await user.click(screen.getByRole('button',{name:'접경전',exact:true}));
  await user.click(screen.getByRole('button',{name:'Claude 이 버전 출품'}));
  await user.click(screen.getByRole('button',{name:'OpenAI 이 버전 출품'}));
}
async function trial(user,side) {
  if(side==='B')await user.click(screen.getByRole('button',{name:/작품 B 직접 체험 전/}));
  await user.click(screen.getByRole('button',{name:`작품 ${side} 실행하기`}));
  const dialog=screen.getByRole('dialog'),frame=within(dialog).getByTitle(`작품 ${side} 실행 화면`);
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(frame.getAttribute('srcdoc')).toContain("connect-src 'none'");
  expect(frame.getAttribute('srcdoc')).toContain('<canvas');
  await user.click(within(dialog).getByRole('button',{name:'직접 체험 완료'}));
}
async function evaluate(user,choice='A',pass=true) {
  await trial(user,'A');await trial(user,'B');
  if(pass)for(const side of ['A','B'])for(const name of ['조작 입력이 반영됨','실패 후 다시 시작','진행·결과 피드백'])
    await user.selectOptions(screen.getByRole('combobox',{name:`작품 ${side} ${name}`}), 'pass');
  await user.click(screen.getByRole('radio',{name:choice==='A'?'A가 더 좋음':'B가 더 좋음'}));
  await user.type(screen.getByRole('textbox',{name:/선택 이유와 개선할 점/}),'입력 반응과 재시작 동선을 직접 확인했습니다.');
  await user.click(screen.getByRole('button',{name:'기능 확인과 선호 평가 제출'}));
  await user.click(screen.getByRole('button',{name:'평가·조건 확인 후 결과 확정'}));
}

describe('v007 symmetric artifact competition',()=>{
  it('shows an honest empty record and both available factions on the home screen',async()=>{
    await start();
    expect(screen.getByRole('heading',{name:'Claude × OpenAI'})).toBeTruthy();
    expect(screen.getByText('양측 1칸 · 0/2 출품')).toBeTruthy();
    expect(screen.getByText('독립적으로 검증된 AI 경기')).toBeTruthy();
    expect(screen.getByText(/같은 Codex 세션에서 만든 참고 구현/)).toBeTruthy();
    expect(saved().history).toHaveLength(0);
  });
  for(const winner of ['A','B'])it(`seals both files, derives ${winner} from the ballot and preserves the exact result through restore`,async()=>{
    let user=await start();const before=saved().owners;
    await submitBoth(user);
    const panel=screen.getByRole('region',{name:'AI 대결'});
    expect(within(panel).queryByText('Moon Hop')).toBeNull();
    expect(within(panel).queryByText('Orbit Run')).toBeNull();
    expect(screen.getByRole('button',{name:'평가·조건 확인 후 결과 확정'}).disabled).toBe(true);
    await evaluate(user,winner);
    const data=saved(),record=data.history[0];
    expect(record.result.valid).toBe(1);
    expect(record.result.outcome).toBe(winner);
    expect(data.owners.filter((owner,index)=>owner!==before[index])).toHaveLength(1);
    const selected=record.result.changedCell,map=screen.getByRole('group',{name:'지역 작품 지도'});
    expect(map.querySelector(`[data-cell-id="${selected}"]`).getAttribute('data-owner')).toBe(String(record.result.winnerTeam));
    await user.click(screen.getByRole('button',{name:'경기 전'}));
    expect(map.querySelector(`[data-cell-id="${selected}"]`).getAttribute('data-owner')).toBe(String(record.result.previousOwner));
    expect(saved().owners).toEqual(data.owners);
    cleanup();user=await start();
    expect(saved().history).toHaveLength(1);expect(saved().owners).toEqual(data.owners);
    const row=within(screen.getByRole('table')).getByRole('row',{name:new RegExp(`^${winner==='A'?'Claude':'OpenAI'} 1 1 0`)});
    expect(row).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'접경전',exact:true}));
    await user.click(screen.getByRole('button',{name:/다음 접경|탈환전|재대결/}));
    expect(saved().history).toHaveLength(1);
    expect(saved().rounds[saved().activeFrontierId].number).toBe(2);
  });
  it('holds territory when functionality was not confirmed, even with a preference vote',async()=>{
    const user=await start(),before=saved().owners;await submitBoth(user);await evaluate(user,'A',false);
    expect(saved().history[0].result.outcome).toBe('review');expect(saved().owners).toEqual(before);
  });
  it('registers a right-side HTML artifact and keeps the AI declaration separate from faction',async()=>{
    const user=await start();await user.click(screen.getByRole('button',{name:'결과물 출품'}));
    const dialog=screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox',{name:'작품 이름'}),'직접 제출한 결과물');
    await user.selectOptions(within(dialog).getByRole('combobox',{name:'출전 진영'}),'1');
    await user.type(within(dialog).getByRole('textbox',{name:'제작에 사용한 AI · 신고'}),'직접 신고한 AI');
    await user.type(within(dialog).getByRole('textbox',{name:'제작 에이전트'}),'사용한 에이전트');
    await user.upload(within(dialog).getByLabelText('실행할 단일 HTML · 최대 256KiB'),new File([source('orbit-run.html')],'my-game.html',{type:'text/html'}));
    await within(dialog).findByText(/HTML 준비됨/);
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button',{name:'결과물 등록'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    const work=saved().works.find(item=>item.title==='직접 제출한 결과물');
    expect(work.faction).toBe('OpenAI');expect(work.creationAI).toBe('직접 신고한 AI');expect(work.artifact.sourceKind).toBe('user-upload');
    await user.click(screen.getByRole('button',{name:'접경전',exact:true}));
    expect(screen.getByRole('button',{name:'OpenAI 이 버전 출품'}).disabled).toBe(false);
    expect(screen.getByRole('button',{name:'Claude 이 버전 출품'}).disabled).toBe(true);
  });
  it('ignores an old file read after the upload dialog is closed and reopened',async()=>{
    const user=await start();const pending=[];
    vi.stubGlobal('FileReader',class {readAsText(file){pending.push({reader:this,file});}});
    await user.click(screen.getByRole('button',{name:'결과물 출품'}));
    let dialog=screen.getByRole('dialog');
    await user.upload(within(dialog).getByLabelText('실행할 단일 HTML · 최대 256KiB'),new File(['<p>old</p>'],'old.html',{type:'text/html'}));
    expect(pending).toHaveLength(1);
    await user.click(within(dialog).getByRole('button',{name:'닫기'}));
    await user.click(screen.getByRole('button',{name:'결과물 출품'}));
    dialog=screen.getByRole('dialog');
    await act(async()=>{pending[0].reader.result='<p>old</p>';pending[0].reader.onload();await new Promise(resolve=>setTimeout(resolve,10));});
    expect(within(dialog).queryByText(/HTML 준비됨/)).toBeNull();
    expect(within(dialog).getByRole('button',{name:'결과물 등록'}).disabled).toBe(true);
  });
  it('preserves earlier save keys and keeps a corrupt current record until explicit reset',async()=>{
    localStorage.setItem('common:frontier-league:v1','old-v005');localStorage.setItem('common:frontier-neighborhood:v1','old-v006');
    localStorage.setItem(COMPETITION_KEY,'broken');const user=await start();
    expect(localStorage.getItem(COMPETITION_KEY)).toBe('broken');
    await user.click(screen.getByRole('button',{name:'연습 기록 초기화'}));
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'이 연습 기록만 초기화'}));
    expect(saved().history).toHaveLength(0);
    expect(localStorage.getItem('common:frontier-league:v1')).toBe('old-v005');
    expect(localStorage.getItem('common:frontier-neighborhood:v1')).toBe('old-v006');
  });
});
