import { expect } from '@esm-bundle/chai';
import { trackAnalyticsEvent, withDaaLlTitle } from '../../../event-libs/v1/utils/analytics.js';

describe('utils/analytics withDaaLlTitle', () => {
  // Milo's own rule for an existing daa-ll (martech/attributes.js decorateDefaultLinkAnalytics).
  const miloProcess = (daaLl) => daaLl.split('-').map((part) => (part === '' ? ''
    : part.replace(/[^\u00C0-\u1FFF\u2C00-\uD7FF\w]+/g, ' ').replace(/^_+|_+$/g, '').trim().slice(0, 20))).join('-');

  it('appends the title with Milo\'s -- separator', () => {
    expect(withDaaLlTitle('Session-Card-Open', 'Opening Keynote')).to.equal('Session-Card-Open--Opening Keynote');
  });

  it('cleans and shortens the title like Milo: punctuation to spaces, 20 characters', () => {
    expect(withDaaLlTitle('Watch-Now', 'Photoshop First Look: New Features and Beyond'))
      .to.equal('Watch-Now--Photoshop First Look');
    expect(withDaaLlTitle('Watch-Now', 'A.COM Adobe Live Test Session')).to.equal('Watch-Now--A COM Adobe Live Tes');
  });

  it('is left unchanged when Milo re-processes it, including titles with dashes or pipes', () => {
    [
      'Build Worlds Faster: A Hybrid AI Workflow in Photoshop',
      'A Hands-on Guide to Real-time AI',
      'Design | Code -- Ship',
      '  __Leading underscores__ ',
    ].forEach((title) => {
      const label = withDaaLlTitle('Add-to-Favorites-Live-Sessions', title);
      expect(miloProcess(label)).to.equal(label);
    });
  });

  it('keeps the plain label when there is no usable title', () => {
    expect(withDaaLlTitle('Add-to-Schedule', '')).to.equal('Add-to-Schedule');
    expect(withDaaLlTitle('Add-to-Schedule', undefined)).to.equal('Add-to-Schedule');
    expect(withDaaLlTitle('Add-to-Schedule', '!!! ---')).to.equal('Add-to-Schedule');
  });
});

describe('utils/analytics trackAnalyticsEvent', () => {
  let originalSatellite;
  let originalLog;
  let logged;

  beforeEach(() => {
    // eslint-disable-next-line no-underscore-dangle
    originalSatellite = window._satellite;
    originalLog = window.lana.log;
    logged = [];
    window.lana.log = (msg) => logged.push(msg);
  });

  afterEach(() => {
    // eslint-disable-next-line no-underscore-dangle
    window._satellite = originalSatellite;
    window.lana.log = originalLog;
  });

  it('sends a link-click event through Launch when it is loaded', () => {
    const calls = [];
    // eslint-disable-next-line no-underscore-dangle
    window._satellite = { track: (...args) => calls.push(args) };
    trackAnalyticsEvent('Toast-Register-Sign-In-Open | favorite');
    expect(calls).to.deep.equal([['event', {
      xdm: {},
      data: { web: { webInteraction: { name: 'Toast-Register-Sign-In-Open | favorite' } } },
    }]]);
  });

  it('waits for the first alloy event when Launch has not loaded yet', () => {
    // eslint-disable-next-line no-underscore-dangle
    window._satellite = undefined;
    trackAnalyticsEvent('Late-Event');
    const calls = [];
    // eslint-disable-next-line no-underscore-dangle
    window._satellite = { track: (...args) => calls.push(args) };
    window.dispatchEvent(new Event('alloy_sendEvent'));
    window.dispatchEvent(new Event('alloy_sendEvent'));
    expect(calls.length).to.equal(1);
  });

  it('logs instead of throwing when Launch fails', () => {
    // eslint-disable-next-line no-underscore-dangle
    window._satellite = { track: () => { throw new Error('boom'); } };
    expect(() => trackAnalyticsEvent('Broken', 'test-scope')).to.not.throw();
    expect(logged.length).to.equal(1);
  });
});
