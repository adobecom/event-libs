import { expect } from '@esm-bundle/chai';

import {
  conflict, showConflictModal, hideConflictModal, mountConflictModal,
} from '../../../../event-libs/v1/features/conflict-modal/conflict-modal.js';

// mountConflictModal() is an idempotent, page-level singleton by design (mirrors
// initSessionState()'s `initialized` guard) — like toast.test.js, this file doesn't
// reset document.body between tests since the mount is meant to happen once per page.
describe('utils/conflict-modal', () => {
  beforeEach(() => {
    conflict.value = null;
  });

  it('showConflictModal sets the signal, hideConflictModal clears it', () => {
    const data = { existing: { id: 'a' }, incoming: { id: 'b' }, onConfirm: () => {} };
    showConflictModal(data);
    expect(conflict.value).to.equal(data);
    hideConflictModal();
    expect(conflict.value).to.be.null;
  });

  describe('mountConflictModal', () => {
    let backdrop;
    let modal;

    before(() => {
      mountConflictModal();
      [backdrop, modal] = document.body.querySelectorAll('.sg-modal-backdrop, .sg-conflict-modal');
    });

    it('mounts a hidden backdrop and modal to document.body', () => {
      expect(backdrop).to.exist;
      expect(modal).to.exist;
      expect(modal.hidden).to.be.true;
    });

    it('is idempotent — calling it again does not duplicate the elements', () => {
      mountConflictModal();
      expect(document.body.querySelectorAll('.sg-conflict-modal')).to.have.lengthOf(1);
    });

    it('reveals the modal with existing/incoming titles when a conflict is shown', () => {
      showConflictModal({
        existing: { id: 'a', title: 'Existing session' },
        incoming: { id: 'b', title: 'Incoming session' },
        onConfirm: () => {},
      });
      expect(modal.hidden).to.be.false;
      expect(modal.textContent).to.include('Existing session');
      expect(modal.textContent).to.include('Incoming session');
    });

    it('keeps Save disabled until an option is selected, then invokes onConfirm and hides', async () => {
      const incoming = { id: 'b', title: 'Incoming session' };
      let confirmedWith = null;
      showConflictModal({
        existing: { id: 'a', title: 'Existing session' },
        incoming,
        onConfirm: async (keep) => { confirmedWith = keep; },
      });

      const saveBtn = modal.querySelector('.sg-conflict-modal__btn--save');
      const incomingRadio = modal.querySelector('input[value="incoming"]');
      expect(saveBtn.disabled).to.be.true;

      incomingRadio.checked = true;
      incomingRadio.dispatchEvent(new Event('change'));
      expect(saveBtn.disabled).to.be.false;

      saveBtn.click();
      // The click handler is async — let its microtasks flush before asserting.
      await new Promise((r) => setTimeout(r, 0));

      expect(confirmedWith).to.equal(incoming);
      expect(conflict.value).to.be.null;
      expect(modal.hidden).to.be.true;
    });

    it('Cancel hides the modal without invoking onConfirm', () => {
      let called = false;
      showConflictModal({
        existing: { id: 'a', title: 'Existing session' },
        incoming: { id: 'b', title: 'Incoming session' },
        onConfirm: () => { called = true; },
      });
      modal.querySelector('.sg-conflict-modal__btn--cancel').click();
      expect(called).to.be.false;
      expect(conflict.value).to.be.null;
      expect(modal.hidden).to.be.true;
    });

    it('clicking the backdrop dismisses without invoking onConfirm', () => {
      let called = false;
      showConflictModal({
        existing: { id: 'a', title: 'Existing session' },
        incoming: { id: 'b', title: 'Incoming session' },
        onConfirm: () => { called = true; },
      });
      backdrop.click();
      expect(called).to.be.false;
      expect(conflict.value).to.be.null;
    });
  });
});
