import { expect } from '@esm-bundle/chai';
import { findA11yViolations, expectAccessible } from './a11y.js';

// Guards the helper itself: a silently no-op axe run would let every
// `expectAccessible` call in the suite pass forever.
describe('a11y helper', () => {
  let el;

  beforeEach(() => {
    document.body.innerHTML = '<div id="fixture"></div>';
    el = document.querySelector('#fixture');
  });

  it('reports a WCAG A violation', async () => {
    el.innerHTML = '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">';
    const violations = await findA11yViolations(el);
    expect(violations.map((v) => v.id)).to.include('image-alt');
  });

  it('passes a conformant fragment', async () => {
    el.innerHTML = '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="A test image">';
    await expectAccessible(el);
  });

  it('throws a report naming the failing rule and node', async () => {
    el.innerHTML = '<button></button>';
    let error;
    try {
      await expectAccessible(el);
    } catch (e) {
      error = e;
    }
    expect(error, 'expectAccessible should have thrown').to.exist;
    expect(error.message).to.include('button-name');
    expect(error.message).to.include('<button></button>');
  });

  it('honours the exclude option', async () => {
    el.innerHTML = '<button></button>';
    await expectAccessible(el, { exclude: ['button-name'] });
  });

  it('ignores axe best-practice rules outside WCAG 2.1 AA', async () => {
    // `heading-order` is best-practice only, so a skipped level must not fail.
    el.innerHTML = '<h1>Title</h1><h3>Skipped a level</h3>';
    await expectAccessible(el);
  });
});
