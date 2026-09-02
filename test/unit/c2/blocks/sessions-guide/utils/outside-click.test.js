import { expect } from '@esm-bundle/chai';
import { sendMouse } from '@web/test-runner-commands';
import { isOutsideClick } from '../../../../../../event-libs/v1/c2/blocks/sessions-guide/utils/outside-click.js';

describe('sessions-guide/utils/outside-click', () => {
  let wrap;
  let inside;
  let outside;

  beforeEach(() => {
    wrap = document.createElement('div');
    inside = document.createElement('button');
    wrap.appendChild(inside);
    document.body.appendChild(wrap);

    outside = document.createElement('button');
    document.body.appendChild(outside);
  });

  afterEach(() => {
    wrap.remove();
    outside.remove();
  });

  it('is a click-away when the target sits outside the wrap', () => {
    expect(isOutsideClick(wrap, outside)).to.be.true;
  });

  it('is not a click-away for the wrap itself or its descendants', () => {
    expect(isOutsideClick(wrap, wrap)).to.be.false;
    expect(isOutsideClick(wrap, inside)).to.be.false;
  });

  // The regression: the filter panel's mobile drill-down replaces the tapped category row
  // during the same click dispatch, so the bubble-phase document listener sees a target
  // that is no longer in the document. Reading that as "outside" dismissed the panel.
  it('is not a click-away when the target was detached mid-dispatch', () => {
    inside.remove();
    expect(inside.isConnected).to.be.false;
    expect(isOutsideClick(wrap, inside)).to.be.false;
  });

  it('is not a click-away with no wrap or no target', () => {
    expect(isOutsideClick(null, outside)).to.be.false;
    expect(isOutsideClick(wrap, null)).to.be.false;
  });

  // Pins down the browser behaviour the guard exists for: a microtask-scheduled re-render
  // (which is how Preact flushes state) detaches the tapped node before the event finishes
  // bubbling to `document`, so the naive contains() check really does see it as outside.
  //
  // This needs a real input event — sendMouse drives it over CDP. A scripted
  // `dispatchEvent()` runs the whole dispatch inside the caller's JS stack, so no microtask
  // checkpoint happens between listeners and the bug cannot reproduce that way.
  it('guards the real detach-before-bubble ordering', async () => {
    let naiveSaidOutside;
    let guardSaidOutside;

    Object.assign(wrap.style, {
      position: 'fixed', top: '0', left: '0', width: '200px', height: '80px', zIndex: '9999',
    });
    Object.assign(inside.style, { width: '200px', height: '80px' });

    inside.addEventListener('click', () => {
      Promise.resolve().then(() => inside.remove());
    });
    const onDocClick = (e) => {
      naiveSaidOutside = !wrap.contains(e.target);
      guardSaidOutside = isOutsideClick(wrap, e.target);
    };
    document.addEventListener('click', onDocClick);

    const { left, top, width, height } = inside.getBoundingClientRect();
    await sendMouse({
      type: 'click',
      position: [Math.floor(left + width / 2), Math.floor(top + height / 2)],
    });
    document.removeEventListener('click', onDocClick);

    expect(naiveSaidOutside).to.be.true;
    expect(guardSaidOutside).to.be.false;
  });
});
