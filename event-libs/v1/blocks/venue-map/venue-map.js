function decorateImages(wrapper) {
  const columns = wrapper.querySelectorAll(':scope > div');
  if (!columns.length) return;

  columns.forEach((column) => {
    column.classList.add('image-container');
  });
}

export default async function init(el) {
  const wrapper = el.querySelector(':scope > div');
  if (!wrapper) return;

  wrapper.classList.add('venue-map-wrapper');
  decorateImages(wrapper);
}
