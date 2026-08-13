// Generic DA admin-API media primitives (folder listing + binary upload), shared by any DA app
// that needs authors to browse/pick a DA folder and upload an image into it. Sibling to
// da-sheet-controller.js (JSON sheet CRUD) — kept separate since binary upload and sheet
// read/write have nothing in common beyond hitting the same admin API, and mixing concerns
// into one file would make neither easier to follow. Owns its own auth state (daToken/
// sdkDaFetch) rather than sharing da-sheet-controller.js's, mirroring how schedule-maker and
// tier-1-event-configurator already each keep an independent copy of this same auth-state
// pattern rather than coupling unrelated modules through shared mutable state.

const DA_ADMIN_ORIGIN = 'https://admin.da.live';
const CONTENT_DA_ORIGIN = 'https://content.da.live';

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

function getHeaders(method = 'GET') {
  const headers = new Headers();
  if (daToken) headers.append('Authorization', `Bearer ${daToken}`);
  return { method, headers, cache: 'no-store' };
}

// Lists the folders and files directly inside `path` (not recursive), folders first —
// same shape/sort as schedule-maker/scripts/da-controller.js's listFolder, so a folder-browser
// UI can be ported across apps unchanged.
export async function listFolder(org, repo, path) {
  const url = `${DA_ADMIN_ORIGIN}/list/${org}/${repo}${path}`;
  let resp;
  try {
    resp = await doFetch(url, getHeaders('GET'));
  } catch (err) {
    window.lana?.log(`DA listFolder network error: ${err} — ${url}`);
    return { ok: false, status: 0, error: 'Network error' };
  }
  if (!resp.ok) {
    const error = await resp.text().catch(() => resp.statusText);
    window.lana?.log(`DA listFolder error ${resp.status}: ${url} — ${error}`);
    return { ok: false, status: resp.status, error };
  }
  const raw = await resp.json().catch(() => []);
  const items = (raw || []).sort((a, b) => {
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
  const normalizedPath = path === '/' ? '' : path;
  const url = `${DA_ADMIN_ORIGIN}/source/${org}/${repo}${normalizedPath}/${file.name}`;
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
  return { ok: true, status: resp.status, url: `${CONTENT_DA_ORIGIN}/${org}/${repo}${normalizedPath}/${file.name}` };
}
