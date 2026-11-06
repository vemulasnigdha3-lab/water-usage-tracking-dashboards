# Water Usage Tracking Dashboard

A beginner-friendly full-stack B.Tech project for manually recording water meter readings, comparing usage between dates, viewing recent trends, and setting a conservation target. It does not need physical sensors or paid APIs.

> **Important demo security note:** This version is designed for a local classroom/demo environment and has no user accounts. The Express server uses a Supabase service-role key, which bypasses Row Level Security. Keep the server on your own computer and never deploy it publicly as-is. A public deployment needs authentication, per-user authorization, and an appropriate RLS design.

## 1. Problem and objectives

Households, hostels, and small facilities may not know how much water they use between meter checks. This app stores dated cumulative meter values, calculates the difference between consecutive readings, shows recent interval usage, and lets the operator set a daily reference target.

Objectives:
- Enter and maintain one cumulative meter reading per date.
- Calculate interval usage from dated readings instead of asking the browser to invent totals.
- View a recent usage chart and dashboard summary.
- Filter readings by dates and category, and search notes.
- Set a configurable target and store data in Supabase PostgreSQL.

## 2. Users, roles, and MVP scope

**Intended users:** a household member, hostel warden, or facility operator recording one shared meter.

**Roles:** no roles or login are included in this local-demo MVP. Anyone who can reach the local server can use its endpoints. Do not expose it to a public network. Multi-user accounts, per-household ownership, CSV export, automated sensor integration, notifications, and billing estimates are intentionally excluded.

## 3. Features and pages

- **Overview:** latest cumulative meter reading, latest interval usage, recent interval average, conservation target, SVG trend chart, and recent entries.
- **Meter reading log:** add, edit, delete, date/category filters, and notes search.
- **Goals & settings:** save the target in m³/day and explain the calculation model.
- **Validation:** valid date, non-negative meter value, up to three decimal places, allowed category, notes length, duplicate-date prevention, and non-decreasing meter sequence.
- **Feedback:** loading/empty/error/success states and a confirmation before deletion.

The first reading has no interval usage because no earlier reading exists. Usage equals the current cumulative meter value minus the previous dated value. If readings are several days apart, the result is usage over that whole interval—not automatically daily usage. The dashboard labels the goal as a reference and reminds users to consider interval length.

## 4. Technology stack

- HTML5, CSS3, Vanilla JavaScript
- Node.js and Express.js
- Supabase PostgreSQL via `@supabase/supabase-js`
- `dotenv` loads local environment variables; `helmet` adds common HTTP security headers; `express-rate-limit` limits request bursts.
- Git and GitHub for version control

No frontend framework, chart library, external image, paid service, or external API is required. The trend chart is drawn with built-in SVG.

## 5. Folder structure

```text
water-usage-tracking-dashboard/
├── .gitignore
├── README.md
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── backend/
│   ├── .env                 # placeholders only; replace locally, never commit
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   ├── package-lock.json
│   ├── server.js
│   ├── supabase.js
│   └── validation.js
└── database/
    └── schema.sql
```

## 6. Prerequisites

Install:
- [Visual Studio Code](https://code.visualstudio.com/)
- [Node.js LTS](https://nodejs.org/) (npm is included)
- [Git](https://git-scm.com/downloads)
- A free [Supabase account](https://supabase.com/)

In a new VS Code terminal, check installation:

```powershell
node --version
npm --version
git --version
```

Use Node.js 20 or newer. The commands below use Windows PowerShell; macOS/Linux terminal commands are generally the same, except for environment-copy commands.

## 7. Supabase setup

1. Sign in at https://supabase.com/ and create a new project. Save the database password somewhere private; the app does not need that password directly.
2. Wait for the project to finish provisioning.
3. In the project dashboard, open **SQL Editor** and create a new query.
4. Open `database/schema.sql` from this project, copy all of it, paste it into the SQL Editor, and click **Run**.
5. Open **Table Editor** and verify `water_readings` and `dashboard_settings` exist. The settings table should contain row `id = 1` with a default target of `0.500` m³/day.
6. In Supabase project settings, find the project URL and API keys. Copy the project URL and the **service_role** key only into the backend `.env` file on your own computer. Supabase labels may change; select the server-side service-role/secret key, not the publishable/anon key.

The schema creates primary keys, a unique reading date, category and value constraints, timestamps, indexes, update triggers, and a single settings row. RLS is enabled on both tables but no public policies are created. The server's service-role key bypasses RLS, which is why this must remain a local demo until authentication and authorization are implemented.

## 8. Configure environment variables

In VS Code, open `backend/.env`. Replace the example placeholders:

```dotenv
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

- `PORT`: local web server port.
- `NODE_ENV`: development mode for local work.
- `SUPABASE_URL`: project URL shown in Supabase settings.
- `SUPABASE_SERVICE_ROLE_KEY`: private server-side key. Never place it in `frontend/`, GitHub, screenshots, reports, or a public deployment.

`.env.example` is a safe template that can be committed. `.env` holds local values and is excluded by `.gitignore`. The included `.env` contains placeholders only, not working credentials. If you need to regenerate a secret for another project, Node.js can create a random value with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; this app itself does not need an additional session secret.

## 9. Install and run

1. Extract `project-name.zip` (the downloaded archive should contain the `water-usage-tracking-dashboard/` folder) and open that folder in VS Code.
2. Open **Terminal → New Terminal**. Make sure the terminal is at the project root, then enter the backend folder:

```powershell
cd backend
npm install
npm start
```

`npm install` downloads the backend libraries into `backend/node_modules/`. `npm start` launches Express. Expected output:

```text
Water Usage Tracking Dashboard running at http://localhost:3000
```

3. Open http://localhost:3000 in your browser. The browser UI is served by Express; do not open `frontend/index.html` directly as a file.
4. Check http://localhost:3000/api/health. Expected JSON has `"success": true` and `"status": "ok"`. `databaseConfigured` means environment configuration was loaded, not that a live SQL query has succeeded.
5. Add at least two readings on different dates, using cumulative meter values that never decrease. Confirm interval usage and the chart appear. Open **Goals & settings** to change the target.

To stop the server, focus the terminal and press `Ctrl+C`. To restart, run `npm start` again from `backend/`.

## 10. Architecture

```text
Browser (HTML/CSS/Vanilla JS)
        | fetch() JSON requests
        v
Express REST API (backend/server.js)
        | Supabase JS client; server-only key
        v
Supabase PostgreSQL (database/schema.sql)
```

Frontend code never connects directly to Supabase. The backend validates requests, applies business rules, and returns consistent JSON responses. Database totals and reading differences are calculated in the backend summary endpoint from stored cumulative readings.

## 11. REST API reference

All endpoints are unauthenticated in this local-only MVP. Do not make the service publicly reachable. JSON success responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": "...", "details": ... }` where field details are available.

| Method | Path | Purpose / input | Success | Common errors |
|---|---|---|---|---|
| GET | `/api/health` | Check server and whether environment configuration loaded; no body | `{success:true,status:"ok",databaseConfigured:boolean}` | 200 even if DB is not configured; this is not a database connectivity test |
| GET | `/api/categories` | Get allowed categories | Array of category strings in `data` | Normally none |
| GET | `/api/readings` | List readings. Optional query: `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `category=Kitchen`, `search=leak` | `data` array, newest date first | 400 invalid date range/category; 503 unconfigured DB; 500 DB failure |
| POST | `/api/readings` | Create reading. JSON: `reading_date`, `meter_reading_m3`, `category`, optional `notes` | 201 and created row | 400 validation/sequence error; 409 duplicate date; 503/500 DB issue |
| PUT | `/api/readings/:id` | Replace fields of an existing reading using the same JSON body | Updated row | 400 invalid ID/body/sequence; 404 missing ID; 409 duplicate date; 503/500 |
| DELETE | `/api/readings/:id` | Delete a reading; ID is a positive integer | Deleted ID | 400 invalid ID; 404 missing ID; 503/500 |
| GET | `/api/settings` | Read the conservation target | Settings row | 503 unconfigured DB; 500 DB issue |
| PUT | `/api/settings` | JSON body: `{ "daily_target_m3": 0.5 }` | Updated settings row | 400 invalid target; 503/500 |
| GET | `/api/summary` | Summary cards, latest intervals, target, and recent trend rows | Summary object in `data` | 503 unconfigured DB; 500 DB issue |

No authentication or role is required in this prototype because it is intended for local use only. The backend does not accept a user ID or role from the browser. For a multi-user version, add Supabase Auth token verification and user ownership fields before deployment.

## 12. Database design

### `water_readings`

- `id`: identity primary key.
- `reading_date`: required and unique; at most one entry per date.
- `meter_reading_m3`: cumulative meter value, numeric to three decimal places, non-negative.
- `category`: constrained category text.
- `notes`: optional text, maximum 500 characters.
- `created_at`, `updated_at`: timestamps; `updated_at` changes through a trigger.

### `dashboard_settings`

- `id`: single-row key constrained to `1`.
- `daily_target_m3`: positive numeric target, default `0.500`.
- `updated_at`: update timestamp.

There is no foreign key because the MVP has one shared dashboard settings row and no user/account table. The unique date constraint is also enforced by the database, not only the form.

## 13. Manual testing checklist

Perform these checks after configuring Supabase:

- [ ] `GET /api/health` returns `success: true`; open the dashboard without a server error.
- [ ] **Database:** a new entry appears in Supabase Table Editor after saving in the browser.
- [ ] **Create:** enter a valid date and cumulative reading; expect a success message and row.
- [ ] **Read:** refresh the browser; the row remains present because it is stored in PostgreSQL.
- [ ] **Usage:** add a second reading on a later date with a larger value; usage equals current minus previous cumulative value.
- [ ] **Edit:** change notes/category/value; expect saved changes and refreshed chart. Sequence rules should reject a value that makes readings decrease over time.
- [ ] **Delete:** click Delete, then confirm; row disappears and usage calculations refresh. Cancel should keep the row.
- [ ] **Duplicate date:** attempt another reading on an existing date; expect a conflict message and no duplicate row.
- [ ] **Invalid fields:** blank date, negative value, more than three decimals, invalid category sent by API, or notes longer than 500 characters should be rejected.
- [ ] **Date filters:** choose a range and confirm rows outside it disappear. A from date after the to date should produce a validation error from the API.
- [ ] **Category/search:** choose a category and search for a word in notes; confirm results match both filters.
- [ ] **Empty state:** with no readings, dashboard should explain how to start and the chart should show a helpful message.
- [ ] **Settings:** set a positive target and refresh; it should remain saved. Zero/negative targets should be rejected.
- [ ] **Responsive layout:** narrow the browser to phone width; navigation, cards, forms, and horizontally scrollable tables should remain usable.
- [ ] **Missing configuration:** temporarily use placeholder credentials and restart; the UI should show a configuration/database error instead of pretending data was saved.
- [ ] **Security scope:** no login, logout, user roles, or cross-user data isolation exists in this MVP; do not mark these as passed or expose the app publicly.

## 14. Troubleshooting

- **`npm` is not recognized:** install Node.js LTS, close and reopen VS Code, then check `node --version` and `npm --version`.
- **Port 3000 is already in use:** change `PORT=3001` in `backend/.env`, restart, and open `http://localhost:3001`.
- **Database not configured:** confirm you edited `backend/.env` (not `.env.example`), removed placeholder values, and restarted the server.
- **Supabase errors:** check the project URL/key, confirm the SQL script ran successfully, and verify both tables exist. Do not paste keys into chat or GitHub.
- **Table/column missing:** rerun the current `database/schema.sql` in the intended Supabase project and inspect the SQL Editor result.
- **Blank or stale UI:** use browser refresh, check the terminal for errors, and open Developer Tools → Console/Network. Never share screenshots containing secrets.
- **`npm install` fails:** check internet access and Node version, then retry `npm install` from `backend/`.

## 15. Git and GitHub upload

Create a new **empty** repository on https://github.com/new. Do not add a README there because this project already has one.

Open a terminal at the project root (`water-usage-tracking-dashboard/`), not inside `backend/`, and run one command at a time:

```powershell
git init
git status
git add .
git status
git commit -m "Build project"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

- `git init` starts local version control.
- `git status` shows files and ignored files before staging.
- `git add .` stages project files that are not ignored.
- Run `git status` again and check that `.env` and `node_modules/` are absent, while `.env.example` is included.
- `git commit` saves a version of the staged project.
- `git branch -M main` names the current branch `main`.
- Replace `YOUR_GITHUB_REPOSITORY_URL` with the HTTPS URL copied from your repository, for example `https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git` (the example is not a real repository).
- `git push -u origin main` uploads the branch. Refresh GitHub and verify the expected files are visible.

If Git asks for identity, configure it with your own details using `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`. Never commit real `.env` values. A `.gitignore` entry does **not** remove a secret already committed. If a credential was committed or exposed, rotate/revoke it immediately in Supabase, replace the local value, and review the repository history.

## 16. Verification report and limitations

The project package is intended to include the complete source, SQL schema, and beginner setup guide. After extracting it, run `npm install` and `npm run check` from `backend/` to check JavaScript syntax. A live Supabase connection and browser workflow can only be confirmed after you add your own project credentials and run the SQL schema; this README does not claim that your private database has already been tested.

Known MVP limitations:
- No authentication, user accounts, multi-tenant isolation, or roles.
- One shared meter log and one shared conservation target.
- No physical sensors, automatic imports, billing/tariff calculations, CSV export, notifications, or audit history.
- The target is expressed in m³/day while readings can span multiple days; users must consider the interval length when interpreting it.
- Do not deploy publicly until authentication, authorization, and an appropriate database access policy are added.
