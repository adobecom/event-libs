import { getEventServiceEnv } from '../../v1/utils/utils.js';

// Same client_id already used by production event-libs Milo pages for real
// ESP calls (event-libs/scripts/scripts.js) — allow-listed by ESP's gateway,
// unlike DA's own token (confirmed rejected with ErrInvalidOauthToken, see
// PLAN.md). This app has no Milo bootstrap of its own, so it mints this
// client's IMS token directly via imslib.min.js, the same mechanism Milo
// and DA's own SDK both use — riding the same underlying Adobe IMS SSO
// session, so a signed-in user shouldn't see a second login prompt.
const IMS_CLIENT_ID = 'events-milo';
const IMS_SCOPE = 'AdobeID,openid,gnav';
const IMS_URL = 'https://auth.services.adobe.com/imslib/imslib.min.js';
const IMS_TIMEOUT = 5000;

const IMS_ENVIRONMENT = {
  dev: 'stg1',
  dev02: 'stg1',
  stage: 'stg1',
  stage02: 'stg1',
  local: 'stg1',
  prod: 'prod',
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

let imsPromise;

// Resolves once window.adobeIMS exists (regardless of sign-in state) or the
// timeout elapses — never rejects, so a slow/blocked IMS load can't crash
// the app; ESP calls will just have no Authorization header until it's ready.
export function initIms() {
  if (imsPromise) return imsPromise;

  imsPromise = new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.lana?.log('IMS init timed out for tier-1-event-configurator');
      resolve(false);
    }, IMS_TIMEOUT);

    window.adobeid = {
      client_id: IMS_CLIENT_ID,
      scope: IMS_SCOPE,
      environment: IMS_ENVIRONMENT[getEventServiceEnv().name] || 'prod',
      autoValidateToken: true,
      useLocalStorage: true,
      onReady: () => {
        clearTimeout(timeout);
        resolve(true);
      },
      onError: (err) => {
        clearTimeout(timeout);
        window.lana?.log(`IMS init error for tier-1-event-configurator: ${err}`);
        resolve(false);
      },
    };

    loadScript(IMS_URL).catch((err) => {
      clearTimeout(timeout);
      window.lana?.log(`IMS script load error for tier-1-event-configurator: ${err}`);
      resolve(false);
    });
  });

  return imsPromise;
}
