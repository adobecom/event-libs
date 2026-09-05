import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../../../../event-libs/v1/c2/blocks/in-person-banner/in-person-banner.js';
import BlockMediator from '../../../../../event-libs/v1/deps/block-mediator.min.js';

const DISMISSED_STORAGE_KEY = 'in-person-banner:dismissed';

function setMeta(name, content) {
  const meta = document.createElement('meta');
  meta.setAttribute('name', name);
  meta.setAttribute('content', content);
  document.head.append(meta);
}

/**
 * Builds the authored block DOM. `config` rows are key/value pairs; the message is the
 * content cell. When only a message is given (no config), it becomes the sole cell.
 */
function buildBlock({ config = {}, message = 'Register for in-person access.' } = {}) {
  const el = document.createElement('div');
  el.className = 'in-person-banner';

  Object.entries(config).forEach(([key, value]) => {
    const row = document.createElement('div');
    const keyCell = document.createElement('div');
    keyCell.textContent = key;
    const valueCell = document.createElement('div');
    valueCell.textContent = value;
    row.append(keyCell, valueCell);
    el.append(row);
  });

  const messageRow = document.createElement('div');
  const messageCell = document.createElement('div');
  messageCell.innerHTML = message;
  messageRow.append(messageCell);
  el.append(messageRow);

  document.body.append(el);
  return el;
}

// init fires an async .then() for gated modes; let those microtasks settle before asserting.
const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

const signedInProfile = { account_type: 'type1', first_name: 'Ada', userId: 'u-1' };
const signedOutProfile = { noProfile: true };
const guestProfile = { account_type: 'guest' };

describe('in-person-banner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    window.localStorage.clear();
    window.lana = { log: sinon.stub() };
    // BlockMediator is a shared singleton with no delete; reset the key we depend on.
    BlockMediator.set('imsProfile', undefined);
    delete window.events;
  });

  afterEach(() => {
    sinon.restore();
    delete window.events;
  });

  describe('audience: all (default)', () => {
    it('renders immediately for everyone, synchronously (no await needed)', () => {
      const el = buildBlock({ message: 'Everyone sees this.' });
      init(el);
      // Rendered in the same tick — init is synchronous for `all`.
      const inner = el.querySelector('.in-person-banner-inner');
      expect(inner).to.exist;
      expect(el.hidden).to.be.false;
      expect(inner.textContent).to.contain('Everyone sees this.');
    });

    it('defaults to `all` when no audience/rf-data-check is authored', async () => {
      const el = buildBlock();
      init(el);
      await flush();
      expect(el.querySelector('.in-person-banner-inner')).to.exist;
    });

    it('sets a light/dark theme dataset from the block class', () => {
      const el = buildBlock();
      el.classList.add('dark');
      init(el);
      expect(el.dataset.theme).to.equal('dark');
    });
  });

  describe('dismissal', () => {
    it('removes the banner without rendering when already dismissed', () => {
      window.localStorage.setItem(
        DISMISSED_STORAGE_KEY,
        JSON.stringify({ 'promo-1': true }),
      );
      const el = buildBlock({ config: { 'banner-id': 'promo-1' } });
      init(el);
      expect(el.isConnected).to.be.false;
    });

    it('persists dismissal and removes the banner when the close button is clicked', () => {
      const el = buildBlock({ config: { 'banner-id': 'promo-1' } });
      init(el);
      el.querySelector('.in-person-banner-close').click();
      expect(el.isConnected).to.be.false;
      const stored = JSON.parse(window.localStorage.getItem(DISMISSED_STORAGE_KEY));
      expect(stored['promo-1']).to.be.true;
    });

    it('does not persist dismissal when no banner-id is authored', () => {
      const el = buildBlock();
      init(el);
      el.querySelector('.in-person-banner-close').click();
      expect(el.isConnected).to.be.false;
      expect(window.localStorage.getItem(DISMISSED_STORAGE_KEY)).to.be.null;
    });
  });

  describe('audience: signed-in', () => {
    it('does not block init: returns synchronously with the banner hidden', () => {
      BlockMediator.set('imsProfile', signedInProfile);
      const el = buildBlock({ config: { audience: 'signed-in' } });
      init(el);
      // Still hidden in the same tick — the sign-in check runs off the critical path.
      expect(el.hidden).to.be.true;
      expect(el.querySelector('.in-person-banner-inner')).to.be.null;
    });

    it('reveals the banner for a signed-in user', async () => {
      BlockMediator.set('imsProfile', signedInProfile);
      const el = buildBlock({ config: { audience: 'signed-in' } });
      init(el);
      await flush();
      expect(el.hidden).to.be.false;
      expect(el.querySelector('.in-person-banner-inner')).to.exist;
    });

    it('removes the banner for a signed-out user', async () => {
      BlockMediator.set('imsProfile', signedOutProfile);
      const el = buildBlock({ config: { audience: 'signed-in' } });
      init(el);
      await flush();
      expect(el.isConnected).to.be.false;
    });

    it('treats a guest account as signed-out', async () => {
      BlockMediator.set('imsProfile', guestProfile);
      const el = buildBlock({ config: { audience: 'signed-in' } });
      init(el);
      await flush();
      expect(el.isConnected).to.be.false;
    });

    it('waits for a late imsProfile, then reveals once it resolves signed-in', async () => {
      // imsProfile is unset at init time; the block subscribes and waits.
      const el = buildBlock({ config: { audience: 'signed-in' } });
      init(el);
      await flush();
      expect(el.hidden).to.be.true;
      expect(el.querySelector('.in-person-banner-inner')).to.be.null;

      BlockMediator.set('imsProfile', signedInProfile);
      await flush();
      expect(el.hidden).to.be.false;
      expect(el.querySelector('.in-person-banner-inner')).to.exist;
    });
  });

  describe('audience: in-person', () => {
    function stubRegistration(status) {
      window.events = { getRegistrationStatus: sinon.stub().resolves(status) };
    }

    it('reveals for a signed-in, confirmed in-person attendee', async () => {
      BlockMediator.set('imsProfile', signedInProfile);
      stubRegistration({ isRegistered: true, inPersonAttendee: true });
      const el = buildBlock({ config: { audience: 'in-person' } });
      init(el);
      await flush();
      expect(el.hidden).to.be.false;
      expect(el.querySelector('.in-person-banner-inner')).to.exist;
    });

    it('removes for a signed-in user who is not an in-person attendee', async () => {
      BlockMediator.set('imsProfile', signedInProfile);
      stubRegistration({ isRegistered: true, inPersonAttendee: false });
      const el = buildBlock({ config: { audience: 'in-person' } });
      init(el);
      await flush();
      expect(el.isConnected).to.be.false;
    });

    it('removes for a signed-in user who is not registered', async () => {
      BlockMediator.set('imsProfile', signedInProfile);
      stubRegistration({ isRegistered: false, inPersonAttendee: true });
      const el = buildBlock({ config: { audience: 'in-person' } });
      init(el);
      await flush();
      expect(el.isConnected).to.be.false;
    });

    it('never checks registration for a signed-out user', async () => {
      BlockMediator.set('imsProfile', signedOutProfile);
      const getStatus = sinon.stub().resolves({ isRegistered: true, inPersonAttendee: true });
      window.events = { getRegistrationStatus: getStatus };
      const el = buildBlock({ config: { audience: 'in-person' } });
      init(el);
      await flush();
      expect(el.isConnected).to.be.false;
      expect(getStatus.called).to.be.false;
    });

    it('fails closed (removes) when window.events is unavailable', async () => {
      BlockMediator.set('imsProfile', signedInProfile);
      // window.events left undefined
      const el = buildBlock({ config: { audience: 'in-person' } });
      init(el);
      await flush();
      expect(el.isConnected).to.be.false;
    });

    it('fails closed and logs when getRegistrationStatus rejects', async () => {
      BlockMediator.set('imsProfile', signedInProfile);
      window.events = { getRegistrationStatus: sinon.stub().rejects(new Error('boom')) };
      const el = buildBlock({ config: { audience: 'in-person' } });
      init(el);
      await flush();
      expect(el.isConnected).to.be.false;
      expect(window.lana.log.called).to.be.true;
    });
  });

  describe('legacy rf-data-check', () => {
    it('maps rf-data-check:true onto in-person', async () => {
      BlockMediator.set('imsProfile', signedInProfile);
      window.events = {
        getRegistrationStatus: sinon.stub().resolves({ isRegistered: true, inPersonAttendee: false }),
      };
      const el = buildBlock({ config: { 'rf-data-check': 'true' } });
      init(el);
      await flush();
      // in-person gate → not an in-person attendee → removed.
      expect(el.isConnected).to.be.false;
    });

    it('is ignored (behaves as `all`) when rf-data-check is not true', () => {
      const el = buildBlock({ config: { 'rf-data-check': 'false' } });
      init(el);
      expect(el.querySelector('.in-person-banner-inner')).to.exist;
    });

    it('lets an explicit audience win over rf-data-check', async () => {
      BlockMediator.set('imsProfile', signedInProfile);
      const el = buildBlock({ config: { audience: 'signed-in', 'rf-data-check': 'true' } });
      init(el);
      await flush();
      // signed-in wins → shows without needing window.events.
      expect(el.hidden).to.be.false;
      expect(el.querySelector('.in-person-banner-inner')).to.exist;
    });
  });

  describe('config via page metadata', () => {
    it('reads audience from a meta tag when not authored in the block', async () => {
      setMeta('audience', 'signed-in');
      BlockMediator.set('imsProfile', signedOutProfile);
      const el = buildBlock();
      init(el);
      await flush();
      expect(el.isConnected).to.be.false;
    });
  });

  describe('nav-overlay', () => {
    it('prepends the banner to the body and adds the overlay class when true', () => {
      const el = buildBlock({ config: { 'nav-overlay': 'true' } });
      init(el);
      expect(el.classList.contains('in-person-banner-nav-overlay')).to.be.true;
      expect(document.body.firstElementChild).to.equal(el);
    });

    it('leaves the banner inline without the overlay class when false', () => {
      const el = buildBlock({ config: { 'nav-overlay': 'false' } });
      init(el);
      expect(el.classList.contains('in-person-banner-nav-overlay')).to.be.false;
    });
  });

  describe('malformed authoring', () => {
    it('no-ops when there is no content cell', () => {
      const el = document.createElement('div');
      el.className = 'in-person-banner';
      document.body.append(el);
      init(el);
      expect(el.querySelector('.in-person-banner-inner')).to.be.null;
    });
  });
});
