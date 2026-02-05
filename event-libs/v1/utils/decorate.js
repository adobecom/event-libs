import { 
  ICON_REG,
  META_REG,
  SERIES_404_MAP_PATH,
  ALLOWED_EMAIL_DOMAINS,
  FALLBACK_LOCALES,
  CONDITIONAL_REG,
} from './constances.js';
import BlockMediator from '../deps/block-mediator.min.js';
import { getEvent } from './esp-controller.js';
import { dictionaryManager } from './dictionary-manager.js';
import {
  getMetadata,
  setMetadata,
  getIcon,
  readBlockConfig,
  getSusiOptions,
  getEventServiceEnv,
  parseMetadataPath,
  getEventConfig,
  getImageSource,
  getFallbackLocale,
  createContextualContent,
  parseEncodedConfig,
  createTag,
} from './utils.js';
import { massageMetadata } from './date-time-helper.js';
import { hydrateBlocks } from '../hydrate/hydrate.js';

const ICONS_BASE_URL = new URL('../icons/', import.meta.url).href;

const preserveFormatKeys = [
  'description',
];

export function updateAnalyticTag(el, newVal) {
  const eventTitle = getMetadata('event-title');
  const newDaaLL = `${newVal}${eventTitle ? `|${eventTitle}` : ''}`;
  el.setAttribute('daa-ll', newDaaLL);
}

function createSVGIcon(iconName) {
  const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgElement.setAttribute('width', '20');
  svgElement.setAttribute('height', '20');
  svgElement.setAttribute('class', 'ecc-icon');

  const useElement = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  useElement.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `${ICONS_BASE_URL}events-icons.svg#${iconName}`);

  svgElement.appendChild(useElement);

  return svgElement;
}

function convertEccIcon(n) {
  const text = n.innerHTML;
  const eccIcons = [
    'events-calendar',
  ];

  return text.replace(ICON_REG, (match, iconName) => {
    if (eccIcons.includes(iconName)) {
      if (iconName === 'events-calendar') n.classList.add('display-event-date-time');
      return createSVGIcon(iconName).outerHTML;
    }

    return '';
  });
}

function setCtaState(targetState, rsvpBtn) { // eslint-disable-line no-unused-vars
  const checkRed = getIcon('check-circle-red');

  const enableBtn = () => {
    rsvpBtn.el.classList.remove('disabled');
    rsvpBtn.el.href = rsvpBtn.el.dataset.modalHash;
    rsvpBtn.el.setAttribute('tabindex', 0);
  };

  const disableBtn = () => {
    rsvpBtn.el.setAttribute('tabindex', -1);
    rsvpBtn.el.href = '';
    rsvpBtn.el.classList.add('disabled');
  };

  const stateTrigger = {
    registered: () => {
      const registeredText = dictionaryManager.getValue('registered-cta-text');
      enableBtn();
      updateAnalyticTag(rsvpBtn.el, registeredText);
      rsvpBtn.el.textContent = registeredText;
      rsvpBtn.el.prepend(checkRed);
    },
    waitlisted: () => {
      const waitlistedText = dictionaryManager.getValue('waitlisted-cta-text');
      enableBtn();
      updateAnalyticTag(rsvpBtn.el, waitlistedText);
      rsvpBtn.el.textContent = waitlistedText;
      rsvpBtn.el.prepend(checkRed);
    },
    toWaitlist: () => {
      const waitlistText = dictionaryManager.getValue('waitlist-cta-text');
      enableBtn();
      updateAnalyticTag(rsvpBtn.el, waitlistText);
      rsvpBtn.el.textContent = waitlistText;
      checkRed.remove();
    },
    eventClosed: () => {
      const closedText = dictionaryManager.getValue('event-full-cta-text');
      disableBtn();
      updateAnalyticTag(rsvpBtn.el, closedText);
      rsvpBtn.el.textContent = closedText;
      checkRed.remove();
    },
    default: () => {
      // Use stored original text as fallback if current originalText is the loading text
      const loadingText = dictionaryManager.getValue('rsvp-loading-cta-text');
      const textToUse = rsvpBtn.originalText === loadingText && rsvpBtn.el.dataset.rsvpOriginalText
        ? rsvpBtn.el.dataset.rsvpOriginalText
        : rsvpBtn.originalText;
      enableBtn();
      updateAnalyticTag(rsvpBtn.el, textToUse);
      rsvpBtn.el.textContent = textToUse;
      checkRed.remove();
    },
  };

  stateTrigger[targetState]();
}

export async function updateRSVPButtonState(rsvpBtn) {
  const eventInfo = await getEvent(getMetadata('event-id'));
  let eventFull = false;
  let waitlistEnabled = getMetadata('allow-wait-listing') === 'true';

  if (eventInfo.ok) {
    const { isFull, allowWaitlisting, attendeeCount, attendeeLimit } = eventInfo.data;
    eventFull = isFull
      || (!allowWaitlisting && attendeeCount >= attendeeLimit);
    waitlistEnabled = allowWaitlisting;
    BlockMediator.set('eventData', eventInfo.data);
  }

  const rsvpData = BlockMediator.get('rsvpData');
  if (!rsvpData) {
    if (eventFull) {
      if (waitlistEnabled) {
        setCtaState('toWaitlist', rsvpBtn);
      } else {
        setCtaState('eventClosed', rsvpBtn);
      }
    } else {
      setCtaState('default', rsvpBtn);
    }
  } else if (rsvpData.registrationStatus === 'registered') {
    setCtaState('registered', rsvpBtn);
  } else if (rsvpData.registrationStatus === 'waitlisted') {
    setCtaState('waitlisted', rsvpBtn);
  }
}

export function signIn(options) {
  if (typeof window.adobeIMS?.signIn !== 'function') {
    window.lana?.log('IMS signIn method not available', { tags: 'errorType=warn,module=gnav' });
    return;
  }

  window.adobeIMS?.signIn(options);
}

async function handleRSVPBtnBasedOnProfile(rsvpBtn, profile) {
  updateRSVPButtonState(rsvpBtn);

  BlockMediator.subscribe('rsvpData', () => {
    updateRSVPButtonState(rsvpBtn);
  });

  if (profile?.noProfile || profile.account_type === 'guest') {
    const allowGuestReg = getMetadata('allow-guest-registration') === 'true';

    if (!allowGuestReg) {
      rsvpBtn.el.addEventListener('click', (e) => {
        e.preventDefault();
        signIn({ ...getSusiOptions(), redirect_uri: `${e.target.href}` });
      });
    }
  }
}

async function getSeries404(seriesSegmentInUrl) {
  const series404MapResp = await fetch(SERIES_404_MAP_PATH);

  if (series404MapResp.ok) {
    const series404Map = await series404MapResp.json();
    const { data } = series404Map;
    const series404 = data.find((s) => s['series-name'] === seriesSegmentInUrl);

    if (series404) {
      return {
        origin: series404.origin,
        path: series404.path,
      };
    }

    const default404 = data.find((s) => s['series-name'] === 'default');

    if (default404) {
      return {
        origin: default404.origin,
        path: default404.path,
      };
    }
  }

  return {
    origin: '',
    path: '/error-pages/404',
  };
}

export async function validatePageAndRedirect(miloLibs) {
  document.body.classList.add('validating-page');
  const pathSegments = window.location.pathname.split('/');
  const eventsIndex = pathSegments.findIndex((segment) => segment === 'events');
  const seriesSegmentInUrl = eventsIndex !== -1 && eventsIndex + 1 < pathSegments.length
    ? pathSegments[eventsIndex + 1]
    : null;
  const [series404, { getConfig, loadLana, getLocale }] = await Promise.all([
    getSeries404(seriesSegmentInUrl),
    import(`${miloLibs}/utils/utils.js`),
  ]);

  const { name: envName } = getEventServiceEnv();
  const pagePublished = getMetadata('published') === 'true' || getMetadata('status') === 'live';
  const invalidStagePage = envName === 'stage' && window.location.hostname === 'www.stage.adobe.com' && !getMetadata('event-id');
  const isPreviewMode = new URLSearchParams(window.location.search).get('previewMode');

  const organicHitUnpublishedOnProd = envName === 'prod' && !pagePublished && !isPreviewMode;
  const purposefulHitOnProdPreview = envName === 'prod' && isPreviewMode;
  const { prefix } = getLocale(getConfig().locales);
  const error404Location = `${series404.origin || ''}${prefix}${series404.path}`;

  if (organicHitUnpublishedOnProd || invalidStagePage) {
    await loadLana({ clientId: 'events-milo' });
    await window.lana?.log(`Error: 404 page hit on ${envName}: ${window.location.href}`);

    window.location.replace(error404Location);
    return;
  }

  if (purposefulHitOnProdPreview) {
    BlockMediator.subscribe('imsProfile', ({ newValue }) => {
      if (newValue?.noProfile || newValue?.account_type === 'guest') {
        signIn(getSusiOptions());
      } else if (!ALLOWED_EMAIL_DOMAINS.some((d) => newValue.email?.toLowerCase().endsWith(d))) {
        window.location.replace(error404Location);
      }
    });
  }

  document.body.classList.remove('validating-page');
}

function processTemplateInLinkText(a) {
  let linkText = a.textContent;
  let match = META_REG.exec(linkText);

  while (match !== null) {
    const innerMetadataPath = match[1];
    const innerMetadataValue = parseMetadataPath(innerMetadataPath) || '';
    linkText = linkText.replaceAll(`[[${innerMetadataPath}]]`, innerMetadataValue);
    match = META_REG.exec(linkText);
  }

  if (linkText !== a.textContent) {
    a.textContent = linkText;
  }
}

const regHashCallbacks = {
  '#rsvp-form': (a) => {
    // Check if button has already been initialized
    if (a.dataset.rsvpInitialized === 'true') {
      return;
    }
    
    // Store the original text BEFORE any modifications
    const originalText = a.textContent.includes('|') ? a.textContent.split('|')[0] : a.textContent;
    
    // Mark as initialized and store original text in dataset
    a.dataset.rsvpInitialized = 'true';
    a.dataset.rsvpOriginalText = originalText;
    
    const rsvpBtn = {
      el: a,
      originalText,
    };

    a.classList.add('rsvp-btn', 'disabled');

    const loadingText = dictionaryManager.getValue('rsvp-loading-cta-text');
    updateAnalyticTag(rsvpBtn.el, loadingText);
    a.textContent = loadingText;
    a.setAttribute('tabindex', -1);

    const profile = BlockMediator.get('imsProfile');
    if (profile) {
      handleRSVPBtnBasedOnProfile(rsvpBtn, profile);
    } else {
      BlockMediator.subscribe('imsProfile', ({ newValue }) => {
        handleRSVPBtnBasedOnProfile(rsvpBtn, newValue);
      });
    }
  },
  '#webinar-marketo-form': (a) => {
    const rsvpBtn = {
      el: a,
      originalText: a.textContent,
    };

    const hrefWithoutHash = window.location.href.split('#')[0];
    a.href = `${hrefWithoutHash}#webinar-marketo-form`;

    const rsvpData = BlockMediator.get('rsvpData');
    if (rsvpData && rsvpData.registrationStatus === 'registered') {
      setCtaState('registered', rsvpBtn);
    } else {
      BlockMediator.subscribe('rsvpData', ({ newValue }) => {
        if (newValue?.registrationStatus === 'registered') {
          setCtaState('registered', rsvpBtn);
        }
      });
    }
  },
};

async function initRSVPHandler(link) {
  await dictionaryManager.initialize();

  try {
    const url = new URL(link.href);
    const regCallbackKey = Object.keys(regHashCallbacks).find((key) => url.hash.startsWith(key));

    if (!regCallbackKey) {
      return false;
    }

    regHashCallbacks[regCallbackKey](link);
    return true;
  } catch (e) {
    window.lana?.log(`Error while attempting to process RSVP link ${link.href}:\n${JSON.stringify(e, null, 2)}`);
    return false;
  }
}

function processSPTemplateLinks(parent) {
  const templateLinks = parent.querySelectorAll('a[href$="#event-template"]');

  templateLinks.forEach((a) => {
    try {
      let templateId;

      try {
        const seriesMetadata = JSON.parse(getMetadata('series'));
        templateId = seriesMetadata?.templateId;
      } catch (e) {
        window.lana?.log(`Failed to parse series metadata. Attempt to fallback on event tempate ID attribute:\n${JSON.stringify(e, null, 2)}`);
      }

      if (!templateId && getMetadata('template-id')) {
        templateId = getMetadata('template-id');
      }

      if (templateId) {
        a.href = templateId;
      } else {
        window.lana?.log(`Error: Failed to find template ID for event ${getMetadata('event-id')}`);
      }
    } catch (e) {
      window.lana?.log(`Error while attempting to replace SP template link ${a.href}:\n${JSON.stringify(e, null, 2)}`);
    }
  });
}

function processDATemplateLinks(parent) {
  const allLinks = parent.querySelectorAll('a');

  allLinks.forEach((a) => {
    try {
      let removeLink = false;
      // Process link text with template syntax
      processTemplateInLinkText(a);

      // Process link href with encoded template syntax
      const encodedHref = a.getAttribute('href');
      if (!encodedHref) return;

      // Decode the href to find [[]] patterns
      const decodedHref = decodeURIComponent(encodedHref);
      const isMailtoLink = decodedHref.startsWith('mailto:');

      const processedHref = decodedHref.replace(META_REG, (_match, metadataPath) => {
        const metaValue = parseMetadataPath(metadataPath);
        if (!metaValue) {
          // For mailto: links with [[host-email]], remove the link if host-email is missing
          if (isMailtoLink && metadataPath === 'host-email') {
            removeLink = true;
          } else if (!isMailtoLink) {
            removeLink = true;
          }
        }
        return metaValue || '';
      });

      if (processedHref !== decodedHref) {
        a.href = processedHref;
      }

      if (removeLink) {
        a.remove();
      }
    } catch (e) {
      window.lana?.log(`Error while attempting to replace DA template link ${a.href}:${JSON.stringify(e, null, 2)}`);
    }
  });
}
function processHashtagLinks(parent) {
  const { cmsType } = getEventConfig();
  const links = parent.querySelectorAll('a[href*="#"]');

  links.forEach((a) => {
    const url = new URL(a.href);
    const isPlaceholderLink = url.pathname.startsWith('/events-placeholder');
    try {
      if (cmsType === 'SP') {
        processTemplateInLinkText(a);

        if (a.href.endsWith('#host-email')) {
          if (getMetadata('host-email')) {
            const emailSubject = `${dictionaryManager.getValue('mailto-subject-prefix')} ${getMetadata('event-title')}`;
            a.href = `mailto:${getMetadata('host-email')}?subject=${encodeURIComponent(emailSubject)}`;
          } else {
            a.remove();
          }
        } else if (url.hash && !a.href.endsWith('#event-template')) {
          const metadataPath = url.hash.replace('#', '');
          const metadataValue = parseMetadataPath(metadataPath);
          if (metadataValue) {
            a.href = metadataValue;
          } else if (isPlaceholderLink) {
            a.remove();
          }
        }
      }

      if (Object.keys(regHashCallbacks).some((key) => a.href.includes(key))) {
        initRSVPHandler(a);
      }
    } catch (e) {
      window.lana?.log(`Error while attempting to replace link ${a.href}:\n${JSON.stringify(e, null, 2)}`);
    }
  });

  
}

function prebuildAutoBlock(blockName, link) {
  let blockEl;
  const autoBlockBuilders = {
    'chrono-box': (link) => {
      const url = new URL(link.href);
      const scheduleBase64 = url.searchParams.get('schedule');
      const schedule = parseEncodedConfig(scheduleBase64);
      
      if (!schedule || !schedule.blocks || !Array.isArray(schedule.blocks)) {
        return null;
      }


      // Transform schedule blocks into chrono-box format
      const chronoBoxData = schedule.blocks.map(block => {
        const item = {
          pathToFragment: block.fragmentPath,
          toggleTime: block.startDateTime
        };

        // Add mobileRider sessionId if the block includes a live stream
        if (block.includeLiveStream && block.liveStream) {
          const { streamId, provider } = block.liveStream;
          if (provider === 'MobileRider' && streamId) {
            item.mobileRider = { sessionId: streamId };
          }
        }

        return item;
      });

      const labelDiv = createTag('div', {}, 'schedule');
      const dataDiv = createTag('div', {}, JSON.stringify(chronoBoxData));
      const innerDiv = createTag('div', {}, [labelDiv, dataDiv]);
      const chronoBoxEl = createTag('div', {
        class: 'chrono-box',
        'data-schedule-id': schedule.scheduleId,
        'data-schedule-title': schedule.title,
        'data-schedule-maker-url': `${url.origin}${url.pathname}?scheduleId=${schedule.scheduleId}`,
      }, innerDiv);

      return chronoBoxEl;
    }
  }

  if (autoBlockBuilders[blockName]) {
    blockEl = autoBlockBuilders[blockName](link);
  }

  return blockEl;
}

export function processAutoBlockLinks(parent) {
  const autoBlockIdentifiers = {
    'chrono-box': 'schedule-maker'
  }

  Object.keys(autoBlockIdentifiers).forEach((bn) => {
    const link = parent.querySelector(`a[href*="${autoBlockIdentifiers[bn]}"]`);
    if (link) {
      const blockEl = prebuildAutoBlock(bn, link);
      if (blockEl) {
        link.closest('p') ? link.closest('p').replaceWith(blockEl) : link.replaceWith(blockEl);
      }
    }
  });
}

export function updatePictureElement(imageUrl, parentPic, altText) {
  let imgUrlObj;
  let imgUrl = imageUrl;
  if (imageUrl.startsWith('https://www.adobe.com/')) {
    try {
      imgUrlObj = new URL(imageUrl);
    } catch (e) {
      window.lana?.log(`Error while parsing absolute sharepoint URL:\n${JSON.stringify(e, null, 2)}`);
    }
  }

  if (imgUrlObj) imgUrl = imgUrlObj.pathname;

  parentPic.querySelectorAll('source').forEach((el) => {
    try {
      el.srcset = el.srcset.replace(/.*\?/, `${imgUrl}?`);
    } catch (e) {
      window.lana?.log(`Failed to convert optimized picture source from ${el} with dynamic data:\n${JSON.stringify(e, null, 2)}`);
    }
  });

  parentPic.querySelectorAll('img').forEach((el) => {
    const onImgLoad = () => {
      el.removeEventListener('load', onImgLoad);
    };

    try {
      el.src = el.src.replace(/.*\?/, `${imgUrl}?`);
      el.alt = altText || '';
    } catch (e) {
      window.lana?.log(`Failed to convert optimized img from ${el} with dynamic data:\n${JSON.stringify(e, null, 2)}`);
    }
    el.addEventListener('load', onImgLoad);
  });
}

function updateImgTag(child, matchCallback, parentElement) {
  const parentPic = child.closest('picture');
  const originalAlt = child.alt;
  const photoMeta = originalAlt.replace(META_REG, (_match, p1) => matchCallback(_match, p1, child));

  if (photoMeta === originalAlt) return;

  try {
    const photoData = JSON.parse(photoMeta);
    const { altText } = photoData;

    const imgUrl = getImageSource(photoData);

    if (imgUrl && parentPic && imgUrl !== originalAlt) {
      updatePictureElement(imgUrl, parentPic, altText);
    } else if (originalAlt.match(META_REG)) {
      parentElement.remove();
    }
  } catch (e) {
    window.lana?.log(`Error while attempting to update image:\n${JSON.stringify(e, null, 2)}`);
  }
}

function isHTMLString(str) {
  const doc = new DOMParser().parseFromString(str, 'text/html');
  return Array.from(doc.body.childNodes).some((node) => node.nodeType === 1);
}

function updateTextNode(child, matchCallback) {
  const originalText = child.nodeValue;
  const replacedText = originalText.replaceAll(
    META_REG,
    (_match, p1) => matchCallback(_match, p1, child),
  );

  if (replacedText === originalText) return;

  if (child.parentElement.dataset.contextualContent) return;

  if (isHTMLString(replacedText)) {
    child.parentElement.innerHTML = replacedText;
  } else {
    const lines = replacedText.split('\\n');
    lines.forEach((line, index) => {
      const textNode = document.createTextNode(line);
      child.parentElement.appendChild(textNode);
      if (index < lines.length - 1) {
        child.parentElement.appendChild(document.createElement('br'));
      }
    });
    child.remove();
  }
}

function updateTextContent(child, matchCallback) {
  const directText = Array.from(child.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join('');
  const originalText = directText;
  const replacedText = originalText.replaceAll(
    META_REG,
    (_match, p1) => matchCallback(_match, p1, child),
  );

  if (replacedText === originalText) return;

  // Check if the element has contextual content marked
  if (child.dataset.contextualContent) return;
  
  if (isHTMLString(replacedText)) {
    child.parentElement.innerHTML = replacedText;
  } else {
    child.textContent = replacedText;
  }
}

export function shouldRenderWithNonProdMetadata(eventId, prodDomain) {
  if (!eventId) return false;
  const isESPProd = getEventServiceEnv()?.name === 'prod';
  const isProdDomain = window.location.hostname === prodDomain;
  const isLiveProd = isESPProd && isProdDomain;

  if (!isLiveProd) return true;

  const isPreviewMode = new URLSearchParams(window.location.search).get('previewMode');

  if (isLiveProd && isPreviewMode) return true;

  return false;
}

function updateContextualContentElements(parent, extraData) {
  // Find all elements with contextual content syntax
  const contextualElements = parent.querySelectorAll('[data-contextual-content]');

  contextualElements.forEach((element) => {
    const originalContent = element.dataset.contextualContent;
    if (originalContent) {
      createContextualContent(element, originalContent, extraData);
    }
  });

  // Also check for conditional content in text nodes that might not have been caught
  const allTextNodes = [];
  const walker = document.createTreeWalker(
    parent,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );

  let node = walker.nextNode();
  while (node) {
    if (node.textContent.includes('?(') && node.textContent.includes('):(')) {
      allTextNodes.push(node);
    }
    node = walker.nextNode();
  }

  allTextNodes.forEach((textNode) => {
    const { parentElement } = textNode;
    if (parentElement && !parentElement.dataset.contextualContent) {
      // Extract conditional content from the text
      const text = textNode.textContent;
      // Updated regex to handle complex conditions with @BM references and nested parentheses
      const conditionalMatch = text.match(CONDITIONAL_REG);
      if (conditionalMatch) {
        const [fullMatch] = conditionalMatch;
        parentElement.dataset.contextualContent = fullMatch;
        createContextualContent(parentElement, fullMatch, extraData);
      }
    }
  });
}


export async function getNonProdData(env) {
  const isPreviewMode = new URLSearchParams(window.location.search).get('previewMode')
  || window.location.hostname.includes('.hlx.page')
  || window.location.hostname.includes('.aem.page');

  const localeMatch = window.location.pathname.match(/^(\/[^/]+)?\/events\//);
  const localePath = localeMatch?.[1] || '';
  const resp = await fetch(`${localePath}/events/default/${env === 'prod' ? '' : `${env}/`}metadata${isPreviewMode ? '-preview' : ''}.json?limit=999999`, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  if (resp.ok) {
    const json = await resp.json();
    let { pathname } = window.location;
    if (pathname.endsWith('.html')) pathname = pathname.slice(0, -5);
    const pageData = json.data.reverse().find((d) => {
      let pageUrl = '';

      try {
        pageUrl = new URL(d.url).pathname;
      } catch (e) {
        pageUrl = d.url;
      }

      return pageUrl === pathname;
    });

    if (pageData) return pageData;

    window.lana?.log('Failed to find non-prod metadata for current page');
    return null;
  }

  window.lana?.log(`Failed to fetch non-prod metadata:\n${JSON.stringify(resp, null, 2)}`);
  return null;
}

function decorateProfileCardsZPattern(parent) {
  if (!getMetadata('speakers')) return;

  let speakerData;
  try {
    speakerData = JSON.parse(getMetadata('speakers'));
  } catch (e) {
    window.lana?.log(`Failed to parse speakers metadata:\n${JSON.stringify(e, null, 2)}`);
    return;
  }

  if (!speakerData?.length) return;

  const profileBlocks = [];
  let flippedIndex = -1;
  let visibleIndex = 0;

  const allBlocks = parent.querySelectorAll('body > div > div:not(.section-metadata):not(.daa-injection)');
  allBlocks.forEach((block) => {
    visibleIndex += 1;
    if (!block.classList.contains('profile-cards')) return;

    const blockConfig = readBlockConfig(block);
    const relatedProfiles = speakerData.filter((speaker) => {
      const speakerType = speaker.speakerType || speaker.type;
      if (!speakerType) return false;
      return speakerType.toLowerCase() === blockConfig.type;
    });

    if (relatedProfiles.length === 1) {
      profileBlocks.push({ block, blockIndex: visibleIndex });
    }

    // visibileIndex only accounts for profile-cards blocks
    if (relatedProfiles.length === 0) {
      visibleIndex -= 1;
    }
  });

  profileBlocks.forEach(({ block, blockIndex }, index) => {
    if (index <= 0) return;

    if (blockIndex - profileBlocks[index - 1].blockIndex === 1 && flippedIndex !== index - 1) {
      flippedIndex = index;
      block.classList.add('reverse');
    }
  });
}

function updateExtraMetaTags(parent) {
  if (parent !== document) return;

  const title = getMetadata('event-title');
  const description = getMetadata('description');
  let photos;

  try {
    photos = JSON.parse(getMetadata('photos'));
  } catch (e) {
    window.lana?.log(`Failed to parse photos metadata for extra metadata tags generation:\n${JSON.stringify(e, null, 2)}`);
  }

  if (title) {
    setMetadata('og:title', title);
    setMetadata('twitter:title', title);
  }

  if (description) {
    setMetadata('og:description', description);
    setMetadata('twitter:description', description);
  }

  if (photos) {
    const cardImg = photos.find((p) => p.imageKind === 'event-card-image');
    if (cardImg) {
      const { imageUrl } = cardImg;
      let { sharepointUrl } = cardImg;

      if (sharepointUrl?.startsWith('https')) {
        try {
          sharepointUrl = new URL(sharepointUrl).pathname;
        } catch (e) {
          window.lana?.log(`Error while parsing SharePoint URL for extra metadata tags generation:\n${JSON.stringify(e, null, 2)}`);
        }
      }

      setMetadata('og:image', sharepointUrl || imageUrl);
      setMetadata('twitter:image', sharepointUrl || imageUrl);
    }
  }
}

function flagEventState(parent) {
  if (parent !== document) return;

  const localStartMillis = getMetadata('local-start-time-millis');
  const localEndMillis = getMetadata('local-end-time-millis');

  if (!localStartMillis || !localEndMillis) return;

  const timeStampInUSP = new URLSearchParams(window.location.search).get('timing');
  const now = timeStampInUSP ? +timeStampInUSP : Date.now();
  const isBeforeStart = now < localStartMillis;
  const isAfterEnd = now > localEndMillis;
  const isDuringEvent = now >= localStartMillis && now <= localEndMillis;

  if (isBeforeStart) {
    document.body.dataset.eventState = 'pre-event';
  } else if (isAfterEnd) {
    document.body.dataset.eventState = 'post-event';
  } else if (isDuringEvent) {
    document.body.dataset.eventState = 'during-event';
  }
}

function parsePhotosData(area) {
  const output = {};

  if (!area) return output;

  try {
    const photosData = JSON.parse(getMetadata('photos'));

    photosData.forEach((photo) => {
      output[photo.imageKind] = photo;
    });
  } catch (e) {
    window.lana?.log(`Failed to parse photos metadata:\n${JSON.stringify(e, null, 2)}`);
  }

  return output;
};

function processTemplateInAllNodes(parent, extraData) {
  const getImgData = (_match, p1, n) => {
    const data = parseMetadataPath(p1, extraData);

    if (preserveFormatKeys.includes(p1)) {
      n.parentNode?.classList.add('preserve-format');
    }
    return JSON.stringify(data);
  };

  const getContent = (_match, p1, n) => {
    // Check if this is conditional content that needs reactive handling
    if (p1.includes('?(') && p1.includes('):(')) {
      // Store the original content and mark for reactive processing
      if (n.parentNode) {
        n.parentNode.dataset.contextualContent = p1;
      }
      // Process the conditional content immediately to get initial value
      const processedContent = parseMetadataPath(p1, extraData);
      return processedContent;
    }

    let content = parseMetadataPath(p1, extraData);

    if (preserveFormatKeys.includes(p1)) {
      n.parentNode?.classList.add('preserve-format');
    }

    return content;
  };

  const isImage = (n) => n.tagName === 'IMG' && n.nodeType === 1;
  const isPlainTextNode = (n) => n.nodeType === 3;
  const isStyledTextTag = (n) => n.tagName === 'STRONG' || n.tagName === 'EM';
  const mightContainIcon = (n) => n.tagName === 'P' || n.tagName === 'A';

  const allElements = parent.querySelectorAll('*');
  allElements.forEach((element) => {
    if (element.childNodes.length) {
      element.childNodes.forEach((n) => {
        if (isImage(n)) {
          updateImgTag(n, getImgData, element);
        }

        if (isPlainTextNode(n)) {
          updateTextNode(n, getContent);
        }

        if (isStyledTextTag(n)) {
          updateTextContent(n, getContent);
        }

        if (mightContainIcon(n)) {
          n.innerHTML = convertEccIcon(n);
        }
      });
    }
  });
}

function addStylesToEventPage() {
  const styleId = 'event-libs-styles';
  
  // Check if styles are already loaded
  if (document.getElementById(styleId)) return;
  
  // Create and append the stylesheet link
  const link = document.createElement('link');
  link.id = styleId;
  link.rel = 'stylesheet';
  link.href = new URL('../libs-styles.css', import.meta.url).href;
  document.head.appendChild(link);
}

export function decorateEvent(parent) {
  hydrateBlocks(parent);

  // handle photos data parsing
  const photosData = parsePhotosData(parent);
  const { cmsType } = getEventConfig();

  if (!parent) {
    window.lana?.log('Error:page server block cannot find its parent element');
    return;
  }

  if (!getMetadata('event-id')) return;
  // Hydrate metadata with user-friendly transformations
  addStylesToEventPage();
  const miloConfig = getEventConfig().miloConfig;
  const locale = miloConfig ? miloConfig.locale?.ietf : getFallbackLocale(FALLBACK_LOCALES);
  const massagedMetadata = massageMetadata(locale);

  processTemplateInAllNodes(parent, { ...photosData, ...massagedMetadata });
  decorateProfileCardsZPattern(parent);

  flagEventState(parent);
  
  // Process template links synchronously first (no dictionary needed)
  if (cmsType === 'SP') {
    processSPTemplateLinks(parent);
  } else if (cmsType === 'DA') {
    processDATemplateLinks(parent);
  }
  
  // Process other links asynchronously (dictionary-dependent)
  processHashtagLinks(parent);
  
  if (getEventServiceEnv()?.name !== 'prod' && cmsType === 'SP') updateExtraMetaTags(parent);

  // handle contextual content with BlockMediator store reactivity
  updateContextualContentElements(parent, { ...photosData, ...massagedMetadata });
}

export default function decorateArea(area = document) {
  const eagerLoad = (parent, selector) => {
    const img = parent.querySelector(selector);
    img?.removeAttribute('loading');
  };

  (async function loadLCPImage() {
    const marquee = area.querySelector('.marquee');
    if (!marquee) {
      eagerLoad(area, 'img');
      return;
    }

    // First image of first row
    eagerLoad(marquee, 'div:first-child img');
    // Last image of last column of last row
    eagerLoad(marquee, 'div:last-child > div:last-child img');
  }());
}
