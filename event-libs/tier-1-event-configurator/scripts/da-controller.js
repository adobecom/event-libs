import { DA_ADMIN_ORIGIN, CONFIGS_SHEET_PATH, CONFIG_TYPES } from '../constants.js';

// Kept as 'data' — the sheet name already in use before Homepage configs
// existed, unchanged so a concurrent Global-only editor never sees a
// structural difference in "its" sheet. Homepage rows go in a new,
// separate-named sheet (tab) in the same file, added alongside it.
const GLOBAL_SHEET_NAME = 'data';
const HOMEPAGE_SHEET_NAME = 'homepage';

// Rows are keyed on (eventId, configType) together, not eventId alone — the
// same event can have one Global config plus separate Homepage configs
// (Upcoming Sessions, Featured Sessions) as independent rows. Absent
// configType means Global, for rows saved before this field existed.
function rowConfigType(row) {
  return row.configType || CONFIG_TYPES.GLOBAL;
}

function sheetNameForConfigType(configType) {
  return (configType || CONFIG_TYPES.GLOBAL) === CONFIG_TYPES.GLOBAL ? GLOBAL_SHEET_NAME : HOMEPAGE_SHEET_NAME;
}

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
  // the CDN's actual current ETag and surfaces as a false-positive Conflict
  // (same issue Schedule Maker's da-controller.js hit and fixed the same way).
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

// One-time migration-on-read: old rows had a single `eventTitle` meaning the
// backend title. Now that's `backendEventTitle`, and `eventTitle` means an
// author-set alternative. Doesn't rewrite the sheet; the next save does.
function migrateLegacyTitle(row) {
  const needsRowMigration = row.backendEventTitle === undefined && row.eventTitle !== undefined;
  const { eventTitle: legacyRowTitle, ...rowRest } = row;
  const migratedRow = needsRowMigration
    ? { ...rowRest, backendEventTitle: legacyRowTitle }
    : row;

  const config = migratedRow.config || {};
  const needsConfigMigration = config.backendEventTitle === undefined && config.eventTitle !== undefined;
  if (!needsConfigMigration) return migratedRow;
  const { eventTitle: legacyConfigTitle, ...configRest } = config;
  return {
    ...migratedRow,
    config: { ...configRest, backendEventTitle: legacyConfigTitle, eventTitle: '' },
  };
}

// A malformed config string (bad manual edit, truncated write) shouldn't take
// down the whole library load — log and default that one row to {} instead.
function parseRowConfig(row) {
  if (typeof row.config !== 'string') return row.config ?? {};
  try {
    return JSON.parse(row.config);
  } catch (error) {
    window.lana?.log(`tier-1-event-configurator: malformed config JSON for row ${row.eventId}, defaulting to {}. ${error}`);
    return {};
  }
}

function parseRows(raw) {
  return (raw || [])
    .filter((row) => row && row.eventId)
    .map((row) => migrateLegacyTitle({ ...row, config: parseRowConfig(row) }));
}

// Reads the config-library file and returns rows split per sheet (tab) name,
// plus the file's ETag for a conditional write. Handles both:
// - the legacy single-sheet doc ({ ":type":"sheet", "data":[...] }) that
//   existed before Homepage configs did — its rows are the Global sheet;
// - the multi-sheet doc this now writes ({ ":type":"multi-sheet",
//   ":names":[...], "<name>": { "data":[...] }, ... }).
// `config` is stored on each row as a stringified JSON blob and parsed back
// into an object here.
async function readConfigsDoc(org, repo, path) {
  const result = await daFetch(`/source/${org}/${repo}${path}`, getHeaders('GET'));
  if (!result.ok) return result;
  const doc = result.data || {};
  const isMultiSheet = doc[':type'] === 'multi-sheet';

  const rowsBySheet = {
    [GLOBAL_SHEET_NAME]: parseRows(isMultiSheet ? doc[GLOBAL_SHEET_NAME]?.data : doc.data),
    [HOMEPAGE_SHEET_NAME]: parseRows(isMultiSheet ? doc[HOMEPAGE_SHEET_NAME]?.data : []),
  };

  return { ok: true, rowsBySheet, etag: result.etag };
}

// Writes the full config-library file as a multi-sheet doc — always both
// sheets together, since it's one file with one ETag. `rowsBySheet` must
// carry every sheet's current rows, not just the one being changed, or the
// untouched sheet would be silently dropped. { etag } → If-Match (write only
// if unchanged); { create: true } → If-None-Match: * (only if the file
// doesn't exist yet); neither → unconditional. A precondition failure
// returns status:412 so callers can re-read and retry instead of clobbering
// a concurrent write.
async function writeConfigsDoc(org, repo, path, rowsBySheet, { etag, create } = {}) {
  const sheetNames = [GLOBAL_SHEET_NAME, HOMEPAGE_SHEET_NAME];
  const payloadBody = { ':type': 'multi-sheet', ':names': sheetNames };
  sheetNames.forEach((name) => {
    const serialized = (rowsBySheet[name] || []).map((row) => ({
      ...row,
      config: typeof row.config === 'string' ? row.config : JSON.stringify(row.config ?? {}),
    }));
    payloadBody[name] = {
      ':type': 'sheet',
      ':sheetname': name,
      total: serialized.length,
      limit: serialized.length,
      offset: 0,
      data: serialized,
    };
  });

  // DA admin API accepts the same object format it returns on GET
  const payload = JSON.stringify(payloadBody);

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

// Optimistic-locking read-modify-write: reads the doc + ETag (both sheets),
// applies mutate(rowsBySheet), writes conditionally, and retries on a 412
// conflict. mutate(rowsBySheet) returns { rowsBySheet, result, skip? } —
// skip avoids a needless write. Callers must pass back every sheet's rows,
// even ones they didn't touch, since a write always covers the whole file.
async function mutateConfigsDoc(org, repo, path, mutate) {
  for (let attempt = 0; attempt <= MAX_WRITE_RETRIES; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const read = await readConfigsDoc(org, repo, path);
    if (!read.ok && read.status !== 404) return read;
    const rowsBySheet = read.ok
      ? read.rowsBySheet
      : { [GLOBAL_SHEET_NAME]: [], [HOMEPAGE_SHEET_NAME]: [] };
    // Existing file → If-Match its etag (or unconditional if etag unavailable).
    // Missing file (404) → If-None-Match:* to guard concurrent first creation.
    const opts = read.ok ? { etag: normalizeEtag(read.etag) } : { create: true };
    const { rowsBySheet: nextRowsBySheet, result, skip } = mutate(rowsBySheet);
    if (skip) return { ok: true, data: result, skipped: true };
    // eslint-disable-next-line no-await-in-loop
    const write = await writeConfigsDoc(org, repo, path, nextRowsBySheet, opts);
    if (write.ok) return { ok: true, data: result };
    if (write.status !== 412) return write;
  }
  return { ok: false, status: 412, error: CONFLICT_ERROR };
}

export async function getConfigs(org, repo) {
  const result = await readConfigsDoc(org, repo, CONFIGS_SHEET_PATH);
  if (!result.ok && result.status === 404) return { ok: true, data: [] };
  if (!result.ok) return result;
  return { ok: true, data: [...result.rowsBySheet[GLOBAL_SHEET_NAME], ...result.rowsBySheet[HOMEPAGE_SHEET_NAME]] };
}

// Upsert-by-(Event-ID, config type): replaces the existing row matching both,
// or appends a new one — a single write path rather than separate
// create/update calls, so re-picking an already-configured event+type can
// never create a duplicate row. The same event can carry a Global row and
// separate Homepage rows side by side, since they're keyed independently and
// stored in separate sheets (tabs) of the same file — a Homepage save never
// rewrites the Global sheet's rows, only passes them through untouched.
export async function upsertConfig(org, repo, {
  eventId, backendEventTitle, eventServiceEnv, configType, config,
}) {
  const updated = new Date().toISOString();
  const stampedConfig = {
    ...config,
    eventId,
    backendEventTitle,
    updated,
  };
  // eventServiceEnv/configType are row-level only, not stamped into config —
  // they're authoring-time detail (which ESP tier this came from, which
  // surface this row targets), irrelevant to the page that eventually
  // consumes the pasted Config.
  const newRow = {
    eventId, backendEventTitle, eventServiceEnv, configType, config: stampedConfig, updated,
  };
  const targetSheet = sheetNameForConfigType(configType);

  const result = await mutateConfigsDoc(org, repo, CONFIGS_SHEET_PATH, (rowsBySheet) => {
    const rows = rowsBySheet[targetSheet] || [];
    const idx = rows.findIndex((r) => r.eventId === eventId && rowConfigType(r) === rowConfigType(newRow));
    const nextRows = idx === -1 ? [newRow, ...rows] : rows.map((r, i) => (i === idx ? newRow : r));
    return { rowsBySheet: { ...rowsBySheet, [targetSheet]: nextRows }, result: newRow };
  });
  if (!result.ok) return result;
  return { ok: true, data: result.data };
}

export async function deleteConfig(org, repo, eventId, configType) {
  let found = false;
  const targetType = configType || CONFIG_TYPES.GLOBAL;
  const targetSheet = sheetNameForConfigType(targetType);
  const result = await mutateConfigsDoc(org, repo, CONFIGS_SHEET_PATH, (rowsBySheet) => {
    const rows = rowsBySheet[targetSheet] || [];
    const nextRows = rows.filter((r) => !(r.eventId === eventId && rowConfigType(r) === targetType));
    if (nextRows.length === rows.length) return { rowsBySheet, result: null, skip: true };
    found = true;
    return { rowsBySheet: { ...rowsBySheet, [targetSheet]: nextRows }, result: null };
  });
  if (!result.ok) return result;
  if (!found) return { ok: false, status: 404, error: 'Config not found' };
  return { ok: true };
}
