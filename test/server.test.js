import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createUptimeWebappServer } from '../server.js';

async function createTempDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'uptime-webapp-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function listen(server, t) {
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('serves the standalone dashboard and manages its own job settings', async (t) => {
  const directory = await createTempDirectory(t);
  const requests = [];
  const scheduledCallbacks = [];
  const server = createUptimeWebappServer({
    jobsPath: join(directory, 'jobs.json'),
    historyPath: join(directory, 'history.jsonl'),
    fetchImpl: async (...args) => {
      requests.push(args);
      return new Response(null, { status: 200 });
    },
    setTimeoutImpl: (callback) => {
      scheduledCallbacks.push(callback);
      return { unref() {} };
    },
    clearTimeoutImpl: () => {}
  });
  const origin = await listen(server, t);
  await new Promise(setImmediate);

  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Uptime<\/title>/);
  assert.equal((await fetch(`${origin}/../README.md`)).status, 404);

  const jobs = await fetch(`${origin}/api/jobs`);
  const initialJobs = await jobs.json();
  assert.equal(initialJobs.httpLochner.enabled, false);
  assert.equal(initialJobs.httpLochner.interval, 5);
  assert.deepEqual(await (await fetch(`${origin}/api/uptime-history`)).json(), []);

  const saved = await fetch(`${origin}/api/jobs`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ httpLochner: { enabled: true, interval: 10 } })
  });
  const savedJobs = await saved.json();
  assert.equal(savedJobs.httpLochner.enabled, true);
  assert.equal(savedJobs.httpLochner.interval, 10);
  assert.ok(savedJobs.httpLochner.nextRunAt);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'jobs.json'), 'utf8')).httpLochnerEnabled, true);
  assert.equal(requests.length, 0);
  await scheduledCallbacks.shift()();
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], 'http://lochner.tech');
  assert.equal((await (await fetch(`${origin}/api/uptime-history`)).json())[0].outcome, 'ok');
});

test('runs the second HTTPS monitors on seconds-based intervals', async (t) => {
  const directory = await createTempDirectory(t);
  const requests = [];
  const scheduledCallbacks = [];
  const server = createUptimeWebappServer({
    jobsPath: join(directory, 'jobs.json'),
    historyPath: join(directory, 'history.jsonl'),
    fetchImpl: async (...args) => {
      requests.push(args);
      return new Response(null, { status: 200 });
    },
    setTimeoutImpl: (callback) => {
      scheduledCallbacks.push(callback);
      return { unref() {} };
    },
    clearTimeoutImpl: () => {}
  });
  const origin = await listen(server, t);
  await new Promise(setImmediate);

  const initialJobs = await (await fetch(`${origin}/api/jobs`)).json();
  assert.equal(initialJobs.httpsLemmySecond.url, 'https://lemmy.lochner.tech');
  assert.equal(initialJobs.httpsLemmySecond.interval, 60);
  assert.equal(initialJobs.httpsLemmySecond.intervalUnit, 'seconds');
  assert.equal(initialJobs.httpsNewsSecond.url, 'https://news.lochner.tech');
  assert.equal(initialJobs.httpsNewsSecond.interval, 60);
  assert.equal(initialJobs.httpsNewsSecond.intervalUnit, 'seconds');

  const saved = await fetch(`${origin}/api/jobs`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ httpsLemmySecond: { enabled: true, interval: 15 } })
  });
  const savedJobs = await saved.json();
  assert.equal(savedJobs.httpsLemmySecond.enabled, true);
  assert.equal(savedJobs.httpsLemmySecond.interval, 15);
  assert.ok(savedJobs.httpsLemmySecond.nextRunAt);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'jobs.json'), 'utf8')).httpsLemmySecondIntervalSeconds, 15);

  await scheduledCallbacks.at(-1)();
  assert.equal(requests.at(-1)[0], 'https://lemmy.lochner.tech');
  const history = await (await fetch(`${origin}/api/uptime-history`)).json();
  assert.equal(history[0].job, 'httpsLemmySecond');
  assert.equal(history[0].url, 'https://lemmy.lochner.tech');

  const clamped = await fetch(`${origin}/api/jobs`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ httpsNewsSecond: { interval: 90_000 } })
  });
  assert.equal((await clamped.json()).httpsNewsSecond.interval, 86_400);
});

test('loads local history and rejects unsupported or oversized job updates', async (t) => {
  const directory = await createTempDirectory(t);
  const historyPath = join(directory, 'history.jsonl');
  await writeFile(historyPath, `${JSON.stringify({ url: 'https://lochner.tech', ranAt: '2026-10-18T12:00:00.000Z', outcome: 'ok' })}\ninvalid\n`);
  const server = createUptimeWebappServer({
    jobsPath: join(directory, 'jobs.json'),
    historyPath,
    fetchImpl: async () => { throw new Error('Unexpected check request.'); }
  });
  const origin = await listen(server, t);

  assert.deepEqual(await (await fetch(`${origin}/api/uptime-history`)).json(), [
    { url: 'https://lochner.tech', ranAt: '2026-10-18T12:00:00.000Z', outcome: 'ok' }
  ]);
  const unsupported = await fetch(`${origin}/api/jobs`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ unknown: { enabled: true } })
  });
  assert.equal(unsupported.status, 400);
  const oversized = await fetch(`${origin}/api/jobs`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: ' '.repeat(16 * 1024 + 1)
  });
  assert.equal(oversized.status, 413);
  assert.equal((await fetch(`${origin}/api/uptime-history`, { method: 'PATCH' })).status, 405);
});
