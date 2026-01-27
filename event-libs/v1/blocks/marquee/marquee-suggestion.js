/*
 * Marquee - Mobile-Rider Player Support Suggestion
 * 
 * This file shows the recommended approach for adding mobile-rider player support
 * to the marquee block, following the same pattern as AdobeTV and YouTube.
 */

import { createTag } from '../../utils/utils.js';

/**
 * Detects if a URL or element is a mobile-rider player
 * @param {string|HTMLElement} urlOrElement - URL string or element containing the URL
 * @returns {Object|null} - Object with videoId, skinId, aslId if detected, null otherwise
 */
function detectMobileRider(urlOrElement) {
  let url = '';
  
  if (typeof urlOrElement === 'string') {
    url = urlOrElement;
  } else if (urlOrElement?.tagName === 'A') {
    url = urlOrElement.href;
  } else {
    // Check for link inside element
    const link = urlOrElement?.querySelector('a');
    url = link?.href || urlOrElement?.textContent?.trim() || '';
  }

  // Pattern 1: Direct mobilerider.com URL
  // Example: https://assets.mobilerider.com/p/adobe/player.min.js?videoId=123&skinId=456
  const mobileriderPattern = /mobilerider\.com.*[?&]video[_-]?id=([^&]+)/i;
  const mobileriderMatch = url.match(mobileriderPattern);
  
  // Pattern 2: Custom URL scheme (adjust based on your actual URL format)
  // Example: mobile-rider://videoId=123&skinId=456
  const customPattern = /mobile[_-]?rider[:\/\/].*video[_-]?id=([^&]+)/i;
  const customMatch = url.match(customPattern);
  
  // Pattern 3: Data attributes or metadata
  // Check if element has data attributes
  if (urlOrElement?.dataset?.videoid || urlOrElement?.dataset?.videoId) {
    return {
      videoId: urlOrElement.dataset.videoid || urlOrElement.dataset.videoId,
      skinId: urlOrElement.dataset.skinid || urlOrElement.dataset.skinId,
      aslId: urlOrElement.dataset.aslid || urlOrElement.dataset.aslId,
    };
  }

  if (mobileriderMatch || customMatch) {
    const match = mobileriderMatch || customMatch;
    const params = new URLSearchParams(url.split('?')[1] || '');
    
    return {
      videoId: match[1] || params.get('videoId') || params.get('video-id'),
      skinId: params.get('skinId') || params.get('skin-id') || '',
      aslId: params.get('aslId') || params.get('asl-id') || '',
    };
  }

  return null;
}

/**
 * Creates a mobile-rider block structure from detected parameters
 * @param {Object} config - Configuration object with videoId, skinId, aslId
 * @param {HTMLElement} media - The media element to replace
 * @returns {HTMLElement} - Mobile-rider block element
 */
function createMobileRiderBlock(config, media) {
  const { videoId, skinId, aslId } = config;
  
  // Create the mobile-rider block structure
  // Mobile-rider expects: <div class="mobile-rider">
  //   <div><div>videoid</div><div>{videoId}</div></div>
  //   <div><div>skinid</div><div>{skinId}</div></div>
  //   <div><div>aslid</div><div>{aslId}</div></div>
  // </div>
  
  const mobileRiderEl = createTag('div', { class: 'mobile-rider' });
  
  if (videoId) {
    const videoIdRow = createTag('div');
    videoIdRow.appendChild(createTag('div', {}, 'videoid'));
    videoIdRow.appendChild(createTag('div', {}, videoId));
    mobileRiderEl.appendChild(videoIdRow);
  }
  
  if (skinId) {
    const skinIdRow = createTag('div');
    skinIdRow.appendChild(createTag('div', {}, 'skinid'));
    skinIdRow.appendChild(createTag('div', {}, skinId));
    mobileRiderEl.appendChild(skinIdRow);
  }
  
  if (aslId) {
    const aslIdRow = createTag('div');
    aslIdRow.appendChild(createTag('div', {}, 'aslid'));
    aslIdRow.appendChild(createTag('div', {}, aslId));
    mobileRiderEl.appendChild(aslIdRow);
  }
  
  return mobileRiderEl;
}

/**
 * Loads and initializes the mobile-rider player
 * @param {HTMLElement} mobileRiderEl - The mobile-rider block element
 * @returns {Promise} - Promise that resolves when player is loaded
 */
async function loadMobileRiderPlayer(mobileRiderEl) {
  try {
    const { default: initMobileRider } = await import('../mobile-rider/mobile-rider.js');
    return initMobileRider(mobileRiderEl);
  } catch (err) {
    window.lana?.log(`Failed to load mobile-rider player: ${err}`);
    return null;
  }
}

/**
 * Modified decorateSplit function with mobile-rider support
 * Add this to your marquee.js file
 */
export function decorateSplitWithMobileRider(el, foreground, media) {
  if (foreground && media) {
    const mediaIndex = [...foreground.children].indexOf(media);
    media.classList.add('bleed');
    const position = mediaIndex ? 'afterend' : 'beforebegin';
    foreground.insertAdjacentElement(position, media);
  }

  // Check for mobile-rider player BEFORE checking for mp4/video
  const mobileRiderConfig = detectMobileRider(media);
  if (mobileRiderConfig?.videoId) {
    // Replace media with mobile-rider block
    const mobileRiderEl = createMobileRiderBlock(mobileRiderConfig, media);
    media.replaceWith(mobileRiderEl);
    
    // Load the mobile-rider player asynchronously
    loadMobileRiderPlayer(mobileRiderEl).catch((err) => {
      window.lana?.log(`Mobile-rider player initialization failed: ${err}`);
    });
    
    return; // Exit early, don't process as regular video
  }

  // Original video detection logic (mp4, VIDEO tag, etc.)
  let mediaCreditInner;
  const txtContent = media?.lastChild?.textContent?.trim();
  if (txtContent?.match(/^http.*\.mp4/) || media?.lastChild?.tagName === 'VIDEO' || media.querySelector('.video-holder video')) return;
  
  // Rest of original decorateSplit logic...
  if (txtContent) {
    mediaCreditInner = createTag('p', { class: 'body-s' }, txtContent);
  } else if (media.lastElementChild?.tagName !== 'PICTURE') {
    mediaCreditInner = media.lastElementChild;
  }

  if (mediaCreditInner) {
    const mediaCredit = createTag('div', { class: 'media-credit container' }, mediaCreditInner);
    el.appendChild(mediaCredit);
    el.classList.add('has-credit');
    media?.lastChild?.remove();
  }
}

/**
 * Alternative approach: Check in the main init function
 * Add this check in your init() function before decorateImage
 */
export function checkAndLoadMobileRider(media) {
  if (!media) return false;
  
  // Check all links in media area
  const links = media.querySelectorAll('a');
  for (const link of links) {
    const config = detectMobileRider(link);
    if (config?.videoId) {
      const mobileRiderEl = createMobileRiderBlock(config, media);
      media.replaceWith(mobileRiderEl);
      loadMobileRiderPlayer(mobileRiderEl);
      return true;
    }
  }
  
  // Check text content for mobile-rider URLs
  const textContent = media.textContent?.trim();
  if (textContent) {
    const config = detectMobileRider(textContent);
    if (config?.videoId) {
      const mobileRiderEl = createMobileRiderBlock(config, media);
      media.replaceWith(mobileRiderEl);
      loadMobileRiderPlayer(mobileRiderEl);
      return true;
    }
  }
  
  return false;
}














