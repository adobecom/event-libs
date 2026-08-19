import { expect } from '@esm-bundle/chai';
import decorateArea from '../../../event-libs/v1/utils/decorate.js';

function waitForStylesheet() {
  const link = document.getElementById('event-libs-styles');
  if (link.sheet) return Promise.resolve();
  return new Promise((resolve) => { link.addEventListener('load', resolve, { once: true }); });
}

describe('section grid layout (CSS)', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    decorateArea();
    await waitForStylesheet();
  });

  const top = (id) => document.getElementById(id).getBoundingClientRect().top;
  const left = (id) => document.getElementById(id).getBoundingClientRect().left;

  it('stacks each column independently, not coupled to the other column\'s row count', () => {
    document.body.innerHTML = `
      <main>
        <div class="section grid grid-tablet-2-1">
          <div class="grid-col-1" id="a" style="height:40px"></div>
          <div class="grid-col-1" id="b" style="height:40px"></div>
          <div class="grid-col-2" id="c" style="height:40px"></div>
          <div class="grid-col-2" id="d" style="height:40px"></div>
        </div>
      </main>
    `;

    expect(top('c')).to.equal(top('a'));
    expect(top('d')).to.equal(top('b'));
    expect(left('c')).to.be.greaterThan(left('a'));
  });

  it('does not misplace a shorter column when the other column has more blocks', () => {
    document.body.innerHTML = `
      <main>
        <div class="section grid grid-tablet-2-1">
          <div class="grid-col-1" id="a" style="height:40px"></div>
          <div class="grid-col-1" id="b" style="height:40px"></div>
          <div class="grid-col-1" id="e" style="height:40px"></div>
          <div class="grid-col-2" id="c" style="height:40px"></div>
        </div>
      </main>
    `;

    expect(top('c')).to.equal(top('a'));
    expect(top('b')).to.be.greaterThan(top('a'));
    expect(top('e')).to.be.greaterThan(top('b'));
  });

  it('untagged blocks default to column 1', () => {
    document.body.innerHTML = `
      <main>
        <div class="section grid grid-tablet-2-1">
          <div id="a" style="height:40px"></div>
          <div class="grid-col-2" id="c" style="height:40px"></div>
        </div>
      </main>
    `;

    expect(left('a')).to.be.lessThan(left('c'));
  });

  it('gives truly independent column heights when each column is a real nested container (grid-column + fragment), not flat tagged siblings', () => {
    document.body.innerHTML = `
      <main>
        <div class="section grid grid-tablet-2-1">
          <div class="grid-column grid-col-1" id="col1">
            <div class="fragment">
              <div style="height:40px"></div>
              <div style="height:40px"></div>
              <div style="height:40px"></div>
            </div>
          </div>
          <div class="grid-column grid-col-2" id="col2">
            <div class="fragment">
              <div style="height:200px"></div>
            </div>
          </div>
        </div>
      </main>
    `;

    const col1 = document.getElementById('col1').getBoundingClientRect();
    const col2 = document.getElementById('col2').getBoundingClientRect();

    expect(col1.height).to.equal(120);
    expect(col2.height).to.equal(200);
    expect(col1.bottom).to.be.lessThan(col2.bottom);
  });

  it('excludes the section-background element from the default grid-column assignment', () => {
    document.body.innerHTML = `
      <main>
        <div class="section grid grid-tablet-2-1">
          <picture class="section-background"></picture>
          <div id="a" style="height:40px"></div>
        </div>
      </main>
    `;

    const background = document.querySelector('.section-background');
    expect(getComputedStyle(background).gridColumnStart).to.equal('auto');
    expect(getComputedStyle(document.getElementById('a')).gridColumnStart).to.equal('1');
  });

  it('caps .section.container-desktop width at the same breakpoint the grid stops being single-column', () => {
    document.body.innerHTML = `
      <main style="width: 1400px">
        <div class="section container-desktop" id="capped"></div>
        <div class="section" id="plain"></div>
      </main>
    `;

    const capped = getComputedStyle(document.getElementById('capped'));
    const plain = getComputedStyle(document.getElementById('plain'));

    expect(capped.maxWidth).to.equal('none');
    expect(parseFloat(capped.paddingLeft)).to.be.greaterThan(0);
    expect(parseFloat(plain.paddingLeft)).to.equal(0);
  });

  it('applies a different ratio per breakpoint when several are authored on the same section', () => {
    document.body.innerHTML = `
      <main style="width: 900px">
        <div class="section grid grid-tablet-90-10 grid-laptop-70-30 grid-desktop-50-50" id="s">
          <div class="grid-col-1" id="a" style="height:40px"></div>
          <div class="grid-col-2" id="b" style="height:40px"></div>
        </div>
      </main>
    `;

    const cols = getComputedStyle(document.getElementById('s')).gridTemplateColumns
      .trim().split(/\s+/).map(parseFloat);
    const ratio = cols[0] / cols[1];

    if (window.matchMedia('(min-width: 1440px)').matches) {
      expect(ratio).to.be.closeTo(1, 0.1);
    } else if (window.matchMedia('(min-width: 1024px) and (max-width: 1439px)').matches) {
      expect(ratio).to.be.closeTo(7 / 3, 0.3);
    } else {
      expect(window.matchMedia('(min-width: 768px) and (max-width: 1023px)').matches).to.be.true;
      expect(ratio).to.be.closeTo(9, 0.5);
    }
  });

  function findMediaRule(conditionText) {
    const { cssRules } = document.getElementById('event-libs-styles').sheet;
    return [...cssRules].find((rule) => rule.media && rule.conditionText === conditionText);
  }

  it('scopes grid-laptop-* to 1024–1439px and grid-desktop-* to 1440px and up', () => {
    const laptop = findMediaRule('(min-width: 1024px) and (max-width: 1439px)');
    const desktop = findMediaRule('(min-width: 1440px)');

    expect(laptop, 'laptop tier media rule').to.exist;
    expect(desktop, 'desktop tier media rule').to.exist;
    expect([...laptop.cssRules].some((r) => r.selectorText === '.section.grid.grid-laptop-70-30')).to.be.true;
    expect([...desktop.cssRules].some((r) => r.selectorText === '.section.grid.grid-desktop-70-30')).to.be.true;
    expect([...laptop.cssRules].some((r) => r.selectorText === '.section.grid.grid-desktop-70-30')).to.be.false;
    expect([...desktop.cssRules].some((r) => r.selectorText === '.section.grid.grid-laptop-70-30')).to.be.false;
  });

  it('hides .desktop-only below 768px and .mobile-only at 768px and up', () => {
    const mobile = findMediaRule('(max-width: 767px)');
    const notMobile = findMediaRule('(min-width: 768px)');

    expect(mobile, 'mobile-range media rule').to.exist;
    expect(notMobile, 'non-mobile-range media rule').to.exist;

    const desktopOnly = [...mobile.cssRules].find((r) => r.selectorText === '.desktop-only');
    const mobileOnly = [...notMobile.cssRules].find((r) => r.selectorText === '.mobile-only');

    expect(desktopOnly, '.desktop-only rule').to.exist;
    expect(mobileOnly, '.mobile-only rule').to.exist;
    expect(desktopOnly.style.display).to.equal('none');
    expect(desktopOnly.style.getPropertyPriority('display')).to.equal('important');
    expect(mobileOnly.style.display).to.equal('none');
    expect(mobileOnly.style.getPropertyPriority('display')).to.equal('important');
  });

  it('shows .mobile-only and hides .desktop-only at the current (non-mobile) test viewport, even when another rule sets display', () => {
    document.body.innerHTML = `
      <div class="mobile-only" id="mo" style="display: flex">mobile</div>
      <div class="desktop-only" id="do" style="display: flex">desktop</div>
    `;

    expect(getComputedStyle(document.getElementById('mo')).display).to.equal('none');
    expect(getComputedStyle(document.getElementById('do')).display).to.equal('flex');
  });
});
