import { DA_ADMIN_ORIGIN, DA_ORIGIN, DA_APP_PATH } from '../constants.js';

let daToken = null;
let sdkDaFetch = null;

export function setDaToken(token) {
  daToken = token;
}

export function setDaFetch(fn) {
  sdkDaFetch = fn;
}

// Prefer the DA SDK's authenticated fetch when it has been provided; otherwise
// fall back to the global fetch (auth is then supplied via the Bearer token).
function doFetch(url, options) {
  return (sdkDaFetch || fetch)(url, options);
}

// How many document fetches to run at once when scanning. The per-doc source
// fetch is the sync bottleneck, so a bounded pool is far faster than a
// sequential loop while staying polite to the admin API. Raise cautiously and
// watch for 429s / a latency plateau — fetchText retries throttled requests so
// higher values degrade to backoff rather than dropped docs.
const SCAN_CONCURRENCY = 100;

const MAX_FETCH_ATTEMPTS = 4;
const MAX_WRITE_RETRIES = 4;

function normalizeEtag(etag) {
  if (!etag) return undefined;
  return etag.replace(/^W\//, '');
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Backoff before the next retry: honor a Retry-After header when present,
// otherwise exponential (0.3s, 0.6s, 1.2s, …) capped at 4s.
function retryDelay(attempt, retryAfter) {
  const ra = Number(retryAfter);
  if (Number.isFinite(ra) && ra > 0) return ra * 1000;
  return Math.min(2 ** attempt * 300, 4000);
}

// Runs `fn` over items with at most `limit` in flight at a time, preserving the
// input order in the returned results array.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await fn(items[i], i);
    }
  };
  const size = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}

function getHeaders(method = 'GET') {
  const headers = new Headers();
  if (daToken) headers.append('Authorization', `Bearer ${daToken}`);
  // no-store bypasses the browser cache so every source read gets the current
  // server state rather than a stale cached response.
  return { method, headers, cache: 'no-store' };
}

async function daFetch(path, options = {}) {
  const url = `${DA_ADMIN_ORIGIN}${path}`;
  let resp;
  try {
    resp = await doFetch(url, options);
  } catch (err) {
    window.lana?.log(`DA fetch network error: ${err} — ${url}`);
    return { ok: false, status: 0, error: 'Network error' };
  }
  if (!resp.ok) {
    const error = await resp.text().catch(() => resp.statusText);
    window.lana?.log(`DA fetch error ${resp.status}: ${url} — ${error}`);
    return { ok: false, status: resp.status, error };
  }
  const etag = resp.headers.get('ETag');
  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await resp.json();
    return { ok: true, status: resp.status, data, etag };
  }
  return { ok: true, status: resp.status, etag };
}

export async function listEventFolders(org, repo) {
  const result = await daFetch(`/list/${org}/${repo}`, getHeaders('GET'));
  if (!result.ok) return result;
  const folders = (result.data || []).filter((item) => !item.ext);
  return { ok: true, data: folders };
}

export async function listFolder(org, repo, path) {
  const result = await daFetch(`/list/${org}/${repo}${path}`, getHeaders('GET'));
  if (!result.ok) return result;
  const items = (result.data || []).sort((a, b) => {
    if (!a.ext && b.ext) return -1;
    if (a.ext && !b.ext) return 1;
    return a.path.localeCompare(b.path);
  });
  return { ok: true, data: items };
}

// Fetches a document's text with retry/backoff on throttling (429) and transient
// server errors (5xx / network). Returns:
//   { ok: true, text }  — success (text is '' for a 404, i.e. the doc is gone)
//   { ok: false }       — could not be read after retries; treat as an error,
//                          NOT as an empty doc, so a throttled fetch never
//                          silently misclassifies a schedule.
async function fetchText(org, repo, path) {
  const url = `${DA_ADMIN_ORIGIN}/source/${org}/${repo}${path}`;
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt += 1) {
    let resp;
    try {
      // eslint-disable-next-line no-await-in-loop
      resp = await doFetch(url, getHeaders('GET'));
    } catch {
      if (attempt < MAX_FETCH_ATTEMPTS - 1) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(retryDelay(attempt));
        continue;
      }
      return { ok: false };
    }
    if (resp.ok) return { ok: true, text: await resp.text() };
    if (resp.status === 404) return { ok: true, text: '' };
    if (resp.status === 429 || resp.status >= 500) {
      if (attempt < MAX_FETCH_ATTEMPTS - 1) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(retryDelay(attempt, resp.headers.get('Retry-After')));
        continue;
      }
      return { ok: false };
    }
    // Non-retriable (401/403/other 4xx) — surface as unreadable.
    return { ok: false };
  }
  return { ok: false };
}

// Recursively lists every file under a path. Traverses breadth-first, one level
// at a time through the bounded pool, so peak concurrent /list requests stay
// capped at SCAN_CONCURRENCY.
async function listAllFiles(org, repo, path) {
  const files = [];
  let frontier = [path];
  let authError = false;

  while (frontier.length > 0) {
    // eslint-disable-next-line no-await-in-loop
    const levelResults = await mapWithConcurrency(frontier, SCAN_CONCURRENCY, async (folderPath) => {
      const result = await daFetch(`/list/${org}/${repo}${folderPath}`, getHeaders('GET'));
      if (!result.ok) {
        // 401/0 means every listing call is failing the same way (auth, not a
        // one-off missing subfolder), so surface it rather than reporting an
        // empty scan as if the folder legitimately had nothing in it.
        if (result.status === 401 || result.status === 0) authError = true;
        return { files: [], folders: [] };
      }
      const items = Array.isArray(result.data) ? result.data : [];
      const levelFiles = [];
      const levelFolders = [];
      items.forEach((item) => {
        const itemPath = item.path.replace(`/${org}/${repo}`, '');
        if (!item.ext) levelFolders.push(itemPath);
        else levelFiles.push(itemPath);
      });
      return { files: levelFiles, folders: levelFolders };
    });

    const nextFrontier = [];
    levelResults.forEach(({ files: levelFiles, folders }) => {
      files.push(...levelFiles);
      nextFrontier.push(...folders);
    });
    frontier = nextFrontier;
  }

  return { files, authError };
}

// Matches ?schedule=, &schedule=, and #schedule= — the schedule param regardless
// of connector char or whether it's in the query string or the hash fragment.
const SCHEDULE_PARAM_RE = /[?#&]schedule=([A-Za-z0-9+/=%-]{20,})/g;

// Matches any anchor href carrying a schedule param, on any domain/path.
const SCHEDULE_HREF_RE = /href=(["'])([^"']*[?#&]schedule=[A-Za-z0-9+/=%-]{20,}[^"']*)\1/gi;

// True if href is already exactly the canonical DA app URL in hash format —
// i.e. nothing for rewriteNonCanonicalScheduleLinks to do.
function isCanonicalScheduleHref(href, canonicalPrefix) {
  if (!href.startsWith(canonicalPrefix)) return false;
  try {
    const parsed = new URL(href);
    if (parsed.searchParams.get('schedule')) return false;
    return /^#schedule=[A-Za-z0-9+/=%-]{20,}$/.test(parsed.hash);
  } catch {
    return false;
  }
}

// Extracts the schedule param's raw value from a href, whether it's in the
// query string or the hash fragment.
function extractScheduleParamFromHref(href) {
  try {
    const parsed = new URL(href);
    const fromQuery = parsed.searchParams.get('schedule');
    if (fromQuery) return fromQuery;
    const hashMatch = parsed.hash.match(/[#&]schedule=([A-Za-z0-9+/=%-]{20,})/);
    return hashMatch?.[1] || null;
  } catch {
    return null;
  }
}

// Rewrites any schedule href that isn't already the canonical DA app URL
// (da.live/app/{org}/{repo}/tools/da-apps/schedule-maker#schedule=...) to that
// form. Covers both old ECC-hosted links (any environment/domain — e.g.
// www.adobe.com, main--ecc-milo--adobecom.aem.page, dev/stage variants — the
// check is domain-agnostic, it just looks for anything that isn't the current
// canonical prefix) and links already on the DA app but still in the old
// ?schedule= query-param format.
async function rewriteNonCanonicalScheduleLinks(org, repo, filePath) {
  const canonicalPrefix = `${DA_ORIGIN}/app/${org}/${repo}/${DA_APP_PATH}`;
  const url = `${DA_ADMIN_ORIGIN}/source/${org}/${repo}${filePath}`;

  for (let attempt = 0; attempt <= MAX_WRITE_RETRIES; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (attempt > 0) await sleep(retryDelay(attempt - 1));
    let resp;
    try {
      // eslint-disable-next-line no-await-in-loop
      resp = await doFetch(url, getHeaders('GET'));
    } catch { return false; }
    if (!resp.ok) return resp.status === 404;
    const etag = normalizeEtag(resp.headers.get('ETag'));
    // eslint-disable-next-line no-await-in-loop
    const text = await resp.text();
    let changed = false;
    const conversions = [];
    const rewritten = text.replace(SCHEDULE_HREF_RE, (match, quote, href) => {
      if (isCanonicalScheduleHref(href, canonicalPrefix)) return match;
      const scheduleParam = extractScheduleParamFromHref(href);
      if (!scheduleParam) return match;
      const newUrl = new URL(canonicalPrefix);
      newUrl.hash = `schedule=${scheduleParam}`;
      changed = true;
      conversions.push({ from: href, to: newUrl.toString() });
      return `href=${quote}${newUrl.toString()}${quote}`;
    });
    if (!changed) return true;

    const formData = new FormData();
    formData.append('data', new Blob([rewritten], { type: 'text/html' }), filePath.split('/').pop());
    const headers = new Headers();
    if (daToken) headers.append('Authorization', `Bearer ${daToken}`);
    if (etag) headers.append('If-Match', etag);
    let writeResp;
    try {
      // eslint-disable-next-line no-await-in-loop
      writeResp = await doFetch(url, { method: 'POST', headers, body: formData });
    } catch { return false; }
    if (writeResp.ok) {
      conversions.forEach(({ from, to }) => {
        console.log(`[schedule-maker sync] migrated link in ${filePath}\n  from: ${from}\n  to:   ${to}`);
      });
      return true;
    }
    if (writeResp.status === 412) continue; // concurrent edit — re-read and retry
    return false;
  }
  return false;
}

// Fingerprints a decoded schedule's authored content only — title and blocks —
// excluding volatile fields (modificationTime changes on every Copy Link even
// with zero real edits; scheduleId is the grouping key itself; createdTime
// never changes but isn't meaningful content). Two occurrences of the same
// scheduleId with matching fingerprints are truly the same schedule placed in
// multiple docs (safe to collapse); differing fingerprints mean genuine
// content divergence — staleness or an intentional fork, either way a
// conflict worth surfacing rather than silently discarding.
function scheduleContentFingerprint(decoded) {
  return JSON.stringify({ title: decoded?.title, blocks: decoded?.blocks });
}

// Handles both correctly-encoded links (single decodeURIComponent) and legacy
// double-encoded links where encodeURIComponent was applied before searchParams.set.
export function decodeScheduleParam(raw) {
  const attempts = [
    () => atob(decodeURIComponent(raw)),
    () => atob(decodeURIComponent(decodeURIComponent(raw))),
    () => atob(raw),
  ];
  for (const attempt of attempts) {
    try {
      const obj = JSON.parse(attempt());
      if (obj && (obj.scheduleId || Array.isArray(obj.blocks))) return obj;
    } catch { /* try next */ }
  }
  return null;
}

// Scans all HTML docs in eventFolder, decodes every schedule link found, and
// returns an in-memory list of unique schedules plus a map of which docs reference
// each schedule. No sheets are read or written — this is a pure scan.
export async function syncSchedules(org, repo, eventFolder) {
  const basePath = eventFolder.startsWith('/') ? eventFolder : `/${eventFolder}`;

  const { files: allFiles, authError } = await listAllFiles(org, repo, basePath);
  if (authError) {
    return {
      ok: false,
      status: 401,
      error: 'Unable to reach DA — sign in at da.live first, then try syncing again.',
    };
  }
  const docFiles = allFiles.filter((f) => f.endsWith('.html'));

  const foundData = new Map(); // scheduleId → decoded object (most recently modified wins)
  const docRefs = {}; // scheduleId → [filePath, ...]
  const conflicts = new Set(); // scheduleId → same id, genuinely different content found
  const canonicalPrefix = `${DA_ORIGIN}/app/${org}/${repo}/${DA_APP_PATH}`;

  const perDocFinds = await mapWithConcurrency(docFiles, SCAN_CONCURRENCY, async (filePath) => {
    const res = await fetchText(org, repo, filePath);
    if (!res.ok) return null;
    if (!res.text) return { finds: [], needsRewrite: false };
    const finds = [];
    const re = new RegExp(SCHEDULE_PARAM_RE.source, 'g');
    let m;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(res.text)) !== null) {
      const decoded = decodeScheduleParam(m[1]);
      if (decoded?.scheduleId || decoded?.title) finds.push(decoded);
    }
    const needsRewrite = [...res.text.matchAll(SCHEDULE_HREF_RE)]
      .some(([, , href]) => !isCanonicalScheduleHref(href, canonicalPrefix));
    return { finds, needsRewrite };
  });

  // Abort rather than misclassify: a doc we couldn't read might reference a
  // schedule, so treating it as empty could silently omit schedules.
  const unreadable = perDocFinds.filter((r) => r === null).length;
  if (unreadable > 0) {
    return {
      ok: false,
      status: 503,
      error: `Sync aborted: ${unreadable} document(s) could not be read (rate limited or unavailable). Please retry.`,
    };
  }

  // Upgrade non-canonical schedule links found during scan — old ECC-hosted
  // links on any domain, and old ?schedule= query-param links on the DA app —
  // to the canonical DA app URL in #schedule= hash format, so authors never
  // need to manually adjust a URL for it to load correctly in the DA app.
  const docsToRewrite = docFiles.filter((_, i) => perDocFinds[i]?.needsRewrite);
  if (docsToRewrite.length > 0) {
    await mapWithConcurrency(docsToRewrite, SCAN_CONCURRENCY, (path) => rewriteNonCanonicalScheduleLinks(org, repo, path));
  }

  perDocFinds.forEach(({ finds }, i) => {
    const filePath = docFiles[i];
    const seenInDoc = new Set();
    finds.forEach((decoded) => {
      const key = decoded.scheduleId || decoded.title;
      const existing = foundData.get(key);
      if (existing && scheduleContentFingerprint(existing) !== scheduleContentFingerprint(decoded)) {
        // Same scheduleId, genuinely different content — a stale copy left
        // behind after an edit, or an intentional variant that never got its
        // own identity. Either way, flag it rather than silently discarding
        // one version: chrono-box and ChronoLens both render/inspect each
        // occurrence independently and would show both, so Sync shouldn't be
        // the only place that looks like there's just one.
        conflicts.add(key);
      }
      // Same scheduleId can appear more than once (e.g. a stale copy of a link
      // left in a doc alongside a freshly-copied one after editing) — keep
      // whichever occurrence has the most recent modificationTime, not just
      // whichever was scanned first.
      if (!existing || new Date(decoded.modificationTime || 0) > new Date(existing.modificationTime || 0)) {
        foundData.set(key, decoded);
      }
      if (!seenInDoc.has(key)) {
        seenInDoc.add(key);
        if (!docRefs[key]) docRefs[key] = [];
        docRefs[key].push(filePath);
      }
    });
  });

  const schedules = [...foundData.values()]
    .map((schedule) => ({
      ...schedule,
      hasConflictingVersions: conflicts.has(schedule.scheduleId || schedule.title),
    }))
    .sort((a, b) => new Date(b.modificationTime || 0) - new Date(a.modificationTime || 0));

  return { ok: true, data: { schedules, docRefs } };
}
