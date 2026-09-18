import {
  setDaToken, setDaFetch, mutateSheet, parseRowConfig, listFolder, uploadMedia, getContentUrl,
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

// Every config row is identified by a unique configId. New rows get one from
// ConfigsContext; this repairs any sheet that doesn't yet satisfy that by
// assigning a fresh id to each row that is missing one, carries a `legacy:*`
// sentinel from an earlier build, or duplicates another row's id within the
// sheet. Unique ids are what keep same-event configs independent — a shared id
// makes a single save or delete hit every sibling at once.
function assignUniqueConfigIds(rows) {
  const seen = new Set();
  let changed = false;
  const next = rows.map((row) => {
    const id = row.configId;
    if (id && !String(id).startsWith('legacy:') && !seen.has(id)) {
      seen.add(id);
      return row;
    }
    const fresh = crypto.randomUUID();
    seen.add(fresh);
    changed = true;
    return { ...row, configId: fresh };
  });
  return { rows: next, changed };
}

// configId is authoritative on either side; eventId+configType is only a
// last-resort fallback for a row that somehow still lacks one.
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
    .map((row) => migrateLegacyTitle({
      ...row,
      config: parseRowConfig(row, 'tier-1-event-configurator'),
    }));
}

// Reads a sheet and, when a row needs a unique configId (see
// assignUniqueConfigIds), persists the repaired rows before returning them — a
// one-time migration that makes every row independently addressable so later
// saves/deletes touch exactly one row. Idempotent: a sheet whose ids are
// already unique is read without a write.
async function readAndRepairSheet(org, repo, sheetName) {
  return mutateSheet(org, repo, CONFIGS_SHEET_PATH, (rows) => {
    const { rows: next, changed } = assignUniqueConfigIds(rows);
    if (!changed) return { rows, result: rows, skip: true };
    return { rows: next, result: next };
  }, sheetName, ALL_SHEET_NAMES);
}

export async function getConfigs(org, repo) {
  // Sequential, not parallel: both sheets live in one file, so two concurrent
  // read-modify-writes would race on its ETag.
  const globalResult = await readAndRepairSheet(org, repo, GLOBAL_SHEET_NAME);
  if (!globalResult.ok && globalResult.status !== 404) return globalResult;
  const homepageResult = await readAndRepairSheet(org, repo, HOMEPAGE_SHEET_NAME);
  if (!homepageResult.ok && homepageResult.status !== 404) return homepageResult;

  const globalRows = globalResult.ok ? parseAndMigrateRows(globalResult.data) : [];
  const homepageRows = homepageResult.ok ? parseAndMigrateRows(homepageResult.data) : [];
  return { ok: true, data: [...globalRows, ...homepageRows] };
}

// Upsert by configId: replace the row with that id, else prepend. Every row
// carries a unique configId (getConfigs repairs any that don't), so multiple
// configs per event coexist and a save touches exactly one row. Global and
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
  const newRow = {
    eventId, backendEventTitle, eventServiceEnv, configType, configId, config: stampedConfig, updated,
  };
  const targetSheet = sheetNameForConfigType(configType);

  const result = await mutateSheet(org, repo, CONFIGS_SHEET_PATH, (rows) => {
    const idx = rows.findIndex((r) => rowMatches(r, newRow));
    if (idx === -1) return { rows: [newRow, ...rows], result: newRow };
    const next = [...rows];
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
  const target = { eventId, configType: targetType, configId };
  const result = await mutateSheet(org, repo, CONFIGS_SHEET_PATH, (rows) => {
    const next = rows.filter((r) => !rowMatches(r, target));
    if (next.length === rows.length) return { rows, result: null, skip: true };
    found = true;
    return { rows: next, result: null };
  }, targetSheet, ALL_SHEET_NAMES);
  if (!result.ok) return result;
  if (!found) return { ok: false, status: 404, error: 'Config not found' };
  return { ok: true };
}
