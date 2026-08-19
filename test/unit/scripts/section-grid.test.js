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
});
