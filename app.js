import * as L from './logic.js';

const STORAGE_KEY = 'mikka-bozu:v1';
const $ = (sel) => document.querySelector(sel);

const app = $('#app');
let state = load();
let renderedDay = null;

// ---------- storage ----------

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return L.parseState(JSON.parse(raw));
  } catch (err) {
    console.warn('Could not read saved data', err);
  }
  return L.emptyState();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save', err);
  }
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ??
    `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- tiny DOM helper ----------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

// ---------- recompute & render ----------

/** Recompute everything from stored dates. Called on open and on every return to the foreground. */
function refresh(force = false) {
  const today = L.todayStr();
  const next = L.normalizeState(state, today);
  const changed = JSON.stringify(next) !== JSON.stringify(state);
  state = next;
  if (changed) save();
  if (changed || force || today !== renderedDay) render();
}

function render(anim = {}) {
  const today = L.todayStr();
  renderedDay = today;
  app.replaceChildren(state.habits.length ? mainView(today, anim) : introView());
}

function introView() {
  const input = el('input', {
    type: 'text', maxLength: L.MAX_NAME_LENGTH, autocomplete: 'off', enterKeyHint: 'done',
    placeholder: 'What habit will you build?', 'aria-label': 'What habit will you build?',
  });
  const form = el('form', {
    novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      if (!L.cleanName(input.value)) return input.focus();
      addHabit(input.value);
    },
  }, input, el('button', { type: 'submit', class: 'btn' }, 'Commit to 3 days'));

  return el('div', { class: 'intro' },
    el('p', {}, 'Anyone can keep a habit for three days. So commit to just three, then three more.'),
    form);
}

function mainView(today, anim) {
  const cards = el('div', { class: 'cards' }, ...state.habits.map((h) => card(h, today, anim)));
  const add = state.habits.length < L.MAX_HABITS &&
    el('button', { type: 'button', class: 'add-btn', 'aria-label': 'Add a habit', onclick: openAdd }, '+');
  const frag = document.createDocumentFragment();
  frag.append(cards, ...(add ? [add] : []));
  return frag;
}

const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const longFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

function localDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Short label under a circle: "Today", or "Sat 14". */
function dayLabel(d) {
  if (d.isToday) return 'Today';
  const date = localDate(d.date);
  return `${weekdayFmt.format(date)} ${date.getDate()}`;
}

function card(habit, today, anim) {
  const v = L.habitView(habit, today);
  const mine = anim.id === v.id;

  const days = v.days.map((d, i) => {
    const cls = ['day', d.checked && 'checked', d.isToday && 'today', d.isFuture && 'future',
      mine && anim.date === d.date && anim.fill].filter(Boolean).join(' ');
    const when = d.isToday ? 'today' : longFmt.format(localDate(d.date));
    const circle = d.isFuture
      ? el('span', { class: cls, role: 'img', 'aria-label': `Day ${i + 1}, ${when}, not yet` })
      : el('button', {
          type: 'button', class: cls,
          'aria-pressed': String(d.checked),
          'aria-label': `Day ${i + 1}, ${when}. ${d.checked ? 'Done. Tap to undo.' : 'Tap to mark done.'}`,
          onclick: () => toggle(v.id, d.date),
        });
    return el('div', { class: 'day-slot' },
      circle,
      el('span', { class: d.isToday ? 'day-label is-today' : 'day-label', 'aria-hidden': 'true' }, dayLabel(d)));
  });

  const squares = Array.from({ length: v.blocks }, (_, i) =>
    el('li', { class: mine && anim.newBlock && i === v.blocks - 1 ? 'drop' : null }));

  const restart = v.canRestart && el('button', {
    type: 'button', class: 'restart',
    'aria-label': `Start a new block for ${v.name}`,
    onclick: () => restartBlock(v),
  }, 'New block');

  return el('article', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', { class: 'card-name' }, v.name),
      restart),
    el('div', { class: 'days' }, ...days),
    el('div', { class: 'series', 'aria-label': `${v.blocks} completed ${v.blocks === 1 ? 'block' : 'blocks'}` },
      el('div', { class: 'count', 'aria-hidden': 'true' },
        String(v.blocks),
        el('span', { class: 'count-label' }, v.blocks === 1 ? 'block' : 'blocks')),
      el('ul', { class: 'squares', 'aria-hidden': 'true' }, ...squares)));
}

// ---------- actions ----------

function toggle(id, date) {
  const today = L.todayStr();
  // The app sat open past midnight: show the new day first, don't act on a stale screen.
  if (today !== renderedDay) return refresh(true);

  const before = state.habits.find((h) => h.id === id);
  if (!before) return;
  state = L.toggleDay(state, id, date, today);
  save();
  const after = state.habits.find((h) => h.id === id);
  render({
    id,
    date,
    fill: after.currentBlock.checks.includes(date) ? 'fill' : 'unfill',
    newBlock: after.completedBlocks.length > before.completedBlocks.length,
  });
}

async function restartBlock(v) {
  if (L.todayStr() !== renderedDay) return refresh(true);
  if (v.checkedCount > 0) {
    const ok = await ask({
      title: 'Start a new block?',
      body: `A fresh three days for "${v.name}" starts today. The current block is set aside and won't be counted.`,
      action: 'Start new block',
    });
    if (!ok) return;
  }
  state = L.startNewBlock(state, v.id, L.todayStr());
  save();
  render();
}

function addHabit(name) {
  try {
    state = L.addHabit(L.normalizeState(state, L.todayStr()), name, L.todayStr(), newId());
  } catch {
    return false;
  }
  save();
  render();
  return true;
}

// ---------- dialogs ----------

const addDialog = $('#add-dialog');
const addName = $('#add-name');
const settings = $('#settings');
const confirmDialog = $('#confirm');

for (const dialog of [addDialog, settings]) {
  // Tap outside to close.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
}

function openAdd() {
  addName.value = '';
  addDialog.showModal();
  addName.focus();
}

$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!L.cleanName(addName.value)) return addName.focus();
  if (addHabit(addName.value)) addDialog.close();
});

function ask({ title, body, action }) {
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  const yes = $('#confirm-yes');
  const no = $('#confirm-no');
  yes.textContent = action;
  return new Promise((resolve) => {
    let answer = false;
    yes.onclick = () => { answer = true; confirmDialog.close(); };
    no.onclick = () => confirmDialog.close();
    confirmDialog.addEventListener('close', () => resolve(answer), { once: true });
    confirmDialog.showModal();
    no.focus();
  });
}

// ---------- settings ----------

const settingsMsg = $('#settings-msg');

$('#open-settings').addEventListener('click', () => {
  settingsMsg.textContent = '';
  renderHabitList();
  settings.showModal();
});

function renderHabitList() {
  const list = $('#habit-list');
  list.replaceChildren(...state.habits.map((h) => {
    const input = el('input', {
      type: 'text', value: h.name, maxLength: L.MAX_NAME_LENGTH, autocomplete: 'off',
      enterKeyHint: 'done', 'aria-label': `Rename ${h.name}`,
      onchange: () => {
        if (!L.cleanName(input.value)) { input.value = h.name; return; }
        state = L.renameHabit(state, h.id, input.value);
        save();
        render();
        renderHabitList();
      },
      onkeydown: (e) => { if (e.key === 'Enter') input.blur(); },
    });
    const del = el('button', {
      type: 'button', class: 'btn-quiet', 'aria-label': `Delete ${h.name}`,
      onclick: async () => {
        const ok = await ask({
          title: `Delete "${h.name}"?`,
          body: 'Its completed blocks are deleted too. This cannot be undone.',
          action: 'Delete',
        });
        if (!ok) return;
        state = L.deleteHabit(state, h.id);
        save();
        render();
        renderHabitList();
      },
    }, 'Delete');
    return el('li', {}, input, del);
  }));
  $('#habit-list-empty').hidden = state.habits.length > 0;
}

$('#export').addEventListener('click', async () => {
  const today = L.todayStr();
  const payload = { app: 'mikka-bozu', exportedAt: new Date().toISOString(), ...L.normalizeState(state, today) };
  const name = `mikka-bozu-backup-${today}.json`;
  const json = JSON.stringify(payload, null, 2);

  // On the iPhone home-screen app, the share sheet ("Save to Files") is the
  // reliable way to get a file out. Elsewhere, a normal download.
  const file = new File([json], name, { type: 'application/json' });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Mikka Bōzu backup' });
      settingsMsg.textContent = 'Backup exported.';
    } catch (err) {
      if (err?.name !== 'AbortError') download(json, name);
    }
    return;
  }
  download(json, name);
});

function download(json, name) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  settingsMsg.textContent = 'Backup exported.';
}

const importFile = $('#import-file');
$('#import').addEventListener('click', () => { importFile.value = ''; importFile.click(); });

importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  let incoming;
  try {
    incoming = L.parseState(JSON.parse(await file.text()));
  } catch (err) {
    settingsMsg.textContent = err instanceof SyntaxError
      ? 'That file could not be read as a backup.'
      : err.message;
    return;
  }
  const n = incoming.habits.length;
  const ok = await ask({
    title: 'Restore this backup?',
    body: `It holds ${n} ${n === 1 ? 'habit' : 'habits'} and will replace everything currently on this device.`,
    action: 'Restore',
  });
  if (!ok) return;
  state = L.normalizeState(incoming, L.todayStr());
  save();
  render();
  renderHabitList();
  settingsMsg.textContent = 'Backup restored.';
});

$('#reset').addEventListener('click', async () => {
  const ok = await ask({
    title: 'Reset everything?',
    body: 'All habits and completed blocks will be deleted from this device. This cannot be undone.',
    action: 'Reset',
  });
  if (!ok) return;
  state = L.emptyState();
  save();
  render();
  settings.close();
});

// ---------- lifecycle ----------

// No timers: state is recomputed from dates whenever the app is shown again.
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('pageshow', () => refresh());
window.addEventListener('focus', () => refresh());

refresh(true);

navigator.storage?.persist?.().catch(() => {});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker failed', err));
  });
}
