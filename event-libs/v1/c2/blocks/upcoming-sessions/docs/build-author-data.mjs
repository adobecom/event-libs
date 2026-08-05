#!/usr/bin/env node
/**
 * Builds upcoming-session-author-data.json from a list of sessionIds by
 * querying the ESP `/v1/events/{eventId}/sessions` endpoint and mapping
 * each matched session into the block's authored-data shape.
 *
 * Usage:
 *   node build-author-data.mjs <sessionId> [<sessionId> ...] [--out <path>]
 *   node build-author-data.mjs --ids-file ids.txt [--out <path>]
 *
 * Env vars (all have the defaults seen in the working curl request):
 *   ESP_BASE_URL        default: https://wcms-events-service-platform-deploy-ethos102-stage-caff5f.stage.cloud.adobe.io
 *   ESP_EVENT_ID         default: ce15d0f5-b836-4118-9b3f-1a0614208112
 *   ESP_GROUP_ID          default: f7bc4f4a-8b2f-4a03-bfe7-d943caea033e
 *   ESP_CLIENT_IDENTITY   default: 438e3b3b-62d7-481d-b4d8-d414fff1ad69
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ESP_BASE_URL = process.env.ESP_BASE_URL
  || 'https://wcms-events-service-platform-deploy-ethos102-stage-caff5f.stage.cloud.adobe.io';
const ESP_EVENT_ID = process.env.ESP_EVENT_ID || 'ce15d0f5-b836-4118-9b3f-1a0614208112';
const ESP_GROUP_ID = process.env.ESP_GROUP_ID || 'f7bc4f4a-8b2f-4a03-bfe7-d943caea033e';
const ESP_CLIENT_IDENTITY = process.env.ESP_CLIENT_IDENTITY || '438e3b3b-62d7-481d-b4d8-d414fff1ad69';

const DEFAULT_OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'upcoming-session-author-data.json');

function parseArgs(argv) {
  const ids = [];
  let out = DEFAULT_OUT;
  let idsFile;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      out = argv[i += 1];
    } else if (arg === '--ids-file') {
      idsFile = argv[i += 1];
    } else {
      ids.push(arg);
    }
  }

  if (idsFile) {
    const fromFile = readFileSync(idsFile, 'utf-8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    ids.push(...fromFile);
  }

  return { ids: [...new Set(ids)], out };
}

async function fetchSessions() {
  const url = `${ESP_BASE_URL}/v1/events/${ESP_EVENT_ID}/sessions`;
  const res = await fetch(url, {
    headers: {
      accept: '*/*',
      'content-type': 'application/json',
      origin: 'https://eventsplatform.dev.adobe.com',
      'x-adobe-esp-group-id': ESP_GROUP_ID,
      'x-api-key': 'acom_event_service',
      'x-client-identity': ESP_CLIENT_IDENTITY,
    },
  });

  if (!res.ok) {
    throw new Error(`ESP request failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function getCustomAttributeValue(session, name) {
  const attr = session.customAttributes?.find((ca) => ca.name.trim().toLowerCase() === name.toLowerCase());
  return attr?.values?.[0]?.label ?? attr?.values?.[0]?.value ?? null;
}

function getTrack(session) {
  return getCustomAttributeValue(session, 'Primary Track for Agenda (Digital Agenda)')
    || getCustomAttributeValue(session, 'Track')
    || '';
}

function getSessionTime(session, sessionTimes) {
  const match = sessionTimes.find((st) => st.sessionId === session.sessionId);
  if (!match) return null;
  return {
    startTimeMillis: match.startTimeMillis,
    endTimeMillis: match.endTimeMillis,
    timezone: match.timezone,
  };
}

function toAuthorEntry(session, sessionTimes) {
  const entry = {
    sessionId: session.sessionId,
    sessionCode: session.sessionCode,
    enTitle: session.enTitle,
    track: getTrack(session),
    url: session.url,
  };

  const sessionTime = getSessionTime(session, sessionTimes);
  if (sessionTime) entry.sessionTime = sessionTime;

  return entry;
}

async function main() {
  const { ids, out } = parseArgs(process.argv.slice(2));

  if (ids.length === 0) {
    console.error('Provide one or more sessionIds, or --ids-file <path>.');
    process.exitCode = 1;
    return;
  }

  const { sessions = [], sessionTimes = [] } = await fetchSessions();
  const bySessionId = new Map(sessions.map((s) => [s.sessionId, s]));

  const missing = ids.filter((id) => !bySessionId.has(id));
  if (missing.length > 0) {
    console.warn(`No matching session found for: ${missing.join(', ')}`);
  }

  const result = ids
    .filter((id) => bySessionId.has(id))
    .map((id) => toAuthorEntry(bySessionId.get(id), sessionTimes));

  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${result.length} session(s) to ${out}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
