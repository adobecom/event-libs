import { expect } from '@esm-bundle/chai';
import { trackAnalyticsEvent, toDaaLh, sessionDaaLh } from '../../../event-libs/v1/utils/analytics.js';

describe('utils/analytics daa-lh helpers', () => {
  it('names a session as code|title, code first', () => {
    expect(sessionDaaLh({ sessionCode: 'GS2-0', title: 'Inspiration Keynote - ASL' })).to.equal('GS2-0|Inspiration Keynote - ASL');
  });

  it('keeps the title verbatim but replaces pipes and collapses whitespace', () => {
    expect(sessionDaaLh({ sessionCode: 'S1', title: '  Design | Code:\n Ship ' })).to.equal('S1|Design - Code: Ship');
  });

  it('skips missing parts and returns undefined when nothing is left', () => {
    expect(sessionDaaLh({ title: 'Only a title' })).to.equal('Only a title');
    expect(sessionDaaLh({})).to.equal(undefined);
    expect(sessionDaaLh(undefined)).to.equal(undefined);
    expect(toDaaLh('', null, ' ')).to.equal(undefined);
    expect(toDaaLh('Adobe Firefly')).to.equal('Adobe Firefly');
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
