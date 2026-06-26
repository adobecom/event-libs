import { getConfig, createTag } from '../../utils/utils.js';

const BREAKPOINTS = ['mobile', 'tablet', 'desktop'];

// --- Viewport grouping (same authoring pattern as router-marquee) ---

const groupByViewport = (el) => {
  const viewports = {};
  let current = null;
  [...el.children].forEach((row) => {
    const firstCol = row.querySelector(':scope > div');
    const breakpoint = BREAKPOINTS.find((b) => firstCol?.textContent.trim().toLowerCase() === b);
    if (breakpoint) {
      current = breakpoint;
      viewports[current] = [];
    } else if (current) {
      viewports[current].push(row);
    }
  });

  // Clone slides from lower breakpoint if a breakpoint has none authored
  BREAKPOINTS.slice(1).forEach((breakpoint, idx) => {
    const lower = BREAKPOINTS[idx];
    if (!viewports[breakpoint]) {
      viewports[breakpoint] = viewports[lower].map((s) => s.cloneNode(true));
      return;
    }
    viewports[breakpoint].forEach((slide, j) => {
      const lowerSlide = viewports[lower][j];
      if (!lowerSlide) return;
      const cols = slide.querySelectorAll(':scope > div');
      const lowerCols = lowerSlide.querySelectorAll(':scope > div');
      cols.forEach((col, k) => {
        if (col && !col.children.length && lowerCols[k]) {
          col.replaceWith(lowerCols[k].cloneNode(true));
        }
      });
    });
  });

  return viewports;
};

// --- Text decoration (mirrors router-marquee) ---

const decorateText = (textCol) => {
  const heading = textCol.querySelector('h1, h2');
  heading?.classList.add('rm-title');
  heading?.previousElementSibling?.classList.add('rm-eyebrow');

  const eyebrow = textCol.querySelector('.rm-eyebrow');
  const icon = textCol.querySelector('p a[href*=".svg"]');
  const label = textCol.querySelector(':scope > p:has(a[href*=".svg"]) + p');
  const cta = textCol.querySelector('p:has(em)');
  const body = [...textCol.querySelectorAll('p')]
    .filter((p) => [eyebrow, icon?.closest('p'), label, cta].every((x) => x !== p));

  if (!body.length) return;
  const bodyEl = createTag('div', { class: 'rm-body' });
  body[0].before(bodyEl);
  body.forEach((p) => bodyEl.append(p));
};

const decorateCtas = (textCol) => {
  const cta = textCol.querySelector('p:has(em)');
  if (!cta) return;
  cta.classList.add('rm-ctas', 'dark', 'action-area');
  const primary = cta.querySelector('em > strong a');
  const secondary = cta.querySelector('em > a');
  primary?.classList.add('con-button', 'rm-cta-primary', 'fill', 'button-lg', 'outline');
  secondary?.classList.add('con-button', 'button-lg', 'outline');
  cta.replaceChildren(...[primary, secondary].filter(Boolean));
};

// --- Background video (mirrors router-marquee) ---

const prepareVideo = (imageCol) => {
  const videoContainer = imageCol?.querySelector('.video-container');
  const video = videoContainer?.querySelector('video');
  if (!video) return;
  ['playsinline', 'muted', 'loop', 'autoplay', 'data-hoverplay'].forEach((attr) => {
    video.setAttribute(attr, '');
  });
  video.muted = true;
  const src = video.dataset.videoSource || video.src;
  video.removeAttribute('src');
  video.querySelectorAll('source').forEach((s) => s.remove());
  video.appendChild(createTag('source', { src, type: 'video/mp4' }));
  videoContainer.querySelector('.pause-play-wrapper')?.remove();
  videoContainer.replaceWith(video);
};

// --- Foreground video embed ---

const isYouTube = (url) => url.hostname.includes('youtube.com') || url.hostname === 'youtu.be';
const isAdobeTV = (url) => url.hostname === 'video.tv.adobe.com' || url.hostname === 'tv.adobe.com';
const isMobileRider = (url) => url.hostname.includes('mobilerider') || url.searchParams.has('videoId');
const isMp4 = (url) => url.pathname.endsWith('.mp4');

const createIframe = (src) => {
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
  iframe.allowFullscreen = true;
  iframe.loading = 'lazy';
  iframe.title = 'Video player';
  iframe.style.border = '0';
  return iframe;
};

async function buildVideoEmbed(anchor) {
  let url;
  try { url = new URL(anchor.href); } catch { return null; }

  const wrap = createTag('div', { class: 'rm-foreground-video' });

  if (isYouTube(url)) {
    const videoId = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
    wrap.classList.add('rm-foreground-video-youtube');
    wrap.append(createIframe(`https://www.youtube.com/embed/${videoId}?enablejsapi=1`));
  } else if (isAdobeTV(url)) {
    wrap.classList.add('rm-foreground-video-adobetv');
    wrap.append(createIframe(anchor.href));
  } else if (isMobileRider(url)) {
    wrap.classList.add('rm-foreground-video-mobile-rider');
    const mrEl = createTag('div', { class: 'mobile-rider' });
    const videoId = url.searchParams.get('videoId') || url.pathname.split('/').filter(Boolean).pop();
    const skinId = url.searchParams.get('skinId') || '';
    if (videoId) {
      mrEl.dataset.extractedVideoId = videoId;
      if (skinId) mrEl.dataset.extractedSkinId = skinId;
      mrEl.dataset.extractedAutoplay = 'false';
    }
    wrap.append(mrEl);
    const mrPath = new URL('../mobile-rider/mobile-rider.js', import.meta.url).href;
    const { default: mrInit } = await import(mrPath);
    mrInit(mrEl);
  } else if (isMp4(url)) {
    wrap.classList.add('rm-foreground-video-mp4');
    const video = createTag('video', { controls: '', playsinline: '', src: anchor.href });
    wrap.append(video);
  } else {
    wrap.append(createIframe(anchor.href));
  }

  return wrap;
}

// --- Slide decoration ---

async function decorateSlide(slide) {
  const cols = slide.querySelectorAll(':scope > div');
  const [textCol, imageCol, videoCol] = cols;

  slide.classList.add('rm-slide', 'is-active');
  imageCol?.classList.add('rm-background');

  prepareVideo(imageCol);

  textCol.classList.add('rm-content');
  const contentWrapper = createTag('div', { class: 'rm-content-wrapper' });
  slide.insertBefore(contentWrapper, textCol);
  contentWrapper.append(textCol);
  slide.insertBefore(createTag('div', { class: 'rm-overlay' }), contentWrapper);

  decorateText(textCol);
  decorateCtas(textCol);

  if (videoCol) {
    const anchor = videoCol.querySelector('a[href]');
    videoCol.remove();
    if (anchor) {
      const embed = await buildVideoEmbed(anchor);
      if (embed) {
        contentWrapper.append(embed);
        slide.classList.add('has-foreground-video');
      }
    }
  }
}

// --- Viewport building ---

async function buildViewport(viewport, slides) {
  const container = createTag('div', { class: 'rm-viewport', 'data-viewport': viewport });
  await Promise.all(slides.map((slide) => decorateSlide(slide)));
  container.append(...slides);
  return container;
}

// --- Init ---

export default async function init(el) {
  const { miloLibs } = getConfig();

  // Load router-marquee CSS for all shared visual styles (.rm-slide, .rm-content, etc.)
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${miloLibs}/c2/blocks/router-marquee/router-marquee.css`;
  document.head.append(link);

  const viewports = groupByViewport(el);
  const containers = await Promise.all(
    Object.entries(viewports).map(([vp, slides]) => buildViewport(vp, slides)),
  );
  el.replaceChildren(...containers);
}
