import { expect } from '@esm-bundle/chai';
import { trapFocus } from '../../../../../event-libs/v1/blocks/sessions-guide/utils/focus-trap.js';

function fireTab({ shiftKey = false } = {}) {
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Tab', shiftKey, bubbles: true, cancelable: true,
  }));
}

function fireEscape() {
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape', bubbles: true, cancelable: true,
  }));
}

describe('sessions-guide/utils/focus-trap', () => {
  let container;
  let outsideButton;

  beforeEach(() => {
    outsideButton = document.createElement('button');
    outsideButton.textContent = 'outside';
    document.body.appendChild(outsideButton);

    container = document.createElement('div');
    container.innerHTML = `
      <button id="first">First</button>
      <button id="middle">Middle</button>
      <button id="last">Last</button>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    outsideButton.remove();
  });

  it('focuses the first focusable element on activation', () => {
    trapFocus(container);
    expect(document.activeElement.id).to.equal('first');
  });

  it('wraps Tab from the last focusable back to the first', () => {
    trapFocus(container);
    container.querySelector('#last').focus();
    fireTab();
    expect(document.activeElement.id).to.equal('first');
  });

  it('wraps Shift+Tab from the first focusable back to the last', () => {
    trapFocus(container);
    container.querySelector('#first').focus();
    fireTab({ shiftKey: true });
    expect(document.activeElement.id).to.equal('last');
  });

  it('does not interfere with Tab between two non-boundary elements', () => {
    trapFocus(container);
    container.querySelector('#middle').focus();
    fireTab();
    // Not prevented, so focus stays put in this test (jsdom doesn't run browser tab order) —
    // just confirms the boundary-only guard didn't throw or force a jump.
    expect(document.activeElement.id).to.equal('middle');
  });

  it('calls onEscape when Escape is pressed', () => {
    let escaped = false;
    trapFocus(container, () => { escaped = true; });
    fireEscape();
    expect(escaped).to.be.true;
  });

  it('restores focus to the previously-focused element on cleanup', () => {
    outsideButton.focus();
    const cleanup = trapFocus(container);
    expect(document.activeElement.id).to.equal('first');
    cleanup();
    expect(document.activeElement).to.equal(outsideButton);
  });

  it('does not throw when the container has no focusable elements', () => {
    const empty = document.createElement('div');
    document.body.appendChild(empty);
    expect(() => trapFocus(empty)).to.not.throw();
    empty.remove();
  });

  it('returns a no-op cleanup when containerEl is null', () => {
    const cleanup = trapFocus(null);
    expect(() => cleanup()).to.not.throw();
  });
});
