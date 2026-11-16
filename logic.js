// Mikka Bōzu block logic.
// Pure functions only: no DOM, no storage, no clock. "today" is always passed
// in as a local YYYY-MM-DD string so everything here is testable.

export const MAX_HABITS = 3;
export const BLOCK_DAYS = 3;
export const MAX_NAME_LENGTH = 40;
export const DATA_VERSION = 1;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

// ---------- dates ----------

/** Local calendar date of `now` as YYYY-MM-DD. */
export function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Date arithmetic is done in UTC on the calendar parts, so daylight saving
// changes (23- or 25-hour local days) can never shift a date.
function toUTC(s) {
  const m = DATE_RE.exec(s);
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

function fromUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isDateStr(s) {
  return typeof s === 'string' && DATE_RE.test(s) && fromUTC(toUTC(s)) === s;
}

export function addDays(s, n) {
  return fromUTC(toUTC(s) + n * DAY_MS);
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

function blockDays(startDate) {
  return Array.from({ length: BLOCK_DAYS }, (_, i) => addDays(startDate, i));
}

// ---------- state ----------

export function emptyState() {
  return { version: DATA_VERSION, habits: [] };
}

export function cleanName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * Bring one habit up to date for `today`.
 *
 * A block is three consecutive calendar days. It stays open until all three
 * are checked or the user starts a new block: a day that passes unchecked
 * does NOT discard it, so days can be logged late.
 *
 * - When the block fills it is recorded once in completedBlocks. It stays on
 *   screen for the rest of the day it was filled (so a check can be undone),
 *   and the next block starts on the day after the block's last day.
 * - A block that is not full is never counted.
 */
export function normalizeHabit(habit, today) {
  const completed = Array.isArray(habit.completedBlocks) ? habit.completedBlocks : [];
  const cb = habit.currentBlock;
  const open = (startDate, blocks) => ({
    ...habit,
    completedBlocks: blocks,
    currentBlock: { startDate, checks: [] },
  });

  // No block yet, corrupt data, or the clock moved backwards past the start.
  if (!cb || !isDateStr(cb.startDate) || cb.startDate > today) return open(today, completed);

  const days = blockDays(cb.startDate);
  const stored = Array.isArray(cb.checks) ? cb.checks : [];
  const checks = days.filter((d) => d <= today && stored.includes(d));

  if (checks.length === BLOCK_DAYS) {
    const recorded = completed.some((b) => b.startDate === cb.startDate);
    const blocks = recorded
      ? completed
      : [...completed, { startDate: days[0], endDate: days[BLOCK_DAYS - 1] }];
    const filledOn = isDateStr(cb.filledOn) ? cb.filledOn : today;
    if (filledOn < today) return open(addDays(days[BLOCK_DAYS - 1], 1), blocks);
    return { ...habit, completedBlocks: blocks, currentBlock: { startDate: cb.startDate, checks, filledOn } };
  }

  // Not full: it must not be counted (this is what makes undo work).
  const blocks = completed.filter((b) => b.startDate !== cb.startDate);
  return { ...habit, completedBlocks: blocks, currentBlock: { startDate: cb.startDate, checks } };
}

export function normalizeState(state, today) {
  return { ...state, habits: state.habits.map((h) => normalizeHabit(h, today)) };
}

/**
 * Check or uncheck one day of a habit's current block. Any day of the block
 * up to and including today can be changed; future days cannot.
 */
export function toggleDay(state, id, date, today) {
  return {
    ...state,
    habits: state.habits.map((h) => {
      const n = normalizeHabit(h, today);
      if (h.id !== id) return n;
      const cb = n.currentBlock;
      if (date > today || !blockDays(cb.startDate).includes(date)) return n;
      const checks = cb.checks.includes(date)
        ? cb.checks.filter((d) => d !== date)
        : [...cb.checks, date];
      return normalizeHabit({ ...n, currentBlock: { ...cb, checks } }, today);
    }),
  };
}

/**
 * Drop the open block without a trace and start a fresh one today.
 * A block that is already full is left alone.
 */
export function startNewBlock(state, id, today) {
  return {
    ...state,
    habits: state.habits.map((h) => {
      const n = normalizeHabit(h, today);
      if (h.id !== id || n.currentBlock.checks.length === BLOCK_DAYS) return n;
      return { ...n, currentBlock: { startDate: today, checks: [] } };
    }),
  };
}

export function addHabit(state, name, today, id) {
  const clean = cleanName(name);
  if (!clean) throw new Error('A habit needs a name.');
  if (state.habits.length >= MAX_HABITS) throw new Error(`You can track up to ${MAX_HABITS} habits.`);
  const habit = {
    id,
    name: clean,
    createdAt: today,
    completedBlocks: [],
    currentBlock: { startDate: today, checks: [] },
  };
  return { ...state, habits: [...state.habits, habit] };
}

export function renameHabit(state, id, name) {
  const clean = cleanName(name);
  if (!clean) return state;
  return { ...state, habits: state.habits.map((h) => (h.id === id ? { ...h, name: clean } : h)) };
}

export function deleteHabit(state, id) {
  return { ...state, habits: state.habits.filter((h) => h.id !== id) };
}

/** What a card needs to draw one habit. */
export function habitView(habit, today) {
  const h = normalizeHabit(habit, today);
  const cb = h.currentBlock;
  const days = blockDays(cb.startDate).map((date) => ({
    date,
    checked: cb.checks.includes(date),
    isToday: date === today,
    isFuture: date > today,
  }));
  const full = cb.checks.length === BLOCK_DAYS;
  return {
    id: h.id,
    name: h.name,
    days,
    blocks: h.completedBlocks.length,
    full,
    checkedCount: cb.checks.length,
    // Offer "new block" only when it would change something.
    canRestart: !full && cb.startDate < today,
  };
}

/** Validate and tidy data from storage or an imported backup. Throws if unusable. */
export function parseState(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.habits)) {
    throw new Error('This file is not a Mikka Bōzu backup.');
  }
  if (data.habits.length > MAX_HABITS) {
    throw new Error(`A backup can hold at most ${MAX_HABITS} habits.`);
  }
  const seen = new Set();
  const habits = data.habits.map((h, i) => {
    if (!h || typeof h !== 'object') throw new Error('The backup contains a damaged habit.');
    const name = cleanName(h.name);
    if (!name) throw new Error('The backup contains a habit with no name.');
    let id = typeof h.id === 'string' && h.id ? h.id : `habit-${i + 1}`;
    while (seen.has(id)) id += '-x';
    seen.add(id);

    const completedBlocks = (Array.isArray(h.completedBlocks) ? h.completedBlocks : [])
      .filter((b) => b && isDateStr(b.startDate) && isDateStr(b.endDate))
      .map((b) => ({ startDate: b.startDate, endDate: b.endDate }));

    const cb = h.currentBlock;
    const currentBlock =
      cb && isDateStr(cb.startDate)
        ? {
            startDate: cb.startDate,
            checks: (Array.isArray(cb.checks) ? cb.checks : []).filter(isDateStr),
            ...(isDateStr(cb.filledOn) ? { filledOn: cb.filledOn } : {}),
          }
        : null; // normalizeHabit starts a fresh block

    const createdAt = isDateStr(h.createdAt) ? h.createdAt : currentBlock?.startDate ?? null;
    return { id, name, createdAt, completedBlocks, currentBlock };
  });
  return { version: DATA_VERSION, habits };
}
