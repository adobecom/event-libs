import { expect } from '@esm-bundle/chai';
import { setMetadata } from '../../../../../event-libs/v1/utils/utils.js';
import { renderShare } from '../../../../../event-libs/v1/c2/blocks/event-session-details/share.js';
import { toast } from '../../../../../event-libs/v1/features/toast/toast.js';

const tick = () => new Promise((r) => { setTimeout(r); });

describe('session-details share', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    toast.value = null;
  });

  afterEach(() => {
    delete navigator.share;
    delete navigator.clipboard;
  });

  it('renders a share button', () => {
    const btn = renderShare();
    expect(btn.classList.contains('session-share')).to.be.true;
    expect(btn.getAttribute('aria-label')).to.equal('Share');
    expect(btn.getAttribute('daa-ll')).to.equal('Share');
    expect(btn.querySelector('svg')).to.not.be.null;
  });

  const stubClipboard = (writeText) => Object.defineProperty(navigator, 'clipboard', {
    value: { writeText }, configurable: true, writable: true,
  });

  it('copies the url metadata and confirms with a toast', async () => {
    setMetadata('url', 'https://example.com/s');
    let copied;
    stubClipboard(async (t) => { copied = t; });
    renderShare().click();
    await tick();
    expect(copied).to.equal('https://example.com/s');
    expect(toast.value?.message).to.equal('Link copied to clipboard');
    expect(toast.value?.variant).to.equal('positive');
  });

  it('falls back to the current location when url metadata is absent', async () => {
    let copied;
    stubClipboard(async (t) => { copied = t; });
    renderShare().click();
    await tick();
    expect(copied).to.equal(window.location.href);
  });

  // MWPW-205502: the native sheet offered a long list of OS targets and resolved without ever
  // reaching a toast, so a successful share gave no feedback. It is deliberately not used.
  it('ignores navigator.share even when the browser supports it', async () => {
    setMetadata('url', 'https://example.com/s');
    let shared = false;
    Object.defineProperty(navigator, 'share', {
      value: async () => { shared = true; }, configurable: true, writable: true,
    });
    let copied;
    stubClipboard(async (t) => { copied = t; });
    renderShare().click();
    await tick();
    expect(shared).to.be.false;
    expect(copied).to.equal('https://example.com/s');
    expect(toast.value?.message).to.equal('Link copied to clipboard');
  });

  it('shows a negative toast when the clipboard write rejects', async () => {
    setMetadata('url', 'https://example.com/s');
    stubClipboard(async () => { throw new Error('denied'); });
    renderShare().click();
    await tick();
    expect(toast.value?.message).to.equal('Could not copy link');
    expect(toast.value?.variant).to.equal('negative');
  });

  it('shows a negative toast when the clipboard API is missing entirely', async () => {
    setMetadata('url', 'https://example.com/s');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true });
    renderShare().click();
    await tick();
    expect(toast.value?.message).to.equal('Could not copy link');
    expect(toast.value?.variant).to.equal('negative');
  });
});
