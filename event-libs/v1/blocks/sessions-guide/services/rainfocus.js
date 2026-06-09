// TODO: implement real Rainfocus API calls when integration is ready.
// Credentials required: rfAuthToken (from FEDS), clientId (IMS userId),
// rfApiProfileId and rfApiUrl (from eventConfig).

export async function fetchScheduled(rfAuthToken, clientId, rfApiProfileId, rfApiUrl) {
  return ['session-1', 'session-3'];
}

export async function fetchFavorited(rfAuthToken, clientId, rfApiProfileId, rfApiUrl) {
  return ['session-2'];
}

export async function addSession(sessionTimeId, rfAuthToken, clientId, rfApiProfileId, rfApiUrl) {
  return { ok: true };
}

export async function removeSession(sessionTimeId, rfAuthToken, clientId, rfApiProfileId, rfApiUrl) {
  return { ok: true };
}

export async function toggleSessionInterest(
  sessionTimeId, sessionId, rfAuthToken, clientId, rfApiProfileId, rfApiUrl,
) {
  return { ok: true };
}
