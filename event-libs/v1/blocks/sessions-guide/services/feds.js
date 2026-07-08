// NOTE: event name 'feds.data.authToken.loaded' and attribute path 'window.feds.data.authToken'
// must be confirmed against live FEDS integration before Phase 0.7 is complete.

export function getFedsToken() {
  const token = window?.feds?.data?.authToken;
  if (token) return Promise.resolve(token);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('[sessions-guide] FEDS auth token timed out')),
      8000,
    );
    window.addEventListener('feds.data.authToken.loaded', () => {
      clearTimeout(timeout);
      resolve(window.feds.data.authToken);
    }, { once: true });
  });
}
