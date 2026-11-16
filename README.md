# Mikka Bōzu 三日坊主

*Mikka bōzu* is a Japanese idiom for someone who gives up after three days. This app
turns that into the whole plan: commit to a habit for three days at a time.

- Track up to three habits. Each one has its own current block and its own series of
  completed blocks.
- A block is three days in a row. Fill in all three and you earn a block.
- The habit is what counts, not opening the app. A block stays open until it is full,
  so a day you did but didn't log can be filled in later.
- If you did skip a day, tap **New block** for a fresh three days starting today. The
  old block is set aside: it isn't counted, stored, or shown.

It is a small installable web app (PWA): plain HTML, CSS and JavaScript, no framework,
no build step, no server, no account, no notifications. It works fully offline after
the first load.

## Your data lives only on your phone

Everything is stored on the device, inside the app. Nothing is sent anywhere. That
also means there is no cloud copy: if you delete the app from your Home Screen, clear
Safari's website data, or lose the phone, the data is gone.

**Export a backup occasionally**: gear icon → *Export data*, then save the JSON file
somewhere safe (Files, iCloud Drive). *Import data* restores it and replaces whatever
is on the device.

## Deploy to GitHub Pages

1. Create a new repository on GitHub (public, or private on a plan that includes Pages).
2. Push this folder to its `main` branch:

   ```bash
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

3. On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. The workflow in `.github/workflows/deploy.yml` runs on every push to `main`: it runs
   the tests, then publishes the app. If the first run happened before step 3, re-run
   it from the **Actions** tab.
5. The app is now at `https://<you>.github.io/<repo>/`.

Only the app files are published (`index.html`, `styles.css`, `app.js`, `logic.js`,
`sw.js`, `manifest.webmanifest`, `icons/`).

## Install on iPhone

1. Open the app's address in **Safari** (it has to be Safari).
2. Tap the **Share** button.
3. Choose **Add to Home Screen**, then **Add**.

Open it from the Home Screen from then on. It runs full screen and works without a
connection. Note that the Home Screen app keeps its own storage, separate from the
Safari tab, so start your habits in the installed app.

After you deploy a change, the installed app picks it up in the background and shows
it the next time you open it after that.

## Develop

```bash
npm test     # or: node --test
npm start    # serves the folder at http://localhost:8173
```

Node 20 or newer is needed for the tests only. There are no dependencies.

| File | What it is |
| --- | --- |
| `logic.js` | All block rules as pure functions. "Today" is always passed in. |
| `test/logic.test.js` | Unit tests for the rules. |
| `app.js` | Rendering, storage, settings. |
| `index.html`, `styles.css` | Markup and styling (light and dark). |
| `sw.js`, `manifest.webmanifest`, `icons/` | The PWA parts. |
| `tools/make_icons.py` | Regenerates the icons. Only needed if you change them. |

## The rules, precisely

- A block is three consecutive calendar days in the phone's local time zone. Days
  change at local midnight.
- Any day of the current block up to and including today can be checked or unchecked.
  Future days cannot.
- A block stays open until all three days are checked or you start a new block. Days
  passing unlogged never discard it.
- **New block** (shown on a card once its block is at least a day old) drops the open
  block without a record and starts a fresh one today.
- Filling the third day completes the block at once. The full block stays on screen
  for the rest of that day, and unchecking a day during that time takes the block back.
- The next block starts on the day after the completed block's last day. If you filled
  a block in late, the next one may already have days in the past; fill those in too,
  or tap **New block** to start from today.
- Nothing runs in the background. State is recomputed from the stored dates every time
  the app opens or returns to the foreground.

Stored data looks like this:

```json
{
  "version": 1,
  "habits": [{
    "id": "…",
    "name": "Stretch",
    "createdAt": "2026-05-10",
    "completedBlocks": [{ "startDate": "2026-05-10", "endDate": "2026-05-12" }],
    "currentBlock": { "startDate": "2026-05-13", "checks": ["2026-05-13"] }
  }]
}
```

A full block also carries `"filledOn"`, the day its last check was made, so the app
knows when to move on to the next block.

## License

Copyright © 2026 Jessica Breen.

Mikka Bōzu is licensed under
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/)
(CC BY-NC-SA 4.0). You may share and adapt it for non-commercial purposes, as long as
you give credit and release your version under the same license. The full text is in
[LICENSE](LICENSE).
