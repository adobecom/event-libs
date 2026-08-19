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
});
