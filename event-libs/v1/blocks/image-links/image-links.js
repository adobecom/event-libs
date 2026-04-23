import { createTag } from '../../utils/utils.js';

function isOdd(number) {
  return number % 2 !== 0;
}

export default async function init(el) {
  if (el.classList.contains('hydrate')) {
    const { getHydrationPromise } = await import('../../hydrate/hydrate.js');
    const hydrationPromise = getHydrationPromise();
    if (hydrationPromise) await hydrationPromise;
  }

  const rows = [...el.querySelectorAll(':scope > div')];

  if (!rows.length) {
    el.remove();
    return;
  }

  // Create main container
  const container = createTag('div', { class: 'image-links-wrapper' });

  // First row is reserved for title
  const headerRow = rows.shift();
  headerRow.className = 'image-links-header';
  container.append(headerRow);

  // Remaining rows contain images
  const images = [];
  rows.forEach((row) => {
    const cells = row.querySelectorAll(':scope > div');

    cells.forEach((cell) => {
      const picture = cell.querySelector('picture');
      const img = cell.querySelector('img');

      if (picture || img) {
        images.push(cell);
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
  images.forEach((cell) => {
    cell.className = 'image-links-item';
    imagesContainer.append(cell);
  });

  container.append(imagesContainer);

  // Clear and append new content
  el.innerHTML = '';
  el.append(container);
}
