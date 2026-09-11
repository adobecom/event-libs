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

// Legacy Global rows (pre-Aug-2026) lack a configId and would match by the
// non-unique eventId+configType, clobbering a same-event sibling. Backfill a
// deterministic id (unique: the old upsert kept one such row per event+type)
// so reads and writes agree without a migration write; next save persists it.
function withConfigId(row) {
  if (row.configId) return row;
  return { ...row, configId: `legacy:${rowConfigType(row)}:${row.eventId}` };
}

// configId is authoritative on either side; eventId+configType is the fallback
// only when neither row carries one.
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

// Upsert by configId: replace the row with that id, else prepend. Multiple
// configs per event coexist without clobbering. Existing rows pass through
// withConfigId so a legacy row's backfilled id persists on write. Global and
// Homepage live in separate sheets of the same file, round-tripped untouched
// by da-sheet-controller.js's otherSheets handling.
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
  // Row-level fields (env/configType/configId) aren't stamped into config —
  // they're authoring detail, irrelevant to the consuming page.
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
