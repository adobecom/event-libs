import { getMetadata, createTag, getImageSource } from '../../utils/utils.js';


async function decorateTextContainer(el, createTag) {
  const wrapper = el.querySelector('.venue-additional-info-wrapper');
  const textContentWrapper = el.querySelector(':scope > div');
  if (!textContentWrapper) return;

  textContentWrapper.classList.add('text-wrapper');
  wrapper.append(textContentWrapper);

  textContentWrapper.querySelectorAll('div').forEach((div) => {
    div.remove();
  });

  const venueObj = JSON.parse(getMetadata('venue'));

  if (!venueObj) return;

  const { venueName, additionalInformation } = venueObj;

  createTag('p', { class: 'venue-name-text' }, createTag('strong', {}, venueName), { parent: textContentWrapper });

  if (!additionalInformation) return;

  textContentWrapper.insertAdjacentHTML('beforeend', additionalInformation);
}

function decorateImage(el, createTag) {
  let venueAdditionalImageObj;
  try {
    venueAdditionalImageObj = JSON.parse(getMetadata('photos')).find((photo) => photo.imageKind === 'venue-additional-image');
  } catch (e) {
    window.lana?.log(`Error while parsing venue additional image metadata:\n${JSON.stringify(e, null, 2)}`);
  }

  if (!venueAdditionalImageObj) return;

  const wrapper = el.querySelector('.venue-additional-info-wrapper');
  const imageContainer = createTag('div', { id: 'additional-image-container', class: 'additional-image-container' });
  wrapper.append(imageContainer);

  const img = createTag('img', { src: getImageSource(venueAdditionalImageObj), alt: venueAdditionalImageObj.altText || '' });
  imageContainer.append(img);
  wrapper.append(imageContainer);
}

function decorateModal(el, createTag) {
  decorateImage(el, createTag);
  decorateTextContainer(el, createTag);
}

export default async function init(el) {
  if (getMetadata('show-venue-additional-info-post-event') !== 'true' && document.body.dataset.eventState === 'post-event') {
    el.remove();
    return;
  }

  const wrapper = createTag('div', { class: 'venue-additional-info-wrapper' });
  el.append(wrapper);

  decorateModal(el, createTag);
}
