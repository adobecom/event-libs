import buildMiloCarousel from '../../features/carousel/milo-carousel.js';
import {
  getMetadata,
  createTag,
  getImageSource,
  getEventConfig,
  LIBS,
} from '../../utils/utils.js';

let modalLoader;

function decorateImage(card, photo) {
  if (!photo) return;

  const { altText } = photo;
  const imgElement = createTag('img', {
    src: getImageSource(photo),
    class: 'card-image',
  });

  if (altText) {
    imgElement.setAttribute('alt', altText);
  }

  const imgContainer = createTag('div', { class: 'card-image-container' });
  imgContainer.append(imgElement);
  card.append(imgContainer);
}

export async function getSVGsfromFile(path, selectors) {
  if (!path) return null;
  const resp = await fetch(path);
  if (!resp.ok) return null;

  const text = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');

  if (!selectors) {
    const svg = doc.querySelector('svg');
    if (svg) return [{ svg }];
    return null;
  }

  if (!(selectors instanceof Array)) {
    // eslint-disable-next-line no-param-reassign
    selectors = [selectors];
  }

  return selectors.map((selector) => {
    const symbol = doc.querySelector(`#${selector}`);
    if (!symbol) return null;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    while (symbol.firstChild) svg.appendChild(symbol.firstChild);
    [...symbol.attributes].forEach((attr) => svg.attributes.setNamedItem(attr.cloneNode()));
    svg.classList.add('icon');
    svg.classList.add(`icon-${selector}`);
    svg.removeAttribute('id');
    return { svg, name: selector };
  });
}

export function createSocialIcon(svg, platform) {
  if (!svg || !platform || !(svg instanceof Node)) return null;
  const icon = svg.cloneNode(true);
  icon.classList.add('card-social-icon');
  icon.setAttribute('alt', `${platform} logo`);
  icon.setAttribute('height', 20);
  icon.setAttribute('width', 20);

  return icon;
}

async function decorateSocialIcons(cardContainer, socialLinks) {
  // Define platform detection patterns using pure regex - no predefined lists needed
  const PLATFORM_PATTERNS = {
    instagram: /^(?:www\.)?(?:instagram\.[a-z]{2,}(?:\.[a-z]{2,})?|instagr\.am)$/,
    facebook: /^(?:www\.)?(?:facebook\.[a-z]{2,}(?:\.[a-z]{2,})?|fb\.com)$/,
    twitter: /^(?:www\.)?(?:twitter\.com|t\.co|tweetdeck\.twitter\.com)$/,
    linkedin: /^(?:www\.)?(?:linkedin\.[a-z]{2,}(?:\.[a-z]{2,})?|lnkd\.in)$/,
    youtube: /^(?:www\.)?(?:youtube\.[a-z]{2,}(?:\.[a-z]{2,})?|youtu\.be|m\.youtube\.com)$/,
    pinterest: /^(?:www\.)?(?:pinterest\.[a-z]{2,}(?:\.[a-z]{2,})?|pin\.it)$/,
    discord: /^(?:www\.)?(?:discord\.com|discord\.gg)$/,
    behance: /^(?:www\.)?behance\.net$/,
    x: /^(?:www\.)?(?:x\.com|twitter\.com)$/, // x.com and legacy twitter.com
    tiktok: /^(?:www\.)?(?:tiktok\.[a-z]{2,}(?:\.[a-z]{2,})?|vm\.tiktok\.com)$/,
  };

  const SUPPORTED_PLATFORMS = [...Object.keys(PLATFORM_PATTERNS), 'web'];

  const svgPath = new URL('../../icons/social-icons.svg', import.meta.url).href;
  const socialList = createTag('ul', { class: 'card-social-icons' });

  const svgEls = await getSVGsfromFile(svgPath, SUPPORTED_PLATFORMS);
  if (!svgEls || svgEls.length === 0) return;
  socialLinks.forEach((social) => {
    const { link } = social;

    if (!link) return;

    let platform = 'web'; // Default fallback
    try {
      const url = new URL(link);
      const hostname = url.hostname.toLowerCase();

      // Find the platform by testing against regex patterns
      const matchedPlatform = Object.entries(PLATFORM_PATTERNS).find(
        ([, pattern]) => pattern.test(hostname),
      );
      platform = matchedPlatform ? matchedPlatform[0] : 'web';
    } catch (error) {
      platform = 'web';
    }

    const svgEl = svgEls.find((el) => el.name === platform);
    if (!svgEl) return;

    const li = createTag('li', { class: 'card-social-icon' });
    const icon = createSocialIcon(svgEl.svg, platform);

    const a = createTag('a', {
      href: link,
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': platform,
    });
    a.textContent = '';
    a.append(icon);
    li.append(a);
    socialList.append(li);
  });

  if (socialList.children.length > 0) {
    cardContainer.append(socialList);
  }
}

function decorateContent(cardContainer, data) {
  const contentContainer = createTag('div', { class: 'card-content' });

  const textContainer = createTag('div', { class: 'card-text-container' });
  const title = createTag('p', { class: 'card-title' }, data.title);
  const name = createTag('h3', { class: 'card-name' }, `${data.firstName} ${data.lastName}`);

  textContainer.append(title, name);

  if (data.bio) {
    // Check if bio contains HTML tags (from static authoring)
    if (data.bio.includes('<')) {
      // Bio is HTML - insert it directly
      const bioContainer = createTag('div', { class: 'card-desc' });
      bioContainer.innerHTML = data.bio;
      textContainer.append(bioContainer);
    } else {
      // Bio is plain text (from metadata) - wrap in paragraph
      const description = createTag('p', { class: 'card-desc' }, data.bio);
      textContainer.append(description);
    }
  }

  contentContainer.append(textContainer);

  decorateSocialIcons(contentContainer, data.socialLinks || data.socialMedia || []);

  cardContainer.append(contentContainer);
}

function decorateContentSimple(cardContainer, data) {
  const contentContainer = createTag('div', { class: 'card-content' });
  const textContainer = createTag('div', { class: 'card-text-container' });
  const title = createTag('p', { class: 'card-title' }, data.title);
  const name = createTag('h3', { class: 'card-name' }, `${data.firstName} ${data.lastName}`);

  textContainer.append(title, name);
  contentContainer.append(textContainer);
  cardContainer.append(contentContainer);
}

function getProfileName(data) {
  return `${data?.firstName || ''} ${data?.lastName || ''}`.trim();
}

function getSocialLinks(data) {
  return data?.socialLinks || data?.socialMedia || [];
}

function appendBio(contentContainer, bio) {
  const trimmedBio = typeof bio === 'string' ? bio.trim() : '';
  if (!trimmedBio) return;

  if (trimmedBio.includes('<')) {
    const bioContainer = createTag('div', { class: 'card-desc' });
    bioContainer.innerHTML = trimmedBio;
    contentContainer.append(bioContainer);
    return;
  }

  const description = createTag('p', { class: 'card-desc' }, trimmedBio);
  contentContainer.append(description);
}

function getModalId(data, index) {
  const fullName = getProfileName(data);
  const slug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `profile-cards-modal-${slug || index + 1}`;
}

async function loadMiloModal() {
  if (!modalLoader) {
    modalLoader = (async () => {
      const eventConfig = getEventConfig();
      const modalBasePath = eventConfig?.miloConfig?.miloLibs || LIBS;
      const { getModal } = await import(`${modalBasePath}/blocks/modal/modal.js`);
      return getModal;
    })();
  }

  return modalLoader;
}

async function buildModalContent(profileData) {
  const content = new DocumentFragment();
  const modalContent = createTag('div', { class: 'profile-cards-modal-content' });
  const textContainer = createTag('div', { class: 'profile-cards-modal-text' });
  const imageContainer = createTag('div', { class: 'profile-cards-modal-image' });
  const fullName = getProfileName(profileData);
  const title = createTag('p', { class: 'card-title' }, profileData?.title || '');
  const name = createTag('h3', { class: 'card-name' }, fullName);

  textContainer.append(title, name);
  appendBio(textContainer, profileData?.bio);
  await decorateSocialIcons(textContainer, getSocialLinks(profileData));
  decorateImage(imageContainer, profileData?.photo);

  modalContent.append(textContainer, imageContainer);
  content.append(modalContent);
  return content;
}

async function openProfileModal(profileData, index) {
  try {
    const getModal = await loadMiloModal();
    const fullName = getProfileName(profileData) || `Profile ${index + 1}`;
    const content = await buildModalContent(profileData);

    await getModal(null, {
      id: getModalId(profileData, index),
      title: `Profile: ${fullName}`,
      content,
      class: 'profile-cards-modal',
    });
  } catch (error) {
    window.lana?.log(`Failed to open profile modal:\n${JSON.stringify(error, null, 2)}`);
  }
}

function decorateModalTrigger(cardContainer, profileData, index) {
  const fullName = getProfileName(profileData) || `Profile ${index + 1}`;
  const openModal = () => {
    openProfileModal(profileData, index);
  };

  cardContainer.classList.add('modal-trigger');
  cardContainer.setAttribute('role', 'button');
  cardContainer.setAttribute('tabindex', '0');
  cardContainer.setAttribute('aria-haspopup', 'dialog');
  cardContainer.setAttribute('aria-label', `Open profile modal for ${fullName}`);

  cardContainer.addEventListener('click', (event) => {
    if (event.target.closest('a')) return;
    openModal();
  });

  cardContainer.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target.closest('a')) return;
    event.preventDefault();
    openModal();
  });
}

function parseStaticCard(row) {
  const cell = row.querySelector(':scope > div');
  if (!cell) return null;

  // Extract picture/image
  const picture = cell.querySelector('picture');
  const img = picture?.querySelector('img') || cell.querySelector('img');
  
  let photo = null;
  if (img) {
    photo = {
      imageUrl: img.src,
      altText: img.alt || '',
    };
  }

  // Find the heading (h1-h6)
  const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
  const name = heading?.textContent.trim() || '';
  
  // Split name into first and last (simple split on space)
  const nameParts = name.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Helper function to check if a paragraph is a social link
  // Social links are typically <p><a>url</a></p> with just the URL as text
  const isSocialLinkParagraph = (p) => {
    const anchor = p.querySelector('a');
    if (!anchor) return false;
    
    // Check if paragraph only contains the anchor (and whitespace)
    const textContent = p.textContent.trim();
    const anchorText = anchor.textContent.trim();
    
    // If the paragraph text matches the anchor text or anchor href, it's likely a social link
    return textContent === anchorText || textContent === anchor.href;
  };

  // Get all direct children of the cell
  const children = Array.from(cell.children);
  
  let title = '';
  const bioElements = [];
  const socialLinks = [];

  children.forEach((child) => {
    // Skip picture elements
    if (child.tagName === 'PICTURE') return;
    
    // Check if this is before or after the heading
    if (heading && child.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING) {
      // Element comes before heading - check if it's the title
      if (!title && child.tagName === 'P' && child.textContent.trim()) {
        title = child.textContent.trim();
      }
    } else if (heading && child.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_PRECEDING) {
      // Element comes after heading
      if (child.tagName === 'P' && isSocialLinkParagraph(child)) {
        // This is a social link paragraph
        const anchor = child.querySelector('a');
        if (anchor?.href) {
          socialLinks.push({ link: anchor.href });
        }
      } else if (child !== heading) {
        // This is bio content - keep the HTML
        bioElements.push(child);
      }
    }
  });

  // Combine bio elements into HTML string
  let bio = '';
  if (bioElements.length > 0) {
    bio = bioElements.map((el) => el.outerHTML).join('');
  }

  return {
    firstName,
    lastName,
    title,
    photo,
    socialLinks,
    bio,
  };
}

function decorateStaticCards(el, { modal } = {}) {
  const cardsWrapper = el.querySelector('.cards-wrapper');
  const rows = Array.from(el.querySelectorAll(':scope > div:not(.cards-wrapper)'));
  
  // First row is the heading, skip it
  const cardRows = rows.slice(1);

  if (cardRows.length === 0) {
    el.remove();
    return;
  }

  cardRows.forEach((row, index) => {
    const cardData = parseStaticCard(row);
    if (!cardData) return;

    const cardContainer = createTag('div', { class: 'card-container' });
    decorateImage(cardContainer, cardData.photo);
    decorateContent(cardContainer, cardData);
    if (modal) {
      decorateModalTrigger(cardContainer, cardData, index);
    }
    cardsWrapper.append(cardContainer);
    
    // Remove the original row
    row.remove();
  });

  const cardCount = cardsWrapper.querySelectorAll('.card-container').length;
  const isGrid = el.classList.contains('grid');
  
  if (cardCount === 1) {
    el.classList.add('single');
  } else if (cardCount > 3 && !isGrid) {
    cardsWrapper.classList.add('carousel-plugin', 'show-3');
    el.classList.add('with-carousel');
    buildMiloCarousel(cardsWrapper, Array.from(cardsWrapper.querySelectorAll('.card-container')));
  }
}

function decorateCards(el, data, { simple, modal } = {}) {
  const cardsWrapper = el.querySelector('.cards-wrapper');
  const rows = el.querySelectorAll(':scope > div');
  const configRow = rows[1];
  const speakerType = configRow?.querySelectorAll(':scope > div')?.[1]?.textContent.toLowerCase().trim();
  const filteredData = data.filter((speaker) => speaker.speakerType.toLowerCase() === speakerType);

  if (filteredData.length === 0) {
    el.remove();
    return;
  }

  configRow.remove();

  filteredData.forEach((speaker, index) => {
    const cardContainer = createTag('div', { class: 'card-container' });

    decorateImage(cardContainer, speaker.photo);
    if (simple) {
      decorateContentSimple(cardContainer, speaker);
    } else {
      decorateContent(cardContainer, speaker);
    }
    if (modal) {
      decorateModalTrigger(cardContainer, speaker, index);
    }

    cardsWrapper.append(cardContainer);
  });

  const isGrid = el.classList.contains('grid');

  if (filteredData.length === 1) {
    el.classList.add('single');
  } else if (filteredData.length > 3 && !isGrid) {
    cardsWrapper.classList.add('carousel-plugin', 'show-3');
    el.classList.add('with-carousel');

    buildMiloCarousel(cardsWrapper, Array.from(cardsWrapper.querySelectorAll('.card-container')));
  }
}

function sortDataByOrdinals(data) {
  return [...data].sort((a, b) => {
    const aHas = a.ordinal != null;
    const bHas = b.ordinal != null;
    if (aHas && bHas) return a.ordinal - b.ordinal;
    if (aHas) return -1;
    if (bHas) return 1;
    return 0;
  });
}


export default function init(el) {
  const rows = el.querySelectorAll(':scope > div');
  const configRow = rows[1];
  
  // Determine if this is metadata-driven or static authoring
  // Check if the first cell of configRow (if it exists) contains 'type'
  const firstCell = configRow?.querySelectorAll(':scope > div')?.[0];
  const isMetadataDriven = firstCell?.textContent.toLowerCase().trim() === 'type';
  const isModal = el.classList.contains('modal');

  // Handle grid variant: add default three-up if no *-up class is present
  if (el.classList.contains('grid')) {
    const hasUpVariant = Array.from(el.classList).some((cls) => cls.endsWith('-up'));
    if (!hasUpVariant) {
      el.classList.add('three-up');
    }
  }

  const cardsWrapper = createTag('div', { class: 'cards-wrapper' });
  el.append(cardsWrapper);

  if (isMetadataDriven) {
    // Metadata-driven mode
    let data = [];

    try {
      data = JSON.parse(getMetadata('speakers'));
    } catch (error) {
      window.lana?.log(`Failed to parse speakers metadata:\n${JSON.stringify(error, null, 2)}`);
      el.remove();
      return;
    }

    if (!data || data.length === 0) {
      el.remove();
      return;
    }

    const isSimple = el.classList.contains('simple');
    const sortedData = sortDataByOrdinals(data);
    decorateCards(el, sortedData, { simple: isSimple, modal: isModal });
  } else {
    decorateStaticCards(el, { modal: isModal });
  }
}
