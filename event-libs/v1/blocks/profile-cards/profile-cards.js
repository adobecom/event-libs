import buildMiloCarousel from '../../utils/milo-carousel.js';
import { getMetadata, createTag } from '../../utils/utils.js';

function decorateImage(card, photo) {
  if (!photo) return;

  const { sharepointUrl, imageUrl, altText } = photo;
  const imgElement = createTag('img', {
    src: sharepointUrl || imageUrl,
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
    const description = createTag('p', { class: 'card-desc' }, data.bio);
    textContainer.append(description);
  }

  contentContainer.append(textContainer);

  decorateSocialIcons(contentContainer, data.socialLinks || data.socialMedia || []);

  cardContainer.append(contentContainer);
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

  // Extract all paragraphs and h3
  const h3 = cell.querySelector('h3');
  const paragraphs = Array.from(cell.querySelectorAll('p'));
  
  // Find name from h3
  const name = h3?.textContent.trim() || '';
  
  // Split name into first and last (simple split on space)
  const nameParts = name.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  // Find title (first paragraph without a link and without picture)
  let title = '';
  const titleParagraph = paragraphs.find((p) => !p.querySelector('picture') && !p.querySelector('a') && p.textContent.trim());
  if (titleParagraph) {
    title = titleParagraph.textContent.trim();
  }

  // Extract social links (all anchor tags)
  const socialLinks = [];
  const anchors = cell.querySelectorAll('a');
  anchors.forEach((anchor) => {
    const link = anchor.href;
    if (link) {
      socialLinks.push({ link });
    }
  });

  return {
    firstName,
    lastName,
    title,
    photo,
    socialLinks,
    bio: '', // Static authoring doesn't include bio in this format
  };
}

function decorateStaticCards(el) {
  const cardsWrapper = el.querySelector('.cards-wrapper');
  const rows = Array.from(el.querySelectorAll(':scope > div'));
  
  // First row is the heading, skip it
  const cardRows = rows.slice(1);

  if (cardRows.length === 0) {
    el.remove();
    return;
  }

  cardRows.forEach((row) => {
    const cardData = parseStaticCard(row);
    if (!cardData) return;

    const cardContainer = createTag('div', { class: 'card-container' });
    decorateImage(cardContainer, cardData.photo);
    decorateContent(cardContainer, cardData);
    cardsWrapper.append(cardContainer);
    
    // Remove the original row
    row.remove();
  });

  const cardCount = cardsWrapper.querySelectorAll('.card-container').length;
  
  if (cardCount === 1) {
    el.classList.add('single');
  } else if (cardCount > 3) {
    cardsWrapper.classList.add('carousel-plugin', 'show-3');
    el.classList.add('with-carousel');
    buildMiloCarousel(cardsWrapper, Array.from(cardsWrapper.querySelectorAll('.card-container')));
  }
}

function decorateCards(el, data) {
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

  filteredData.forEach((speaker) => {
    const cardContainer = createTag('div', { class: 'card-container' });

    decorateImage(cardContainer, speaker.photo);
    decorateContent(cardContainer, speaker);

    cardsWrapper.append(cardContainer);
  });

  if (filteredData.length === 1) {
    el.classList.add('single');
  } else if (filteredData.length > 3) {
    cardsWrapper.classList.add('carousel-plugin', 'show-3');
    el.classList.add('with-carousel');

    buildMiloCarousel(cardsWrapper, Array.from(cardsWrapper.querySelectorAll('.card-container')));
  }
}

export default function init(el) {
  const rows = el.querySelectorAll(':scope > div');
  const configRow = rows[1];
  
  // Determine if this is metadata-driven or static authoring
  // Check if the first cell of configRow (if it exists) contains 'type'
  const firstCell = configRow?.querySelectorAll(':scope > div')?.[0];
  const isMetadataDriven = firstCell?.textContent.toLowerCase().trim() === 'type';

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

    decorateCards(el, data);
  } else {
    // Static authoring mode
    decorateStaticCards(el);
  }
}
