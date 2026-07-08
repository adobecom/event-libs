import { expect } from '@esm-bundle/chai';

import {
  conflict, showConflictModal, hideConflictModal,
} from '../../../../event-libs/v1/features/conflict-modal/conflict-modal.js';

// Prototype: conflict-modal.js now defers rendering to Milo's shared modal
// (dynamic import of `${miloLibs}/blocks/modal/modal.js`), so the DOM-level
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
});
