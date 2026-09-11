import {
  setDaToken, setDaFetch, readSheet, mutateSheet, parseRowConfig, listFolder, uploadMedia, getContentUrl,
  getAemLiveUrl, uploadAndPublishMedia,
} from '../../v1/utils/da-sheet-controller.js';
import { CONFIGS_SHEET_PATH, CONFIG_TYPES } from '../constants.js';

export {
  setDaToken, setDaFetch, listFolder, uploadMedia, getContentUrl, getAemLiveUrl, uploadAndPublishMedia,
};

// Global rows live in the shared utility's default-owned sheet ('data') —
// unchanged from before Homepage configs existed, so a concurrent
// Global-only editor sees no structural difference in "its" sheet. Homepage
// rows (both Upcoming and Featured Sessions config types) live in a second,
// separate-named sheet in the same file — visible as its own tab in da.live's
// sheet editor. da-sheet-controller.js's otherSheets/sheetNames/version
// round-tripping means a write to either sheet automatically leaves the
// other byte-for-byte untouched.
const GLOBAL_SHEET_NAME = 'data';
const HOMEPAGE_SHEET_NAME = 'homepage';
const ALL_SHEET_NAMES = [GLOBAL_SHEET_NAME, HOMEPAGE_SHEET_NAME];

// Rows within the homepage sheet are keyed on `configId` — a single event can
// carry any number of Upcoming/Featured Sessions rows side by side (each its
// own named config, see `configName`), so (eventId, configType) alone isn't
// a unique row identity there the way it is for Global rows.
function rowConfigType(row) {
  return row.configType || CONFIG_TYPES.GLOBAL;
}

// Backfills a stable configId onto legacy Global rows that predate configId
// identity (added Aug 2026). Without one, rowMatches falls back to
// eventId+configType — which is no longer unique once an event carries more
// than one Global config, so saving/deleting a legacy row would clobber a
// newer sibling for the same event ("bleed-through"). The key is derived from
// the row's own (eventId, configType): the old upsert-by-eventId+configType
// kept at most one configId-less Global row per event+type, so this is unique.
// Deterministic (not a random UUID) so getConfigs (for the UI) and
// upsert/delete (for the raw sheet) always agree on a legacy row's identity
// without a migration write — the next save persists it. Homepage rows always
// carry a configId already, so this never touches them.
function withConfigId(row) {
  if (row.configId) return row;
  return { ...row, configId: `legacy:${rowConfigType(row)}:${row.eventId}` };
}

// Identity match. Every row now carries a configId (real for new/Homepage
// rows, backfilled by withConfigId for legacy Global rows), so a configId on
// either side is authoritative — compared symmetrically so a configId-bearing
// row is never matched by the eventId+configType fallback. The fallback only
// applies to two rows that both still lack a configId.
function rowMatches(row, target) {
  if (row.configId || target.configId) return row.configId === target.configId;
  return row.eventId === target.eventId && rowConfigType(row) === rowConfigType(target);
}

function sheetNameForConfigType(configType) {
  return (configType || CONFIG_TYPES.GLOBAL) === CONFIG_TYPES.GLOBAL ? GLOBAL_SHEET_NAME : HOMEPAGE_SHEET_NAME;
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

function parseAndMigrateRows(rawRows) {
  return (rawRows || [])
    .filter((row) => row && row.eventId)
    .map((row) => withConfigId(migrateLegacyTitle({
      ...row,
      config: parseRowConfig(row, 'tier-1-event-configurator'),
    })));
}

export async function getConfigs(org, repo) {
  const [globalResult, homepageResult] = await Promise.all([
    readSheet(org, repo, CONFIGS_SHEET_PATH, GLOBAL_SHEET_NAME),
    readSheet(org, repo, CONFIGS_SHEET_PATH, HOMEPAGE_SHEET_NAME),
  ]);
  if (!globalResult.ok && globalResult.status !== 404) return globalResult;
  if (!homepageResult.ok && homepageResult.status !== 404) return homepageResult;

  const globalRows = globalResult.ok ? parseAndMigrateRows(globalResult.data) : [];
  const homepageRows = homepageResult.ok ? parseAndMigrateRows(homepageResult.data) : [];
  return { ok: true, data: [...globalRows, ...homepageRows] };
}

// Upsert-by-identity (rowMatches: configId for every row now — real for
// new/Homepage rows, backfilled for legacy Global rows): replaces the existing
// row matching that identity, or appends a new one — a single write path
// rather than separate create/update calls. Each row's own configId keeps it
// independent even when another row shares the same event+type, so an event
// can carry any number of Global (or Homepage) configs side by side without
// one save clobbering another. The mutate maps existing rows through
// withConfigId first, so a legacy row's backfilled configId is persisted on
// the next write of its sheet. The same event can carry Global and Homepage
// rows side by side, since they live in separate sheets of the same file — a
// Homepage save never rewrites the Global sheet's rows, only leaves them
// untouched (and vice versa), via da-sheet-controller.js's otherSheets
// round-tripping.
export async function upsertConfig(org, repo, {
  eventId, backendEventTitle, eventServiceEnv, configType, configId, config,
}) {
  const updated = new Date().toISOString();
  const stampedConfig = {
    ...config,
    eventId,
    backendEventTitle,
    updated,
  };
  // eventServiceEnv/configType/configId are row-level only, not stamped into
  // config — they're authoring-time detail (which ESP tier this came from,
  // which surface/row this targets), irrelevant to the page that eventually
  // consumes the pasted Config. withConfigId guards a caller that somehow
  // omits configId; in practice ConfigsContext always supplies one.
  const newRow = withConfigId({
    eventId, backendEventTitle, eventServiceEnv, configType, configId, config: stampedConfig, updated,
  });
  const targetSheet = sheetNameForConfigType(configType);

  const result = await mutateSheet(org, repo, CONFIGS_SHEET_PATH, (rows) => {
    const stamped = rows.map(withConfigId);
    const idx = stamped.findIndex((r) => rowMatches(r, newRow));
    if (idx === -1) return { rows: [newRow, ...stamped], result: newRow };
    const next = [...stamped];
    next[idx] = newRow;
    return { rows: next, result: newRow };
  }, targetSheet, ALL_SHEET_NAMES);
  if (!result.ok) return result;
  return { ok: true, data: result.data };
}

export async function deleteConfig(org, repo, { eventId, configType, configId }) {
  let found = false;
  const targetType = configType || CONFIG_TYPES.GLOBAL;
  const targetSheet = sheetNameForConfigType(targetType);
  // withConfigId derives a legacy row's deterministic id from eventId+type so
  // the target matches its stamped raw row even if the caller passed no configId.
  const target = withConfigId({ eventId, configType: targetType, configId });
  const result = await mutateSheet(org, repo, CONFIGS_SHEET_PATH, (rows) => {
    const stamped = rows.map(withConfigId);
    const next = stamped.filter((r) => !rowMatches(r, target));
    if (next.length === stamped.length) return { rows, result: null, skip: true };
    found = true;
    return { rows: next, result: null };
  }, targetSheet, ALL_SHEET_NAMES);
  if (!result.ok) return result;
  if (!found) return { ok: false, status: 404, error: 'Config not found' };
  return { ok: true };
}
