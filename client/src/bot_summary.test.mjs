import { test, expect } from '@jest/globals';
import { describeBots } from './bot_summary.mjs';

test('no bots', () => {
  expect(describeBots({ enabled: false, amount: 0, difficulties: [] })).toBe('No');
  expect(describeBots(undefined)).toBe('No');
});

test('bots that all match show one difficulty', () => {
  expect(describeBots({ enabled: true, amount: 2, difficulties: ['hard', 'hard'] })).toBe('2 (hard)');
});

test('mixed bots are counted easy to hard', () => {
  expect(describeBots({ enabled: true, amount: 4, difficulties: ['hard', 'easy', 'hard', 'medium'] }))
    .toBe('4 (1 easy, 1 medium, 2 hard)');
});

test('a lobby saved without difficulties shows medium', () => {
  expect(describeBots({ enabled: true, amount: 2 })).toBe('2 (medium)');
});
