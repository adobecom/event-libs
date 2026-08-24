// HTTP layer for ANS (Adobe Notification Service) and its companion bookkeeping
// resource on ESP (Events Service Platform), which tracks which ANS notification ids
// were created for which session (ANS itself has no list/diff API of its own). ANS
// calls build their own headers (x-adobe-app-id, x-api-key: adobedotcomdx, accept,
// from), which aren't compatible with constructRequestOptions()'s ESP-specific ones
// (x-api-key: acom_event_service) — bookkeeping calls reuse that ESP helper directly
// since they're just another attendee-scoped ESP resource.
import { getSwanConfig } from './swan-config.js';
import { getEventServiceEnv } from '../../utils/utils.js';
import { constructRequestOptions } from '../../utils/esp-controller.js';

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

// Attendee-scoped ESP resource — 'me' resolves server-side from the IMS bearer token,
// same convention as esp-controller.js's getAttendee()/getMyEventSessions() calls.
function getBookkeepingEndpoint(rfCode) {
  const { serviceApiEndpoints } = getEventServiceEnv();
  const base = `${serviceApiEndpoints.esp}/v1/attendees/me/swan-notifications`;
  return rfCode ? `${base}/${rfCode}` : base;
}

export async function getAdobeUserId() {
  const tokenAndProfile = await window.adobeIMS?.tokenService?.getTokenAndProfile();
  return tokenAndProfile?.tokenFields?.user_id || null;
}

// Returns the bookkeeping list normalized into: [{ id, metadata: { sessionId } }] —
// the shape swan-notifications.js's reconcile logic expects — from ESP's
// { items: [{ rfCode, notificationId }] } response.
export async function fetchAdobeIoNotifications() {
  const options = await constructRequestOptions('GET');
  const res = await fetch(getBookkeepingEndpoint(), options);
  if (!res.ok) throw new Error(`SWAN bookkeeping list failed: ${res.status}`);
  const { items } = await res.json();
  return (items || []).map((item) => ({ id: item.notificationId, metadata: { sessionId: item.rfCode } }));
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
  if (!adobeUserId) {
    // window.adobeIMS's tokenService may not have resolved a user_id yet on the very
    // first schedule action after page load — surface it the same way as the
    // notificationSubType gap above, rather than sending ANS a 'user-id': [null] body.
    window.lana?.log('[swan-notifications] adobeUserId is missing — ANS create requests will be malformed');
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
  const options = await constructRequestOptions('POST', JSON.stringify({ rfCode, notificationId }));
  const res = await fetch(getBookkeepingEndpoint(), options);
  if (!res.ok) throw new Error(`SWAN bookkeeping store failed: ${res.status}`);
}

export async function deleteBookkeepingEntry(rfCode) {
  // Without a real rfCode, getBookkeepingEndpoint() would fall back to the bare
  // collection URL (no DELETE route registered there on ESP) instead of a single
  // item — fail fast here rather than firing a request that can only ever 404.
  if (!rfCode) throw new Error('SWAN bookkeeping delete failed: missing rfCode');
  const options = await constructRequestOptions('DELETE');
  const res = await fetch(getBookkeepingEndpoint(rfCode), options);
  if (!res.ok) throw new Error(`SWAN bookkeeping delete failed: ${res.status}`);
}
