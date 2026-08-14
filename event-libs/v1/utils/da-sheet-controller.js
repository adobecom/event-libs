// Generic DA admin-API primitives, shared by every DA app: sheet CRUD for apps that store a
// config library as a single sheet (tier-1-event-configurator, session-guide-configurator),
// plus folder listing and media upload for apps that let authors browse/upload into DA. All of
// it shares one auth singleton (daToken/sdkDaFetch below) rather than each concern keeping its
// own copy, so a single DA SDK handshake authenticates every call this file makes. App-specific
// concerns (row key, upsert/delete semantics, schema migration) stay in each app's own
// scripts/da-controller.js, built on top of these primitives.

const DA_ADMIN_ORIGIN = 'https://admin.da.live';
const CONTENT_DA_ORIGIN = 'https://content.da.live';
const OWNED_SHEET_NAME = 'data'; // the only sheet name any app built on this ever writes.

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

// admin.da.live sits behind a CDN that weakens ETags (W/"...") when it gzips a
// response. R2/S3 reject weak validators on a conditional write, so strip the
// W/ prefix to recover the strong ETag that If-Match compares against.
function normalizeEtag(etag) {
  if (!etag) return undefined;
  return etag.replace(/^W\//, '');
}

function getHeaders(method = 'GET', body = null) {
  const headers = new Headers();
  if (daToken) headers.append('Authorization', `Bearer ${daToken}`);
  if (body) headers.append('content-type', 'application/json');
  // no-store bypasses the browser cache — otherwise a cached GET can return a
  // stale ETag, so the very next conditional write's If-Match fails against
  // the CDN's actual current ETag and surfaces as a false-positive Conflict.
  return {
    method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
  };
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

// A malformed config string (bad manual edit, truncated write) shouldn't take
// down the whole library load — log and default that one row to {} instead.
export function parseRowConfig(row, logPrefix) {
  if (typeof row.config !== 'string') return row.config ?? {};
  try {
    return JSON.parse(row.config);
  } catch (error) {
    window.lana?.log(`${logPrefix}: malformed config JSON for row, defaulting to {}. ${error}`);
    return {};
  }
}

// A single-row sheet collapses `data` to a bare object instead of a one-element array
// (a common spreadsheet-backed-JSON-API quirk) — coerce it back into an array either way.
function coerceRows(raw) {
  if (Array.isArray(raw)) return raw;
  return raw ? [raw] : [];
}

// Reads a sheet and returns its rows + ETag, for optimistic-locking writes via writeSheet.
// Handles both single-sheet and multi-sheet documents (our rows live under the owned sheet
// name — 'data' by default, or `sheetName` when a caller manages more than one named sheet
// in the same file); any other named sheet is captured as `otherSheets` so writes round-trip
// it untouched.
export async function readSheet(org, repo, path, sheetName = OWNED_SHEET_NAME) {
  const result = await daFetch(`/source/${org}/${repo}${path}`, getHeaders('GET'));
  if (!result.ok) return result;
  const body = result.data;
  const isMultiSheet = body?.[':type'] === 'multi-sheet';
  const rows = coerceRows(isMultiSheet ? body?.[sheetName]?.data : body?.data);
  const otherSheets = isMultiSheet
    ? Object.fromEntries(
      Object.entries(body).filter(([key]) => key !== sheetName && !key.startsWith(':')),
    )
    : {};
  const sheetNames = isMultiSheet ? (body[':names'] || [sheetName]) : [sheetName];
  return {
    ok: true, data: rows, etag: result.etag, otherSheets, sheetNames, version: body?.[':version'],
  };
}

// Writes the full sheet. { etag } → If-Match; { create: true } → If-None-Match: *.
// { otherSheets, sheetNames, version } (from a prior readSheet()) round-trip any sheet this
// call doesn't own; omitted, it writes the plain single-sheet shape. A 412 means a concurrent
// write — callers should re-read and retry.
export async function writeSheet(org, repo, path, rows, {
  etag, create, otherSheets, sheetNames, version, sheetName = OWNED_SHEET_NAME,
} = {}) {
  const serialized = rows.map((row) => ({
    ...row,
    config: typeof row.config === 'string' ? row.config : JSON.stringify(row.config ?? {}),
  }));
  const ownedSheet = {
    total: serialized.length, limit: serialized.length, offset: 0, data: serialized,
  };

  // DA admin API accepts the same object format it returns on GET.
  const hasOtherSheets = otherSheets && Object.keys(otherSheets).length > 0;
  const payload = JSON.stringify(hasOtherSheets ? {
    ':names': sheetNames || [sheetName, ...Object.keys(otherSheets)],
    ':version': version ?? 3,
    ':type': 'multi-sheet',
    [sheetName]: ownedSheet,
    ...otherSheets,
  } : {
    ':type': 'sheet',
    ':sheetname': sheetName,
    ...ownedSheet,
  });

  const url = `${DA_ADMIN_ORIGIN}/source/${org}/${repo}${path}`;
  const formData = new FormData();
  formData.append('data', new Blob([payload], { type: 'application/json' }), 'blob');

  const headers = new Headers();
  if (daToken) headers.append('Authorization', `Bearer ${daToken}`);
  if (etag) headers.append('If-Match', etag);
  else if (create) headers.append('If-None-Match', '*');

  let resp;
  try {
    resp = await doFetch(url, { method: 'POST', headers, body: formData });
  } catch (err) {
    window.lana?.log(`DA writeSheet network error: ${err} — ${url}`);
    return { ok: false, status: 0, error: 'Network error' };
  }
  if (resp.status === 412) {
    return { ok: false, status: 412, conflict: true, error: 'Sheet changed concurrently' };
  }
  if (!resp.ok) {
    const error = await resp.text().catch(() => resp.statusText);
    return { ok: false, status: resp.status, error };
  }
  return { ok: true, status: resp.status, etag: resp.headers.get('ETag') };
}

const MAX_WRITE_RETRIES = 4;
const CONFLICT_ERROR = 'Conflict: the config library sheet was changed by someone else. Please retry.';

// Optimistic-locking read-modify-write: reads the sheet + ETag, applies
// mutate(rows), writes conditionally, and retries on a 412 conflict.
// mutate(rows) returns { rows, result, skip? } — skip avoids a needless write.
// `sheetName` (default 'data') lets a caller manage more than one named sheet
// in the same file — each sheet's own mutateSheet call automatically
// preserves every other sheet untouched via otherSheets/sheetNames/version.
//
// `knownSheetNames` (e.g. ['data', 'homepage']) is required for any caller that manages
// more than one named sheet, from the very first write onward. readSheet only detects a
// file as multi-sheet from an ALREADY multi-sheet-shaped body — so without this, the
// first-ever write to a second sheet name (while the file is still single-sheet-shaped,
// or doesn't exist yet) would write a plain single-sheet document instead, permanently
// collapsing every sheet into one shared, ambiguous pool that a later read can no longer
// tell apart (every sheetName would return the same merged rows, forever — the file
// never becomes properly multi-sheet on its own). Passing every known sheet name up
// front forces a real multi-sheet write from the start, with an empty placeholder for
// any sheet that doesn't have data yet.
export async function mutateSheet(org, repo, path, mutate, sheetName = OWNED_SHEET_NAME, knownSheetNames = null) {
  for (let attempt = 0; attempt <= MAX_WRITE_RETRIES; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const read = await readSheet(org, repo, path, sheetName);
    if (!read.ok && read.status !== 404) return read;
    const rows = read.ok ? (read.data || []) : [];
    // Existing sheet → If-Match its etag (or unconditional if etag unavailable), and
    // preserve whatever other sheets it had. Missing sheet (404) → If-None-Match:* to
    // guard concurrent first creation; nothing else to preserve.
    let opts = read.ok
      ? {
        etag: normalizeEtag(read.etag), otherSheets: read.otherSheets, sheetNames: read.sheetNames, version: read.version, sheetName,
      }
      : { create: true, sheetName };
    if (knownSheetNames) {
      const otherSheets = { ...opts.otherSheets };
      knownSheetNames.filter((name) => name !== sheetName).forEach((name) => {
        if (!otherSheets[name]) otherSheets[name] = { total: 0, limit: 0, offset: 0, data: [] };
      });
      opts = { ...opts, otherSheets, sheetNames: knownSheetNames };
    }
    const { rows: newRows, result, skip } = mutate(rows);
    if (skip) return { ok: true, data: result, skipped: true };
    // eslint-disable-next-line no-await-in-loop
    const write = await writeSheet(org, repo, path, newRows, opts);
    if (write.ok) return { ok: true, data: result };
    if (write.status !== 412) return write;
  }
  return { ok: false, status: 412, error: CONFLICT_ERROR };
}

// A '.' or '..' path segment gets collapsed by the browser's own URL/fetch dot-segment
// normalization before the request is even sent — so an unguarded "new folder name" input
// (or, in principle, a crafted filename) could silently retarget a request at a different
// org/repo than the one the app resolved. Reject at the source rather than trying to sanitize
// a full path string after the fact.
function hasUnsafePathSegment(path) {
  return (path || '').split('/').some((segment) => segment === '.' || segment === '..');
}

export function getContentUrl(itemPath) {
  return `${CONTENT_DA_ORIGIN}${itemPath}`;
}

// Lists the folders and files directly inside `path` (not recursive), folders first.
export async function listFolder(org, repo, path) {
  if (hasUnsafePathSegment(path)) return { ok: false, status: 400, error: 'Invalid path' };
  const result = await daFetch(`/list/${org}/${repo}${path}`, getHeaders('GET'));
  if (!result.ok) return result;
  const items = (result.data || []).sort((a, b) => {
    if (!a.ext && b.ext) return -1;
    if (a.ext && !b.ext) return 1;
    return a.path.localeCompare(b.path);
  });
  return { ok: true, data: items };
}

// Uploads a single image file to `path` (a folder — not yet necessarily existing in DA; DA has
// no explicit folder-creation call, a folder becomes real the moment a file lands in it) as
// multipart form data, matching the upload convention documented in
// .claude/skills/build-content-from-figma/SKILL.md (POST .../source/... with a `data` field
// carrying the file blob). Returns the public content.da.live URL the image is served from.
export async function uploadMedia(org, repo, path, file) {
  if (hasUnsafePathSegment(path)) return { ok: false, status: 400, error: 'Invalid path' };
  // file.name comes from the native file picker, not app-controlled navigation — a stray
  // separator or dot-segment there could escape the chosen folder the same way an unguarded
  // path segment could, so it gets the same rejection rather than just a different encoding.
  if (!file?.name || /[/\\]/.test(file.name) || file.name === '.' || file.name === '..') {
    return { ok: false, status: 400, error: 'Invalid file name' };
  }
  const normalizedPath = path === '/' ? '' : path;
  const encodedName = encodeURIComponent(file.name);
  const url = `${DA_ADMIN_ORIGIN}/source/${org}/${repo}${normalizedPath}/${encodedName}`;
  const formData = new FormData();
  formData.append('data', file, file.name);

  const headers = new Headers();
  if (daToken) headers.append('Authorization', `Bearer ${daToken}`);

  let resp;
  try {
    resp = await doFetch(url, { method: 'POST', headers, body: formData });
  } catch (err) {
    window.lana?.log(`DA uploadMedia network error: ${err} — ${url}`);
    return { ok: false, status: 0, error: 'Network error' };
  }
  if (!resp.ok) {
    const error = await resp.text().catch(() => resp.statusText);
    window.lana?.log(`DA uploadMedia error ${resp.status}: ${url} — ${error}`);
    return { ok: false, status: resp.status, error };
  }
  return { ok: true, status: resp.status, url: getContentUrl(`/${org}/${repo}${normalizedPath}/${encodedName}`) };
}
