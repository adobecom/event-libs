import { html } from '../htm-wrapper.js';
import Modal from './Modal.js';

export default function UnsavedChangesModal({ isOpen, onClose, onProceed }) {
  const handleDiscard = () => {
    onProceed();
    onClose();
  };

  return html`
    <${Modal} \
      isOpen=${isOpen} \
      onClose=${onClose} \
      onConfirm=${handleDiscard} \
      confirmText="Discard" \
      cancelText="Cancel" \
      title="Unsaved Changes" \
      showActions=${true} \
      size="small" \
    >
      <div>
        <p>You have unsaved changes. Would you like to discard them?</p>
      </div>
    </${Modal}>
  `;
}
