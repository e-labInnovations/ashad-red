# ashad-red

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/e-labInnovations/ashad-red)

A ready-to-deploy [Node-RED](https://nodered.org) 5 setup for [Render](https://render.com) and similar hosts. These hosts have no persistent disk, so flows, credentials and settings are stored in a database instead of on disk.

- Storage in **Turso**, **PostgreSQL** or local files, picked from environment variables
- Optional login for the flow editor
- Editor follows the system light/dark theme by default
- Static site served from `public/` at `/`, editor at `/red`

## Requirements

- Node.js **22.9 or later** (Node 24 recommended), as Node-RED 5 requires
- Optional: a [Turso](https://turso.tech) or PostgreSQL database

## Quick start (local)

```sh
git clone https://github.com/e-labInnovations/ashad-red.git
cd ashad-red
npm install
cp .env.example .env   # edit it; see Configuration
npm start
```

Open <http://localhost:1880/red> for the editor and <http://localhost:1880> for the static site.

To run locally without a database, delete or comment out `TURSO_DATABASE_URL` and `DATABASE_URL` in `.env`. Flows are then saved to `flows.json` in the project folder.

## Deploy free with Turso and Render

You can run Node-RED around the clock at no cost using Turso's free database and Render's free web service.

**1. Create a Turso database**

1. Sign up at [app.turso.tech](https://app.turso.tech).
2. Create a database.
3. On the database page, copy its URL (`libsql://<db>-<org>.turso.io`) and create a token. Keep both at hand; the token is shown only once.

**2. Deploy to Render**

1. Sign up at [render.com](https://render.com).
2. Click **Deploy to Render** at the top of this page.
3. Fill in the values Render asks for:

   | Variable | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | Database URL from step 1 |
   | `TURSO_AUTH_TOKEN` | Token from step 1 |
   | `NODE_RED_USERNAME` | Editor login name you choose |
   | `NODE_RED_PASSWORD` | Editor password you choose |

4. Click **Deploy**. When it finishes, open `https://<your-app>.onrender.com/red` and log in.

The service settings come from [render.yaml](render.yaml): free plan, Node 24, `npm install` then `npm start`.

**3. Keeping it awake (automatic)**

Render's free services go to sleep after 15 minutes without traffic, and the next visit waits for a slow wake-up. To prevent this, the app pings its own public URL every 10 minutes. Render provides that URL as `RENDER_EXTERNAL_URL`, so there's nothing to set up. The startup log shows `Keep-alive: pinging https://<your-app>.onrender.com every 10 min`.

To turn it off, set `KEEP_ALIVE=false`.

<details>
<summary>Optional: external pinger with Google Apps Script</summary>

The built-in ping can't wake the app if it has stopped for some other reason. For an outside check as well:

1. Go to [script.google.com](https://script.google.com) and create a new project.
2. Paste in [scripts/keep-alive.gs](scripts/keep-alive.gs), replacing the default code.
3. Open **Project Settings** (gear icon), and under **Script properties** add `APP_URL` with your Render URL, e.g. `https://<your-app>.onrender.com/`.
4. Back in the editor, select `setupTrigger` in the function list and click **Run**. Approve the permissions prompt.

Pings show under **Executions** in Apps Script. Run `removeTrigger` to stop them.

</details>

Render's free plan includes 750 instance hours a month, and a 31-day month is 744 hours, so one service can stay up all month. The hours are shared across your Render workspace, so a second always-on free service would run out. Free-plan limits can change; check Render's current pricing page.

> [!NOTE]
> Render can still restart a free service now and then. Flows, credentials and settings are in Turso and survive restarts, but in-memory context data does not.

### Other hosts

Any Node.js host works: run `npm install`, then `npm start`, with Node 22.9 or later. `npm start` limits the Node.js heap to 384 MB (`--max-old-space-size=384`) to fit small instances; change it in `package.json` if you have more memory.

## Configuration

All settings come from environment variables. Locally they're read from `.env`.

| Variable | Required | Description |
|---|---|---|
| `TURSO_DATABASE_URL` | for Turso | `libsql://<db>-<org>.turso.io`, or `file:local.db` for a local SQLite file |
| `TURSO_AUTH_TOKEN` | for Turso | Turso database token |
| `DATABASE_URL` | for Postgres | PostgreSQL connection string. SSL is always on. |
| `NODE_RED_USERNAME` | recommended | Editor login username |
| `NODE_RED_PASSWORD` | recommended | Editor login password |
| `APP_NAME` | no | Key for this instance's data in the database. Default `ashad-nodered`. Use different values to run several instances on one database. |
| `PORT` | no | HTTP port. Default `1880`. Render sets this for you. |
| `SECURE_LINK` | no | Stored with the flows on each save |
| `UIBROOT` | no | Root folder for `node-red-contrib-uibuilder`. Default: project folder |
| `KEEP_ALIVE` | no | Set to `false` to turn off the keep-alive ping |
| `KEEP_ALIVE_URL` | no | URL to ping. Default: `RENDER_EXTERNAL_URL`, which Render sets. Set it on other hosts to enable the ping. |
| `KEEP_ALIVE_INTERVAL` | no | Minutes between pings. Default `10` |

> [!WARNING]
> If `NODE_RED_USERNAME` and `NODE_RED_PASSWORD` aren't both set, the editor has no login and anyone who finds the URL can change your flows.

## Storage

The first backend that's configured is used:

1. **Turso**, when `TURSO_DATABASE_URL` is set
2. **PostgreSQL**, when `DATABASE_URL` is set
3. **Local files** (`flows.json`) otherwise

The startup log shows which one is in use, for example `Using turso storage`. Tables are created on first start.

Flows, credentials, user settings and library entries are stored. Credentials are **not encrypted** (`credentialSecret: false`), so keep database access private.

Context data (`flow.set` / `global.set`) is kept in memory and is lost on restart.

### Moving from PostgreSQL to Turso

```sh
# with DATABASE_URL, TURSO_DATABASE_URL and TURSO_AUTH_TOKEN all set
npm run migrate:turso
```

This copies every row from Postgres to Turso. It stops if the Turso tables already contain data, so nothing is duplicated. Back up Postgres first. Once the copy succeeds, keep `TURSO_DATABASE_URL` set (Turso takes priority) and remove `DATABASE_URL` when you no longer need it.

## Editor and runtime notes

- **Theme:** new browsers get the *System* theme, which follows the OS light/dark setting. Each user can change it in *User Settings*; the choice is saved per browser. The login page is always light.
- **Disabled core nodes:** `exec`, `file in` / `file`, `watch`, `tcp` and `udp` are turned off (`nodesExcludes` in `settings.js`). Hosts like Render have no persistent disk and don't accept raw TCP/UDP traffic, and `exec` would allow shell commands on the server.
- **Function nodes:** can load npm modules (`functionExternalModules: true`). `firebase-admin` is available as `global.get('firebaseAdmin')`.
- **Extra nodes:** install them from the palette manager, or add the package to `package.json` and redeploy. A rebuild on Render wipes palette installs, but `externalModules.autoInstall` reinstalls any module your flows use at the next start, which slows that start. Add the package to `package.json` to avoid this.
- **CORS:** HTTP-in endpoints allow any origin (`httpNodeCors` in `settings.js`).

## Project layout

| Path | Purpose |
|---|---|
| `settings.js` | Node-RED settings; picks the storage backend and sets up the login |
| `db.js` | Chooses Turso, Postgres or none from the environment |
| `dbstorage.js` | Node-RED storage module that uses the selected database |
| `tursoutil.js` / `pgutil.js` | Turso and PostgreSQL queries |
| `scripts/migrate-pg-to-turso.js` | One-off Postgres → Turso copy |
| `keepalive.js` | Pings the app's own URL so free hosts don't put it to sleep |
| `scripts/keep-alive.gs` | Google Apps Script that keeps a Render free service awake |
| `render.yaml` | Render Blueprint used by the deploy button |
| `editor/default-theme.js` | Sets the editor's default theme to *System* |
| `public/` | Static site served at `/` |

## License

[Apache 2.0](LICENSE)
