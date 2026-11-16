// Run with: node --test
// A fixed zone with daylight saving time, so the DST tests mean something.
process.env.TZ = 'America/New_York';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  todayStr, addDays, diffDays, isDateStr,
  emptyState, addHabit, renameHabit, deleteHabit,
  toggleDay, startNewBlock, normalizeState, habitView, parseState,
} from '../logic.js';

const one = (start, name = 'Stretch') => addHabit(emptyState(), name, start, 'a');
const habit = (state, id = 'a') => state.habits.find((h) => h.id === id);
const blocks = (state, id = 'a') => habit(state, id).completedBlocks;
const current = (state, id = 'a') => habit(state, id).currentBlock;

/** Log each of the given days on that same day, in order. */
function checkOn(state, days, id = 'a') {
  for (const d of days) state = toggleDay(state, id, d, d);
  return state;
}

test('adding a habit starts its first block today', () => {
  const s = one('2026-05-10');
  assert.deepEqual(current(s), { startDate: '2026-05-10', checks: [] });
  assert.deepEqual(blocks(s), []);
});

test('three days checked complete a block', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11']);
  assert.equal(blocks(s).length, 0);
  s = toggleDay(s, 'a', '2026-05-12', '2026-05-12');
  assert.deepEqual(blocks(s), [{ startDate: '2026-05-10', endDate: '2026-05-12' }]);
});

test('a full block stays on screen until midnight, then the next one starts', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12']);
  const v = habitView(habit(s), '2026-05-12');
  assert.deepEqual(v.days.map((d) => d.checked), [true, true, true]);
  assert.equal(v.full, true);
  assert.equal(v.canRestart, false);

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

// ---------- not logging is not failing ----------

test('an unlogged Day 1 does not discard the block', () => {
  const s = normalizeState(one('2026-05-10'), '2026-05-11');
  assert.deepEqual(current(s), { startDate: '2026-05-10', checks: [] });
});

test('an unlogged Day 2 does not discard the block', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10']);
  s = normalizeState(s, '2026-05-12');
  assert.deepEqual(current(s), { startDate: '2026-05-10', checks: ['2026-05-10'] });
});

test('an unlogged Day 3 does not discard the block', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11']);
  s = normalizeState(s, '2026-05-13');
  assert.deepEqual(current(s), { startDate: '2026-05-10', checks: ['2026-05-10', '2026-05-11'] });
  assert.equal(blocks(s).length, 0);
});

test('away for a week: the block is still open, exactly as it was left', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10']);
  s = normalizeState(s, '2026-05-18');
  assert.deepEqual(current(s), { startDate: '2026-05-10', checks: ['2026-05-10'] });
  const v = habitView(habit(s), '2026-05-18');
  assert.equal(v.canRestart, true);
  assert.deepEqual(v.days.map((d) => d.isFuture), [false, false, false]);
});

test('past days of the open block can be logged late', () => {
  let s = one('2026-05-10');
  // Did the habit all three days, opened the app only on the 14th.
  s = toggleDay(s, 'a', '2026-05-10', '2026-05-14');
  s = toggleDay(s, 'a', '2026-05-11', '2026-05-14');
  assert.equal(blocks(s).length, 0);
  s = toggleDay(s, 'a', '2026-05-12', '2026-05-14');
  assert.deepEqual(blocks(s), [{ startDate: '2026-05-10', endDate: '2026-05-12' }]);
});

test('after a late-filled block, the next block starts the day after it, so it can be caught up too', () => {
  let s = one('2026-05-10');
  for (const d of ['2026-05-10', '2026-05-11', '2026-05-12']) s = toggleDay(s, 'a', d, '2026-05-14');
  // Rest of the 14th: the full block is still showing (undo is possible).
  assert.equal(current(s).startDate, '2026-05-10');
  s = normalizeState(s, '2026-05-15');
  assert.deepEqual(current(s), { startDate: '2026-05-13', checks: [] });
  // Catch up the second block too.
  for (const d of ['2026-05-13', '2026-05-14', '2026-05-15']) s = toggleDay(s, 'a', d, '2026-05-15');
  assert.equal(blocks(s).length, 2);
});

test('future days cannot be checked', () => {
  let s = one('2026-05-10');
  s = toggleDay(s, 'a', '2026-05-11', '2026-05-10');
  s = toggleDay(s, 'a', '2026-05-12', '2026-05-10');
  assert.deepEqual(current(s).checks, []);
  const v = habitView(habit(s), '2026-05-10');
  assert.deepEqual(v.days.map((d) => [d.isToday, d.isFuture]),
    [[true, false], [false, true], [false, true]]);
});

test('days outside the current block cannot be checked', () => {
  const s = toggleDay(one('2026-05-10'), 'a', '2026-05-09', '2026-05-12');
  assert.deepEqual(current(s).checks, []);
});

// ---------- starting a new block ----------

test('starting a new block drops the open one without a trace and starts today', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11']);
  s = startNewBlock(s, 'a', '2026-05-14');
  assert.deepEqual(current(s), { startDate: '2026-05-14', checks: [] });
  assert.deepEqual(blocks(s), []);
  assert.deepEqual(Object.keys(habit(s)).sort(),
    ['completedBlocks', 'createdAt', 'currentBlock', 'id', 'name']);
  assert.equal(JSON.stringify(s).includes('2026-05-11'), false);
});

test('starting a new block keeps earlier completed blocks and other habits', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13']);
  s = addHabit(s, 'Run', '2026-05-13', 'b');
  s = toggleDay(s, 'b', '2026-05-13', '2026-05-13');
  s = startNewBlock(s, 'a', '2026-05-20');
  assert.equal(blocks(s).length, 1);
  assert.deepEqual(current(s), { startDate: '2026-05-20', checks: [] });
  assert.deepEqual(current(s, 'b'), { startDate: '2026-05-13', checks: ['2026-05-13'] });
});

test('a full block cannot be thrown away by starting a new one', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12']);
  s = startNewBlock(s, 'a', '2026-05-12');
  assert.equal(blocks(s).length, 1);
  assert.equal(current(s).startDate, '2026-05-10');
});

// ---------- undo ----------

test('a check can be undone, today or on an earlier day of the block', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11']);
  s = toggleDay(s, 'a', '2026-05-11', '2026-05-11');
  assert.deepEqual(current(s).checks, ['2026-05-10']);
  s = toggleDay(s, 'a', '2026-05-10', '2026-05-11');
  assert.deepEqual(current(s).checks, []);
});

test('undoing a check on a full block takes the block back; re-checking restores it once', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12']);
  assert.equal(blocks(s).length, 1);
  s = toggleDay(s, 'a', '2026-05-11', '2026-05-12');
  assert.equal(blocks(s).length, 0);
  assert.deepEqual(current(s), { startDate: '2026-05-10', checks: ['2026-05-10', '2026-05-12'] });
  s = toggleDay(s, 'a', '2026-05-11', '2026-05-12');
  assert.equal(blocks(s).length, 1);
});

test('normalizing is idempotent and never double-counts', () => {
  const s = checkOn(one('2026-05-10'), ['2026-05-10', '2026-05-11', '2026-05-12']);
  const once = normalizeState(s, '2026-05-12');
  assert.deepEqual(normalizeState(once, '2026-05-12'), once);
  assert.equal(blocks(normalizeState(normalizeState(s, '2026-05-13'), '2026-05-13')).length, 1);
  const later = normalizeState(s, '2026-05-30');
  assert.deepEqual(normalizeState(later, '2026-05-30'), later);
  assert.equal(blocks(later).length, 1);
});

// ---------- calendar ----------

test('crossing midnight changes the day', () => {
  assert.equal(todayStr(new Date(2026, 4, 10, 23, 59, 59)), '2026-05-10');
  assert.equal(todayStr(new Date(2026, 4, 11, 0, 0, 0)), '2026-05-11');
  const d1 = todayStr(new Date(2026, 4, 10, 23, 59, 59));
  const s = toggleDay(one(d1), 'a', d1, d1);
  const v = habitView(habit(s), todayStr(new Date(2026, 4, 11, 0, 0, 0)));
  assert.deepEqual(v.days.map((d) => [d.checked, d.isToday, d.isFuture]),
    [[true, false, false], [false, true, false], [false, false, true]]);
});

test('month boundary', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29'); // leap year
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  let s = checkOn(one('2026-04-29'), ['2026-04-29', '2026-04-30', '2026-05-01']);
  assert.deepEqual(blocks(s), [{ startDate: '2026-04-29', endDate: '2026-05-01' }]);
  s = normalizeState(s, '2026-05-02');
  assert.equal(current(s).startDate, '2026-05-02');
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
  assert.deepEqual(habitView(habit(one('2026-03-07')), '2026-03-07').days.map((d) => d.date),
    ['2026-03-07', '2026-03-08', '2026-03-09']);
});

test('daylight saving: fall back (25-hour day)', () => {
  // US clocks fall 02:00 -> 01:00 on 2026-11-01.
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(diffDays('2026-10-31', '2026-11-02'), 2);
  assert.equal(todayStr(new Date(2026, 10, 1, 23, 59)), '2026-11-01');
  let s = checkOn(one('2026-10-31'), ['2026-10-31', '2026-11-01', '2026-11-02']);
  assert.deepEqual(blocks(s), [{ startDate: '2026-10-31', endDate: '2026-11-02' }]);
  s = normalizeState(s, '2026-11-03');
  assert.equal(current(s).startDate, '2026-11-03');
});

// ---------- several habits ----------

test('three habits progress independently, each with its own block series', () => {
  let s = emptyState();
  s = addHabit(s, 'Read', '2026-05-10', 'a');
  s = addHabit(s, 'Run', '2026-05-10', 'b');

  // a is logged every day (completes), b only on Day 1, c from the day it was added.
  s = toggleDay(s, 'a', '2026-05-10', '2026-05-10');
  s = toggleDay(s, 'b', '2026-05-10', '2026-05-10');
  s = addHabit(s, 'Write', '2026-05-11', 'c'); // added a day later
  s = toggleDay(s, 'a', '2026-05-11', '2026-05-11');
  s = toggleDay(s, 'c', '2026-05-11', '2026-05-11');
  s = toggleDay(s, 'a', '2026-05-12', '2026-05-12');
  s = toggleDay(s, 'c', '2026-05-12', '2026-05-12');

  assert.equal(blocks(s, 'a').length, 1);
  assert.equal(current(s, 'a').checks.length, 3);
  assert.equal(blocks(s, 'b').length, 0);
  assert.deepEqual(current(s, 'b'), { startDate: '2026-05-10', checks: ['2026-05-10'] });
  assert.equal(blocks(s, 'c').length, 0);
  assert.deepEqual(current(s, 'c'), { startDate: '2026-05-11', checks: ['2026-05-11', '2026-05-12'] });

  s = toggleDay(s, 'c', '2026-05-13', '2026-05-13');
  s = startNewBlock(s, 'b', '2026-05-13');
  assert.equal(blocks(s, 'a').length, 1);
  assert.equal(current(s, 'a').startDate, '2026-05-13');
  assert.equal(blocks(s, 'b').length, 0);
  assert.deepEqual(current(s, 'b'), { startDate: '2026-05-13', checks: [] });
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

// ---------- robustness ----------

test('a clock set backwards does not break anything', () => {
  let s = checkOn(one('2026-05-10'), ['2026-05-10']);
  s = normalizeState(s, '2026-05-08');
  assert.deepEqual(current(s), { startDate: '2026-05-08', checks: [] });
});

test('data saved by the first version (no filledOn) still loads', () => {
  const old = { version: 1, habits: [{ id: 'a', name: 'x', createdAt: '2026-05-10',
    completedBlocks: [{ startDate: '2026-05-10', endDate: '2026-05-12' }],
    currentBlock: { startDate: '2026-05-10', checks: ['2026-05-10', '2026-05-11', '2026-05-12'] } }] };
  let s = normalizeState(parseState(old), '2026-05-12');
  assert.equal(blocks(s).length, 1);
  s = normalizeState(s, '2026-05-13');
  assert.equal(blocks(s).length, 1);
  assert.deepEqual(current(s), { startDate: '2026-05-13', checks: [] });
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
