// HTTP layer for ANS (Adobe Notification Service) and its companion Adobe IO Runtime
// bookkeeping action, which tracks which ANS notification ids were created for which
// session (ANS itself has no list/diff API of its own). Parallels esp-controller.js's
// role for ESP, but is a distinct builder — ANS's required headers (x-adobe-app-id,
// x-api-key: adobedotcomdx, accept, from) aren't compatible with
// constructRequestOptions()'s ESP-specific ones (x-api-key: acom_event_service).
import { getSwanConfig } from './swan-config.js';

// Matches northstar's own hardcoded ANS type — this identifies the notification stream
// as an events-platform notification to ANS/UNC, not something event-specific, so a
// fixed default (rather than requiring authors to type it) is correct.
const DEFAULT_NOTIFICATION_TYPE = 'com.adobe.events.v1';

function buildAnsHeaders() {
  const { appId } = getSwanConfig();
  const token = window.adobeIMS?.getAccessToken()?.token;
  return {
    Authorization: `Bearer ${token}`,
    accept: 'Application/json',
    'x-adobe-app-id': appId || 'adobecom',
    'x-api-key': 'adobedotcomdx',
    from: String(Date.now()),
    'content-type': 'application/json',
  };
}

function buildBookkeepingHeaders() {
  const token = window.adobeIMS?.getAccessToken()?.token;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function getAdobeUserId() {
  const tokenAndProfile = await window.adobeIMS?.tokenService?.getTokenAndProfile();
  return tokenAndProfile?.tokenFields?.user_id || null;
}

// Returns the bookkeeping service's full notification list: [{ id, metadata: { sessionId } }].
export async function fetchAdobeIoNotifications() {
  const { adobeIoEndpoint } = getSwanConfig();
  const res = await fetch(`${adobeIoEndpoint}/list`, { method: 'GET', headers: buildBookkeepingHeaders() });
  if (!res.ok) throw new Error(`SWAN bookkeeping list failed: ${res.status}`);
  return res.json();
}

// Returns ANS's created notification records: [{ 'notification-id': ... }].
export async function createAnsNotification({ adobeUserId, timingProperties, payload }) {
  const { ansEndpoint, notificationType, notificationSubType } = getSwanConfig();
  if (!notificationSubType) {
    // Unlike notificationType, there's no safe universal default for sub-type — it's
    // meant to distinguish this event's notification stream from every other event's.
    // Omitting it silently drops the field from the JSON body (undefined), sending ANS
    // a malformed request; surface it instead of failing silently.
    window.lana?.log('[swan-notifications] swan-notification-config is missing notificationSubType — ANS create requests will be malformed');
  }
  const body = {
    notifications: {
      notification: [{
        'user-id': [adobeUserId],
        type: notificationType || DEFAULT_NOTIFICATION_TYPE,
        'sub-type': notificationSubType,
        payload: JSON.stringify(payload),
        timestamp: timingProperties.triggerNotificationTime,
      }],
    },
  };
  const res = await fetch(ansEndpoint, { method: 'POST', headers: buildAnsHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`ANS create failed: ${res.status}`);
  const data = await res.json();
  return data?.notifications?.notification || [];
}

// PUT + state:EXPIRED, not DELETE — UNC's UI does not honor DELETE (confirmed in
// northstar's own implementation comment).
export async function expireAnsNotification(notificationId) {
  const { ansEndpoint } = getSwanConfig();
  const body = { notifications: { notification: [{ 'notification-id': notificationId, state: 'EXPIRED' }] } };
  const res = await fetch(ansEndpoint, { method: 'PUT', headers: buildAnsHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`ANS expire failed: ${res.status}`);
}

export async function storeBookkeepingEntry({ notificationId, rfCode }) {
  const { adobeIoEndpoint } = getSwanConfig();
  const body = { id: notificationId, metadata: { sessionId: rfCode } };
  const res = await fetch(`${adobeIoEndpoint}/store`, { method: 'POST', headers: buildBookkeepingHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`SWAN bookkeeping store failed: ${res.status}`);
}

export async function deleteBookkeepingEntry(notificationId) {
  const { adobeIoEndpoint } = getSwanConfig();
  const res = await fetch(`${adobeIoEndpoint}/delete/${notificationId}`, { method: 'POST', headers: buildBookkeepingHeaders() });
  if (!res.ok) throw new Error(`SWAN bookkeeping delete failed: ${res.status}`);
}
