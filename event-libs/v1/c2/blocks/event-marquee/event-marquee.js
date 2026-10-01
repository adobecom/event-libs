import { createTag, getEventConfig, LIBS } from '../../../utils/utils.js';
import { processAutoBlockLinks } from '../../../utils/decorate.js';
import { getNowMs } from '../../../utils/session-state.js';
import { formatCountdown } from '../../../utils/date-time-helper.js';
import { logWarning } from '../../../utils/lana-log.js';

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
  if (metadata['video-title']) config.videoTitle = metadata['video-title'].content[0]?.textContent.trim() || '';
  if (metadata['countdown-end-time-millis']) {
    const raw = metadata['countdown-end-time-millis'].content[0]?.textContent.trim() || '';
    const parsed = Number(raw);
    if (raw && Number.isFinite(parsed)) {
      config.countdownEndTime = parsed;
    } else if (raw) {
      logWarning('event-marquee', `invalid countdown-end-time-millis: ${raw}`);
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
    logWarning('event-marquee', 'expected a foreground row with a text column, got none');
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
  if (player && config.videoTitle) mediaCol.append(buildVideoTitle(config.videoTitle));

  attachUpcomingSessionsWrapper(el);
}
