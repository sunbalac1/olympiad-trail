# Olympiad Trail

A local practice-exam app for Math, Science, English, and Reasoning
(Grade 4–6 Olympiad style), with timed rounds, per-kid profiles,
scored review, and worked solutions.

Data (profiles, custom questions, attempt history) is saved in this
browser's localStorage — it stays on this device only, and is scoped to
whichever URL/port you opened the app at (so questions added while
running `npm run dev` on one port won't show up if you later open the
app on a different port — see "Add more questions" below for a way
around this).

## Run it

    npm install
    npm run dev

Then open the printed local URL (usually http://localhost:5173).

## Desktop icon (recommended for regular use)

A "Olympiad Trail" shortcut on the Desktop launches the app in its own
window (no browser tabs or address bar) — just double-click it like any
other app. It runs `launch-app.vbs`, which rebuilds the app and serves
it locally before opening the window, so it always shows the latest
content in this folder.

If the shortcut ever goes missing, recreate it by making a Windows
shortcut that points to `launch-app.vbs` in this folder.

## Build for regular use

    npm run build

This outputs a static `dist/` folder. Note: opening `dist/index.html`
directly by double-clicking it will show a blank page — Chromium
blocks the ES module script tag Vite generates when loaded from a
`file://` URL. Serve the `dist/` folder with any static file server
(`npm run preview`, or host it on GitHub Pages/Netlify/etc.) instead.
The desktop shortcut above handles this for local use automatically.

## Admin: managing the question bank

Question bank management (adding questions, CSV upload, reviewing
flagged questions, browsing every question in a filterable table) lives
behind an **Admin** area, not on kids' dashboards. Click the small
**"Admin"** button at the top of the profile-picker screen. The first
time, you'll be asked to set a password (this is a light parental gate,
not real security — it only has to stop a curious kid, since this is a
local single-device app with no server); after that, the same button
asks for that password each time. The password is stored as a SHA-256
hash in this browser's localStorage — there's no reset flow, so if it's
forgotten, clear the `olympiad-trail:admin-hash` key in this browser's
localStorage (DevTools → Application → Local Storage) to set a new one.

Inside Admin: the grade × subject matrix, an **"All questions"** table
with Grade / Subject / Topic filters and a text search (every question,
not just custom ones), flagged-question review, manual question add,
and CSV bulk upload all live here — edit the `STARTER_QUESTIONS` array
in `src/questions.js` directly for the same effect, since that file
holds only data and no app code needs to change.

Questions added through the app (manual add or CSV upload) are saved to
localStorage by default, which only persists for the exact URL/port you
used — they won't follow you if you switch between `npm run dev` and
the desktop icon, or if browser data gets cleared. To make uploads
permanent, click **"Connect questions.js"** in the Admin screen
(Chromium/Edge only) and pick `src/questions.js` in this folder once —
after that, every question you add or CSV you upload is also written
directly into that file, so it survives storage clears and shows up
everywhere, exactly like the built-in questions.
