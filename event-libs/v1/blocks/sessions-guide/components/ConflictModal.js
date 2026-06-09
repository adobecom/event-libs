export function buildConflictModal(preact, store) {
  const { html, useState, useEffect } = preact;
  const { useSessionGuide } = store;

  return function ConflictModal() {
    const { state, dispatch } = useSessionGuide();
    const { conflictModal } = state;
    const [selected, setSelected] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      setSelected(null);
      setSaving(false);
    }, [conflictModal]);

    if (!conflictModal) return null;
    const { existing, incoming } = conflictModal;

    function dismiss() {
      dispatch({ type: 'HIDE_CONFLICT' });
    }

    async function save() {
      if (!selected || saving) return;
      setSaving(true);
      try {
        const keep = selected === 'incoming' ? incoming : existing;
        const remove = selected === 'incoming' ? existing : incoming;
        await conflictModal.onConfirm(keep, remove);
      } finally {
        setSaving(false);
        dispatch({ type: 'HIDE_CONFLICT' });
      }
    }

    return html`
      <div class="sg-modal-backdrop" onclick=${dismiss} aria-hidden="true"></div>
      <div class="sg-conflict-modal" role="dialog" aria-modal="true" aria-label="Schedule conflict">
        <h3 class="sg-conflict-modal__title">Schedule Conflict</h3>
        <p class="sg-conflict-modal__desc">These sessions overlap. Choose which one to keep.</p>
        <div class="sg-conflict-modal__options">
          <label class=${'sg-conflict-option' + (selected === 'existing' ? ' sg-conflict-option--selected' : '')}>
            <input type="radio" name="sg-conflict" value="existing" onchange=${() => setSelected('existing')} />
            <div class="sg-conflict-option__body">
              <span class="sg-conflict-option__badge">Currently scheduled</span>
              <p class="sg-conflict-option__title">${existing.title}</p>
            </div>
          </label>
          <label class=${'sg-conflict-option' + (selected === 'incoming' ? ' sg-conflict-option--selected' : '')}>
            <input type="radio" name="sg-conflict" value="incoming" onchange=${() => setSelected('incoming')} />
            <div class="sg-conflict-option__body">
              <span class="sg-conflict-option__badge">New session</span>
              <p class="sg-conflict-option__title">${incoming.title}</p>
            </div>
          </label>
        </div>
        <div class="sg-conflict-modal__footer">
          <button class="sg-conflict-modal__btn sg-conflict-modal__btn--cancel" onclick=${dismiss} type="button">Cancel</button>
          <button
            class="sg-conflict-modal__btn sg-conflict-modal__btn--save"
            onclick=${save}
            disabled=${!selected || saving}
            type="button"
          >${saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    `;
  };
}
