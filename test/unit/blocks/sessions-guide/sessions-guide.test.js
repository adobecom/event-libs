import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { setEventConfig } from '../../../../event-libs/v1/utils/utils.js';
import { eventConfig } from '../../scripts/mocks/event-config.js';
import init from '../../../../event-libs/v1/blocks/sessions-guide/sessions-guide.js';

const body = await readFile({ path: './mocks/default.html' });

const localMiloLibs = 'http://localhost:2000/test/unit/mocks';
setEventConfig(
  { ...eventConfig, miloConfig: { ...eventConfig.miloConfig, miloLibs: localMiloLibs } },
  { ...eventConfig.miloConfig, miloLibs: localMiloLibs },
);

describe('sessions-guide', () => {
  let el;

  beforeEach(() => {
    document.body.innerHTML = body;
    document.head.innerHTML = '';
    el = document.querySelector('.sessions-guide');
  });

  it('renders .sg-app into the block', async () => {
    await init(el);
    expect(el.querySelector('.sg-app')).to.exist;
  });

  it('sets data-theme attribute from config', async () => {
    await init(el);
    expect(el.dataset.theme).to.equal('dark');
  });

  it('clears the authoring table rows before rendering', async () => {
    await init(el);
    expect(el.querySelectorAll(':scope > div').length).to.equal(0);
  });

  it('renders sessions view immediately (sessions are pre-fetched)', async () => {
    await init(el);
    expect(el.querySelector('.sg-view')).to.exist;
    expect(el.querySelector('.sg-loading')).to.not.exist;
  });
});
