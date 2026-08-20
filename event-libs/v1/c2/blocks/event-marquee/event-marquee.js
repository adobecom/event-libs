import { createTag, getEventConfig, LIBS } from '../../../utils/utils.js';
import { processAutoBlockLinks } from '../../../utils/decorate.js';
import {
  initSessionState, sessions, favorited, getApiConfig,
} from '../../../utils/session-store.js';
import { toggleFavoriteWithFeedback } from '../../../services/sessions/action-feedback.js';
import { showToast } from '../../../features/toast/toast.js';
import { getNowMs } from '../../../utils/session-state.js';
import { formatCountdown } from '../../../utils/date-time-helper.js';

const ICON_HEART_OUTLINE = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 18C9.51124 18 9.02247 17.8398 8.61427 17.5195C7.02833 16.2754 3.41163 13.0078 2.23976 11.0908C1.30714 9.56542 0.986826 7.67772 1.38283 6.04198C1.72267 4.63768 2.54494 3.50487 3.76125 2.76366C5.13527 1.92479 6.7842 1.76659 8.06301 2.35057C8.72317 2.65233 9.42629 3.17772 9.99172 3.77147C10.5698 3.14159 11.2647 2.63182 11.959 2.34178C13.2705 1.79002 14.9116 1.95408 16.2393 2.76366C17.4551 3.50487 18.2774 4.63768 18.6172 6.04198C19.0132 7.67772 18.6929 9.56542 17.7603 11.0908C16.5908 13.0039 12.9732 16.2734 11.3858 17.5195C10.9781 17.8398 10.4888 18 10 18ZM6.38722 3.49901C5.78077 3.49901 5.13185 3.68456 4.54201 4.04491C3.67287 4.57421 3.08498 5.38671 2.84084 6.39452C2.53615 7.65233 2.79006 9.11522 3.51906 10.3076C4.47218 11.8662 7.66847 14.8711 9.54006 16.3398C9.81057 16.5527 10.189 16.5527 10.4595 16.3398C12.333 14.8691 15.5298 11.8633 16.4805 10.3076C17.21 9.11523 17.4639 7.65234 17.1592 6.39452C16.9151 5.38671 16.3272 4.57421 15.4585 4.04491C14.5327 3.48046 13.4136 3.35839 12.5386 3.7246C11.8565 4.01073 11.1055 4.6621 10.6245 5.38476C10.3462 5.80273 9.65385 5.80273 9.37553 5.38476C8.94047 4.73144 8.12651 4.02929 7.43998 3.71581C7.12162 3.5703 6.7627 3.49901 6.38722 3.49901Z" fill="currentColor"/></svg>';
const ICON_HEART_FILLED = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.61426 17.5195C9.02246 17.8398 9.51123 18 10 18C10.4888 18 10.9781 17.8398 11.3858 17.5195C12.9732 16.2734 16.5908 13.0039 17.7603 11.0908C18.6929 9.56543 19.0132 7.67773 18.6172 6.04199C18.2774 4.63769 17.4551 3.50488 16.2393 2.76367C14.9116 1.95409 13.2705 1.79003 11.959 2.34179C11.2647 2.63183 10.5698 3.1416 9.99171 3.77148C9.42628 3.17773 8.72316 2.65234 8.063 2.35058C6.78419 1.7666 5.13526 1.9248 3.76124 2.76367C2.54493 3.50488 1.72266 4.63769 1.38282 6.04199C0.98682 7.67773 1.30713 9.56543 2.23975 11.0908C3.41162 13.0078 7.02832 16.2754 8.61426 17.5195Z" fill="currentColor"/></svg>';
const ICON_SHARE = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M14.5 6.5C15.8807 6.5 17 5.38071 17 4C17 2.61929 15.8807 1.5 14.5 1.5C13.1193 1.5 12 2.61929 12 4C12 4.16249 12.0154 4.32158 12.0447 4.4759L6.68625 7.62766C6.21886 7.09565 5.5387 6.76 4.78125 6.76C3.39871 6.76 2.28125 7.87746 2.28125 9.26C2.28125 10.6425 3.39871 11.76 4.78125 11.76C5.53927 11.76 6.21996 11.4239 6.68738 10.8912L12.0447 14.0416C12.0154 14.1959 12 14.355 12 14.5175C12 15.8982 13.1193 17.0175 14.5 17.0175C15.8807 17.0175 17 15.8982 17 14.5175C17 13.1368 15.8807 12.0175 14.5 12.0175C13.7412 12.0175 13.0603 12.3546 12.5928 12.8879L7.23752 9.73838C7.26721 9.58281 7.28125 9.42246 7.28125 9.26C7.28125 9.09708 7.26714 8.93627 7.23731 8.78028L12.5936 5.6289C13.0611 6.16257 13.7417 6.5 14.5 6.5Z" fill="currentColor"/></svg>';

const DEFAULT_COUNTDOWN_LABEL = 'Session starts in:';

function parseContent(el) {
  const rows = [...el.querySelectorAll(':scope > div')];
  const foregroundRow = rows[rows.length - 1];
  const backgroundRow = rows.length > 1 ? rows[0] : null;
  const [textCol, mediaCol] = foregroundRow ? foregroundRow.querySelectorAll(':scope > div') : [];
  return {
    backgroundRow, foregroundRow, textCol, mediaCol,
  };
}

async function getSectionConfig(el, miloLibs) {
  const config = {
    title: '',
    sessionId: '',
    favoriteEnabled: null,
    shareEnabled: null,
    videoTitle: '',
    countdownEndTime: null,
    countdownLabel: DEFAULT_COUNTDOWN_LABEL,
  };

  const sectionMeta = el.parentElement?.querySelector('.section-metadata');
  if (!sectionMeta) return config;

  const { getMetadata: getSectionMetadata } = await import(`${miloLibs}/c2/blocks/section-metadata/section-metadata.js`);
  const metadata = getSectionMetadata(sectionMeta);

  if (metadata['event-title']) config.title = metadata['event-title'].content[0]?.textContent.trim() || '';
  if (metadata['session-id']) config.sessionId = metadata['session-id'].content[0]?.textContent.trim() || '';
  if (metadata['favorite-enabled']) config.favoriteEnabled = metadata['favorite-enabled'].text[0] === 'true';
  if (metadata['share-enabled']) config.shareEnabled = metadata['share-enabled'].text[0] === 'true';
  if (metadata['video-title']) config.videoTitle = metadata['video-title'].content[0]?.textContent.trim() || '';
  if (metadata['countdown-end-time-millis']) {
    const raw = metadata['countdown-end-time-millis'].content[0]?.textContent.trim() || '';
    const parsed = Number(raw);
    if (raw && Number.isFinite(parsed)) {
      config.countdownEndTime = parsed;
    } else if (raw) {
      window.lana?.log(`[event-marquee] invalid countdown-end-time-millis: ${raw}`);
    }
  }
  if (metadata['countdown-label']) {
    config.countdownLabel = metadata['countdown-label'].content[0]?.textContent.trim() || DEFAULT_COUNTDOWN_LABEL;
  }

  return config;
}

function detectPlayer(mediaCol) {
  if (!mediaCol) return null;
  if (mediaCol.querySelector('.mobile-rider')) return { type: 'mobile-rider', processed: true };
  const mrLink = mediaCol.querySelector('a[href*="mobilerider.com"]');
  if (mrLink) return { type: 'mobile-rider', processed: false };
  const miloVideo = mediaCol.querySelector('.milo-video');
  if (miloVideo) return { type: 'milo-video' };
  return null;
}

function hasAsset(mediaCol) {
  return !!mediaCol && (mediaCol.children.length > 0 || !!mediaCol.textContent.trim());
}

function buildFavoriteButton(session, feedbackConfig) {
  const btn = createTag('button', {
    type: 'button',
    class: 'event-marquee-action event-marquee-favorite',
  });

  const paint = () => {
    const isFavorited = favorited.value.has(session.id);
    btn.innerHTML = isFavorited ? ICON_HEART_FILLED : ICON_HEART_OUTLINE;
    btn.setAttribute('aria-label', isFavorited ? 'Remove from favorites' : 'Add to favorites');
    btn.setAttribute('aria-pressed', String(isFavorited));
    btn.classList.toggle('is-favorited', isFavorited);
  };
  paint();
  favorited.subscribe(paint);

  btn.addEventListener('click', () => {
    toggleFavoriteWithFeedback(session, {
      eventConfig: feedbackConfig,
      isFavorited: favorited.value.has(session.id),
    });
  });

  return btn;
}

function buildVideoTitle(title) {
  return createTag('p', { class: 'event-marquee-video-title' }, title);
}

function buildCountdown(targetMs, label) {
  const wrapper = createTag('div', { class: 'event-marquee-countdown' });
  const initial = formatCountdown(targetMs, getNowMs());
  createTag('p', { class: 'event-marquee-countdown-label' }, label, { parent: wrapper });
  const clock = createTag('p', { class: 'event-marquee-countdown-clock' }, initial.display, { parent: wrapper });

  let intervalId = null;
  const tick = () => {
    const { display, remainingMs } = formatCountdown(targetMs, getNowMs());
    clock.textContent = display;
    if (remainingMs <= 0 && intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
  if (initial.remainingMs > 0) {
    intervalId = setInterval(tick, 1000);
  }

  return { el: wrapper, stop: () => { if (intervalId) clearInterval(intervalId); } };
}

function buildShareButton() {
  const btn = createTag('button', {
    type: 'button',
    class: 'event-marquee-action event-marquee-share',
    'aria-label': 'Share',
  }, ICON_SHARE);

  btn.addEventListener('click', async () => {
    const shareData = { url: window.location.href, title: document.title };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareData.url);
      showToast({ message: 'Link copied to clipboard', variant: 'positive' });
    } catch (e) {
      if (e.name !== 'AbortError') window.lana?.log(`[event-marquee] share failed: ${e.message}`);
    }
  });

  return btn;
}

// TEMP: unused while decorateActions renders a fallback session directly instead of
// calling this; restore the call when reverting.
// eslint-disable-next-line no-unused-vars
function resolveSession(sessionId, render) {
  const existing = sessions.value.find((s) => s.id === sessionId);
  if (existing) {
    render(existing);
    return;
  }
  const unsubscribe = sessions.subscribe((list) => {
    const found = list.find((s) => s.id === sessionId);
    if (found) {
      render(found);
      unsubscribe();
    }
  });
}

function decorateActions(textCol, config) {
  const shareEnabled = config.shareEnabled ?? true;
  const favoriteEnabled = (config.favoriteEnabled ?? true) && !!config.sessionId;
  if (!shareEnabled && !favoriteEnabled) return;

  let actionArea = textCol.querySelector('.action-area');
  if (!actionArea) actionArea = createTag('p', { class: 'action-area' }, '', { parent: textCol });

  const actions = createTag('div', { class: 'event-marquee-actions' }, '', { parent: actionArea });

  if (favoriteEnabled) {
    initSessionState();
    // Mirrors sessions-guide.js's own config shape for toggleFavoriteWithFeedback/action-feedback.js —
    // { title, registerUrl } — not Milo's unrelated global getEventConfig().
    const feedbackConfig = { title: config.title, registerUrl: getApiConfig()?.registerUrl || '/register' };
    const favoriteSlot = createTag('span', { class: 'event-marquee-favorite-slot' }, '', { parent: actions });
    // TEMP: render immediately with a fallback session object so the button is
    // visible for visual/DOM review even without real session data — favorite
    // functionality itself isn't being implemented yet. Revert to
    // resolveSession(config.sessionId, ...) once real data is in place.
    const session = sessions.value.find((s) => s.id === config.sessionId) || { id: config.sessionId };
    favoriteSlot.replaceChildren(buildFavoriteButton(session, feedbackConfig));
  }

  if (shareEnabled) actions.append(buildShareButton());
}

function attachUpcomingSessionsWrapper(el) {
  if (!el.classList.contains('attach-upcoming')) return;
  if (el.parentElement?.classList.contains('event-marquee-upcoming-wrapper')) return;
  const next = el.nextElementSibling;
  if (!next?.classList.contains('upcoming-sessions')) return;
  const wrapper = createTag('div', { class: 'event-marquee-upcoming-wrapper' });
  el.parentElement.insertBefore(wrapper, el);
  wrapper.append(el, next);
}

export default async function init(el) {
  const miloLibs = getEventConfig()?.miloConfig?.miloLibs || LIBS;
  const [{ decorateButtons, decorateBlockBg }, config] = await Promise.all([
    import(`${miloLibs}/utils/decorate.js`),
    getSectionConfig(el, miloLibs),
  ]);

  const {
    backgroundRow, foregroundRow, textCol, mediaCol,
  } = parseContent(el);
  if (!foregroundRow || !textCol) {
    window.lana?.log('[event-marquee] expected a foreground row with a text column, got none');
    return;
  }

  foregroundRow.classList.add('event-marquee-foreground');
  textCol.classList.add('event-marquee-text');
  decorateButtons(textCol);

  el._eventMarqueeCountdownStop?.();
  textCol.querySelector('.event-marquee-countdown')?.remove();
  el._eventMarqueeCountdownStop = null;
  if (config.countdownEndTime != null) {
    const countdown = buildCountdown(config.countdownEndTime, config.countdownLabel);
    textCol.append(countdown.el);
    el._eventMarqueeCountdownStop = countdown.stop;
  }

  // Reuses Milo's own background decoration (responsive per-viewport variants, focal
  // point, solid-color fallback) — zero new code, same as MPC/YT/MR/ambient video.
  if (backgroundRow) {
    await decorateBlockBg(el, backgroundRow, {
      useHandleFocalpoint: true,
      className: 'event-marquee-background',
    });
  }

  if (mediaCol) mediaCol.classList.add('event-marquee-media');
  const player = detectPlayer(mediaCol);
  const showsAsset = hasAsset(mediaCol);
  el.classList.add(showsAsset ? 'event-marquee-video' : 'event-marquee-text-cta');
  // Matches classic marquee.js#decorateSplit's `media.classList.add('bleed')` — the
  // asset bleeds to the trailing edge instead of sitting inline with the text.
  if (showsAsset) mediaCol.classList.add('event-marquee-bleed');

  if (player?.type === 'mobile-rider' && !player.processed) processAutoBlockLinks(mediaCol);
  if (player) decorateActions(textCol, config);
  if (player && config.videoTitle) mediaCol.append(buildVideoTitle(config.videoTitle));

  attachUpcomingSessionsWrapper(el);
}
