import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { checkTcpPortFromRemote } from './checks.js';
import { verifyIpfsPublication } from './ipfs-verification.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });

const publicRoot = fileURLToPath(new URL('./', import.meta.url));
const dataRoot = fileURLToPath(new URL('./data/', import.meta.url));
const staticFiles = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/app.js', 'app.js'],
  ['/styles.css', 'styles.css']
]);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};
const configuredIpfsPublishingPort = Number(process.env.IPFS_PUBLISHING_PORT);
const ipfsPublishingHost = (process.env.IPFS_PUBLISHING_HOST || '').trim();
const ipfsPublishingPort = Number.isInteger(configuredIpfsPublishingPort) && configuredIpfsPublishingPort > 0 && configuredIpfsPublishingPort <= 65535 ? configuredIpfsPublishingPort : 4001;
const ipfsPublishingUrl = ipfsPublishingHost ? `tcp://${ipfsPublishingHost}:${ipfsPublishingPort}` : '';
const jobDefinitions = {
  httpLochner: { enabled: 'httpLochnerEnabled', interval: 'httpLochnerIntervalMinutes', offsetMs: 30_000, url: 'http://lochner.tech' },
  httpsLochner: { enabled: 'httpsLochnerEnabled', interval: 'httpsLochnerIntervalMinutes', url: 'https://lochner.tech' },
  httpsLochnerSecond: { enabled: 'httpsLochnerSecondEnabled', interval: 'httpsLochnerSecondIntervalSeconds', intervalUnit: 'seconds', defaultInterval: 60, url: 'https://lochner.tech' },
  httpWwwLochner: { enabled: 'httpWwwLochnerEnabled', interval: 'httpWwwLochnerIntervalMinutes', offsetMs: 30_000, url: 'http://www.lochner.tech' },
  httpsWwwLochner: { enabled: 'httpsWwwLochnerEnabled', interval: 'httpsWwwLochnerIntervalMinutes', url: 'https://www.lochner.tech' },
  httpLochnerAlfmirPage: { enabled: 'httpLochnerAlfmirPageEnabled', interval: 'httpLochnerAlfmirPageIntervalMinutes', offsetMs: 30_000, url: 'http://lochner.tech/alfmir.ai.html' },
  httpsLochnerAlfmirPage: { enabled: 'httpsLochnerAlfmirPageEnabled', interval: 'httpsLochnerAlfmirPageIntervalMinutes', url: 'https://lochner.tech/alfmir.ai.html' },
  httpLochnerApparelPage: { enabled: 'httpLochnerApparelPageEnabled', interval: 'httpLochnerApparelPageIntervalMinutes', offsetMs: 30_000, url: 'http://lochner.tech/lochner-apparel.html' },
  httpsLochnerApparelPage: { enabled: 'httpsLochnerApparelPageEnabled', interval: 'httpsLochnerApparelPageIntervalMinutes', url: 'https://lochner.tech/lochner-apparel.html' },
  httpLemmy: { enabled: 'httpLemmyEnabled', interval: 'httpLemmyIntervalMinutes', offsetMs: 30_000, url: 'http://lemmy.lochner.tech' },
  httpsLemmy: { enabled: 'httpsLemmyEnabled', interval: 'httpsLemmyIntervalMinutes', url: 'https://lemmy.lochner.tech' },
  httpsLemmySecond: { enabled: 'httpsLemmySecondEnabled', interval: 'httpsLemmySecondIntervalSeconds', intervalUnit: 'seconds', defaultInterval: 60, url: 'https://lemmy.lochner.tech' },
  httpNews: { enabled: 'httpNewsEnabled', interval: 'httpNewsIntervalMinutes', offsetMs: 30_000, url: 'http://news.lochner.tech' },
  httpsNews: { enabled: 'httpsNewsEnabled', interval: 'httpsNewsIntervalMinutes', url: 'https://news.lochner.tech' },
  httpsNewsSecond: { enabled: 'httpsNewsSecondEnabled', interval: 'httpsNewsSecondIntervalSeconds', intervalUnit: 'seconds', defaultInterval: 60, url: 'https://news.lochner.tech' },
  tcpIpfsPublishing: { enabled: 'tcpIpfsPublishingEnabled', interval: 'tcpIpfsPublishingIntervalMinutes', host: ipfsPublishingHost, port: ipfsPublishingPort, url: ipfsPublishingUrl },
  ipfsLochnerVerification: { enabled: 'ipfsLochnerVerificationEnabled', interval: 'ipfsLochnerVerificationIntervalMinutes', url: 'ipfs://lochner.tech' },
  httpAlfmir: { enabled: 'httpAlfmirEnabled', interval: 'httpAlfmirIntervalMinutes', offsetMs: 30_000, url: 'http://alfmir.ai' },
  httpsAlfmir: { enabled: 'httpsAlfmirEnabled', interval: 'httpsAlfmirIntervalMinutes', url: 'https://alfmir.ai' },
  httpsAlfmirSecond: { enabled: 'httpsAlfmirSecondEnabled', interval: 'httpsAlfmirSecondIntervalSeconds', intervalUnit: 'seconds', defaultInterval: 60, url: 'https://alfmir.ai' },
  httpWwwAlfmir: { enabled: 'httpWwwAlfmirEnabled', interval: 'httpWwwAlfmirIntervalMinutes', offsetMs: 30_000, url: 'http://www.alfmir.ai' },
  httpsWwwAlfmir: { enabled: 'httpsWwwAlfmirEnabled', interval: 'httpsWwwAlfmirIntervalMinutes', url: 'https://www.alfmir.ai' },
  httpChatAlfmir: { enabled: 'httpChatAlfmirEnabled', interval: 'httpChatAlfmirIntervalMinutes', offsetMs: 30_000, url: 'http://chat.alfmir.ai' },
  httpsChatAlfmir: { enabled: 'httpsChatAlfmirEnabled', interval: 'httpsChatAlfmirIntervalMinutes', url: 'https://chat.alfmir.ai' },
  httpCodeAlfmir: { enabled: 'httpCodeAlfmirEnabled', interval: 'httpCodeAlfmirIntervalMinutes', offsetMs: 30_000, url: 'http://code.alfmir.ai' },
  httpsCodeAlfmir: { enabled: 'httpsCodeAlfmirEnabled', interval: 'httpsCodeAlfmirIntervalMinutes', url: 'https://code.alfmir.ai' },
  httpLitellmAlsh: { enabled: 'httpLitellmAlshEnabled', interval: 'httpLitellmAlshIntervalMinutes', offsetMs: 30_000, url: 'http://litellm.alfe.sh' },
  httpsLitellmAlsh: { enabled: 'httpsLitellmAlshEnabled', interval: 'httpsLitellmAlshIntervalMinutes', url: 'https://litellm.alfe.sh' }
};
const defaultSettings = Object.fromEntries(Object.values(jobDefinitions).flatMap(({ enabled, interval, defaultInterval = 5 }) => [
  [enabled, false], [interval, defaultInterval]
]));
const intervalDefinitions = new Map(Object.values(jobDefinitions).map((definition) => [definition.interval, definition]));

function clampInterval(definition, interval) {
  const maximum = definition.intervalUnit === 'seconds' ? 86_400 : 1440;
  return Math.min(maximum, Math.max(1, interval));
}

export function millisecondsUntilAlignedRun(intervalMs, offsetMs = 0, nowMs = Date.now()) {
  const elapsed = ((nowMs - offsetMs) % intervalMs + intervalMs) % intervalMs;
  return elapsed === 0 ? intervalMs : intervalMs - elapsed;
}

export function createUptimeWebappServer({
  jobsPath = process.env.UPTIME_WEBAPP_JOBS_DATA || join(dataRoot, 'jobs.json'),
  historyPath = process.env.UPTIME_WEBAPP_HISTORY_DATA || join(dataRoot, 'history.jsonl'),
  orderPath = process.env.UPTIME_WEBAPP_ORDER_DATA || join(dataRoot, 'monitor-order.json'),
  fetchImpl = fetch,
  checkTcp = checkTcpPortFromRemote,
  verifyIpfs = verifyIpfsPublication,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout
} = {}) {
  let settingsWrite = Promise.resolve();
  let historyWrite = Promise.resolve();
  let orderWrite = Promise.resolve();
  const jobTimers = new Map();
  const jobStates = new Map();

  async function loadSettings() {
    let saved;
    try { saved = JSON.parse(await readFile(jobsPath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') saved = {}; else throw error; }
    if (!saved || Array.isArray(saved) || typeof saved !== 'object') throw new Error('Uptime settings must contain a JSON object.');
    return Object.fromEntries(Object.entries(defaultSettings).map(([key, fallback]) => {
      const value = saved[key];
      if (key.endsWith('Enabled')) return [key, typeof value === 'boolean' ? value : fallback];
      const interval = Number(value);
      const definition = intervalDefinitions.get(key);
      return [key, Number.isFinite(interval) && definition ? clampInterval(definition, interval) : fallback];
    }));
  }

  async function saveSettings(update) {
    let settings;
    settingsWrite = settingsWrite.catch(() => {}).then(async () => {
      settings = { ...(await loadSettings()), ...update };
      await mkdir(dirname(jobsPath), { recursive: true });
      const temporaryPath = `${jobsPath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, jobsPath);
    });
    await settingsWrite;
    return settings;
  }

  async function addHistory(entry) {
    const historyEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ranAt: new Date().toISOString(), kind: 'request', ...entry };
    historyWrite = historyWrite.catch(() => {}).then(async () => {
      await mkdir(dirname(historyPath), { recursive: true });
      await appendFile(historyPath, `${JSON.stringify(historyEntry)}\n`, 'utf8');
    });
    await historyWrite;
  }

  async function loadHistory() {
    let entries = [];
    try {
      entries = (await readFile(historyPath, 'utf8')).split(/\r?\n/).filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return entries.sort((a, b) => new Date(b.ranAt) - new Date(a.ranAt));
  }

  function normalizeMonitorOrder(value) {
    const input = Array.isArray(value) ? value : value && typeof value === 'object' ? value.order : null;
    if (!Array.isArray(input)) throw new Error('Monitor order must be an array of job names.');
    const known = new Set(Object.keys(jobDefinitions));
    const order = [];
    for (const name of input) {
      if (typeof name !== 'string') throw new Error('Monitor order must contain job names.');
      if (known.has(name) && !order.includes(name)) order.push(name);
    }
    for (const name of known) if (!order.includes(name)) order.push(name);
    return order;
  }

  async function loadMonitorOrder() {
    let saved;
    try { saved = JSON.parse(await readFile(orderPath, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return Object.keys(jobDefinitions);
      throw error;
    }
    return normalizeMonitorOrder(saved);
  }

  async function saveMonitorOrder(value) {
    const order = normalizeMonitorOrder(value);
    orderWrite = orderWrite.catch(() => {}).then(async () => {
      await mkdir(dirname(orderPath), { recursive: true });
      const temporaryPath = `${orderPath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(order, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, orderPath);
    });
    await orderWrite;
    return order;
  }

  async function jobsPayload() {
    const settings = await loadSettings();
    return Object.fromEntries(Object.entries(jobDefinitions).map(([name, definition]) => {
      const payload = {
        enabled: settings[definition.enabled] === true,
        interval: Number(settings[definition.interval]),
        intervalUnit: definition.intervalUnit || 'minutes',
        url: definition.url || null,
        ...(jobStates.get(name) || {})
      };
      if ('host' in definition) payload.configured = Boolean(definition.host);
      return [name, payload];
    }));
  }

  async function runJob(name, definition) {
    if ('host' in definition && !definition.host) throw new Error('IPFS_PUBLISHING_HOST must be set to run the IPFS publishing check.');
    const startedAt = Date.now();
    const { url } = definition;
    let historyRecorded = false;
    try {
      if ('host' in definition) {
        const result = await checkTcp(definition.host, definition.port);
        await addHistory({ job: name, outcome: 'ok', url, latencyMs: result.latencyMs });
        historyRecorded = true;
        return { url, latencyMs: result.latencyMs };
      }
      if (url === 'ipfs://lochner.tech') {
        const result = await verifyIpfs('https://lochner.tech', fetchImpl);
        await addHistory({ job: name, outcome: 'ok', url, latencyMs: result.latencyMs, contentSha256: result.contentSha256, matchingGateways: result.matchingGateways, filesVerified: result.filesVerified });
        historyRecorded = true;
        return { url, ...result };
      }
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000)
      });
      const latencyMs = Date.now() - startedAt;
      await addHistory({ job: name, outcome: response.ok ? 'ok' : 'http-error', url, status: response.status, latencyMs });
      historyRecorded = true;
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
      return { url, status: response.status, latencyMs };
    } catch (error) {
      if (!historyRecorded) await addHistory({ job: name, outcome: 'failed', url, latencyMs: Date.now() - startedAt, error: error.message || String(error) });
      throw error;
    }
  }

  async function executeJob(name, definition) {
    const state = jobStates.get(name) || {};
    if (state.running) return;
    Object.assign(state, { running: true, lastStartedAt: new Date().toISOString(), lastError: null });
    jobStates.set(name, state);
    try {
      state.lastResult = await runJob(name, definition);
      state.lastCompletedAt = new Date().toISOString();
    } catch (error) {
      state.lastError = error.message || String(error);
      state.lastCompletedAt = new Date().toISOString();
      console.error(`[Uptime checks] ${name} failed`, { error: state.lastError });
    } finally {
      state.running = false;
    }
  }

  async function scheduleJobs() {
    for (const timeout of jobTimers.values()) clearTimeoutImpl(timeout);
    jobTimers.clear();
    const settings = await loadSettings();
    for (const [name, definition] of Object.entries(jobDefinitions)) {
      if (!settings[definition.enabled]) continue;
      const interval = clampInterval(definition, Number(settings[definition.interval]) || 1);
      const intervalMs = interval * (definition.intervalUnit === 'seconds' ? 1_000 : 60_000);
      const scheduleNext = () => {
        const delay = millisecondsUntilAlignedRun(intervalMs, definition.offsetMs || 0);
        const state = jobStates.get(name) || {};
        state.nextRunAt = new Date(Date.now() + delay).toISOString();
        jobStates.set(name, state);
        const timeout = setTimeoutImpl(async () => {
          if (jobTimers.get(name) !== timeout) return;
          await executeJob(name, definition);
          if (jobTimers.get(name) === timeout) scheduleNext();
        }, delay);
        timeout.unref?.();
        jobTimers.set(name, timeout);
      };
      scheduleNext();
    }
  }

  const server = createServer(async (request, response) => {
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('cache-control', 'no-store');
    const url = new URL(request.url, 'http://localhost');

    if (url.pathname === '/api/jobs') {
      if (request.method === 'GET') {
        try { return json(response, 200, await jobsPayload()); }
        catch (error) { return json(response, 500, { error: error.message || 'Could not load uptime jobs.' }); }
      }
      if (request.method === 'PATCH') {
        try {
          const update = await readJson(request);
          if (!update || Array.isArray(update) || typeof update !== 'object') throw new Error('Uptime jobs must be a JSON object.');
          const changes = {};
          for (const [name, config] of Object.entries(update)) {
            const definition = jobDefinitions[name];
            if (!definition || !config || Array.isArray(config) || typeof config !== 'object') throw new Error('Uptime jobs contain an unsupported configuration.');
            if (Object.keys(config).some((key) => !['enabled', 'interval'].includes(key))) throw new Error('Uptime jobs contain an unsupported configuration.');
            if ('enabled' in config) {
              if (typeof config.enabled !== 'boolean') throw new Error('The enabled setting must be a boolean.');
              changes[definition.enabled] = config.enabled;
            }
            if ('interval' in config) {
              const interval = Number(config.interval);
              if (!Number.isFinite(interval)) throw new Error('The check interval must be a number.');
              changes[definition.interval] = clampInterval(definition, interval);
            }
          }
          if (changes.tcpIpfsPublishingEnabled && !jobDefinitions.tcpIpfsPublishing.host) throw new Error('Set IPFS_PUBLISHING_HOST before enabling the IPFS publishing check.');
          await saveSettings(changes);
          await scheduleJobs();
          return json(response, 200, await jobsPayload());
        } catch (error) {
          return json(response, error.status === 413 ? 413 : 400, { error: error.message || 'Could not save uptime jobs.' });
        }
      }
      return json(response, 405, { error: 'Method not allowed.' });
    }

    if (url.pathname === '/api/monitor-order') {
      if (request.method === 'GET') {
        try { return json(response, 200, await loadMonitorOrder()); }
        catch (error) { return json(response, 500, { error: error.message || 'Could not load monitor order.' }); }
      }
      if (request.method === 'PUT') {
        try { return json(response, 200, await saveMonitorOrder(await readJson(request))); }
        catch (error) { return json(response, error.status === 413 ? 413 : 400, { error: error.message || 'Could not save monitor order.' }); }
      }
      return json(response, 405, { error: 'Method not allowed.' });
    }

    if (url.pathname === '/api/uptime-history') {
      if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed.' });
      try { return json(response, 200, await loadHistory()); }
      catch (error) { return json(response, 500, { error: error.message || 'Could not load uptime history.' }); }
    }

    if (url.pathname.startsWith('/api/')) return json(response, 404, { error: 'Not found.' });
    if (request.method !== 'GET') {
      response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed.');
      return;
    }
    const filename = staticFiles.get(url.pathname);
    if (!filename) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found.');
      return;
    }
    try {
      const content = await readFile(resolve(publicRoot, filename));
      response.writeHead(200, { 'content-type': types[extname(filename)] });
      response.end(content);
    } catch {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Could not read the uptime webapp.');
    }
  });

  server.on('listening', () => scheduleJobs().catch((error) => console.error('[Uptime checks] Could not initialize jobs:', error)));
  server.on('close', () => {
    for (const timeout of jobTimers.values()) clearTimeoutImpl(timeout);
    jobTimers.clear();
  });
  return server;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16 * 1024) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Request body must be valid JSON.'); }
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.UPTIME_WEBAPP_PORT) || 4175;
  const host = process.env.HOST || '127.0.0.1';
  createUptimeWebappServer().listen(port, host, () => {
    console.log(`Uptime webapp listening on http://${host}:${port}`);
  });
}
