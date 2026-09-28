# Beyond the Desk — NMI Departmental Games

A static leaderboard for Nationwide Medical Insurance's staff games. No server,
no database, no build step — it's a single HTML page plus some CSS/JS, and the
"database" is just CSV files sitting in this repo.

## How it works

- **Viewing never needs setup.** `index.html` fetches `data/<year>/*.csv`
  directly. Push this repo to GitHub Pages (or open `index.html` locally) and
  anyone can see it — no login, no token.
- **Saving a score creates a git commit — and requires signing in.** The repo
  itself (owner/name/branch) is fixed once in `assets/app.js` (`REPO_OWNER` /
  `REPO_NAME` / `REPO_BRANCH`), the same for everyone. What each scorer signs
  in with is just their **name** and their own GitHub Personal Access Token
  (profile icon, top right) — saved to that browser's `localStorage` only.
  The real access control is GitHub itself: only people the repo owner has
  added as a collaborator can generate a token with write access, so only
  they can actually save. Everyone else can still open the sign-in dialog,
  but their save attempt is rejected by GitHub. Every successful save is a
  real commit crediting the signed-in person's name, so the score history is
  the git log.
- **Two years live side by side**: `data/2025/` is last year's recap (frozen),
  `data/2026/` is this year's live tracker. Add `data/2027/` etc. the same way
  next time — duplicate a year folder and add `'2027'` to the `YEARS` array
  near the top of `assets/app.js`.

## Data model

Each year folder has:

| file | columns | notes |
|---|---|---|
| `departments.csv` | `id,name` | the competing units |
| `games.csv` | `id,name,has_breakdown` | `has_breakdown=0` means "no per-department scores recorded for this game yet/ever" — the game selector shows a friendly note instead of fake zeros |
| `scores.csv` | `game_id,department_id,score` | one row per game×department that's been scored |
| `totals.csv` *(2025 only)* | `department_id,total` | the authoritative final tally. 2026 computes totals live by summing `scores.csv` instead |

## Setting up GitHub-backed saving

One-time, done by whoever owns the repo:

1. Push this folder to a GitHub repo (public is fine — the data isn't
   sensitive).
2. Open `assets/app.js` and fill in `REPO_OWNER` and `REPO_NAME` near the top
   (e.g. `'yourname'` / `'nmiExtras'`). Leave `REPO_BRANCH` as `'main'` unless
   you use something else. Commit and push that change.
3. Add each person who should be allowed to record scores as a **collaborator**
   on the repo (Settings → Collaborators).

What each scorer does, once, on their own device:

1. Ask GitHub for a [fine-grained PAT](https://github.com/settings/tokens)
   scoped to this repo with **Contents: Read and write**.
2. In the app, tap the profile icon (top right) → enter their name and that
   token → **Sign in**.
3. Tap **➕ Record a score** (bottom tab bar, or on the live year) to save
   results as the games happen. Their name rides along in the commit message.

Anyone without a token can still open "Record a score" to see the form, but
GitHub itself will reject the save — so the access control is real, not just
a UI hint.

## About the 2025 data

The 2025 department **totals** and the full list of 12 games are accurate
(from the event's tally sheet). The per-game breakdown, however, is only
fully reconciled for **Oware** and **Football** — the rest of the original
scoring grid came through a garbled export and wasn't trustworthy enough to
digitize as fact. Those games show "not digitized" in the selector rather than
invented zeros. If you find the original breakdown, add rows to
`data/2025/scores.csv` and flip the matching `has_breakdown` to `1` in
`data/2025/games.csv`.

## Photos

The gallery from the old app isn't wired up yet — there's no photo storage in
this version. To add one, drop images under `data/<year>/photos/` and extend
`assets/app.js` to render them (the old design had a 4-up gallery strip in the
footer area you can reuse as a reference).

## Design reference

`inspo/` holds the mobile-app screenshots the current visual style is built
from — chunky rounded shapes, 3D-pressed buttons, and the podium-plus-list
leaderboard layout in particular come straight from those.
