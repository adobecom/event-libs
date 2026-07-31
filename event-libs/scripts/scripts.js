/*
 * Copyright 2022 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { LIBS, getMetadata } from '../v1/utils/utils.js';
import decorateArea from '../v1/utils/decorate.js';
import { EVENT_BLOCKS, EVENT_BLOCKS_C2 } from '../v1/libs.js';

const {
  loadArea,
  setConfig,
  loadLana,
} = await import(`${LIBS}/utils/utils.js`);



const prodDomains = ['milo.adobe.com', 'business.adobe.com', 'www.adobe.com', 'news.adobe.com', 'helpx.adobe.com'];

// Add project-wide style path here.
const STYLES = '';

const EVENT_LIBS_BASE = '/event-libs/v1';
const IS_C2 = getMetadata('foundation') === 'c2';
const EVENT_BLOCKS_LIB = IS_C2
  ? { base: `${EVENT_LIBS_BASE}/c2`, blocks: EVENT_BLOCKS_C2 }
  : { base: EVENT_LIBS_BASE, blocks: EVENT_BLOCKS };

// Add any config options.
const CONFIG = {
  codeRoot: '/event-libs',
  contentRoot: '/event-libs',
  imsClientId: 'events-milo',
  miloLibs: LIBS,
  prodDomains,
  externalLibs: [
    EVENT_BLOCKS_LIB,
  ],
  htmlExclude: [
    /www\.adobe\.com\/(\w\w(_\w\w)?\/)?express(\/.*)?/,
    /www\.adobe\.com\/(\w\w(_\w\w)?\/)?go(\/.*)?/,
    /www\.adobe\.com\/(\w\w(_\w\w)?\/)?learn(\/.*)?/,
  ],
  // imsScope: 'AdobeID,openid,gnav',
  // geoRouting: 'off',
  // fallbackRouting: 'off',
  decorateArea,
  locales: {
    '': { ietf: 'en-US', tk: 'hah7vzn.css' },
  },
  adobeid: {
    enableGuestAccounts: true,
    enableGuestTokenForceRefresh: true,
    enableGuestBotDetection: false,
    api_parameters: { check_token: { guest_allowed: true } },
    onTokenExpired: () => {
      window.location.reload();
    },
  },
};

setConfig(CONFIG);

decorateArea();

/*
 * ------------------------------------------------------------
 * Edit below at your own risk
 * ------------------------------------------------------------
 */

(function loadStyles() {
  const paths = [`${LIBS}/styles/styles.css`];
  if (STYLES) { paths.push(STYLES); }
  // Page-wide C2 styles (rounded video players, etc.) — only on foundation:c2
  // pages. Blocks' own CSS can't host page-wide rules (it loads only when the
  // block is present), so this stylesheet is loaded here instead.
  if (IS_C2) { paths.push(`${EVENT_LIBS_BASE}/c2/styles/c2-global.css`); }
  paths.forEach((path) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', path);
    document.head.appendChild(link);
  });
}());

(async function loadPage() {
  await loadLana({ clientId: 'events-milo' });
  await loadArea();
}());
