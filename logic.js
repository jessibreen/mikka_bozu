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
 * - A finished block is recorded once in completedBlocks and stays on screen
 *   until midnight; the next day a fresh block starts.
 * - A block with any missed past day is dropped without a trace and a fresh
 *   block starts today.
 */
export function normalizeHabit(habit, today) {
  const completed = Array.isArray(habit.completedBlocks) ? habit.completedBlocks : [];
  const cb = habit.currentBlock;
  const fresh = (blocks) => ({
    ...habit,
    completedBlocks: blocks,
    currentBlock: { startDate: today, checks: [] },
  });

  // No block yet, corrupt data, or the clock moved backwards past the start.
  if (!cb || !isDateStr(cb.startDate) || cb.startDate > today) return fresh(completed);

  const days = blockDays(cb.startDate);
  const stored = Array.isArray(cb.checks) ? cb.checks : [];
  const checks = days.filter((d) => d <= today && stored.includes(d));
  const elapsed = diffDays(cb.startDate, today); // 0 on Day 1

  if (checks.length === BLOCK_DAYS) {
    const recorded = completed.some((b) => b.startDate === cb.startDate);
    const blocks = recorded
      ? completed
      : [...completed, { startDate: days[0], endDate: days[BLOCK_DAYS - 1] }];
    if (elapsed >= BLOCK_DAYS) return fresh(blocks);
    return { ...habit, completedBlocks: blocks, currentBlock: { startDate: cb.startDate, checks } };
  }

  // Not complete: it must not be counted (this is what makes undo on Day 3 work).
  const blocks = completed.filter((b) => b.startDate !== cb.startDate);
  for (let i = 0; i < Math.min(elapsed, BLOCK_DAYS); i++) {
    if (!checks.includes(days[i])) return fresh(blocks);
  }
  return { ...habit, completedBlocks: blocks, currentBlock: { startDate: cb.startDate, checks } };
}

export function normalizeState(state, today) {
  return { ...state, habits: state.habits.map((h) => normalizeHabit(h, today)) };
}

/** Check today for one habit, or undo today's check. Only today can change. */
export function toggleToday(state, id, today) {
  return {
    ...state,
    habits: state.habits.map((h) => {
      const n = normalizeHabit(h, today);
      if (h.id !== id) return n;
      const has = n.currentBlock.checks.includes(today);
      const checks = has
        ? n.currentBlock.checks.filter((d) => d !== today)
        : [...n.currentBlock.checks, today];
      return normalizeHabit({ ...n, currentBlock: { ...n.currentBlock, checks } }, today);
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
  const days = blockDays(h.currentBlock.startDate).map((date) => ({
    date,
    checked: h.currentBlock.checks.includes(date),
    isToday: date === today,
  }));
  return { id: h.id, name: h.name, days, blocks: h.completedBlocks.length };
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
          }
        : null; // normalizeHabit starts a fresh block

    const createdAt = isDateStr(h.createdAt) ? h.createdAt : currentBlock?.startDate ?? null;
    return { id, name, createdAt, completedBlocks, currentBlock };
  });
  return { version: DATA_VERSION, habits };
}
