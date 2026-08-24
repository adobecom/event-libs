import {
  setDaToken, setDaFetch, readSheet, mutateSheet, parseRowConfig, previewAsset, publishAsset,
} from '../../v1/utils/da-sheet-controller.js';
import { CONFIGS_SHEET_PATH } from '../constants.js';

export { setDaToken, setDaFetch };

// Rows are keyed by configId, not eventId — see constants.js.
function parseRows(rawRows) {
  return rawRows
    .filter((row) => row && row.configId)
    .map((row) => ({ ...row, config: parseRowConfig(row, 'swan-notification-configurator') }));
}

export async function getConfigs(org, repo) {
  const result = await readSheet(org, repo, CONFIGS_SHEET_PATH);
  if (!result.ok && result.status === 404) return { ok: true, data: [] };
  if (!result.ok) return result;
  return { ok: true, data: parseRows(result.data) };
}

// Publishes the sheet after every write so it's fetchable unauthenticated from aem.live
// at runtime (see event-libs/v1/features/swan-notifications/swan-config.js) — a
// capability neither tier-1-event-configurator's nor session-guide-configurator's own
// config-library sheets need, since those are only ever read back by the authoring app
// itself, never by an anonymous page visitor. A publish failure does NOT fail the save —
// the row is safely written either way — but the caller must surface publishOk/
// publishError so the UI can warn that the configId won't work on a live page yet.
//
// Known trade-off (see docs/swan-unc-dependencies.md's Open Risks): publishing makes the
// ENTIRE sheet — every event's row, not just the one a given page resolves — fetchable by
// anyone with the URL, since swan-config.js's runtime lookup has to be a plain
// unauthenticated fetch. Each row's eventId/backendEventTitle could reveal an
// unannounced/embargoed event's name ahead of its own page going live. Accepted for now
// (low/moderate severity, no credentials involved) rather than splitting this into a
// separate public/authoring-only data shape — revisit if that trade-off changes.
async function publishConfigsSheet(org, repo) {
  const previewed = await previewAsset(org, repo, CONFIGS_SHEET_PATH);
  const published = previewed.ok ? await publishAsset(org, repo, CONFIGS_SHEET_PATH) : previewed;
  return {
    publishOk: published.ok,
    publishError: published.ok ? null : (published.error || `Publish failed (${published.status})`),
  };
}

export async function upsertConfig(org, repo, {
  configId, eventId, backendEventTitle, config,
}) {
  const updated = new Date().toISOString();
  const stampedConfig = {
    ...config, eventId, eventName: backendEventTitle, updated,
  };
  const newRow = {
    configId, eventId, backendEventTitle, config: stampedConfig, updated,
  };

  const result = await mutateSheet(org, repo, CONFIGS_SHEET_PATH, (rows) => {
    const idx = rows.findIndex((r) => r.configId === configId);
    if (idx === -1) return { rows: [newRow, ...rows], result: newRow };
    const next = [...rows];
    next[idx] = newRow;
    return { rows: next, result: newRow };
  });
  if (!result.ok) return result;

  const publishResult = await publishConfigsSheet(org, repo);
  return { ok: true, data: result.data, ...publishResult };
}

// Retries just the publish step, without rewriting the sheet — lets the editor recover
// from a transient publish failure without resubmitting the form.
export async function republishConfigs(org, repo) {
  const { publishOk, publishError } = await publishConfigsSheet(org, repo);
  if (!publishOk) return { ok: false, error: publishError };
  return { ok: true };
}

export async function deleteConfig(org, repo, configId) {
  let found = false;
  const result = await mutateSheet(org, repo, CONFIGS_SHEET_PATH, (rows) => {
    const next = rows.filter((r) => r.configId !== configId);
    if (next.length === rows.length) return { rows, result: null, skip: true };
    found = true;
    return { rows: next, result: null };
  });
  if (!result.ok) return result;
  if (!found) return { ok: false, status: 404, error: 'Config not found' };

  // An unpublished deletion leaves the old published sheet (which still contains the
  // "deleted" row) live — anyone who already pasted that configId keeps working until
  // the next successful publish, so this needs the same publish step as upsertConfig.
  const publishResult = await publishConfigsSheet(org, repo);
  return { ok: true, ...publishResult };
}
