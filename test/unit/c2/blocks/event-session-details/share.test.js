import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderShare } from '../../../../../event-libs/v1/c2/blocks/event-session-details/share.js';
import { toasts } from '../../../../../event-libs/v1/features/toast/toast.js';

const tick = () => new Promise((r) => { setTimeout(r); });

describe('session-details share', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    toasts.value = [];
  });

  afterEach(() => {
    delete navigator.share;
    delete navigator.clipboard;
  });

  it('renders a share button', () => {
    const btn = renderShare();
    expect(btn.classList.contains('session-share')).to.be.true;
    expect(btn.getAttribute('aria-label')).to.equal('Share');
    expect(btn.querySelector('svg')).to.not.be.null;
  });

  it('uses native share with the url + title metadata', async () => {
    setMetadata('url', 'https://example.com/s');
    setMetadata('title', 'My Session');
    let shared;
    Object.defineProperty(navigator, 'share', {
      value: async (data) => { shared = data; }, configurable: true, writable: true,
    });
    renderShare().click();
    await tick();
    expect(shared).to.deep.equal({ url: 'https://example.com/s', title: 'My Session' });
  });

  it('falls back to clipboard + toast when native share is unavailable', async () => {
    setMetadata('url', 'https://example.com/s');
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
    let copied;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (t) => { copied = t; } }, configurable: true, writable: true,
    });
    renderShare().click();
    await tick();
    expect(copied).to.equal('https://example.com/s');
    expect(toasts.value[0]?.message).to.equal('Link copied to clipboard');
  });
});
