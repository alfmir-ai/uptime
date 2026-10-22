import { createHash } from 'node:crypto';

const MANIFEST_PATH = 'ipfs-version.json';
const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const PUBLIC_GATEWAYS = [
  { label: 'ipfs.io', url: (id) => `https://ipfs.io/ipns/${id}/${MANIFEST_PATH}` },
  { label: 'dweb.link', url: (id) => `https://${id}.ipns.dweb.link/${MANIFEST_PATH}` },
  { label: 'ipfs.filebase.io', url: (id) => `https://ipfs.filebase.io/ipns/${id}/${MANIFEST_PATH}` },
  { label: 'dget.top', url: (id) => `https://dget.top/ipns/${id}/${MANIFEST_PATH}` }
];

function assertManifest(manifest, source) {
  if (!manifest || manifest.schemaVersion !== 1 || typeof manifest.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.contentSha256)) throw new Error(`${source} returned an invalid IPFS manifest.`);
  if (!manifest.ipnsId || !Array.isArray(manifest.files)) throw new Error(`${source} returned an incomplete IPFS manifest.`);
  const paths = new Set();
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || !file.path || !Number.isFinite(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || paths.has(file.path)) throw new Error(`${source} contains an invalid file entry.`);
    paths.add(file.path);
  }
  return manifest;
}

async function fetchJson(fetchImpl, url, label) {
  const response = await fetchImpl(url, { cache: 'no-store', headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  return assertManifest(await response.json(), label);
}

function manifestsMatch(expected, candidate) {
  if (candidate.contentSha256 !== expected.contentSha256 || candidate.gitRevision !== expected.gitRevision || candidate.files.length !== expected.files.length) return false;
  const files = new Map(candidate.files.map((file) => [file.path, file]));
  return expected.files.every((file) => {
    const candidateFile = files.get(file.path);
    return candidateFile?.bytes === file.bytes && candidateFile.sha256 === file.sha256;
  });
}

function isImage(path) {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && IMAGE_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

function fileUrl(origin, relativePath) {
  return new URL(relativePath.split('/').map(encodeURIComponent).join('/'), `${origin}/`).href;
}

/** Verify Lochner's published manifest, live files, Git revision, and IPNS gateway quorum. */
export async function verifyIpfsPublication(origin = 'https://lochner.tech', fetchImpl = fetch) {
  const startedAt = Date.now();
  const normalizedOrigin = origin.replace(/\/$/, '');
  const manifest = await fetchJson(fetchImpl, `${normalizedOrigin}/${MANIFEST_PATH}`, 'Lochner origin');
  if (manifest.gitRevisionDirty) throw new Error('Lochner IPFS manifest was generated from a dirty Git tree.');

  const liveFiles = manifest.files.filter((file) => !isImage(file.path));
  await Promise.all(liveFiles.map(async (file) => {
    const response = await fetchImpl(fileUrl(normalizedOrigin, file.path), { cache: 'no-store' });
    if (!response.ok) throw new Error(`${file.path} returned HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== file.bytes || sha256 !== file.sha256) throw new Error(`${file.path} does not match the IPFS manifest.`);
  }));

  const gatewayResults = await Promise.allSettled(PUBLIC_GATEWAYS.map(async (gateway) => ({
    label: gateway.label,
    manifest: await fetchJson(fetchImpl, gateway.url(manifest.ipnsId), gateway.label)
  })));
  const matchingGateways = gatewayResults.filter((result) => result.status === 'fulfilled' && manifestsMatch(manifest, result.value.manifest)).map((result) => result.value.label);
  if (!matchingGateways.length) throw new Error('No public IPNS gateway matches the Lochner origin manifest.');

  if (manifest.includeGithubVerification) {
    if (!manifest.gitRepositoryUrl || !manifest.gitRevision) throw new Error('Lochner manifest is missing GitHub revision metadata.');
    const repository = manifest.gitRepositoryUrl.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
    if (!repository || repository === manifest.gitRepositoryUrl) throw new Error('Lochner manifest has an invalid GitHub repository URL.');
    const [rawManifest, commitResponse] = await Promise.all([
      fetchJson(fetchImpl, `https://raw.githubusercontent.com/${repository}/main/${MANIFEST_PATH}`, 'GitHub manifest'),
      fetchImpl(`https://api.github.com/repos/${repository}/commits/main`, { cache: 'no-store', headers: { accept: 'application/vnd.github+json' } })
    ]);
    if (!manifestsMatch(manifest, rawManifest)) throw new Error('GitHub and Lochner manifests do not match.');
    if (!commitResponse.ok) throw new Error(`GitHub main commit returned HTTP ${commitResponse.status}.`);
    const mainCommit = await commitResponse.json();
    const acceptedRevisions = new Set([mainCommit.sha, ...(mainCommit.parents || []).map((parent) => parent.sha)]);
    if (!acceptedRevisions.has(manifest.gitRevision)) throw new Error('Lochner manifest is not GitHub main or its direct parent.');
  }

  return { latencyMs: Date.now() - startedAt, contentSha256: manifest.contentSha256, matchingGateways, filesVerified: liveFiles.length };
}

export { manifestsMatch };
