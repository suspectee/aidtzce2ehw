# Pairwise

Pairwise is a focused workspace for live coding interviews. Opening the app creates a shareable room automatically; anyone with its URL can join, edit the same document, and see updates in real time.

## Features

- React + Vite interview workspace with a responsive three-panel layout
- CodeMirror highlighting for JavaScript, Python, TypeScript, HTML, CSS, and JSON
- FastAPI room API with WebSocket collaboration and participant presence
- Shareable `/room/:id` URLs with automatic room creation
- JavaScript and Python execution in disposable browser workers
- No DOM access, blocked common network APIs, and a five-second execution limit
- Public test cases, console output, session timing, connection state, and revision tracking

JavaScript uses the browser engine directly. Python uses a version-pinned [Pyodide](https://pyodide.org/) runtime that loads when the first Python run is requested. The room document is synchronized through FastAPI, but submitted code is never executed by the backend.

## Prerequisites

- Node.js 20 or newer with npm
- Python 3.11 or newer
- Internet access for dependency installation and the first Python/Pyodide run

## One-time setup

From the repository root, install the frontend dependencies:

```bash
npm install
```

Create the Python environment and install the API and test dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-dev.txt
```

On Windows PowerShell, activate the environment with:

```powershell
.venv\Scripts\Activate.ps1
```

## Run the application

Start FastAPI in the first terminal:

```bash
npm run dev:api
```

The equivalent direct command is:

```bash
.venv/bin/uvicorn backend.main:app --reload --port 8000
```

Start Vite in a second terminal:

```bash
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and `/ws` to FastAPI at `http://localhost:8000`.

Useful server checks:

```bash
curl http://localhost:8000/api/health
curl -X POST -H "Content-Type: application/json" -d '{"title":"Test interview"}' http://localhost:8000/api/rooms
```

## Manual interaction test

1. Open `http://localhost:5173` and wait for the URL to change to `/room/<id>`.
2. Click **Invite**, copy the room link, and open it in an incognito window or another browser.
3. Type in one editor. The other editor should update and both windows should show two participants.
4. Select JavaScript and click **Run code**. Console output should appear in the right panel.
5. Select Python and run it. The first run takes longer while Pyodide downloads.
6. Run `while (true) {}` as JavaScript. The worker should stop it after five seconds without affecting the API.

## Automated tests

The unit tests exercise room logic and API handlers without opening a network port:

```bash
npm run test:backend
# or
.venv/bin/pytest backend -q
```

The integration tests start a real Uvicorn server on an available ephemeral port and connect to it over HTTP and WebSockets. Do not start the development servers first; the test fixture manages its own server lifecycle.

```bash
npm run test:integration
# or
.venv/bin/pytest tests/integration -q
```

The integration suite verifies:

- room creation through `POST /api/rooms`
- initial room snapshots and ping/pong messages
- two-client participant presence
- edits flowing in both directions with increasing revisions
- disconnect presence updates
- the latest document reaching a newly connected client
- the REST room snapshot matching the WebSocket state

Run all Python unit and integration tests:

```bash
npm test
# or
.venv/bin/pytest -q
```

Run frontend static checks and create the production bundle:

```bash
npm run lint
npm run build
```

Run every lint, build, unit, and integration check with one command:

```bash
npm run check
```

After building, inspect the production bundle locally with:

```bash
npm run preview
```

## Project structure

```text
src/                         React workspace, collaboration hook, and runner hook
public/runner.worker.js      Disposable JavaScript/Python execution worker
backend/main.py              FastAPI room API and WebSocket protocol
backend/test_main.py         Fast backend unit tests
tests/integration/           Live HTTP/WebSocket client-server tests
vite.config.ts               Vite build and development proxy configuration
```

## Architecture and production boundaries

The backend owns room creation, the latest room snapshot, participant presence, monotonic revisions, and WebSocket fan-out. Rooms currently live in process memory, which is convenient for local development and a single API process.

The frontend owns editor drafts and browser execution. Every JavaScript or Python run starts in a fresh Worker. A runaway program is handled by terminating that Worker; the API process is never exposed to submitted code execution.

For production, the natural next steps are Redis-backed room state and pub/sub for multiple API instances, authenticated expiring room links, durable interview records, rate limits, and a CRDT such as Yjs for conflict-free simultaneous keystrokes. Self-hosting the pinned Pyodide assets and enforcing a strict Content Security Policy would remove the runtime CDN dependency.
