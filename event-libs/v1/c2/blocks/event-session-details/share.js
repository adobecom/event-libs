/*
 * Share (MWPW-203472) — sub-feature of session-details.
 * Native share with a copy-link fallback + toast. Persistent across all states.
 * Ports event-marquee.js's buildShareButton logic; reads the published `url` +
 * `title` metadata, falling back to the current document.
 */
import { createTag, getMetadata } from '../../../utils/utils.js';
import { showToast } from '../../../features/toast/toast.js';

const ICON_SHARE = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M14.5 6.5C15.8807 6.5 17 5.38071 17 4C17 2.61929 15.8807 1.5 14.5 1.5C13.1193 1.5 12 2.61929 12 4C12 4.16249 12.0154 4.32158 12.0447 4.4759L6.68625 7.62766C6.21886 7.09565 5.5387 6.76 4.78125 6.76C3.39871 6.76 2.28125 7.87746 2.28125 9.26C2.28125 10.6425 3.39871 11.76 4.78125 11.76C5.53927 11.76 6.21996 11.4239 6.68738 10.8912L12.0447 14.0416C12.0154 14.1959 12 14.355 12 14.5175C12 15.8982 13.1193 17.0175 14.5 17.0175C15.8807 17.0175 17 15.8982 17 14.5175C17 13.1368 15.8807 12.0175 14.5 12.0175C13.7412 12.0175 13.0603 12.3546 12.5928 12.8879L7.23752 9.73838C7.26721 9.58281 7.28125 9.42246 7.28125 9.26C7.28125 9.09708 7.26714 8.93627 7.23731 8.78028L12.5936 5.6289C13.0611 6.16257 13.7417 6.5 14.5 6.5Z" fill="currentColor"/></svg>';

export function renderShare() {
  const btn = createTag('button', {
    type: 'button',
    class: 'session-action session-share',
    'aria-label': 'Share',
  }, ICON_SHARE);

  btn.addEventListener('click', async () => {
    const shareData = {
      url: getMetadata('url') || window.location.href,
      title: getMetadata('title') || document.title,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareData.url);
      showToast({ message: 'Link copied to clipboard', variant: 'positive' });
    } catch (e) {
      if (e.name !== 'AbortError') window.lana?.log(`[session-details] share failed: ${e.message}`);
    }
  });

  return btn;
}
