import { expect } from '@esm-bundle/chai';
import markMobileRiderForLaunch from '../../../event-libs/v1/utils/mr-launch-marker.js';

const MR_SCHEDULE = [{ title: 'pre', pathToFragment: '/a' }, { title: 'live', mobileRider: { videoId: 'x' }, pathToFragment: '/b' }];
const PLAIN_SCHEDULE = [{ title: 'pre', pathToFragment: '/a' }];

const chronoBox = (key, value) => `<div class="chrono-box"><div><div>${key}</div><div>${value}</div></div></div>`;
const markers = () => document.querySelectorAll('.mr-launch-marker');

describe('markMobileRiderForLaunch', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('adds one hidden .mobileRider_container marker for a mobile-rider block', () => {
    document.body.innerHTML = '<main><div class="mobile-rider"></div></main>';
    markMobileRiderForLaunch(document.querySelector('main'));
    const [marker] = markers();
    expect(marker.classList.contains('mobileRider_container')).to.be.true;
    expect(marker.hidden).to.be.true;
    expect(marker.getAttribute('aria-hidden')).to.equal('true');
    expect(marker.parentElement).to.equal(document.body);
  });

  it('accepts the mobile-rider block itself as the area', () => {
    document.body.innerHTML = '<div class="mobile-rider"></div>';
    markMobileRiderForLaunch(document.querySelector('.mobile-rider'));
    expect(markers()).to.have.lengthOf(1);
  });

  it('marks a chrono-box whose schedule-id schedule has mobileRider', () => {
    document.head.innerHTML = `<meta name="schedules" content='${JSON.stringify({ s1: MR_SCHEDULE })}'>`;
    document.body.innerHTML = `<main>${chronoBox('schedule-id', 's1')}</main>`;
    markMobileRiderForLaunch(document);
    expect(markers()).to.have.lengthOf(1);
  });

  it('marks a chrono-box (as the area) with an inline mobileRider schedule', () => {
    document.body.innerHTML = chronoBox('schedule', JSON.stringify(MR_SCHEDULE));
    markMobileRiderForLaunch(document.querySelector('.chrono-box'));
    expect(markers()).to.have.lengthOf(1);
  });

  it('skips chrono-box schedules without mobileRider', () => {
    document.body.innerHTML = `<main>${chronoBox('schedule', JSON.stringify(PLAIN_SCHEDULE))}</main>`;
    markMobileRiderForLaunch(document.querySelector('main'));
    expect(markers()).to.have.lengthOf(0);
  });

  it('skips unparseable or unknown schedules', () => {
    document.head.innerHTML = '<meta name="schedules" content="not json">';
    document.body.innerHTML = `<main>${chronoBox('schedule-id', 's1')}${chronoBox('schedule', '{bad')}</main>`;
    markMobileRiderForLaunch(document.querySelector('main'));
    expect(markers()).to.have.lengthOf(0);
  });

  it('skips areas without players', () => {
    document.body.innerHTML = '<main><div class="marquee"></div></main>';
    markMobileRiderForLaunch(document.querySelector('main'));
    expect(markers()).to.have.lengthOf(0);
  });

  it('does not add a marker when a .mobileRider_container already exists', () => {
    document.body.innerHTML = '<div class="mobileRider_container"></div><div class="mobile-rider"></div>';
    markMobileRiderForLaunch(document);
    expect(markers()).to.have.lengthOf(0);
  });

  it('is idempotent', () => {
    document.body.innerHTML = '<div class="mobile-rider"></div>';
    markMobileRiderForLaunch(document);
    markMobileRiderForLaunch(document);
    expect(markers()).to.have.lengthOf(1);
  });

  it('ignores invalid areas', () => {
    expect(() => markMobileRiderForLaunch(null)).to.not.throw();
    expect(() => markMobileRiderForLaunch({})).to.not.throw();
    expect(markers()).to.have.lengthOf(0);
  });
});
