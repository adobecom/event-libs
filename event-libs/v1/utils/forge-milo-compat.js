import { getEventConfig, LIBS } from './utils.js';
export * from './utils.js';

const miloLibs = getEventConfig()?.miloConfig?.miloLibs || LIBS;
const [decorate, utils] = await Promise.all([
  import(`${miloLibs}/utils/decorate.js`),
  import(`${miloLibs}/utils/utils.js`),
]);

export const decorateButtons = decorate.decorateButtons;
export const decorateBlockText = decorate.decorateBlockText;
export const decorateViewportContent = decorate.decorateViewportContent;
export const getFederatedUrl = utils.getFederatedUrl;
