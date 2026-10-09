import { expect } from '@esm-bundle/chai';

import {
  conflict, showConflictModal, hideConflictModal, getMiloModalPath,
} from '../../../../event-libs/v1/features/conflict-modal/conflict-modal.js';

// Prototype: conflict-modal.js now defers rendering to Milo's shared modal
// (dynamic import of the page's Milo modal module), so the DOM-level
// behavior (radio selection, save/cancel, backdrop dismiss, focus trap, etc.)
// is no longer unit-testable here without mocking that import — it needs a
// real browser + real Milo to exercise, which is exactly what's being tried
// manually before this lands. This file only covers the synchronous part of
// the contract: the `conflict` signal is still set/cleared as before.
describe('features/conflict-modal (Milo modal prototype)', () => {
  beforeEach(() => {
    conflict.value = null;
  });

  it('showConflictModal sets the signal synchronously', () => {
    const data = { existing: { id: 'a' }, incoming: { id: 'b' }, onConfirm: () => {} };
    showConflictModal(data).catch(() => { /* Milo modal unavailable in the test harness */ });
    expect(conflict.value).to.equal(data);
  });

  it('hideConflictModal clears the signal when no dialog is open', async () => {
    conflict.value = { existing: {}, incoming: {}, onConfirm: () => {} };
    await hideConflictModal();
    expect(conflict.value).to.be.null;
  });

  // Regression (MWPW-210384): the classic module on a C2 page doubled every modal link.
  describe('getMiloModalPath', () => {
    afterEach(() => {
      document.head.querySelector('meta[name="foundation"]')?.remove();
    });

    it('loads the C2 modal module on a foundation: c2 page', () => {
      document.head.insertAdjacentHTML('beforeend', '<meta name="foundation" content="c2">');
      expect(getMiloModalPath('/libs')).to.equal('/libs/c2/blocks/modal/modal.js');
    });

    it('loads the classic modal module everywhere else', () => {
      expect(getMiloModalPath('/libs')).to.equal('/libs/blocks/modal/modal.js');
    });
  });
});
