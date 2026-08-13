import {
  setDaToken, setDaFetch, readSheet, mutateSheet, parseRowConfig, listFolder, uploadMedia,
} from '../../v1/utils/da-sheet-controller.js';
import { CONFIGS_SHEET_PATH, CONFIG_TYPES } from '../constants.js';

export { setDaToken, setDaFetch, listFolder, uploadMedia };

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

// Rows within the homepage sheet are keyed on (eventId, configType) together,
// not eventId alone — the same event can carry both an Upcoming Sessions row
// and a Featured Sessions row side by side, in that one sheet.
function rowConfigType(row) {
  return row.configType || CONFIG_TYPES.GLOBAL;
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

// Upsert-by-(Event-ID, config type): replaces the existing row matching both,
// or appends a new one — a single write path rather than separate
// create/update calls, so re-picking an already-configured event+type can
// never create a duplicate row. The same event can carry a Global row and
// separate Homepage rows side by side, since they're keyed independently and
// stored in separate sheets of the same file — a Homepage save never
// rewrites the Global sheet's rows, only leaves them untouched (and
// vice versa), via da-sheet-controller.js's otherSheets round-tripping.
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

  const result = await mutateSheet(org, repo, CONFIGS_SHEET_PATH, (rows) => {
    const idx = rows.findIndex((r) => r.eventId === eventId && rowConfigType(r) === rowConfigType(newRow));
    if (idx === -1) return { rows: [newRow, ...rows], result: newRow };
    const next = [...rows];
    next[idx] = newRow;
    return { rows: next, result: newRow };
  }, targetSheet);
  if (!result.ok) return result;
  return { ok: true, data: result.data };
}

export async function deleteConfig(org, repo, eventId, configType) {
  let found = false;
  const targetType = configType || CONFIG_TYPES.GLOBAL;
  const targetSheet = sheetNameForConfigType(targetType);
  const result = await mutateSheet(org, repo, CONFIGS_SHEET_PATH, (rows) => {
    const next = rows.filter((r) => !(r.eventId === eventId && rowConfigType(r) === targetType));
    if (next.length === rows.length) return { rows, result: null, skip: true };
    found = true;
    return { rows: next, result: null };
  }, targetSheet);
  if (!result.ok) return result;
  if (!found) return { ok: false, status: 404, error: 'Config not found' };
  return { ok: true };
}
