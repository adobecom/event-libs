import { useState } from '../../../v1/deps/htm-preact.js';
import { html } from '../../htm-wrapper.js';
import { useSchedulesData, useSchedulesOperations, useSchedulesUI } from '../../context/SchedulesContext.js';
import { useDA } from '../../context/DAContext.js';
import { ScheduleURLUtility } from '../../utils.js';
import { DA_ORIGIN } from '../../constants.js';

export default function ScheduleHeader() {
  const { org, repo } = useDA();
  const { activeSchedule, hasUnsavedChanges, setActiveSchedule } = useSchedulesData();
  const {
    updateScheduleLocally, discardChangesToActiveSchedule, sortBlocksLocally, createAndAddSchedule,
  } = useSchedulesOperations();
  const { setToastSuccess, setToastError } = useSchedulesUI();

  const [isEditingScheduleTitle, setIsEditingScheduleTitle] = useState(false);

  const handleCopyLink = async () => {
    if (!activeSchedule) return;
    try {
      const { copied, wasReordered } = await ScheduleURLUtility.copyScheduleToClipboard(activeSchedule, org, repo);
      if (copied) {
        if (wasReordered) {
          sortBlocksLocally();
          setToastSuccess('Blocks were out of order and have been sorted by start time. Link copied to clipboard.');
        } else {
          setToastSuccess('Link copied to clipboard');
        }
      } else {
        setToastError('Failed to copy link to clipboard');
      }
    } catch (error) {
      window.lana?.log(`Error copying link: ${error}`);
    }
  };

  // Starts an independent schedule seeded from the current one's content, with
  // a fresh scheduleId/createdTime/modificationTime — for authors building a
  // variant, not updating this schedule in place. Copy Link never does this:
  // it always keeps the same scheduleId, since placing/replacing links for the
  // same logical schedule is its own, more common job.
  const handleDuplicate = () => {
    if (!activeSchedule) return;
    const duplicated = createAndAddSchedule({
      ...activeSchedule,
      title: `${activeSchedule.title} (Copy)`,
    });
    setActiveSchedule(duplicated);
    setToastSuccess('Duplicated as a new, independent schedule');
  };

  if (!activeSchedule) {
    return html`
      <header class="sm-editor__header">
        <h2>No schedule selected</h2>
      </header>
    `;
  }

  return html`
    <header class="sm-editor__header">
      <div class="sm-editor__header-title">
        <sp-textfield \
          type="text" \
          size="xl" \
          id="schedule-title-input" \
          value=${activeSchedule?.title || ''} \
          onInput=${(e) => updateScheduleLocally(e.target.value)} \
          class="sm-input--title ${isEditingScheduleTitle ? '' : 'sm-hidden'}" \
          onBlur=${() => setIsEditingScheduleTitle(false)} \
          onFocusIn=${() => setIsEditingScheduleTitle(true)} \
          placeholder="Enter schedule title" \
        ></sp-textfield>
        <button \
          class="sm-title-button sm-title-button--header ${isEditingScheduleTitle ? 'sm-hidden' : ''}" \
          onclick=${() => { setIsEditingScheduleTitle(true); requestAnimationFrame(() => document.getElementById('schedule-title-input')?.focus()); }} \
        >
          ${activeSchedule?.title || ''}
          <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 18 18" width="18">
            <path fill="currentColor" fill-rule="evenodd" d="M16.783,4.1,13.9,1.216a.607.607,0,0,0-.433-.176h-.019a.687.687,0,0,0-.464.2L2.542,11.686a.5.5,0,0,0-.126.211L1.028,16.55c-.057.188.229.425.391.425a.155.155,0,0,0,.031,0c.138-.032,3.933-1.172,4.656-1.39a.489.489,0,0,0,.207-.124L16.756,5.014a.684.684,0,0,0,.2-.442A.616.616,0,0,0,16.783,4.1ZM5.7,14.658c-1.08.325-2.431.733-3.364,1.011l1-3.365Z"/>
          </svg>
        </button>
      </div>
      <div class="sm-editor__header-actions">
        ${hasUnsavedChanges && html`
          <sp-action-button size="m" onclick=${discardChangesToActiveSchedule} title="Discard unsaved changes">
            <sp-icon slot="icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M1.72949 3.72895C2.12158 3.60834 2.54443 3.82954 2.6665 4.22553L3.19793 5.95569C4.63451 3.62543 7.19416 2.13031 10 2.13031C14.4111 2.13031 18 5.71918 18 10.1303C18 14.5414 14.4111 18.1303 10 18.1303C7.33838 18.1303 4.85839 16.812 3.36669 14.6035C3.13476 14.2602 3.22509 13.7939 3.56835 13.562C3.9121 13.3305 4.37792 13.4213 4.60985 13.7636C5.82225 15.5585 7.8374 16.6303 10 16.6303C13.584 16.6303 16.5 13.7143 16.5 10.1303C16.5 6.54633 13.584 3.63031 10 3.63031C7.79926 3.63031 5.78808 4.76465 4.60009 6.54547L6.14745 6.07025C6.54003 5.95111 6.96288 6.17035 7.08446 6.56683C7.20604 6.96283 6.98387 7.38226 6.58788 7.50384L3.208 8.54193C3.13476 8.56439 3.06054 8.57513 2.9873 8.57513C2.66699 8.57513 2.37011 8.3681 2.27099 8.04534L1.2329 4.66595C1.11132 4.26995 1.3335 3.85053 1.72949 3.72895Z"/>
              </svg>
            </sp-icon>
            Discard
          </sp-action-button>
        `}
        <sp-action-button size="m" onclick=${handleDuplicate} title="Start a new, independent schedule from this one's current content">
          <sp-icon slot="icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2.5" y="4.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.3"/>
              <path d="M6.5 4.5V3.5C6.5 2.94772 6.94772 2.5 7.5 2.5H14.5C15.0523 2.5 15.5 2.94772 15.5 3.5V10.5C15.5 11.0523 15.0523 11.5 14.5 11.5H13.5" stroke="currentColor" stroke-width="1.3" fill="none"/>
            </svg>
          </sp-icon>
          Duplicate
        </sp-action-button>
        <sp-action-button size="m" onclick=${handleCopyLink}>
          <sp-icon slot="icon">
            <svg width="20" height="21" viewBox="0 0 20 21" fill="currentColor">
              <path d="M5.31348 19.248C4.27246 19.248 3.23243 18.8516 2.44043 18.0596C0.856446 16.4756 0.856446 13.8974 2.44043 12.3125L6.3457 8.40722C7.93066 6.82324 10.5078 6.82421 12.0928 8.40722C12.3096 8.62499 12.5 8.86425 12.6592 9.11718C12.8799 9.46777 12.7744 9.93066 12.4238 10.1514C12.0713 10.373 11.6103 10.2656 11.3896 9.91601C11.2891 9.75585 11.168 9.60449 11.0303 9.46679C10.0312 8.46777 8.40527 8.46874 7.40625 9.46777L3.50098 13.373C2.50196 14.373 2.50196 16 3.50098 16.999C4.50196 18 6.12793 17.9961 7.12696 16.999L9.07911 15.0469C9.37208 14.7539 9.84669 14.7539 10.1397 15.0469C10.4326 15.3398 10.4326 15.8144 10.1397 16.1074L8.18751 18.0596C7.39552 18.8516 6.35449 19.2471 5.31348 19.248ZM13.6543 12.5928L17.5596 8.6875C19.1435 7.10254 19.1435 4.52441 17.5596 2.94043C15.9756 1.35645 13.3965 1.35645 11.8125 2.94043L9.86035 4.89258C9.56738 5.18555 9.56738 5.66016 9.86035 5.95313C10.1533 6.2461 10.6279 6.2461 10.9209 5.95313L12.873 4.00098C13.8721 3.00293 15.498 3.00098 16.499 4.00098C17.498 5 17.498 6.62696 16.499 7.62696L12.5938 11.5322C11.5947 12.5312 9.96876 12.5322 8.96974 11.5332C8.83204 11.3955 8.71095 11.2441 8.61036 11.084C8.38966 10.7344 7.92872 10.627 7.57618 10.8486C7.22559 11.0693 7.12013 11.5322 7.34083 11.8828C7.50001 12.1357 7.69044 12.375 7.90724 12.5928C9.49218 14.1777 12.0684 14.1777 13.6543 12.5928Z"/>
            </svg>
          </sp-icon>
          Copy link
        </sp-action-button>
      </div>
      ${activeSchedule.hasConflictingVersions && html`
        <div class="sm-editor__conflict-warning">
          ⚠ This schedule shares an ID with other version(s) that have different content elsewhere.
          Use Duplicate if this is meant to be an independent schedule.
        </div>
      `}
      ${activeSchedule.referencedInDocs?.length > 0 && html`
        <div class="sm-editor__doc-refs">
          <span class="sm-editor__doc-refs-label">Referenced in:</span>
          ${activeSchedule.referencedInDocs.map((path) => html`
            <a
              class="sm-editor__doc-ref"
              href="${DA_ORIGIN}/edit#/${org}/${repo}${path.replace(/\.html$/, '')}"
              target="_blank"
              rel="noreferrer"
            >${path.replace(/\.html$/, '')}</a>
          `)}
        </div>
      `}
    </header>
  `;
}
