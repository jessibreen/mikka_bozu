# Build "Mikka Bōzu": a minimal 3-day-block habit tracker (iPhone PWA)

## Overview
Mikka Bōzu (三日坊主) is a Japanese idiom for someone who gives up after three days.
This app turns that into a game. For each habit, the user commits to 3 days at a
time. Check the habit off 3 days in a row and they earn a "block". Miss a day and
that block is simply gone: it isn't counted, stored, or shown anywhere. A fresh
3-day block begins. Only completed blocks exist in the app's memory.

Build it as a Progressive Web App, hosted on GitHub Pages, that I install on my
iPhone 16 Pro via Safari → Share → Add to Home Screen.

## Tech requirements
- Plain HTML, CSS, and vanilla JavaScript. No framework, no build step, no backend.
- Installable PWA: web app manifest, service worker for full offline use,
  app icons (including apple-touch-icon), `display: standalone`, iOS status bar
  and safe-area handling (Dynamic Island, home indicator).
- All data stored on-device in localStorage (or IndexedDB). Call
  `navigator.storage.persist()` where supported.
- Deploy to GitHub Pages using a GitHub Actions workflow on push to `main`.
- Must work fully offline after first load.
- No notifications or reminders.

## Habits
- The user can track up to 3 habits at once. Each habit is fully independent,
  with its own current block and its own completed-block count.
- The user can add a habit (if fewer than 3), rename one, or delete one
  (with confirmation; deleting removes its blocks too).

## Core rules (apply to each habit independently)
1. Adding a habit starts its first block today. A block is 3 consecutive calendar
   days (Day 1 = start date, Day 2, Day 3) in the phone's local time zone.
   Days roll over at local midnight.
2. The user can mark a habit complete once per day, for TODAY only.
   No back-filling past days and no checking future days.
3. The user can undo today's check until midnight.
4. If all 3 days are checked, the block is COMPLETE: the habit's block count goes
   up by 1, and the next block starts the following day.
5. If a day in the current block ends without a check, that block is discarded
   entirely, with no record kept. A new block starts the next day. If the user doesn't
   open the app for several days, the new block starts on the day they return
   (today). Never show or store failed blocks.
6. Recompute all state from stored dates whenever the app opens or comes back to
   the foreground, including when it's been closed for days. Don't rely on timers.

## Data model (suggested)
habits: [{
  id, name, createdAt,
  completedBlocks: [{ startDate, endDate }],   // only successes are stored
  currentBlock: { startDate, checks: [YYYY-MM-DD] }
}]
Store dates as local YYYY-MM-DD strings to avoid time-zone bugs.

## Interface: minimal, calm, Japanese-inspired
Generous whitespace, one accent color, system sans-serif font, light and dark mode
(follow system setting). No clutter, no streak-shaming, no gamified noise.

### First launch
- App name in small type, one line explaining the idea, a text field
  "What habit will you build?", and a "Commit to 3 days" button.

### Main screen (the only screen most days)
- One card per habit, stacked vertically (1 to 3 cards). Each card shows:
  - Habit name
  - Three circles for the current block's days. Checked = filled,
    today = outlined in accent color, upcoming = faint.
  - Tap today's circle to check it off: a subtle fill animation. Tap again to undo.
  - The habit's completed-block count as a number, with a small row/grid of
    solid squares underneath (one per completed block, wrapping) so progress
    visually stacks up.
- When a block completes: a brief, understated moment (the new square drops into
  that habit's grid).
- When a block has been lost since the last visit: show nothing about it.
  The circles just show a fresh Day 1. No messages, no failure counts.
- A small "+" to add a habit, shown only when fewer than 3 exist.

### Settings (small gear icon, out of the way)
- Rename / delete habits
- Export data (download JSON) / Import data (restore from JSON)
- Reset everything (with confirmation)
- Short "How it works" explanation

## Testing
- Put the block logic in its own module with an injectable "today" date.
- Unit tests covering: completing a block; missing Day 1, 2, or 3; being away a
  week; undoing today's check; crossing midnight, month and year boundaries;
  daylight saving time changes; three habits progressing independently.
- Tests run with a simple command (e.g. `node --test`).

## Deliverables
- Full repo, ready to push to GitHub
- GitHub Actions workflow that deploys to GitHub Pages
- README covering: deployment, installing on iPhone (Safari → Share → Add to
  Home Screen), and a note that data lives only on the device, so export a
  backup occasionally
- Before writing code, briefly confirm your plan and flag anything in this spec
  that seems ambiguous.