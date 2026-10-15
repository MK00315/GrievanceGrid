# GrievanceGrid

A mobile and web prototype for four visible civic complaint categories. Citizens keep individual tracking records; authorised municipal officers control review and outcomes.

## What works now

**Submit a complaint → receive a tracking ID → authorised officer review → citizen sees the update.**

- Citizen registration, login and server-revocable, expiring sessions.
- Four categories: visible road damage, garbage accumulation, road waterlogging and missing/broken manhole covers.
- Text, real coordinates/location description and optional photographs. Unsafe or missing photographs do not block registration.
- Acknowledgement before evidence upload, retry-safe submission and individual tracking records.
- Citizen-owned complaint list, status history and protected photograph viewing.
- Jurisdiction-scoped Grievance Redressal Officer (GRO) queue, reasoned updates and stale-update protection.
- Shared API/client contracts for React Native mobile and the Next.js website.
- Database migration with a generated PostGIS point and spatial index on PostgreSQL.

This is an academic prototype, not an official grievance portal or emergency service. **AI models are not trained or enabled.** No live government integration or operational deployment is claimed. Field assignment, appeals, incident linking, priority recommendations and maps are next milestones, not completed features.

## Stack

| Area | Used here |
| --- | --- |
| Mobile | React Native 0.86, Expo SDK 57, TypeScript |
| Website | Next.js 16.4, React 19.2, TypeScript |
| Shared API | FastAPI, SQLAlchemy 2, Alembic, Python 3.13 |
| Database | PostgreSQL 17 + PostGIS; SQLite only for isolated tests/lightweight demo |
| Evidence | Private local development adapter; private S3-compatible adapter available |
| Checks | pytest, Ruff, TypeScript, Node tests, Playwright, Android Metro export |

Celery/Redis and ML libraries are intentionally not installed before there are real background tasks/models. The earlier blueprint still describes their later purpose; adding unused services would not make this milestone more complete.

## Get the code

```powershell
git clone https://github.com/MK00315/GrievanceGrid.git
cd GrievanceGrid
npm ci
```

Use Node 24 and Python 3.13 for the tested setup. Android Studio/emulator or a compatible Expo Go installation is needed for on-device mobile testing. A website build is not an Android device test.

## Run locally — Windows, no Docker needed

### 1. Prepare the API

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m pip install --no-deps -e .
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Default configuration uses SQLite under `backend/var/`, a **simulated municipality** and private local photographs. No `.env` is required for this local-only configuration. Optional settings are shown in `backend/.env.example`; copy it to `backend/.env` before editing. Run backend commands from `backend/` so relative configuration paths resolve consistently.

### 2. Create a GRO account

Still inside `backend/`:

```powershell
.\.venv\Scripts\python.exe -m app.cli --email officer@example.com --name "Review officer" --role gro
```

The command asks for a new password twice. It does not save a plaintext password or create default credentials. Use 12–128 characters. Public registration cannot create officers. The default jurisdiction is `demo-municipality`; another jurisdiction's GRO cannot see these complaints. Technical `admin` accounts do not automatically have GRO powers.

### 3. Start the API

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Leave this terminal running. API documentation: http://localhost:8000/docs . Readiness: http://localhost:8000/ready . The API does **not** silently create tables on startup; run migrations first.

### 4. Start the website in another terminal

From the repository root:

```powershell
npm run web
```

Open http://localhost:3000 . Create a citizen account, submit a supported complaint and retain its tracking ID. Use a separate private/incognito browser window for the GRO account. Open the record, move it to `under review` and enter a reason. Refresh the citizen's record to see the same update.

Tokens stay in client memory, not browser local storage. Reloading the page/app requires signing in again. Sign out revokes the current server session; inactive accounts and expired sessions cannot access records.

### 5. Start the React Native app

In another terminal, from the repository root:

```powershell
npm run mobile
```

For the Android emulator, the app defaults to `http://10.0.2.2:8000`. For a physical phone:

1. Put the phone and computer on the same trusted local network.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env`; replace the API address with your computer's LAN IP, for example `http://192.168.x.x:8000` using its actual address.
3. Restart the API with `--host 0.0.0.0` and allow only the necessary private-network firewall access. Restart Expo after changing the environment file.

Do not expose development servers to the internet. Sessions, actual GPS permission behaviour, photo picking and camera orientation still need physical-device QA. The app currently selects existing JPEG/PNG photographs; live camera capture and a map picker are later work. Coordinates can be entered manually if device location is unavailable.

## Optional PostgreSQL/PostGIS + Docker setup

With Docker Desktop's Linux engine running:

1. Copy the root `.env.example` to `.env` and replace `GG_DB_PASSWORD` with a long random **hexadecimal/alphanumeric** password (URL-reserved characters require encoding).
2. From the repository root, run `docker compose up --build`.
3. The database uses host port 5433, API port 8000 and website port 3000, bound to loopback. Stop local servers using these ports first.
4. Create an officer with `docker compose exec api python -m app.cli --email officer@example.com --name "Review officer" --role gro`.

`docker compose down` stops containers and retains named data volumes. Do not add `-v` unless you intend to delete stored records and evidence. Compose is a local development setup, not an internet-ready deployment. The web API URL is set at build time.

For S3-compatible evidence storage, set `GG_STORAGE_BACKEND=s3`, `GG_S3_BUCKET` and, where needed, `GG_S3_ENDPOINT_URL`; supply credentials through the SDK's normal environment/role mechanism. Keep the bucket private. No public evidence URL is returned. Live S3 integration needs separate verification.

## Checks

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\ruff.exe check app tests migrations
.\.venv\Scripts\ruff.exe format --check app tests migrations
```

From the repository root:

```powershell
npm test
npm run typecheck
npm run build:web
```

From `apps/mobile/`:

```powershell
npx expo install --check
npx expo export --platform android --output-dir dist/android
```

The PostGIS-specific test skips without a dedicated migrated `GG_TEST_DATABASE_URL`. For that test suite the database name must end in `_test`; tests use rollback boundaries rather than deleting a working application's tables. GitHub Actions provisions a disposable PostGIS database, migrates it, runs workflow tests, builds both clients and runs browser tests. It **does not deploy** the application.

Browser tests require running API/web servers plus the dedicated test-only GRO account. See [testing](docs/testing.md); never seed fixed test credentials into a normal database.

## Repository guide

```text
apps/mobile/          React Native app
apps/web/             Citizen website and GRO portal
packages/api-client/  Shared API types and requests
backend/app/          Permissions, records, status rules and private storage
backend/migrations/   Database migration history
backend/tests/        Workflow, privacy and PostGIS checks
docs/                 Decisions, scope and verification boundaries
```

See [decisions](docs/decisions.md), [current limitations](docs/status.md), [security notes](SECURITY.md) and [team workflow](CONTRIBUTING.md).
