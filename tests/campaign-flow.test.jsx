import {describe,it,expect,beforeAll,beforeEach,afterEach,vi} from 'vitest';
import React from 'react';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {webcrypto} from 'node:crypto';
import {render,screen,within,cleanup,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../src/world.js',async original=>({...await original(),mountWorld:vi.fn(()=>({select:vi.fn(),borders:vi.fn(),updateOwners:vi.fn(),setWorks:vi.fn(),turn:vi.fn(),dispose:vi.fn()}))}));
import {App as CampaignApp} from '../src/App.jsx';
import {CAMPAIGN_KEY} from '../src/campaign-storage.js';
import {getCampaignOffers} from '../src/campaign-model.js';
const source=name=>readFileSync(resolve(process.cwd(),'public','entries',name),'utf8');
const saved=()=>JSON.parse(localStorage.getItem(CAMPAIGN_KEY)).state;
const coordinates=offers=>offers.map(({homeCell,targetCell})=>[homeCell,targetCell]);
beforeAll(()=>{
  HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  HTMLDialogElement.prototype.close=function(){this.open=false;};
});
beforeEach(()=>{
  localStorage.clear();vi.stubGlobal('crypto',webcrypto);
  vi.stubGlobal('fetch',vi.fn(async path=>({ok:true,text:async()=>source(String(path).split('/').at(-1))})));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function start(){const user=userEvent.setup();render(<CampaignApp/>);await screen.findByRole('region',{name:'접경 비교와 출전'});await waitFor(()=>expect(localStorage.getItem(CAMPAIGN_KEY)).toBeTruthy());return user;}
async function choose(user,index=0){
  const offer=getCampaignOffers(saved())[index];
  await user.click(screen.getByRole('button',{name:`${offer.title} 선택`,exact:true}));
  await user.click(screen.getByRole('button',{name:'선택한 접경에 출전'}));
  return offer;
}
async function submitBoth(user){
  await user.click(screen.getByRole('button',{name:'Claude 이 버전 출품'}));
  await user.click(screen.getByRole('button',{name:'OpenAI 이 버전 출품'}));
}
async function evaluate(user,choice='A',confirm=true){
  for(const side of ['A','B']){
    if(side==='B')await user.click(screen.getByRole('button',{name:'작품 B 직접 체험 전'}));
    await user.click(screen.getByRole('button',{name:`작품 ${side} 실행하기`}));
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'직접 체험 완료'}));
  }
  if(confirm)for(const select of within(screen.getByRole('region',{name:'AI 대결'})).getAllByRole('combobox'))await user.selectOptions(select,'pass');
  const labels={A:'A가 더 좋음',B:'B가 더 좋음',tie:'차이를 고르기 어려움'};
  await user.click(screen.getByRole('radio',{name:labels[choice]}));
  await user.click(screen.getByRole('button',{name:'기능 확인과 선호 평가 제출'}));
  expect(screen.getByText('선택별 집계는 결과 확정 후 공개합니다.')).toBeTruthy();
  expect(screen.getByRole('region',{name:'AI 대결'}).querySelector('.cp-tally dl')).toBeNull();
  await user.click(screen.getByRole('button',{name:'평가·조건 확인 후 결과 확정'}));
}

describe('v008 border choice and real campaign consequences',()=>{
  it('compares two distinct actual borders without selecting or changing land',async()=>{
    const user=await start(),initial=saved(),offers=getCampaignOffers(initial);
    expect(offers).toHaveLength(2);expect(coordinates(offers)).toEqual([[232,225],[232,552]]);
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('button',{name:'선택한 접경에 출전'}).disabled).toBe(true);
    await user.click(screen.getByRole('button',{name:'피드백 접경 지도에서 위치 보기'}));
    expect(saved()).toEqual(initial);expect(screen.getByRole('group',{name:'지역 작품 지도'})).toBeTruthy();
    expect(screen.queryByRole('button',{name:/달빛 접경.*양측 출품 모집/})).toBeNull();
    await user.click(screen.getByRole('button',{name:'피드백 접경 선택',exact:true}));
    expect(saved().campaign.current.targetCell).toBe(552);expect(saved().owners).toEqual(initial.owners);
    await user.click(screen.getByRole('button',{name:'재도전 접경 선택',exact:true}));
    expect(saved().campaign.current.targetCell).toBe(225);expect(saved().history).toHaveLength(0);
  });
  it('locks alternatives after one sealed submission and restores that lock',async()=>{
    let user=await start();await choose(user);await user.click(screen.getByRole('button',{name:'Claude 이 버전 출품'}));
    await user.click(screen.getByRole('button',{name:'전황으로 돌아가기'}));
    expect(screen.getByText(/첫 출품이 고정되어/)).toBeTruthy();
    expect(screen.queryByRole('button',{name:'피드백 접경 선택',exact:true})).toBeNull();
    const before=saved();cleanup();user=await start();expect(saved().campaign.current).toEqual(before.campaign.current);
    expect(screen.getByRole('button',{name:'현재 경기로 돌아가기'})).toBeTruthy();
    await user.click(screen.getByRole('button',{name:'현재 경기로 돌아가기'}));
    expect(screen.getByText('제출 버전 고정')).toBeTruthy();
  });
  for(const index of [0,1])for(const outcome of ['A','B'])it(`border ${index+1}: ${outcome} result changes actual next routes exactly as previewed`,async()=>{
    let user=await start();const before=saved(),offer=getCampaignOffers(before)[index];
    const expected=coordinates(outcome==='A'?offer.win.offers:offer.loss.offers);
    await choose(user,index);await submitBoth(user);await evaluate(user,outcome);
    const after=saved();expect(after.history).toHaveLength(1);expect(after.campaign.log).toHaveLength(1);
    expect(after.history[0].result.outcome).toBe(outcome);
    expect(after.owners.filter((owner,id)=>owner!==before.owners[id])).toHaveLength(1);
    expect(coordinates(getCampaignOffers(after))).toEqual(expected);
    expect(after.works).toEqual(before.works);
    await user.click(screen.getByRole('button',{name:'변경된 다음 접경 비교하기'}));
    expect(screen.getAllByRole('article')).toHaveLength(expected.length);
    expect(screen.getByRole('button',{name:'선택한 접경에 출전'}).disabled).toBe(true);
    const nextOffer=getCampaignOffers(after)[0];await user.click(screen.getByRole('button',{name:`${nextOffer.title} 선택`,exact:true}));
    const chosen=saved();expect(chosen.campaign.current.homeCell).toBe(expected[0][0]);
    await user.click(screen.getByRole('button',{name:'판정 근거'}));
    const record=screen.getByRole('dialog',{name:'지난 경기 판정 근거'});
    expect(within(record).getByRole('heading',{name:/작품 A · Moon Hop · v1/})).toBeTruthy();
    expect(saved()).toEqual(chosen);
    await user.click(within(record).getByRole('button',{name:'닫기'}));
    cleanup();user=await start();expect(saved().campaign).toEqual(chosen.campaign);expect(saved().owners).toEqual(after.owners);
    await user.click(screen.getByRole('button',{name:'선택한 접경에 출전'}));
    expect(saved().activeFrontierId).toBe('campaign-2');
    expect(screen.getByRole('region',{name:'AI 대결'})).toBeTruthy();
  });
  for(const [choice,confirm,outcome] of [['tie',true,'tie'],['A',false,'review']])it(`holds land and focus for ${outcome}`,async()=>{
    const user=await start(),before=saved();await choose(user);await submitBoth(user);await evaluate(user,choice,confirm);
    expect(saved().owners).toEqual(before.owners);expect(saved().campaign.anchorCell).toBe(before.campaign.anchorCell);
    expect(saved().history[0].result.outcome).toBe(outcome);
  });
  it('preserves v007 and earlier data when explicitly resetting a corrupt v008 record',async()=>{
    const oldKeys=['common:competition:v1','common:frontier-league:v1','common:frontier-neighborhood:v1'];
    for(const key of oldKeys)localStorage.setItem(key,`original-${key}`);
    localStorage.setItem(CAMPAIGN_KEY,'corrupt');const user=await start();
    expect(localStorage.getItem(CAMPAIGN_KEY)).toBe('corrupt');
    await user.click(screen.getByRole('button',{name:'연습 기록 초기화'}));
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'이 연습 기록만 초기화'}));
    expect(saved().campaign.current).toBeNull();
    for(const key of oldKeys)expect(localStorage.getItem(key)).toBe(`original-${key}`);
  });
  it('resets route preview and map focus together, while cancel preserves the selected front',async()=>{
    const user=await start();
    await user.click(screen.getByRole('button',{name:'피드백 접경 지도에서 위치 보기'}));
    await user.click(screen.getByRole('button',{name:'피드백 접경 선택',exact:true}));
    const before=saved();
    await user.click(screen.getByRole('button',{name:'연습 기록 초기화'}));
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'닫기'}));
    expect(saved()).toEqual(before);
    await user.click(screen.getByRole('button',{name:'연습 기록 초기화'}));
    await user.click(within(screen.getByRole('dialog')).getByRole('button',{name:'이 연습 기록만 초기화'}));
    expect(saved().campaign.current).toBeNull();
    expect(screen.getByRole('button',{name:'선택한 접경에 출전'}).disabled).toBe(true);
    expect(screen.getByRole('button',{name:'구체',exact:true}).getAttribute('aria-pressed')).toBe('true');
  });
});
