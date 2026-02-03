import { createTag } from '../../utils/utils.js';

function isOdd(number) {
  return number % 2 !== 0;
}

export default function init(el) {
  const rows = el.querySelectorAll(':scope > div');

  if (!rows.length) {
    el.remove();
    return;
  }

  // Create main container
  const container = createTag('div', { class: 'image-links-wrapper' });

  // Track if we found a header
  let headerFound = false;
  const images = [];

  rows.forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');

    cells.forEach((cell) => {
      // Check for header (h1-h6)
      const header = cell.querySelector('h1, h2, h3, h4, h5, h6');
      if (header && !headerFound) {
        const headerContainer = createTag('div', { class: 'image-links-header' });
        const clonedHeader = header.cloneNode(true);
        clonedHeader.classList.add('image-links-title');
        headerContainer.append(clonedHeader);
        container.append(headerContainer);
        headerFound = true;
        return;
      }

      // Check for images (picture or img)
      const picture = cell.querySelector('picture');
      const img = cell.querySelector('img');
      const link = cell.querySelector('a');

      if (picture || img) {
        const imageElement = picture || img;

        // Check if image is wrapped in a link or if there's a sibling link
        let linkHref = null;
        let linkTitle = '';

        if (link) {
          linkHref = link.href;
          linkTitle = link.title || link.textContent?.trim() || '';
        } else if (imageElement.closest('a')) {
          const parentLink = imageElement.closest('a');
          linkHref = parentLink.href;
          linkTitle = parentLink.title || parentLink.textContent?.trim() || '';
        }

        images.push({
          element: imageElement.cloneNode(true),
          link: linkHref,
          title: linkTitle,
        });
      }
    });
  });

  // If no images found, remove block
  if (!images.length) {
    el.remove();
    return;
  }

  // Create images container
  const imagesContainer = createTag('div', { class: 'image-links-container' });

  // Add odd/single class based on image count
  if (isOdd(images.length)) {
    if (images.length === 1) {
      imagesContainer.classList.add('single');
    } else {
      imagesContainer.classList.add('odd');
    }
  }

  // Render images
  images.forEach((imageData) => {
    const imageWrapper = createTag('div', { class: 'image-links-item' });
    imageWrapper.append(imageData.element);

    if (imageData.link) {
      const linkEl = createTag('a', {
        href: imageData.link,
        target: '_blank',
        title: imageData.title,
      });
      linkEl.append(imageWrapper);
      imagesContainer.append(linkEl);
    } else {
      imagesContainer.append(imageWrapper);
    }
  });

  container.append(imagesContainer);

  // Clear and append new content
  el.innerHTML = '';
  el.append(container);
}
