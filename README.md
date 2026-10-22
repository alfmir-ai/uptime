# Uptime Webapp

A standalone Node.js dashboard that runs HTTP, HTTPS, TCP, and IPFS uptime
checks. Settings and latency history are stored locally; no database or
external service is required.

## Requirements

- Node.js 18 or newer

## Run

```sh
npm install
cp .env.example .env
npm start
```

Open <http://127.0.0.1:4175>.

## Configuration

The server loads `.env` from this directory. Variables already present in the
environment take precedence.

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interface the HTTP server binds to. |
| `UPTIME_WEBAPP_PORT` | `4175` | Dashboard port. |
| `UPTIME_WEBAPP_JOBS_DATA` | `./data/jobs.json` | Job settings file. |
| `UPTIME_WEBAPP_HISTORY_DATA` | `./data/history.jsonl` | Check history file. |
| `IPFS_PUBLISHING_HOST` | none | IP address or hostname of the IPFS publishing target. Required to enable the IPFS publishing monitor. |
| `IPFS_PUBLISHING_PORT` | `4001` | TCP port of the IPFS publishing target. |
| `IPFS_UPTIME_SSH_HOST` | none | SSH host used for the remote TCP check. Required to enable the IPFS publishing monitor. |
| `IPFS_UPTIME_SSH_KEY_PEM` | none | PEM private key used for the remote TCP check. Required to enable the IPFS publishing monitor. |

Settings and history are written under `data/`, which is ignored by Git.

## Checks

Each monitor can be enabled and given an interval from the dashboard. The
server schedules checks in the background and appends every result to the
history file. The IPFS verification check compares the Lochner origin manifest
against configured public IPNS gateways and, when requested by the manifest,
the GitHub revision.

The remote TCP monitor shells out to `ssh` and `nc`, so `IPFS_PUBLISHING_HOST`,
`IPFS_UPTIME_SSH_HOST`, and the SSH key referenced by `IPFS_UPTIME_SSH_KEY_PEM`
must be set before enabling it. The key must be usable non-interactively.

## Test

```sh
npm test
```

## Files

- `server.js` - HTTP server, scheduler, settings, and history API
- `checks.js` - remote TCP port check
- `ipfs-verification.js` - IPFS manifest and gateway verification
- `index.html`, `app.js`, `styles.css` - dashboard frontend
