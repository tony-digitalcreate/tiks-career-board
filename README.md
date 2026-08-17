# Tik's Career Board

A job scanner + application tracker for **Vientiane Capital**, tuned to Tik's field:
**GIS / mapping**, **project management**, and **management roles on environmental projects**.

Same engine as EZ JOBS, different keyword profile and a white/orange theme.

## Run it locally

Double-click **`Tiks Career Board.bat`** — it starts the server and opens
<http://localhost:3809>.

- Scans automatically every 4 hours (9am / 1pm / 5pm / 9pm / 1am / 5am Laos time),
  plus a catch-up scan on startup if the PC was off.
- **Scan Now** runs one immediately.
- Phone on the same Wi-Fi: `http://<PC-IP>:3809` (run `allow-phone-access.bat` once as
  administrator to open the firewall port).

## What it looks for

| Field | Matches on |
|---|---|
| **GIS & Mapping** | GIS, geospatial, remote sensing, ArcGIS/QGIS, cartography, spatial analysis, land survey, LiDAR, drone/UAV |
| **Project Management** | project/programme manager, project coordinator, project officer, chief of party, project director |
| **Management / Leadership** | manager, head of, director, team leader, coordinator — *only* when the posting is also environmental / geospatial / development-sector |
| **Environment & Climate** | environment, climate, biodiversity, conservation, natural resources, ESIA, safeguards, forest, land use, watershed, renewable |
| **Consultant / NGO** | consultant, technical advisor, NGO, development project — *only* with sector context |

The "needs context" gate keeps generic postings ("Sales Manager", "Restaurant Supervisor")
out of the list while still catching "Operations Manager – Water Resources Project".

## Sources

1. **108.jobs** — private client API, filtered to the Vientiane Capital location id.
   This is the workhorse: it carries the NGO/development sector too (CARE, Swisscontact,
   WCS, People in Need, BEQUAL, Fred Hollows all posted there in the last scan).
2. **Web search (best effort)** — Bing HTML. As of Aug 2026 DuckDuckGo's html endpoint
   answers scrapers with a bot-block page and Bing answers with loosely-matched results,
   so this source usually contributes nothing. It's kept because it costs one pass and
   occasionally lands a real posting; results must have a job-shaped URL and mention Laos.
3. **ReliefWeb (off by default)** — the UN/NGO job feed for Lao PDR. ReliefWeb retired
   API v1 and now rejects unregistered clients. Request a free appname at
   <https://apidoc.reliefweb.int/> then run with `RELIEFWEB_APPNAME=<name>` set (add it as
   a repo secret for the GitHub Action). The connector is written but unverified until
   an appname is approved.

Every new web result is fetched and date-checked before it's stored: postings past their
deadline, older than 90 days, or returning 404/410 are rejected and blocklisted for 60
days. Stored web jobs are re-verified weekly. Favorites are never pruned.

## Tabs

- **Job Scanner** — new postings with NEW badges, ⭐ favorites, filters by source and by
  field, "+ Track" to copy a job into the tracker, "Hide" to dismiss it.
- **My Applications** — status (Saved → Applied → Interview → Offer, or Rejected),
  auto-stamped dates, progress stepper, feedback yes/no, salary range, notes, link.
  ⬇ Backup / ⬆ Restore write a JSON file.

## Data

- `data/jobs.json` — scanned postings (+ stale blocklist)
- `data/meta.json` — last scan time
- `data/notes.json` — the tracker (gitignored; private)

Optional cloud sync (Firebase Firestore, anonymous auth) keeps the tracker and favorites
live between phone and PC — collections `tikcb_notes` and `tikcb_state`. If Firestore is
unreachable the app just runs local-only.

## Hosting (optional)

`.github/workflows/scan.yml` is ready for a GitHub Pages deploy: it runs the scanner on
the same 4-hour schedule and commits results to `data/` and `docs/data/`. Publish the repo
with Pages set to `main` → `/docs`, and the frontend automatically switches to static mode
(reads `docs/data/jobs.json`, keeps notes in localStorage + Firestore).
