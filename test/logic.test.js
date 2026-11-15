// Run with: node --test
// A fixed zone with daylight saving time, so the DST tests mean something.
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  todayStr, addDays, diffDays, isDateStr,
  emptyState, addHabit, renameHabit, deleteHabit,
  toggleToday, normalizeState, habitView, parseState,
} from '../logic.js';

const one = (start, name = 'Stretch') => addHabit(emptyState(), name, start, 'a');
const habit = (state, id = 'a') => state.habits.find((h) => h.id === id);
const blocks = (state, id = 'a') => habit(state, id).completedBlocks;
const current = (state, id = 'a') => habit(state, id).currentBlock;

/** Check habit `id` on each of the given days, in order. */
function checkOn(state, days, id = 'a') {
  for (const d of days) state = toggleToday(state, id, d);
  return state;
}

test('adding a habit starts its first block today', () => {
  const s = one('2026-05-10');
  assert.deepEqual(current(s), { startDate: '2026-05-10', checks: [] });
  assert.deepEqual(blocks(s), []);
});

test('three checks in a row complete a block', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11']);
  assert.equal(blocks(s).length, 0);
  s = toggleToday(s, 'a', '2026-05-12');
  assert.deepEqual(blocks(s), [{ startDate: '2026-05-10', endDate: '2026-05-12' }]);
});

test('a finished block stays on screen until midnight, then a new one starts', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12']);
  const v = habitView(habit(s), '2026-05-12');
  assert.deepEqual(v.days.map((d) => d.checked), [true, true, true]);
  assert.equal(v.days[2].isToday, true);

  s = normalizeState(s, '2026-05-13');
  assert.deepEqual(current(s), { startDate: '2026-05-13', checks: [] });
  assert.equal(blocks(s).length, 1);
});

test('blocks keep adding up', () => {
  let s = one('2026-05-10');
  s = checkOn(s, ['2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15']);
  assert.deepEqual(blocks(s), [
    { startDate: '2026-05-10', endDate: '2026-05-12' },
    { startDate: '2026-05-13', endDate: '2026-05-15' },
  ]);
});

test('missing Day 1 discards the block and restarts the next day', () => {
  const s = normalizeState(one('2026-05-10'), '2026-05-11');
  assert.deepEqual(current(s), { startDate: '2026-05-11', checks: [] });
  assert.deepEqual(blocks(s), []);
});

test('missing Day 2 discards the block', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10']);
  s = normalizeState(s, '2026-05-12'); // Day 2 went by unchecked
  assert.deepEqual(current(s), { startDate: '2026-05-12', checks: [] });
  assert.deepEqual(blocks(s), []);
});

test('missing Day 3 discards the block', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11']);
  s = normalizeState(s, '2026-05-13');
  assert.deepEqual(current(s), { startDate: '2026-05-13', checks: [] });
  assert.deepEqual(blocks(s), []);
});

test('a failed block leaves no record anywhere', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11']);
  s = normalizeState(s, '2026-05-13');
  assert.deepEqual(Object.keys(habit(s)).sort(),
    ['completedBlocks', 'createdAt', 'currentBlock', 'id', 'name']);
  assert.equal(JSON.stringify(s).includes('2026-05-11'), false);
});

test('away for a week: the new block starts on the day of return', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10']);
  s = normalizeState(s, '2026-05-18');
  assert.deepEqual(current(s), { startDate: '2026-05-18', checks: [] });
});

test('away for a week after a completed block keeps the block', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12']);
  s = normalizeState(s, '2026-05-20');
  assert.equal(blocks(s).length, 1);
  assert.deepEqual(current(s), { startDate: '2026-05-20', checks: [] });
});

test("undoing today's check", () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10']);
  assert.deepEqual(current(s).checks, ['2026-05-10']);
  s = toggleToday(s, 'a', '2026-05-10');
  assert.deepEqual(current(s).checks, []);
});

test('undoing the Day 3 check takes the block back; re-checking restores it once', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12']);
  assert.equal(blocks(s).length, 1);
  s = toggleToday(s, 'a', '2026-05-12');
  assert.equal(blocks(s).length, 0);
  assert.deepEqual(current(s).checks, ['2026-05-10', '2026-05-11']);
  s = toggleToday(s, 'a', '2026-05-12');
  assert.equal(blocks(s).length, 1);
});

test('only today can be toggled: past days cannot be back-filled', () => {
  // Day 1 missed. Toggling on Day 2 checks Day 2 of a *new* block, not Day 1.
  const s = toggleToday(one('2026-05-10'), 'a', '2026-05-11');
  assert.deepEqual(current(s), { startDate: '2026-05-11', checks: ['2026-05-11'] });
});

test('normalizing is idempotent and never double-counts', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12']);
  const once = normalizeState(s, '2026-05-12');
  assert.deepEqual(normalizeState(once, '2026-05-12'), once);
  assert.equal(blocks(normalizeState(normalizeState(s, '2026-05-13'), '2026-05-13')).length, 1);
});

test('crossing midnight changes the day', () => {
  assert.equal(todayStr(new Date(2026, 4, 10, 23, 59, 59)), '2026-05-10');
  assert.equal(todayStr(new Date(2026, 4, 11, 0, 0, 0)), '2026-05-11');
  // Checked at 23:59, opened again at 00:00: yesterday counts, today is open.
  let s = one(todayStr(new Date(2026, 4, 10, 9, 0)));
  s = toggleToday(s, 'a', todayStr(new Date(2026, 4, 10, 23, 59, 59)));
  const v = habitView(habit(s), todayStr(new Date(2026, 4, 11, 0, 0, 0)));
  assert.deepEqual(v.days.map((d) => [d.checked, d.isToday]),
    [[true, false], [false, true], [false, false]]);
});

test('month boundary', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29'); // leap year
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  const s = checkOn(one('2026-04-29'), ['2026-04-29', '2026-04-30', '2026-05-01']);
  assert.deepEqual(blocks(s), [{ startDate: '2026-04-29', endDate: '2026-05-01' }]);
});

test('year boundary', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2026-12-30', '2027-01-01'), 2);
  const s = checkOn(one('2026-12-30'), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.deepEqual(blocks(s), [{ startDate: '2026-12-30', endDate: '2027-01-01' }]);
});

test('daylight saving: spring forward (23-hour day)', () => {
  // US clocks jump 02:00 -> 03:00 on 2026-03-08.
  assert.equal(addDays('2026-03-07', 1), '2026-03-08');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(diffDays('2026-03-07', '2026-03-09'), 2);
  assert.equal(todayStr(new Date(2026, 2, 8, 0, 30)), '2026-03-08');
  assert.equal(todayStr(new Date(2026, 2, 8, 23, 30)), '2026-03-08');
  const s = checkOn(one('2026-03-07'), ['2026-03-07', '2026-03-08', '2026-03-09']);
  assert.deepEqual(blocks(s), [{ startDate: '2026-03-07', endDate: '2026-03-09' }]);
});

test('daylight saving: fall back (25-hour day)', () => {
  // US clocks fall 02:00 -> 01:00 on 2026-11-01.
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(diffDays('2026-10-31', '2026-11-02'), 2);
  assert.equal(todayStr(new Date(2026, 10, 1, 23, 59)), '2026-11-01');
  const s = checkOn(one('2026-10-31'), ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(blocks(s), [{ startDate: '2026-10-31', endDate: '2026-11-02' }]);
  // And a miss across the change is still a miss.
  const missed = normalizeState(checkOn(one('2026-10-31'), ['2026-10-31']), '2026-11-02');
  assert.deepEqual(current(missed), { startDate: '2026-11-02', checks: [] });
});

test('three habits progress independently, each with its own block series', () => {
  let s = emptyState();
  s = addHabit(s, 'Read', '2026-05-10', 'a');
  s = addHabit(s, 'Run', '2026-05-10', 'b');
  s = addHabit(s, 'Write', '2026-05-11', 'c'); // added a day later

  // Day by day, as it would really happen:
  // a is checked every day (completes), b only on Day 1 (misses Day 2),
  // c from the day it was added (mid-block).
  s = toggleToday(s, 'a', '2026-05-10');
  s = toggleToday(s, 'b', '2026-05-10');
  s = toggleToday(s, 'a', '2026-05-11');
  s = toggleToday(s, 'c', '2026-05-11');
  s = toggleToday(s, 'a', '2026-05-12');
  s = toggleToday(s, 'c', '2026-05-12');

  assert.equal(blocks(s, 'a').length, 1);
  assert.deepEqual(current(s, 'a').checks.length, 3);
  assert.equal(blocks(s, 'b').length, 0);
  assert.deepEqual(current(s, 'b'), { startDate: '2026-05-12', checks: [] });
  assert.equal(blocks(s, 'c').length, 0);
  assert.deepEqual(current(s, 'c'), { startDate: '2026-05-11', checks: ['2026-05-11', '2026-05-12'] });

  s = toggleToday(s, 'c', '2026-05-13');
  assert.equal(blocks(s, 'a').length, 1);
  assert.equal(blocks(s, 'b').length, 0);
  assert.deepEqual(blocks(s, 'c'), [{ startDate: '2026-05-11', endDate: '2026-05-13' }]);
});

test('at most three habits; names are trimmed and required', () => {
  let s = emptyState();
  s = addHabit(s, '  Read   a  page ', '2026-05-10', 'a');
  assert.equal(habit(s).name, 'Read a page');
  s = addHabit(s, 'Run', '2026-05-10', 'b');
  s = addHabit(s, 'Write', '2026-05-10', 'c');
  assert.throws(() => addHabit(s, 'Fourth', '2026-05-10', 'd'));
  assert.throws(() => addHabit(emptyState(), '   ', '2026-05-10', 'a'));
});

test('rename keeps progress; delete removes the habit and its blocks', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12']);
  s = addHabit(s, 'Run', '2026-05-12', 'b');
  s = renameHabit(s, 'a', 'Stretch daily');
  assert.equal(habit(s).name, 'Stretch daily');
  assert.equal(blocks(s).length, 1);
  assert.equal(renameHabit(s, 'a', '  '), s); // blank name is ignored
  s = deleteHabit(s, 'a');
  assert.deepEqual(s.habits.map((h) => h.id), ['b']);
});

test('a clock set backwards does not break anything', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10']);
  s = normalizeState(s, '2026-05-08');
  assert.deepEqual(current(s), { startDate: '2026-05-08', checks: [] });
});

test('export/import round trip, and bad files are rejected', () => {
  const s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12']);
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(s))), s);
  assert.throws(() => parseState(null));
  assert.throws(() => parseState({ habits: 'nope' }));
  assert.throws(() => parseState({ habits: [{ id: 'a', name: '' }] }));
  assert.throws(() => parseState({ habits: [1, 2, 3, 4].map((n) => ({ id: `${n}`, name: 'x' })) }));
  assert.equal(isDateStr('2026-02-30'), false);
  // Junk dates are dropped rather than trusted.
  const tidy = parseState({ habits: [{ id: 'a', name: 'x',
    completedBlocks: [{ startDate: '2026-02-30', endDate: 'nope' }],
    currentBlock: { startDate: 'garbage', checks: [] } }] });
  assert.deepEqual(tidy.habits[0].completedBlocks, []);
  assert.deepEqual(current(normalizeState(tidy, '2026-05-10')), { startDate: '2026-05-10', checks: [] });
});
