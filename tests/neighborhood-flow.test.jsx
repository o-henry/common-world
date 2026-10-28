import {describe, it, expect, beforeAll, beforeEach, afterEach, vi} from 'vitest';
import React from 'react';
import {act, fireEvent, render, screen, within, cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const capture = vi.hoisted(() => ({world: null, handlers: null}));
vi.mock('../src/world.js', async original => {
  const module = await original();
  return {...module, mountWorld: vi.fn((host, world, handlers) => {
    capture.world = world; capture.handlers = handlers;
    return {select: vi.fn(), borders: vi.fn(), updateOwners: vi.fn(), setWorks: vi.fn(), turn: vi.fn(), dispose: vi.fn()};
  })};
});
import {LegacyApp as App} from '../src/App.jsx';
import {LEAGUE_KEY} from '../src/league-storage.js';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {this.open = true;};
  HTMLDialogElement.prototype.close = function () {this.open = false;};
});
beforeEach(() => localStorage.clear());
afterEach(cleanup);
const start = () => {render(<App/>); return userEvent.setup();};

describe('sphere and neighborhood share the same works and local world', () => {
  it('opens the settlement, selects a map work and keeps the actual cover identity', async () => {
    const user = start();
    await user.click(screen.getByRole('button', {name: '이곳 둘러보기'}));
    const map = screen.getByRole('group', {name: '지역 작품 지도'});
    expect(within(map).getAllByRole('button')).toHaveLength(6);
    await user.click(within(map).getByRole('button', {name: '지도 작품 Velvet Loop · mori'}));
    expect(screen.getByRole('heading', {name: /Velvet Loop/})).toBeTruthy();
    const image = within(map).getByRole('button', {name: '지도 작품 Velvet Loop · mori'}).querySelector('image');
    expect(image.getAttribute('href')).toBe(screen.getByRole('img', {name: 'Velvet Loop 표지'}).getAttribute('src'));
  });

  it('retains map zoom and position after returning through the globe', async () => {
    const user = start();
    await user.click(screen.getByRole('button', {name: '지역', exact: true}));
    await user.click(screen.getByRole('button', {name: '지역 지도 확대'}));
    const map = screen.getByRole('group', {name: '지역 작품 지도'});
    fireEvent.keyDown(map, {key: 'ArrowRight'});
    const before = map.getAttribute('viewBox');
    await user.click(screen.getByRole('button', {name: '구체', exact: true}));
    await user.click(screen.getByRole('button', {name: '지역', exact: true}));
    expect(screen.getByRole('group', {name: '지역 작품 지도'}).getAttribute('viewBox')).toBe(before);
    expect(screen.getByText('120%')).toBeTruthy();
  });

  it('shows an honest empty region and moves to the actual frontier from a distant neutral location', async () => {
    const user = start();
    const distant = capture.world.cells.find(cell => cell.normal.z < -.95);
    act(() => capture.handlers.onEmpty(distant.id));
    expect(screen.getByRole('heading', {name: '미점유 지역'})).toBeTruthy();
    expect(within(screen.getByRole('group', {name: '지역 작품 지도'})).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('button', {name: '작품이 모인 곳으로'})).toBeTruthy();
    await user.click(screen.getByRole('button', {name: '접경전', exact: true}));
    expect(screen.queryByRole('heading', {name: '미점유 지역'})).toBeNull();
    expect(within(screen.getByRole('group', {name: '지역 작품 지도'})).getByRole('button', {name: '지도 작품 Lumen Hop · nari'})).toBeTruthy();
  });

  it('compares the previous and current border without changing saved ownership or authorship', async () => {
    const user = start();
    await user.click(screen.getByRole('button', {name: '접경전', exact: true}));
    await user.click(screen.getByRole('button', {name: /이 버전으로 출전하기/}));
    for (const side of ['A', 'B']) {
      if (side === 'B') await user.click(screen.getByRole('button', {name: /작품 B 체험 전/}));
      await user.click(screen.getByRole('button', {name: new RegExp(`^작품 ${side} 체험하기`)}));
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', {name: '점프 인터랙션'}));
      await user.click(within(dialog).getByRole('button', {name: '체험 완료'}));
    }
    await user.click(screen.getByRole('radio', {name: 'A가 더 좋음'}));
    await user.click(screen.getByRole('button', {name: '평가 제출'}));
    await user.click(screen.getByRole('button', {name: /결과 확정/}));
    const saved = localStorage.getItem(LEAGUE_KEY), state = JSON.parse(saved).state;
    const changed = state.history.at(-1).result.changedCell;
    const map = screen.getByRole('group', {name: '지역 작품 지도'});
    const plot = () => map.querySelector(`[data-cell-id="${changed}"]`);
    const viewBox = map.getAttribute('viewBox');
    expect(plot().getAttribute('data-owner')).toBe('0');
    await user.click(screen.getByRole('button', {name: '경기 전'}));
    expect(plot().getAttribute('data-owner')).toBe('1');
    expect(map.getAttribute('viewBox')).toBe(viewBox);
    await user.click(screen.getByRole('button', {name: '현재', exact: true}));
    expect(plot().getAttribute('data-owner')).toBe('0');
    expect(localStorage.getItem(LEAGUE_KEY)).toBe(saved);
    expect(state.works.find(work => work.id === 'moonstep').author).toBe('sol');
  });

  it('does not touch the old version save during reset of the new prototype', async () => {
    const legacy = '{"anOldSave":"keep exactly"}';
    localStorage.setItem('common:frontier-league:v1', legacy);
    const user = start();
    await user.click(screen.getByRole('button', {name: '연습 기록 초기화'}));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', {name: '연습 기록을 지우고 처음부터'}));
    expect(localStorage.getItem('common:frontier-league:v1')).toBe(legacy);
    expect(JSON.parse(localStorage.getItem(LEAGUE_KEY)).state.owners.filter(owner => owner === -1)).toHaveLength(589);
  });
});
