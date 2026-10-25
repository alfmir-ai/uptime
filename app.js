const $ = (selector) => document.querySelector(selector);
const requestMonitors = [
  ['httpLochner', 'http-lochner', 'http://lochner.tech'], ['httpsLochner', 'https-lochner', 'https://lochner.tech'],
  ['httpWwwLochner', 'http-www-lochner', 'http://www.lochner.tech'], ['httpsWwwLochner', 'https-www-lochner', 'https://www.lochner.tech'],
  ['httpLochnerAlfmirPage', 'http-lochner-alfmir-page', 'http://lochner.tech/alfmir.ai.html', 'Alfmir AI page'], ['httpsLochnerAlfmirPage', 'https-lochner-alfmir-page', 'https://lochner.tech/alfmir.ai.html', 'Alfmir AI page'],
  ['httpLochnerApparelPage', 'http-lochner-apparel-page', 'http://lochner.tech/lochner-apparel.html', 'Lochner Apparel page'], ['httpsLochnerApparelPage', 'https-lochner-apparel-page', 'https://lochner.tech/lochner-apparel.html', 'Lochner Apparel page'],
  ['httpLemmy', 'http-lemmy', 'http://lemmy.lochner.tech'], ['httpsLemmy', 'https-lemmy', 'https://lemmy.lochner.tech'],
  ['httpNews', 'http-news', 'http://news.lochner.tech'], ['httpsNews', 'https-news', 'https://news.lochner.tech'],
  ['tcpIpfsPublishing', 'tcp-ipfs-publishing', '', 'IPFS Publishing Host'],
  ['ipfsLochnerVerification', 'ipfs-lochner-verification', 'ipfs://lochner.tech', 'IPFS Verification'],
  ['httpAlfmir', 'http-alfmir', 'http://alfmir.ai'], ['httpsAlfmir', 'https-alfmir', 'https://alfmir.ai'],
  ['httpWwwAlfmir', 'http-www-alfmir', 'http://www.alfmir.ai'], ['httpsWwwAlfmir', 'https-www-alfmir', 'https://www.alfmir.ai'],
  ['httpChatAlfmir', 'http-chat-alfmir', 'http://chat.alfmir.ai'], ['httpsChatAlfmir', 'https-chat-alfmir', 'https://chat.alfmir.ai'],
  ['httpCodeAlfmir', 'http-code-alfmir', 'http://code.alfmir.ai'], ['httpsCodeAlfmir', 'https-code-alfmir', 'https://code.alfmir.ai'],
  ['httpLitellmAlsh', 'http-litellm-alsh', 'http://litellm.alfe.sh'], ['httpsLitellmAlsh', 'https-litellm-alsh', 'https://litellm.alfe.sh']
];
let requestHistory = [];
let expandedUptimeChecks = [];
let uptimeRefreshTimer;
const uptimeSaveVersions = new Map();
const uptimeSaveQueues = new Map();
const httpFilterStorageKey = 'uptime-show-http-checks';
let showHttpChecks = true;
try { showHttpChecks = localStorage.getItem(httpFilterStorageKey) !== 'false'; } catch {}

function monitorKind(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? 'http' : 'other';
  } catch {
    return 'other';
  }
}

function applyHttpFilter() {
  const toggle = $('#http-filter-toggle');
  toggle.setAttribute('aria-checked', String(showHttpChecks));
  try { localStorage.setItem(httpFilterStorageKey, String(showHttpChecks)); } catch {}
  for (const card of document.querySelectorAll('.monitor-card[data-request-job]')) {
    card.hidden = card.dataset.requestKind === 'http' && !showHttpChecks;
  }
  for (const section of document.querySelectorAll('.uptime-section')) {
    const cards = [...section.querySelectorAll('.monitor-card[data-request-job]')];
    section.hidden = cards.length > 0 && cards.every((card) => card.hidden);
  }
}

function buildUptimeMonitors() {
  for (const [name, id, url, label] of requestMonitors) {
    const parsed = url ? new URL(url) : null;
    const card = document.createElement('article');
    card.className = 'monitor-card';
    card.dataset.requestJob = name;
    card.dataset.requestUrl = url;
    card.dataset.requestLabel = label || '';
    card.dataset.requestKind = monitorKind(url);

    const header = document.createElement('header');
    const service = document.createElement('div');
    const protocol = document.createElement('p');
    protocol.className = 'monitor-protocol';
    protocol.textContent = parsed ? url.split(':', 1)[0].toUpperCase() : 'TCP';
    const heading = document.createElement('h3');
    heading.textContent = label || parsed?.host || name;
    service.append(protocol, heading);
    if (label) {
      const host = document.createElement('small');
      host.className = 'monitor-host';
      host.textContent = parsed ? parsed.host : 'Not configured';
      service.append(host);
    }
    const health = document.createElement('span');
    health.className = 'monitor-health';
    health.textContent = 'No checks yet';
    header.append(service, health);

    const controls = document.createElement('div');
    controls.className = 'monitor-controls';
    const intervalLabel = document.createElement('label');
    intervalLabel.append('Every ');
    const interval = document.createElement('input');
    interval.id = `${id}-interval`;
    interval.type = 'number';
    interval.min = '1';
    interval.max = '1440';
    interval.value = '5';
    interval.required = true;
    intervalLabel.append(interval, ' minutes');
    const toggle = document.createElement('button');
    toggle.id = `${id}-toggle`;
    toggle.className = 'switch';
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', 'false');
    toggle.setAttribute('aria-label', `Check ${label || parsed?.host || name} over ${protocol.textContent}`);
    toggle.append(document.createElement('span'));
    const status = document.createElement('small');
    status.id = `${id}-job-status`;
    status.textContent = 'Stopped';
    controls.append(intervalLabel, toggle, status);

    const chart = document.createElement('div');
    chart.className = 'monitor-chart';
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `${protocol.textContent} ${label || parsed?.host || name} latency history`);
    card.append(header, controls, chart);
    const group = parsed
      ? (parsed.hostname.endsWith('alfmir.ai') || parsed.hostname === 'litellm.alfe.sh' ? 'alfmir' : 'lochner')
      : 'lochner';
    $(`[data-monitor-group="${group}"]`).append(card);
  }
}
buildUptimeMonitors();
applyHttpFilter();

function applyMonitorJob(name, job) {
  const card = document.querySelector(`[data-request-job="${name}"]`);
  if (!card || !job) return;
  const host = card.querySelector('.monitor-host');
  if (!job.url) {
    if (host) host.textContent = 'Not configured';
    return;
  }
  const parsed = new URL(job.url);
  card.dataset.requestUrl = job.url;
  card.dataset.requestKind = monitorKind(job.url);
  card.hidden = card.dataset.requestKind === 'http' && !showHttpChecks;
  const protocol = card.querySelector('.monitor-protocol');
  if (protocol) protocol.textContent = job.url.split(':', 1)[0].toUpperCase();
  if (host) host.textContent = parsed.host;
  const chart = card.querySelector('.monitor-chart');
  if (chart) chart.setAttribute('aria-label', `${protocol?.textContent || 'TCP'} ${card.dataset.requestLabel || parsed.host} latency history`);
}

function jobStatus(job) {
  if (job?.configured === false) return 'Not configured';
  if (!job?.enabled) return 'Stopped';
  if (job.running) return 'Running now';
  if (job.lastError) return `Last run failed: ${job.lastError}`;
  if (job.nextRunAt) return `Next run ${new Date(job.nextRunAt).toLocaleString()}`;
  return 'Running in background';
}

async function fetchJson(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Uptime server returned HTTP ${response.status}.`);
  return body;
}

async function loadJobs() {
  const jobs = await fetchJson('/api/jobs');
  for (const [name, id] of requestMonitors) {
    const job = jobs[name];
    if (!job) continue;
    applyMonitorJob(name, job);
    $(`#${id}-toggle`).setAttribute('aria-checked', String(job.enabled));
    $(`#${id}-interval`).value = String(job.interval || 5);
    $(`#${id}-job-status`).textContent = jobStatus(job);
  }
}

function saveUptimeMonitor(name, id) {
  const version = (uptimeSaveVersions.get(name) || 0) + 1;
  uptimeSaveVersions.set(name, version);
  const status = $(`#${id}-job-status`);
  status.textContent = 'Saving…';
  const update = { [name]: {
    enabled: $(`#${id}-toggle`).getAttribute('aria-checked') === 'true',
    interval: Number($(`#${id}-interval`).value)
  } };
  const save = (uptimeSaveQueues.get(name) || Promise.resolve()).catch(() => {}).then(async () => {
    try {
      const jobs = await fetchJson('/api/jobs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update)
      });
      if (uptimeSaveVersions.get(name) === version) status.textContent = jobStatus(jobs[name]);
    } catch (error) {
      if (uptimeSaveVersions.get(name) === version) status.textContent = 'Save failed';
      showToast(error.message || 'Could not save uptime checks.', true);
    }
  });
  uptimeSaveQueues.set(name, save);
  return save;
}

for (const [name, id] of requestMonitors) {
  $(`#${id}-toggle`).addEventListener('click', (event) => {
    event.currentTarget.setAttribute('aria-checked', String(event.currentTarget.getAttribute('aria-checked') !== 'true'));
    saveUptimeMonitor(name, id);
  });
  $(`#${id}-interval`).addEventListener('change', () => saveUptimeMonitor(name, id));
}

$('#http-filter-toggle').addEventListener('click', () => {
  showHttpChecks = !showHttpChecks;
  applyHttpFilter();
});

function renderUptimeHistory() {
  for (const card of document.querySelectorAll('.monitor-card[data-request-job]')) {
    const url = card.dataset.requestUrl;
    const chart = card.querySelector('.monitor-chart');
    const health = card.querySelector('.monitor-health');
    if (!url) {
      chart.classList.add('empty');
      chart.textContent = 'Set IPFS_PUBLISHING_HOST to enable this check.';
      health.textContent = 'Not configured';
      health.classList.remove('failed');
      continue;
    }
    const checks = requestHistory.filter((entry) => entry.url === url).sort((a, b) => new Date(a.ranAt) - new Date(b.ranAt)).slice(-40);
    if (!checks.length) {
      chart.classList.add('empty');
      chart.textContent = 'Latency history will appear after the first check.';
      health.textContent = 'No checks yet';
      health.classList.remove('failed');
      continue;
    }
    chart.classList.remove('empty');
    const latest = checks.at(-1);
    const verified = url.startsWith('ipfs:');
    health.textContent = latest.outcome === 'ok' ? `${verified ? 'Verified' : 'Online'} · ${Number(latest.latencyMs).toLocaleString()} ms` : 'Check failed';
    health.classList.toggle('failed', latest.outcome !== 'ok');
    drawUptimeChart(chart, checks);
  }
}

function drawUptimeChart(chart, allChecks, { full = false } = {}) {
  chart.replaceChildren();
  if (!allChecks.length) {
    chart.classList.add('empty');
    chart.textContent = 'No checks in this timeframe.';
    return;
  }
  chart.classList.remove('empty');
  const checks = allChecks.length <= 1500 ? allChecks : allChecks.filter((check, index) => index === 0 || index === allChecks.length - 1 || check.outcome !== 'ok' || index % Math.ceil(allChecks.length / 1500) === 0);
  const width = full ? 1200 : 600;
  const height = full ? 500 : 160;
  const padding = full ? 32 : 18;
  const maximum = Math.max(1, ...checks.map((check) => Number(check.latencyMs) || 0));
  const firstTime = new Date(checks[0].ranAt).getTime();
  const lastTime = new Date(checks.at(-1).ranAt).getTime();
  const span = Math.max(1, lastTime - firstTime);
  const points = checks.map((check) => ({
    x: checks.length === 1 ? width / 2 : padding + ((new Date(check.ranAt).getTime() - firstTime) / span) * (width - padding * 2),
    y: height - padding - ((Number(check.latencyMs) || 0) / maximum) * (height - padding * 2),
    check
  }));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const area = document.createElementNS(svg.namespaceURI, 'path');
  area.setAttribute('class', 'latency-area');
  area.setAttribute('d', `M ${points[0].x} ${height - padding} ${points.map(({ x, y }) => `L ${x} ${y}`).join(' ')} L ${points.at(-1).x} ${height - padding} Z`);
  const line = document.createElementNS(svg.namespaceURI, 'polyline');
  line.setAttribute('class', 'latency-line');
  line.setAttribute('points', points.map(({ x, y }) => `${x},${y}`).join(' '));
  svg.append(area, line);
  const tooltip = document.createElement('div');
  tooltip.className = 'monitor-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  const hideTooltip = () => { tooltip.hidden = true; };
  for (const { x, y, check } of points) {
    const point = document.createElementNS(svg.namespaceURI, 'circle');
    const time = new Date(check.ranAt).toLocaleString();
    const gateways = Array.isArray(check.matchingGateways) ? check.matchingGateways.length : 0;
    const detail = `${Number(check.latencyMs).toLocaleString()} ms${check.status ? ` · HTTP ${check.status}` : check.outcome === 'ok' ? check.contentSha256 ? ` · verified by ${gateways} gateway${gateways === 1 ? '' : 's'}` : ' · connected' : ' · failed'}`;
    point.setAttribute('cx', x);
    point.setAttribute('cy', y);
    point.setAttribute('r', '3.5');
    point.setAttribute('tabindex', '0');
    point.setAttribute('aria-label', `${time}: ${detail}`);
    point.classList.toggle('failed', check.outcome !== 'ok');
    const showTooltip = () => {
      const title = document.createElement('strong');
      title.textContent = time;
      const text = document.createElement('span');
      text.textContent = detail;
      tooltip.replaceChildren(title, text);
      const pointBounds = point.getBoundingClientRect();
      const chartBounds = chart.getBoundingClientRect();
      tooltip.style.left = `${pointBounds.left + pointBounds.width / 2 - chartBounds.left}px`;
      tooltip.style.top = `${pointBounds.top - chartBounds.top}px`;
      tooltip.hidden = false;
    };
    point.addEventListener('mouseenter', showTooltip);
    point.addEventListener('mouseleave', hideTooltip);
    point.addEventListener('focus', showTooltip);
    point.addEventListener('blur', hideTooltip);
    svg.append(point);
  }
  const legend = document.createElement('div');
  legend.className = 'monitor-legend';
  const count = document.createElement('span');
  count.textContent = `${allChecks.length.toLocaleString()} check${allChecks.length === 1 ? '' : 's'}`;
  const peak = document.createElement('span');
  peak.textContent = `Peak ${maximum.toLocaleString()} ms`;
  legend.append(count, peak);
  chart.append(svg, tooltip, legend);
}

function openUptimeChart(url) {
  expandedUptimeChecks = requestHistory.filter((entry) => entry.url === url).sort((a, b) => new Date(a.ranAt) - new Date(b.ranAt));
  if (!expandedUptimeChecks.length) return;
  const parsed = new URL(url);
  const label = document.querySelector(`[data-request-url="${url}"]`)?.dataset.requestLabel;
  $('#uptime-chart-title').textContent = label || parsed.host;
  $('#uptime-chart-subtitle').textContent = `${url.split(':', 1)[0].toUpperCase()} · ${url} · ${expandedUptimeChecks.length.toLocaleString()} checks stored on the server`;
  for (const input of [$('#uptime-range-start'), $('#uptime-range-end')]) {
    input.min = '0';
    input.max = String(expandedUptimeChecks.length - 1);
  }
  $('#uptime-range-start').value = '0';
  $('#uptime-range-end').value = String(expandedUptimeChecks.length - 1);
  renderExpandedUptimeChart();
  $('#uptime-chart-dialog').showModal();
}

function renderExpandedUptimeChart() {
  if (!expandedUptimeChecks.length) return;
  const start = Number($('#uptime-range-start').value);
  const end = Number($('#uptime-range-end').value);
  const visible = expandedUptimeChecks.slice(start, end + 1);
  drawUptimeChart($('#uptime-full-chart'), visible, { full: true });
  const startDate = new Date(visible[0].ranAt);
  const endDate = new Date(visible.at(-1).ranAt);
  $('#uptime-range-label').textContent = `${startDate.toLocaleString()} — ${endDate.toLocaleString()} · ${visible.length.toLocaleString()} checks`;
  document.querySelectorAll('.uptime-range-presets button').forEach((button) => button.classList.toggle('active', button.dataset.range === 'all' && start === 0 && end === expandedUptimeChecks.length - 1));
}

$('#uptime-monitors').addEventListener('click', (event) => {
  const chart = event.target.closest('.monitor-chart');
  if (chart && !chart.classList.contains('empty')) openUptimeChart(chart.closest('.monitor-card').dataset.requestUrl);
});
$('#uptime-chart-dialog .dialog-close').addEventListener('click', () => $('#uptime-chart-dialog').close());
for (const input of [$('#uptime-range-start'), $('#uptime-range-end')]) {
  input.addEventListener('input', (event) => {
    const start = $('#uptime-range-start');
    const end = $('#uptime-range-end');
    if (Number(start.value) > Number(end.value)) (event.currentTarget === start ? end : start).value = event.currentTarget.value;
    renderExpandedUptimeChart();
  });
}
document.querySelector('.uptime-range-presets').addEventListener('click', (event) => {
  const button = event.target.closest('[data-range]');
  if (!button || !expandedUptimeChecks.length) return;
  const durations = { day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 };
  const end = expandedUptimeChecks.length - 1;
  const cutoff = button.dataset.range === 'all' ? -Infinity : new Date(expandedUptimeChecks[end].ranAt).getTime() - durations[button.dataset.range];
  const start = Math.max(0, expandedUptimeChecks.findIndex((check) => new Date(check.ranAt).getTime() >= cutoff));
  $('#uptime-range-start').value = String(start);
  $('#uptime-range-end').value = String(end);
  renderExpandedUptimeChart();
  document.querySelectorAll('.uptime-range-presets button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
});

function showToast(message, error = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

async function refreshUptimePage() {
  clearTimeout(uptimeRefreshTimer);
  try {
    const [jobs, history] = await Promise.all([fetchJson('/api/jobs'), fetchJson('/api/uptime-history')]);
    for (const [name, id] of requestMonitors) {
      const job = jobs[name];
      if (!job) continue;
      applyMonitorJob(name, job);
      $(`#${id}-toggle`).setAttribute('aria-checked', String(job.enabled));
      $(`#${id}-interval`).value = String(job.interval || 5);
      $(`#${id}-job-status`).textContent = jobStatus(job);
    }
    requestHistory = Array.isArray(history) ? history : [];
    renderUptimeHistory();
    $('#connection-status').textContent = 'Connected';
    $('#connection-status').classList.remove('error');
  } catch (error) {
    $('#connection-status').textContent = 'Uptime server unavailable';
    $('#connection-status').classList.add('error');
    showToast(error.message || 'Could not load uptime data.', true);
  }
  uptimeRefreshTimer = setTimeout(refreshUptimePage, 15_000);
}

$('#theme-toggle').addEventListener('click', () => document.documentElement.classList.toggle('dark'));
refreshUptimePage();
