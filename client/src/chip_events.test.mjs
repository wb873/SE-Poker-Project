import { test, expect } from '@jest/globals';
import { chipEvents, HAND_END_DELAY, SWAP_TIME } from './chip_events.mjs';

const seat = (username, status, extra = {}) => ({ username, status, result: null, net: null, ...extra });
const state = (phase, seats) => ({ lobbyId: 'L1', ante: 10, swapCost: 20, phase, seats });

test('nothing plays on the first state', () => {
  expect(chipEvents(null, state('done', [seat('a', 'raised', { result: 'win', net: 30 })]))).toEqual([]);
});

test('a fold sends the ante to the dealer', () => {
  const prev = state('decision', [seat('a', 'deciding'), seat('b', 'deciding')]);
  const next = state('decision', [seat('a', 'folded'), seat('b', 'deciding')]);
  expect(chipEvents(prev, next)).toEqual([{ username: 'a', kind: 'fold', toDealer: true, label: '-$10', delay: 0 }]);
});

test('when the hand ends, winners get chips and losers pay the dealer', () => {
  const prev = state('decision', [seat('a', 'raised'), seat('b', 'raised'), seat('c', 'raised'), seat('d', 'deciding')]);
  const next = state('done', [
    seat('a', 'raised', { result: 'win', net: 1030 }),
    seat('b', 'raised', { result: 'loss', net: -30 }),
    seat('c', 'raised', { result: 'push', net: 0 }),
    seat('d', 'folded', { result: 'fold', net: -10 }),
  ]);
  expect(chipEvents(prev, next)).toEqual([
    { username: 'a', kind: 'win', toDealer: false, label: '+$1,030', delay: HAND_END_DELAY },
    { username: 'b', kind: 'loss', toDealer: true, label: '-$30', delay: HAND_END_DELAY },
    { username: 'c', kind: 'push', toDealer: false, label: 'Push', delay: HAND_END_DELAY },
    { username: 'd', kind: 'fold', toDealer: true, label: '-$10', delay: 0 }, // the last fold ended the hand
  ]);
});

test('a dealer who does not qualify counts as a win', () => {
  const prev = state('decision', [seat('a', 'raised')]);
  const next = state('done', [seat('a', 'raised', { result: 'dealer_not_qualified', net: 10 })]);
  expect(chipEvents(prev, next)[0]).toMatchObject({ kind: 'win', label: '+$10' });
});

test('earlier folds are not played again when the hand ends', () => {
  const prev = state('decision', [seat('a', 'folded'), seat('b', 'deciding')]);
  const next = state('done', [seat('a', 'folded', { result: 'fold', net: -10 }), seat('b', 'folded', { result: 'fold', net: -10 })]);
  expect(chipEvents(prev, next).map((e) => e.username)).toEqual(['b']);
});

test('repeat updates after the hand ends play nothing', () => {
  const done = state('done', [seat('a', 'raised', { result: 'win', net: 30 })]);
  expect(chipEvents(done, { ...done })).toEqual([]);
});

test('a new hand starting plays nothing', () => {
  const prev = state('done', [seat('a', 'folded', { result: 'fold' })]);
  const next = state('decision', [seat('a', 'deciding')]);
  expect(chipEvents(prev, next)).toEqual([]);
});

test('seats that just joined or left are skipped', () => {
  const prev = state('decision', [seat('a', 'deciding')]);
  const next = state('done', [seat('b', 'raised', { result: 'win', net: 30 })]);
  expect(chipEvents(prev, next)).toEqual([]);
});

test('without amounts it falls back to words', () => {
  const prev = { lobbyId: 'L1', phase: 'decision', seats: [seat('a', 'deciding'), seat('b', 'raised')] };
  const next = { lobbyId: 'L1', phase: 'done', seats: [seat('a', 'folded'), seat('b', 'raised', { result: 'win' })] };
  expect(chipEvents(prev, next).map((e) => e.label)).toEqual(['Folded', 'Won']);
});

test('a swap slides a card and shows the cost, and the turn stays open', () => {
  const prev = state('decision', [seat('a', 'deciding', { swapUsed: false })]);
  const next = state('decision', [seat('a', 'deciding', { swapUsed: true })]);
  expect(chipEvents(prev, next)).toEqual([
    { username: 'a', kind: 'swap', toDealer: false, label: 'Swapped 1 card · -$20', delay: 0 },
  ]);
});

test('a swap plays once, not again on later updates', () => {
  const swapped = state('decision', [seat('a', 'deciding', { swapUsed: true })]);
  expect(chipEvents(swapped, { ...swapped })).toEqual([]);
});

test('a bot that swaps then folds in one update folds after the swap finishes', () => {
  const prev = state('decision', [seat('bot', 'deciding', { swapUsed: false }), seat('a', 'deciding')]);
  const next = state('decision', [seat('bot', 'folded', { swapUsed: true }), seat('a', 'deciding')]);
  expect(chipEvents(prev, next).map((e) => [e.kind, e.delay])).toEqual([['swap', 0], ['fold', SWAP_TIME]]);
});

test('a swap that ends the hand plays before the result', () => {
  const prev = state('decision', [seat('bot', 'deciding', { swapUsed: false })]);
  const next = state('done', [seat('bot', 'raised', { swapUsed: true, result: 'win', net: 30 })]);
  expect(chipEvents(prev, next).map((e) => [e.kind, e.delay])).toEqual([['swap', 0], ['win', SWAP_TIME]]);
});

test('a new hand resetting swapUsed plays nothing', () => {
  const prev = state('done', [seat('a', 'raised', { swapUsed: true, result: 'loss' })]);
  const next = state('decision', [seat('a', 'deciding', { swapUsed: false })]);
  expect(chipEvents(prev, next)).toEqual([]);
});
