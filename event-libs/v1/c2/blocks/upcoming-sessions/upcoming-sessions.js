import { createTag } from '../../../utils/utils.js';
import {
  favorited,
  scheduled,
  pendingActions,
  initSessionState,
  openSessionGuideDetail,
} from '../../../utils/session-store.js';
import { scheduleWithFeedback, favoriteWithFeedback } from '../../../services/sessions/action-feedback.js';
import MobileRiderController from '../../../services/sessions/mobile-rider-controller.js';

const ROTATE_OUT_MS = 350;
const SLIDE_MS = 350;
const SLIDE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const MR_POLL_INTERVAL_MS = 30_000;

/**
 * Testing-only clock override: `?timing=<epoch-ms>` in the page URL lets QA
 * simulate "now" as any instant (e.g. right before a session starts, or
 * mid-live) without waiting for real time to pass. Read once at module load
 * (not per-call) as an *offset* from the real clock, not a frozen value —
 * `now()` still advances in real time from that point, so setTimeout-based
 * timers and the MR poll keep firing correctly relative to it. Absent or
 * invalid `timing` falls back to the real `Date.now()` exactly as before.
 */
const TIMING_OVERRIDE_OFFSET_MS = (() => {
  const raw = new URLSearchParams(window.location.search).get('timing');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed - Date.now() : null;
})();

function now() {
  return TIMING_OVERRIDE_OFFSET_MS === null ? Date.now() : Date.now() + TIMING_OVERRIDE_OFFSET_MS;
}

// This block never displays a "live" state — the instant a session starts,
// its card is removed (see scheduleStateTimers for non-MR sessions,
// startMobileRiderPolling for MR sessions) rather than switching to a live
// badge/routing. session-store.js's own shared liveStreamActiveIds signal is
// irrelevant here for the same reason — polls the real Mobile Rider endpoint
// directly instead, via the real MobileRiderController
// (services/sessions/mobile-rider-controller.js, hits
// overlay-admin-integration.mobilerider.com).
const mobileRiderController = new MobileRiderController();

// scheduleWithFeedback/favoriteWithFeedback need an eventConfig for registration-required
// copy and conflict-modal gating. This block has no authored config surface for those yet
// (see the design doc's open questions) — falls back to sensible defaults.
// showConflictModal is intentionally false: this event allows double-booking, so
// scheduleAction() (services/sessions/session-actions.js) never runs
// findScheduleConflict() for cards in this component — Add to Schedule always
// succeeds immediately, with no conflict-modal prompt.
const EVENT_CONFIG = { title: '', showConflictModal: false, registerUrl: '/register' };

// Same SVGs as event-libs/v1/blocks/sessions-guide/components/icons.js, inlined —
// that file exports Preact components (htm-preact), not usable from vanilla JS.
const ICON_CALENDAR_CHECK = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M7.86427 15.7344C7.64161 15.7344 7.43068 15.6357 7.2881 15.4648L3.54103 10.9668C3.27541 10.6484 3.31935 10.1748 3.63673 9.91015C3.95411 9.64453 4.42677 9.68652 4.69337 10.0059L7.84669 13.792L15.2861 4.32323C15.542 3.99706 16.0147 3.94139 16.3389 4.19628C16.665 4.45214 16.7217 4.92382 16.4658 5.24901L8.4541 15.4473C8.31445 15.626 8.10156 15.7314 7.875 15.7344L7.86427 15.7344Z" fill="currentColor"/></svg>';
const ICON_CALENDAR_PLUS = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.64355 16.5H4.25C3.83643 16.5 3.5 16.1636 3.5 15.75V8.5H16.5V8.64355C16.5 9.05761 16.8359 9.39355 17.25 9.39355C17.6641 9.39355 18 9.05761 18 8.64355V5.25C18 4.00928 16.9907 3 15.75 3H13.75V2C13.75 1.58594 13.4141 1.25 13 1.25C12.5859 1.25 12.25 1.58594 12.25 2V3H7.75V2C7.75 1.58594 7.41406 1.25 7 1.25C6.58594 1.25 6.25 1.58594 6.25 2V3H4.25C3.00928 3 2 4.00928 2 5.25V15.75C2 16.9907 3.00928 18 4.25 18H8.64355C9.05761 18 9.39355 17.6641 9.39355 17.25C9.39355 16.8359 9.05761 16.5 8.64355 16.5ZM4.25 4.5H6.25V5C6.25 5.41406 6.58594 5.75 7 5.75C7.41406 5.75 7.75 5.41406 7.75 5V4.5H12.25V5C12.25 5.41406 12.5859 5.75 13 5.75C13.4141 5.75 13.75 5.41406 13.75 5V4.5H15.75C16.1636 4.5 16.5 4.83643 16.5 5.25V7H3.5V5.25C3.5 4.83643 3.83643 4.5 4.25 4.5Z" fill="currentColor"/><path d="M15 10.5C12.5147 10.5 10.5 12.5147 10.5 15C10.5 17.4853 12.5147 19.5 15 19.5C17.4853 19.5 19.5 17.4853 19.5 15C19.5 12.5147 17.4853 10.5 15 10.5ZM17.5 15.625H15.625V17.5C15.625 17.8452 15.3452 18.125 15 18.125C14.6548 18.125 14.375 17.8452 14.375 17.5V15.625H12.5C12.1548 15.625 11.875 15.3452 11.875 15C11.875 14.6648 12.1548 14.375 12.5 14.375H14.375V12.5C14.375 12.1548 14.6548 11.875 15 11.875C15.3452 11.875 15.625 12.1548 15.625 12.5V14.375H17.5C17.8452 14.375 18.125 14.6648 18.125 15C18.125 15.3452 17.8452 15.625 17.5 15.625Z" fill="currentColor"/></svg>';
const ICON_HEART_FILLED = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M8.61426 17.5195C9.02246 17.8398 9.51123 18 10 18C10.4888 18 10.9781 17.8398 11.3858 17.5195C12.9732 16.2734 16.5908 13.0039 17.7603 11.0908C18.6929 9.56543 19.0132 7.67773 18.6172 6.04199C18.2774 4.63769 17.4551 3.50488 16.2393 2.76367C14.9116 1.95409 13.2705 1.79003 11.959 2.34179C11.2647 2.63183 10.5698 3.1416 9.99171 3.77148C9.42628 3.17773 8.72316 2.65234 8.063 2.35058C6.78419 1.7666 5.13526 1.9248 3.76124 2.76367C2.54493 3.50488 1.72266 4.63769 1.38282 6.04199C0.98682 7.67773 1.30713 9.56543 2.23975 11.0908C3.41162 13.0078 7.02832 16.2754 8.61426 17.5195Z" fill="currentColor"/></svg>';
const ICON_HEART_OUTLINE = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 18C9.51124 18 9.02247 17.8398 8.61427 17.5195C7.02833 16.2754 3.41163 13.0078 2.23976 11.0908C1.30714 9.56542 0.986826 7.67772 1.38283 6.04198C1.72267 4.63768 2.54494 3.50487 3.76125 2.76366C5.13527 1.92479 6.7842 1.76659 8.06301 2.35057C8.72317 2.65233 9.42629 3.17772 9.99172 3.77147C10.5698 3.14159 11.2647 2.63182 11.959 2.34178C13.2705 1.79002 14.9116 1.95408 16.2393 2.76366C17.4551 3.50487 18.2774 4.63768 18.6172 6.04198C19.0132 7.67772 18.6929 9.56542 17.7603 11.0908C16.5908 13.0039 12.9732 16.2734 11.3858 17.5195C10.9781 17.8398 10.4888 18 10 18ZM6.38722 3.49901C5.78077 3.49901 5.13185 3.68456 4.54201 4.04491C3.67287 4.57421 3.08498 5.38671 2.84084 6.39452C2.53615 7.65233 2.79006 9.11522 3.51906 10.3076C4.47218 11.8662 7.66847 14.8711 9.54006 16.3398C9.81057 16.5527 10.189 16.5527 10.4595 16.3398C12.333 14.8691 15.5298 11.8633 16.4805 10.3076C17.21 9.11523 17.4639 7.65234 17.1592 6.39452C16.9151 5.38671 16.3272 4.57421 15.4585 4.04491C14.5327 3.48046 13.4136 3.35839 12.5386 3.7246C11.8565 4.01073 11.1055 4.6621 10.6245 5.38476C10.3462 5.80273 9.65385 5.80273 9.37553 5.38476C8.94047 4.73144 8.12651 4.02929 7.43998 3.71581C7.12162 3.5703 6.7627 3.49901 6.38722 3.49901Z" fill="currentColor"/></svg>';
const ICON_ARROW_RIGHT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M3.5 8H12.5M12.5 8L8.5 4M12.5 8L8.5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Same BADGE_MAP as sessions-guide's CategoryBadge.js, inlined for the same reason as
 * the icons above (Preact components aren't usable from vanilla JS). Keys/labels/icons
 * copied verbatim so `session.category` (authored per §"category" in build-author-data.mjs)
 * resolves to the exact same badge sessions-guide itself would render.
 */
const CATEGORY_BADGES = {
  'social-media': {
    label: 'Social media',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path opacity="0.6" d="M17.9554 8.12915C17.9829 7.90649 17.8962 7.68188 17.71 7.54639L10.3672 2.21289C10.338 2.19165 10.3047 2.18066 10.2731 2.16504C10.2524 2.15442 10.2338 2.14233 10.2119 2.13403C10.16 2.11523 10.1067 2.10644 10.0525 2.10193C10.031 2.09961 10.0122 2.08936 9.99023 2.08936C9.9436 2.08936 9.90136 2.10633 9.85766 2.11622C9.83898 2.12061 9.82006 2.12135 9.80175 2.12745C9.74462 2.14588 9.69482 2.17347 9.64623 2.20655C9.64208 2.20948 9.63695 2.21033 9.6328 2.21339L9.58739 2.24635C9.57421 2.25782 9.5576 2.26442 9.5454 2.27687L2.29102 7.54883C2.26685 7.56629 2.25061 7.59009 2.22974 7.61023C2.20984 7.62927 2.18958 7.646 2.17237 7.66773C2.12623 7.72559 2.08839 7.78882 2.06544 7.85804C2.06495 7.85938 2.06398 7.86012 2.06349 7.86134C2.063 7.86305 2.06349 7.86464 2.063 7.86622C2.04103 7.93592 2.03468 8.00916 2.03798 8.08326C2.0392 8.10914 2.04518 8.13282 2.04958 8.15821C2.05471 8.188 2.05397 8.21802 2.0635 8.24757L4.86916 16.8784C4.87893 16.9085 4.89748 16.933 4.9114 16.9607C4.92239 16.9827 4.93093 17.0045 4.9446 17.0254C4.98635 17.0889 5.03542 17.1461 5.09597 17.1902L5.0967 17.1909C5.10549 17.1973 5.11574 17.1993 5.12478 17.2052C5.17043 17.2349 5.21804 17.262 5.27041 17.2791C5.33328 17.2996 5.39822 17.3101 5.46291 17.3101L14.5391 17.3091C14.5681 17.3091 14.5947 17.2996 14.6229 17.2957C14.6508 17.2919 14.6775 17.2902 14.7049 17.2825C14.8507 17.2421 14.9751 17.1511 15.0584 17.0243C15.0722 17.0032 15.0808 16.981 15.0919 16.9586C15.1057 16.9312 15.124 16.9068 15.1338 16.877L17.9375 8.24512C17.9473 8.21485 17.9467 8.18408 17.9517 8.15332C17.9527 8.14502 17.9548 8.13745 17.9554 8.12915ZM14.3237 15.3243L11.0142 10.77L16.3613 9.05139L14.3237 15.3243ZM3.63135 9.02734L8.98975 10.7676L5.67908 15.3252L3.63135 9.02734ZM10.6169 3.93933L16.0048 7.85254L10.625 9.58203L10.6169 3.93933ZM9.37476 9.57861L4.0177 7.83862L9.36694 3.95117L9.37476 9.57861ZM10.001 11.5024L13.3123 16.0592L6.69043 16.0599L10.001 11.5024Z" fill="currentColor"/><path d="M9.9972 4.10342C10.8255 4.10342 11.4969 3.43199 11.4969 2.60374C11.4969 1.77549 10.8255 1.10406 9.9972 1.10406C9.16895 1.10406 8.49752 1.77549 8.49752 2.60374C8.49752 3.43199 9.16895 4.10342 9.9972 4.10342Z" fill="currentColor"/><path d="M5.41642 18.2449C6.24467 18.2449 6.9161 17.5734 6.9161 16.7452C6.9161 15.9169 6.24467 15.2455 5.41642 15.2455C4.58817 15.2455 3.91674 15.9169 3.91674 16.7452C3.91674 17.5734 4.58817 18.2449 5.41642 18.2449Z" fill="currentColor"/><path d="M10 11.8485C10.8283 11.8485 11.4997 11.1771 11.4997 10.3489C11.4997 9.52062 10.8283 8.84919 10 8.84919C9.17175 8.84919 8.50032 9.52062 8.50032 10.3489C8.50032 11.1771 9.17175 11.8485 10 11.8485Z" fill="currentColor"/><path d="M14.5575 18.2102C15.3857 18.2102 16.0572 17.5387 16.0572 16.7105C16.0572 15.8822 15.3857 15.2108 14.5575 15.2108C13.7292 15.2108 13.0578 15.8822 13.0578 16.7105C13.0578 17.5387 13.7292 18.2102 14.5575 18.2102Z" fill="currentColor"/><path d="M17.4001 9.58791C18.2283 9.58791 18.8998 8.91648 18.8998 8.08823C18.8998 7.25998 18.2283 6.58855 17.4001 6.58855C16.5718 6.58855 15.9004 7.25998 15.9004 8.08823C15.9004 8.91648 16.5718 9.58791 17.4001 9.58791Z" fill="currentColor"/><path d="M2.59991 9.58037C3.42816 9.58037 4.09959 8.90894 4.09959 8.08069C4.09959 7.25244 3.42816 6.58101 2.59991 6.58101C1.77166 6.58101 1.10023 7.25244 1.10023 8.08069C1.10023 8.90894 1.77166 9.58037 2.59991 9.58037Z" fill="currentColor"/></svg>',
  },
  'design-and-illustration': {
    label: 'Design & Illustration',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M13.2402 3.7168L11.2832 1.75977C10.6045 1.08106 9.49902 1.08301 8.82031 1.75977L7.49804 3.08301C7.47973 3.10132 7.47265 3.12549 7.45654 3.14527L4.48828 4.76368C4.05566 5.00098 3.7207 5.38575 3.54492 5.84669L1.35254 11.6094C1.13281 12.1865 1.27344 12.8428 1.70996 13.2793C2.01172 13.5811 2.41211 13.7402 2.82129 13.7402C3.01856 13.7402 3.21777 13.7031 3.4082 13.627L9.52246 11.168C9.99316 10.9795 10.3769 10.624 10.6025 10.1719L11.9673 7.44436C11.9749 7.43728 11.9849 7.43508 11.9922 7.42776L13.2412 6.17874C13.9189 5.50003 13.9189 4.39453 13.2402 3.7168ZM9.25976 9.50196C9.19824 9.62696 9.09277 9.72364 8.96288 9.7754L4.24755 11.6715L6.47607 9.443C6.89624 9.40418 7.229 9.0619 7.229 8.63135C7.229 8.17505 6.85913 7.80506 6.40283 7.80506C5.97241 7.80506 5.62988 8.13795 5.59131 8.55823L3.21436 10.9352L4.94727 6.37988C4.9961 6.25195 5.08887 6.1455 5.20801 6.08008L7.92188 4.59961L10.4482 7.12695L9.25976 9.50196ZM12.1797 5.11915L11.3711 5.92774L9.07251 3.62916L9.87988 2.8213C9.97656 2.72462 10.1299 2.72755 10.2226 2.82032L12.1797 4.77735C12.2734 4.8711 12.2734 5.0254 12.1797 5.11915Z" fill="currentColor"/><path d="M18.0811 6.65137C17.6475 6.28809 17.1045 6.11426 16.5322 6.16602C15.9678 6.2168 15.456 6.4834 15.084 6.92969C15.0283 6.99951 11.9702 10.7666 10.7192 12.27C10.4756 12.2877 10.2295 12.3253 9.98339 12.3936C8.41601 12.8281 7.8623 14.1367 7.37401 15.29C7.01073 16.1465 6.66893 16.9551 5.95506 17.3418C5.66893 17.4961 5.51561 17.8184 5.57518 18.1387C5.63475 18.458 5.89354 18.7031 6.21678 18.7451C6.92381 18.836 7.70994 18.9024 8.50389 18.9024C10.1631 18.9024 11.8555 18.6133 12.9238 17.6602C13.6601 17.0029 14.0254 16.1211 14.0107 15.0371C14.0102 15.0104 14.0014 14.9854 14.0005 14.9587C14.9604 13.8037 17.0359 11.2521 17.9336 10.1494L18.3486 9.63868C18.7119 9.20411 18.8847 8.6543 18.834 8.08985C18.7832 7.5254 18.5166 7.01368 18.0811 6.65137ZM11.9248 16.541C11.2256 17.1631 9.83496 17.459 8.00292 17.3926C8.31835 16.9053 8.54394 16.374 8.75487 15.875C9.22655 14.7617 9.5576 14.0684 10.3838 13.8389C10.9844 13.6729 11.5664 13.7598 11.9873 14.0732C12.3144 14.3193 12.5059 14.6777 12.5107 15.0586C12.5195 15.6963 12.3281 16.1816 11.9248 16.541ZM17.2041 8.66993C17.1953 8.68067 17.0322 8.88087 16.7695 9.20313C16.019 10.1257 14.439 12.0671 13.3828 13.3521C13.2383 13.177 13.0752 13.0143 12.8867 12.8731C12.7353 12.7598 12.5671 12.6763 12.3987 12.5936C13.8393 10.8447 16.2341 7.8932 16.2441 7.87989C16.3506 7.75294 16.5 7.67481 16.666 7.66016C16.8203 7.64258 16.9912 7.69629 17.1201 7.80176C17.2471 7.90821 17.3252 8.05762 17.3398 8.22364C17.3545 8.38868 17.3047 8.54981 17.2041 8.66993Z" fill="currentColor"/></svg>',
  },
  'mainstage': {
    label: 'Mainstage',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 14 12.1437" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M0 12.1367L5.19492 0H8.84061L14 12.1437H10.134L6.87919 4.07806L4.73299 9.36701H7.28426L8.30051 12.1367H0Z" fill="currentColor"/></svg>',
  },
  '3d': {
    label: '3D',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M16.876 4.84082L11.126 1.52148C10.4297 1.11914 9.56739 1.12011 8.875 1.52148L3.12402 4.84082C2.43066 5.24219 2 5.98926 2 6.79004V13.4297C2 14.2315 2.43164 14.9775 3.125 15.3779L8.87402 18.6982C9.22168 18.8994 9.61132 18.999 10 18.999C10.3896 18.999 10.7783 18.8994 11.125 18.6982L16.875 15.3779C17.5684 14.9775 18 14.2315 18 13.4297V6.79004C18 5.98926 17.5693 5.24219 16.876 4.84082ZM9.62598 2.82031C9.74121 2.75293 9.87012 2.71972 10 2.71972C10.1289 2.71972 10.2588 2.75292 10.375 2.82031L15.6602 5.87182L10.0007 8.99413L4.33643 5.87328L9.62598 2.82031ZM3.875 14.0791C3.64355 13.9453 3.5 13.6963 3.5 13.4297V7.12598L9.25 10.2939V17.1829L3.875 14.0791ZM16.125 14.0791L10.75 17.1824V10.293L16.5 7.12061V13.4297C16.5 13.6963 16.3565 13.9453 16.125 14.0791Z" fill="currentColor"/></svg>',
  },
  'photography': {
    label: 'Photography',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M16.75 17H3.25C2.00928 17 1 15.9902 1 14.75V7.25C1 6.00977 2.00928 5 3.25 5H5.07275C5.35888 5 5.61572 4.84082 5.74365 4.58594L5.91455 4.24414C6.29834 3.47656 7.06934 3 7.92725 3H12.0728C12.9307 3 13.7017 3.47656 14.0855 4.24414L14.2564 4.58594C14.3843 4.84082 14.6411 5 14.9273 5H16.75C17.9907 5 19 6.00977 19 7.25V14.75C19 15.9902 17.9907 17 16.75 17ZM3.25 6.5C2.83643 6.5 2.5 6.83691 2.5 7.25V14.75C2.5 15.1631 2.83643 15.5 3.25 15.5H16.75C17.1636 15.5 17.5 15.1631 17.5 14.75V7.25C17.5 6.83691 17.1636 6.5 16.75 6.5H14.9272C14.0693 6.5 13.2983 6.02344 12.9145 5.25586L12.7437 4.91406C12.6157 4.65918 12.3589 4.5 12.0728 4.5H7.92724C7.64111 4.5 7.38427 4.65918 7.25634 4.91406L7.08544 5.25586C6.70165 6.02344 5.93065 6.5 5.07274 6.5H3.25Z" fill="currentColor"/><path d="M10 14.5C7.79443 14.5 6 12.706 6 10.5C6 8.29395 7.79443 6.5 10 6.5C12.2056 6.5 14 8.29395 14 10.5C14 12.706 12.2056 14.5 10 14.5ZM10 8C8.62158 8 7.5 9.12109 7.5 10.5C7.5 11.8789 8.62158 13 10 13C11.3784 13 12.5 11.8789 12.5 10.5C12.5 9.12109 11.3784 8 10 8Z" fill="currentColor"/></svg>',
  },
  'business': {
    label: 'Business',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M14.9727 5.05371H13.4727V3.31445C13.4727 2.8955 13.0771 2.5 12.6582 2.5H7.18751C6.78907 2.5 6.50001 2.81543 6.50001 3.25V4.99023H5.00001V3.25C5.00001 1.98828 5.96095 1 7.18751 1H12.6582C13.8916 1 14.9727 2.08105 14.9727 3.31445V5.05371Z" fill="currentColor"/><path d="M16.75 17H3.25C2.00977 17 1 15.9902 1 14.75V6.25C1 5.00977 2.00977 4 3.25 4H16.75C17.9902 4 19 5.00977 19 6.25V14.75C19 15.9902 17.9902 17 16.75 17ZM3.25 5.5C2.83691 5.5 2.5 5.83691 2.5 6.25V14.75C2.5 15.1631 2.83691 15.5 3.25 15.5H16.75C17.1631 15.5 17.5 15.1631 17.5 14.75V6.25C17.5 5.83691 17.1631 5.5 16.75 5.5H3.25Z" fill="currentColor"/><path d="M18 9.25H2V10.75H18V9.25Z" fill="currentColor"/><path d="M5.75 12.25C5.33594 12.25 5 11.9141 5 11.5V9C5 8.58594 5.33594 8.25 5.75 8.25C6.16406 8.25 6.5 8.58594 6.5 9V11.5C6.5 11.9141 6.16406 12.25 5.75 12.25Z" fill="currentColor"/><path d="M14.25 12.25C13.8359 12.25 13.5 11.9141 13.5 11.5V9C13.5 8.58594 13.8359 8.25 14.25 8.25C14.6641 8.25 15 8.58594 15 9V11.5C15 11.9141 14.6641 12.25 14.25 12.25Z" fill="currentColor"/></svg>',
  },
  'content-creator': {
    label: 'Content creator',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M18.571 10.0428C17.6051 9.2513 16.1178 9.35432 15.192 10.2821L11.0094 14.4647C10.7614 14.7123 10.5768 15.0204 10.4762 15.3553L9.52214 18.515C9.44206 18.7797 9.51433 19.0668 9.70964 19.2621C9.85222 19.4047 10.0436 19.4818 10.2399 19.4818C10.3122 19.4818 10.3854 19.4716 10.4567 19.4496L13.6149 18.496C13.9508 18.3949 14.2594 18.2108 14.5055 17.9633C14.5055 17.9633 18.6305 13.8387 18.7584 13.7103C19.2516 13.2176 19.5153 12.535 19.4801 11.8383C19.4459 11.1415 19.1139 10.4872 18.571 10.0428ZM11.362 17.6092L11.9128 15.788C11.9298 15.7306 11.9706 15.6861 12.0031 15.6363L13.3354 16.9685C13.2853 17.0013 13.2406 17.0422 13.1823 17.0599L11.362 17.6092ZM17.6969 12.6507C17.6042 12.744 15.4457 14.9022 14.2411 16.1066L12.8647 14.7306L16.2526 11.3426C16.4743 11.121 16.7653 11.0057 17.0456 11.0057C17.2555 11.0057 17.4587 11.0707 17.6217 11.204C17.8405 11.3827 17.9684 11.6346 17.9821 11.9125C17.9958 12.1908 17.8952 12.4525 17.6969 12.6507Z" fill="currentColor"/><path d="M8.99983 11.2497C6.38069 11.2497 4.24983 9.00651 4.24983 6.24967C4.24983 3.49283 6.38069 1.24967 8.99983 1.24967C11.619 1.24967 13.7498 3.49283 13.7498 6.24967C13.7498 9.00651 11.619 11.2497 8.99983 11.2497ZM8.99983 2.74967C7.20784 2.74967 5.74983 4.31998 5.74983 6.24967C5.74983 8.17936 7.20784 9.74967 8.99983 9.74967C10.7918 9.74967 12.2498 8.17936 12.2498 6.24967C12.2498 4.31998 10.7918 2.74967 8.99983 2.74967Z" fill="currentColor"/><path d="M1.75081 18.7497C1.72688 18.7497 1.70247 18.7487 1.67806 18.7458C1.26546 18.7067 0.9637 18.3405 1.00326 17.9274C1.3099 14.7438 4.8226 12.2497 8.99984 12.2497C9.24789 12.2497 9.493 12.2585 9.73422 12.2751C10.1473 12.3034 10.4588 12.6618 10.43 13.0749C10.4012 13.4879 10.0487 13.7858 9.62973 13.7711C9.4227 13.7565 9.21274 13.7497 8.99985 13.7497C5.58676 13.7497 2.72983 15.6481 2.49643 18.0719C2.45883 18.4596 2.13265 18.7497 1.75081 18.7497Z" fill="currentColor"/></svg>',
  },
  'education': {
    label: 'Education',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 2.24121C9.58594 2.24121 9.25 1.90527 9.25 1.49121V0.79101C9.25 0.37695 9.58594 0.04101 10 0.04101C10.4141 0.04101 10.75 0.37695 10.75 0.79101V1.49121C10.75 1.90527 10.4141 2.24121 10 2.24121Z" fill="currentColor"/><path d="M18.4541 10.0215H17.7539C17.3398 10.0215 17.0039 9.68554 17.0039 9.27148C17.0039 8.85742 17.3398 8.52148 17.7539 8.52148H18.4541C18.8682 8.52148 19.2041 8.85742 19.2041 9.27148C19.2041 9.68554 18.8682 10.0215 18.4541 10.0215Z" fill="currentColor"/><path d="M2.23242 10.0215H1.53222C1.11816 10.0215 0.78222 9.68554 0.78222 9.27148C0.78222 8.85742 1.11816 8.52148 1.53222 8.52148H2.23242C2.64648 8.52148 2.98242 8.85742 2.98242 9.27148C2.98242 9.68554 2.64648 10.0215 2.23242 10.0215Z" fill="currentColor"/><path d="M4.51074 4.53906C4.31836 4.53906 4.12695 4.46582 3.98047 4.31933L3.48535 3.82421C3.19238 3.53124 3.19238 3.05663 3.48535 2.76366C3.77832 2.47069 4.25293 2.47069 4.5459 2.76366L5.04102 3.25878C5.33399 3.55175 5.33399 4.02636 5.04102 4.31933C4.89454 4.46581 4.70312 4.53906 4.51074 4.53906Z" fill="currentColor"/><path d="M15.4756 4.53906C15.2832 4.53906 15.0918 4.46582 14.9453 4.31933C14.6524 4.02636 14.6524 3.55175 14.9453 3.25878L15.4404 2.76366C15.7334 2.47069 16.208 2.47069 16.501 2.76366C16.794 3.05663 16.794 3.53124 16.501 3.82421L16.0059 4.31933C15.8594 4.46581 15.668 4.53906 15.4756 4.53906Z" fill="currentColor"/><path d="M16 9.5C16 6.19141 13.3086 3.5 10 3.5C6.69141 3.5 4 6.19141 4 9.5C4 11.7157 5.21021 13.6499 7.00122 14.689C7.00122 14.6913 7 14.6931 7 14.6953V16.5C7 18.1543 8.3457 19.5 10 19.5C11.6543 19.5 13 18.1543 13 16.5V14.6882C14.7904 13.6489 16 11.7151 16 9.5ZM11.5 16.5C11.5 17.3271 10.8271 18 10 18C9.17285 18 8.5 17.3271 8.5 16.5V15.3025C8.98047 15.4269 9.4812 15.5 10 15.5C10.5188 15.5 11.0195 15.4269 11.5 15.3025V16.5ZM10 14C7.51855 14 5.5 11.9815 5.5 9.5C5.5 7.01855 7.51855 5 10 5C12.4815 5 14.5 7.01855 14.5 9.5C14.5 11.9815 12.4815 14 10 14Z" fill="currentColor"/></svg>',
  },
  'branding': {
    label: 'Branding',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10.0068 19C9.92286 19 9.83887 18.998 9.75391 18.9961C5.33203 18.7451 1.93555 15.0938 2.00098 10.6846V3.25C2.00098 2.00977 3.01075 1 4.25098 1H15.75C16.9902 1 18 2.00977 18 3.25L17.9971 11.2402C17.9307 13.3799 17.0381 15.3633 15.4814 16.8271C13.9854 18.2334 12.0498 19 10.0068 19ZM4.25098 2.5C3.83789 2.5 3.50098 2.83691 3.50098 3.25V10.6953C3.44727 14.3096 6.22266 17.293 9.82032 17.4971C11.5273 17.5488 13.1885 16.9238 14.4531 15.7344C15.7178 14.5449 16.4443 12.9336 16.4971 11.1973L16.5 11V3.25C16.5 2.83691 16.1631 2.5 15.75 2.5H4.25098Z" fill="currentColor"/><path d="M14.25 12H8.75C8.48535 12 8.24023 11.8603 8.10547 11.6328C7.96973 11.4053 7.96485 11.123 8.0918 10.8906L10.8428 5.85156C10.9746 5.61035 11.2266 5.46094 11.501 5.46094C11.7754 5.46094 12.0283 5.61133 12.1592 5.85156L14.9082 10.8906C15.0351 11.123 15.0303 11.4053 14.8945 11.6328C14.7598 11.8603 14.5146 12 14.25 12ZM10.0137 10.5H12.9863L11.501 7.77637L10.0137 10.5Z" fill="currentColor"/><path d="M5.74902 12C5.62793 12 5.50488 11.9707 5.39062 11.9082C5.02734 11.71 4.89355 11.2539 5.09179 10.8906L7.07324 7.26171C7.27051 6.89843 7.72656 6.76366 8.09082 6.96288C8.4541 7.16112 8.58789 7.61718 8.38965 7.98046L6.4082 11.6094C6.27246 11.8584 6.01465 12 5.74902 12Z" fill="currentColor"/></svg>',
  },
  'generative-ai': {
    label: 'Generative AI',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M13.25 18H5.75C3.68213 18 2 16.3174 2 14.25V6.75C2 4.68262 3.68213 3 5.75 3H8C8.41406 3 8.75 3.33594 8.75 3.75C8.75 4.16406 8.41406 4.5 8 4.5H5.75C4.50928 4.5 3.5 5.50977 3.5 6.75V14.25C3.5 15.4902 4.50928 16.5 5.75 16.5H13.25C14.4907 16.5 15.5 15.4902 15.5 14.25V10.498C15.5 10.084 15.8359 9.74805 16.25 9.74805C16.6641 9.74805 17 10.084 17 10.498V14.25C17 16.3174 15.3179 18 13.25 18Z" fill="currentColor"/><path d="M12.9399 9.58301C12.7456 9.58301 12.5498 9.53223 12.3721 9.42969C11.9439 9.18262 11.7261 8.69239 11.8306 8.20899L12.3433 5.83399L10.7119 4.03419C10.3799 3.66798 10.3228 3.1338 10.5703 2.70509C10.8184 2.27736 11.3076 2.05958 11.7925 2.16407L14.1665 2.67774L15.9658 1.0459C16.3325 0.71289 16.8672 0.65625 17.2954 0.9043C17.7236 1.15137 17.9409 1.64258 17.836 2.12598L17.3232 4.5L18.9546 6.2998C19.2866 6.66601 19.3442 7.19921 19.0967 7.62792C18.8496 8.05761 18.3613 8.27538 17.8745 8.16991L15.5005 7.65624L13.7012 9.28808C13.4863 9.48242 13.2144 9.58301 12.9399 9.58301ZM13.8491 5.9668L13.5371 7.41211L14.6323 6.41895C14.9043 6.17286 15.2768 6.07032 15.6348 6.15137L17.0776 6.46289L16.0854 5.36816C15.8408 5.09765 15.7407 4.72461 15.8169 4.36816L16.1294 2.92285L15.0347 3.91504C14.7632 4.16016 14.3921 4.26367 14.0317 4.18262L12.5889 3.8711L13.581 4.96583C13.8262 5.23536 13.9268 5.61035 13.8491 5.9668Z" fill="currentColor"/><path d="M8.12012 13.25C7.99121 13.25 7.86182 13.2168 7.74512 13.1494C7.46289 12.9863 7.31836 12.6601 7.38721 12.3418L7.58985 11.4023L6.94434 10.6904C6.72559 10.4482 6.6875 10.0937 6.85059 9.81152C7.01368 9.52929 7.34278 9.38964 7.6587 9.45312L8.59766 9.65722L9.30957 9.01171C9.55127 8.79198 9.90674 8.75487 10.1885 8.91796C10.4707 9.08105 10.6152 9.40722 10.5464 9.72558L10.3437 10.665L10.9893 11.3769C11.208 11.6191 11.2461 11.9736 11.083 12.2558C10.9199 12.5381 10.5918 12.6767 10.2749 12.6142L9.33545 12.4101L8.62402 13.0557C8.48242 13.1836 8.30176 13.25 8.12012 13.25Z" fill="currentColor"/></svg>',
  },
  'video': {
    label: 'Video',
    icon: '<svg class="sg-category-badge__icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M15.75 18H4.25C3.00977 18 2 16.9902 2 15.75V4.25C2 3.00977 3.00977 2 4.25 2H15.75C16.9902 2 18 3.00977 18 4.25V15.75C18 16.9902 16.9902 18 15.75 18ZM4.25 3.5C3.83691 3.5 3.5 3.83691 3.5 4.25V15.75C3.5 16.1631 3.83691 16.5 4.25 16.5H15.75C16.1631 16.5 16.5 16.1631 16.5 15.75V4.25C16.5 3.83691 16.1631 3.5 15.75 3.5H4.25Z" fill="currentColor"/><path d="M13.0731 9.11916L8.47336 6.64704C7.80715 6.28898 6.99994 6.77155 6.99994 7.52789V12.4721C6.99994 13.2285 7.80715 13.711 8.47336 13.353L13.0731 10.8808C13.7752 10.5035 13.7752 9.49652 13.0731 9.11916Z" fill="currentColor"/></svg>',
  },
};

// TODO: remove once category-colors is authored via block config, mirroring the
// identical MOCK_CATEGORY_COLORS/TODO in sessions-guide.js — same keys, same values,
// so badges look identical between the two blocks until real authoring lands.
const CATEGORY_COLORS = {
  'social-media': '#FF6B35',
  'design-and-illustration': '#9D50BB',
  'mainstage': '#E91E63',
  '3d': '#00BCD4',
  'photography': '#4CAF50',
  'business': '#2196F3',
  'content-creator': '#FF9800',
  'education': '#FF5722',
  'branding': '#607D8B',
  'generative-ai': '#8BC34A',
  'video': '#F44336',
};

/** Mirrors sessions-guide's CategoryBadge.js normalization, so minor authoring variance in `category` (spacing/case) still resolves. */
function normalizeCategoryKey(category) {
  return category.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/** Mirrors sessions-guide's CategoryBadge.js markup/classes exactly (size="sm" only — the only size this card ever uses). */
function buildCategoryBadge(category) {
  if (!category) return null;
  const config = CATEGORY_BADGES[normalizeCategoryKey(category)];
  if (!config) return null;

  const badge = createTag('span', { class: 'sg-category-badge sg-category-badge--sm' });
  const color = CATEGORY_COLORS[normalizeCategoryKey(category)];
  createTag('span', {
    class: 'sg-category-badge__icon-color',
    style: color ? `color:${color}` : '',
  }, config.icon, { parent: badge });
  createTag('span', { class: 'sg-category-badge__label' }, config.label, { parent: badge });
  return badge;
}

/** ISO start/end for session-actions.js/session-store.js, which expect UTC strings, not millis. */
function toIsoTimes(session) {
  const { sessionTime } = session;
  return {
    startTimeUtc: sessionTime ? new Date(sessionTime.startTimeMillis).toISOString() : null,
    endTimeUtc: sessionTime ? new Date(sessionTime.endTimeMillis).toISOString() : null,
  };
}

function formatTimeRange(session) {
  const { sessionTime } = session;
  if (!sessionTime) return '';
  const options = { hour: 'numeric', minute: '2-digit', hour12: true };
  if (sessionTime.timezone) options.timeZone = sessionTime.timezone;
  try {
    const start = new Date(sessionTime.startTimeMillis).toLocaleTimeString('en-US', options);
    const end = new Date(sessionTime.endTimeMillis).toLocaleTimeString('en-US', options);
    return `${start} - ${end}`;
  } catch (error) {
    window.lana?.log(`upcoming-sessions: time format failed: ${error.message}`);
    return '';
  }
}

/** `track` matches sessions-guide.js's own field name/shape (flat string, not a delimited list). */
function primaryCategory(session) {
  return session.track || '';
}

/** session-store/session-actions expect `.id`/`.rfCode`/`.startTimeUtc`/`.endTimeUtc`. */
function toRfSession(session) {
  const { startTimeUtc, endTimeUtc } = toIsoTimes(session);
  return {
    id: session.sessionId,
    rfCode: session.sessionCode,
    startTimeUtc,
    endTimeUtc,
    title: session.enTitle,
    track: session.track,
  };
}

/**
 * Every rendered card is always in the "upcoming" state — this block never
 * displays a live session; the instant one starts, its card is removed
 * instead (scheduleStateTimers for non-MR sessions, startMobileRiderPolling
 * for MR sessions), so a click can only ever mean "open the Session Guide
 * detail view". Kept as its own function, mirroring sessions-guide's own
 * click-decision pattern, so it stays independently testable.
 * @returns {{ type: 'session-guide', sessionId: string }}
 */
export function resolveClickAction(session) {
  return { type: 'session-guide', sessionId: session.sessionId };
}

function routeCardClick(session) {
  const action = resolveClickAction(session);
  openSessionGuideDetail(action.sessionId);
}

/** Builds an sg-icon-btn (same classes/markup shape as sessions-guide's IconButton.js). */
function buildIconButton({
  iconSvg, label, pressed, disabled, extraClass, onClick,
}) {
  const btn = createTag('button', {
    class: ['sg-icon-btn', 'sg-icon-btn--solid', 'sg-icon-btn--on-dark', 'sg-icon-btn--md', extraClass].filter(Boolean).join(' '),
    type: 'button',
    'aria-label': label,
    'aria-pressed': String(pressed),
  });
  if (disabled) btn.disabled = true;
  createTag('span', { class: 'sg-icon-btn__icon', 'aria-hidden': 'true' }, iconSvg, { parent: btn });
  btn.addEventListener('click', onClick);
  return btn;
}

async function handleSchedule(e, session, isScheduled, btn) {
  e.stopPropagation();
  btn.disabled = true;
  try {
    await scheduleWithFeedback(toRfSession(session), { eventConfig: EVENT_CONFIG, isScheduled });
  } finally {
    btn.disabled = false;
  }
}

async function handleFavorite(e, session, isFavorited, btn) {
  e.stopPropagation();
  btn.disabled = true;
  try {
    await favoriteWithFeedback(toRfSession(session), { eventConfig: EVENT_CONFIG, isFavorited });
  } finally {
    btn.disabled = false;
  }
}

/**
 * Mirrors sessions-guide's SessionCard.js markup/classes exactly (sg-card family) —
 * badge-row above the title (shown at mobile/tablet), a footer row below it pairing
 * the plain track label with a repeated category badge and the time (shown at
 * desktop; CSS swaps which of the two badges is visible per breakpoint, matching
 * SessionCard.js's own responsive treatment).
 */
export function buildCard(session) {
  const isScheduled = scheduled.value.has(session.sessionId);
  const isFavorited = favorited.value.has(session.sessionId);
  const isPending = pendingActions.value.has(session.sessionId);

  const cardClass = [
    'sg-card',
    'upcoming-sessions-card',
    isScheduled ? 'is-scheduled' : '',
    isFavorited ? 'is-favorited' : '',
    isPending ? 'is-pending' : '',
  ].filter(Boolean).join(' ');

  const card = createTag('div', {
    class: cardClass,
    'data-session-id': session.sessionId,
    role: 'button',
    tabindex: '0',
    'aria-label': `${session.enTitle}, ${formatTimeRange(session)}`,
  });

  const body = createTag('div', { class: 'sg-card__body' }, '', { parent: card });

  const badgeRow = createTag('div', { class: 'sg-card__badge-row' }, '', { parent: body });
  const topBadge = buildCategoryBadge(session.category);
  if (topBadge) badgeRow.append(topBadge);

  createTag('p', { class: 'sg-card__title' }, session.enTitle, { parent: body });

  const footer = createTag('div', { class: 'sg-card__footer' }, '', { parent: body });
  createTag('span', { class: 'sg-card__track sg-card__track--footer' }, primaryCategory(session), { parent: footer });
  const footerBadgeWrap = createTag('span', { class: 'sg-card__footer-badge' }, '', { parent: footer });
  const footerBadge = buildCategoryBadge(session.category);
  if (footerBadge) footerBadgeWrap.append(footerBadge);
  createTag('span', { class: 'sg-card__time' }, formatTimeRange(session), { parent: footer });

  const timeRange = formatTimeRange(session);
  const actions = createTag('div', { class: 'sg-card__actions', 'data-time': timeRange }, '', { parent: card });
  actions.addEventListener('click', (e) => e.stopPropagation());

  const scheduleBtn = buildIconButton({
    iconSvg: isScheduled ? ICON_CALENDAR_CHECK : ICON_CALENDAR_PLUS,
    label: isScheduled ? 'Remove from schedule' : 'Add to schedule',
    pressed: isScheduled,
    disabled: isPending,
    extraClass: 'sg-card__btn--schedule',
    onClick: (e) => handleSchedule(e, session, isScheduled, scheduleBtn),
  });
  actions.append(scheduleBtn);

  const favoriteBtn = buildIconButton({
    iconSvg: isFavorited ? ICON_HEART_FILLED : ICON_HEART_OUTLINE,
    label: isFavorited ? 'Remove from favorites' : 'Add to favorites',
    pressed: isFavorited,
    disabled: isPending,
    extraClass: 'sg-card__btn--favorite',
    onClick: (e) => handleFavorite(e, session, isFavorited, favoriteBtn),
  });
  actions.append(favoriteBtn);

  const activate = () => routeCardClick(session);
  card.addEventListener('click', activate);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  });

  return card;
}

function buildCarouselControls(track) {
  const controls = createTag('div', { class: 'upcoming-sessions-controls' });
  // Same right-arrow icon for both — "prev" is rotated 180deg via CSS,
  // matching the Figma "ControlButton" component (one icon asset, two directions).
  const prev = createTag('button', {
    class: 'upcoming-sessions-arrow upcoming-sessions-arrow--prev',
    type: 'button',
    'aria-label': 'Scroll to previous sessions',
  }, ICON_ARROW_RIGHT, { parent: controls });
  const next = createTag('button', {
    class: 'upcoming-sessions-arrow upcoming-sessions-arrow--next',
    type: 'button',
    'aria-label': 'Scroll to next sessions',
  }, ICON_ARROW_RIGHT, { parent: controls });

  function scrollBy(direction) {
    const card = track.querySelector('.upcoming-sessions-card');
    const step = card ? card.getBoundingClientRect().width + 16 : track.clientWidth * 0.8;
    track.scrollBy({
      left: direction * step,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  prev.addEventListener('click', () => scrollBy(-1));
  next.addEventListener('click', () => scrollBy(1));

  return controls;
}

/**
 * FLIP technique (First-Last-Invert-Play): `movers` have already reflowed
 * into their post-removal positions by the time this runs (called right
 * after `card.remove()`). For each one, jump it back to where it *was*
 * (`beforeLefts`) with transitions disabled, then release that on the next
 * frame with a transition enabled — it animates smoothly from the old
 * position to the new one instead of snapping, reading as "later cards
 * slide left to fill the gap" rather than an abrupt reflow.
 */
function slideIntoPlace(movers, beforeLefts) {
  movers.forEach((mover, i) => {
    const afterLeft = mover.getBoundingClientRect().left;
    const delta = beforeLefts[i] - afterLeft;
    mover.style.transition = 'none';
    mover.style.transform = delta ? `translateX(${delta}px)` : '';
  });

  // Force layout so the jump above is committed before it's released on the
  // next frame — otherwise the browser can coalesce both style writes into
  // one paint and skip straight to the end state, with no visible slide.
  movers[0]?.getBoundingClientRect();

  requestAnimationFrame(() => {
    movers.forEach((mover) => {
      mover.style.transition = `transform ${SLIDE_MS}ms ${SLIDE_EASING}`;
      mover.style.transform = '';
    });
  });

  setTimeout(() => {
    movers.forEach((mover) => { mover.style.transition = ''; });
  }, SLIDE_MS);
}

function removeCard(el, sessionId) {
  const card = el.querySelector(`[data-session-id="${sessionId}"]`);
  if (!card) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    card.remove();
    return;
  }

  // Cards after this one will shift left once it's actually removed — snapshot
  // their pre-removal positions now, while this card still occupies its slot.
  const siblings = [...card.parentElement.querySelectorAll(':scope > .upcoming-sessions-card')];
  const movers = siblings.slice(siblings.indexOf(card) + 1);
  const beforeLefts = movers.map((mover) => mover.getBoundingClientRect().left);

  card.classList.add('upcoming-sessions-card--rotating-out');
  setTimeout(() => {
    card.remove();
    if (movers.length) slideIntoPlace(movers, beforeLefts);
  }, ROTATE_OUT_MS);
}

// Live/favorite/schedule updates rebuild every card from scratch (state is
// derived fresh per render, not diffed) — preserve scroll position across
// that rebuild so a background update (e.g. a session going live) doesn't
// yank a mid-browse user back to the start of the carousel.
function renderTrack(track, sessions) {
  const { scrollLeft } = track;
  track.innerHTML = '';
  sessions.forEach((session) => track.append(buildCard(session)));
  track.scrollLeft = scrollLeft;
}

/**
 * Non-MR (e.g. YouTube) sessions rely purely on the baked-in scheduled start
 * time — the instant it passes, the card is dropped entirely (this block
 * never shows a live state). MR sessions are explicitly excluded here: their
 * removal is owned solely by startMobileRiderPolling's poll confirmation,
 * not by scheduled time, since MR is the authoritative "has this session
 * actually started" signal for them.
 */
function scheduleStateTimers(sessions, dropSession) {
  const timers = [];

  sessions.forEach((session) => {
    if (session.mrStreamId) return;
    const { sessionTime } = session;
    if (!sessionTime) return;

    const untilStart = sessionTime.startTimeMillis - now();
    if (untilStart > 0) {
      timers.push(setTimeout(() => dropSession(session.sessionId), untilStart));
    } else {
      // Already past its start (e.g. a long-backgrounded tab recomputing on
      // visibilitychange) — drop immediately rather than missing the window.
      dropSession(session.sessionId);
    }
  });

  return timers;
}

/** §8 of the design doc: overlay on the preceding block only if it opts in. */
function attachToPrecedingBlock(el) {
  const previous = el.previousElementSibling;
  if (previous?.classList.contains('attach-upcoming')) {
    el.classList.add('upcoming-sessions--attached');
    previous.classList.add('attach-upcoming--has-overlay');
  }
}

/**
 * Reads a key/value row from the sibling `.section-metadata` block in the
 * same section — the session array is authored there (not in this block's
 * own table), since Milo's section-metadata block only handles a fixed set
 * of known keys internally and doesn't expose arbitrary custom keys anywhere
 * else for a sibling block to read.
 */
function readSectionMetadata(el, key) {
  const metadataBlock = el.closest('.section')?.querySelector(':scope > .section-metadata');
  if (!metadataBlock) return null;
  const rows = metadataBlock.querySelectorAll(':scope > div');
  for (const row of rows) {
    const cells = row.querySelectorAll(':scope > div');
    const rowKey = cells[0]?.textContent?.trim().toLowerCase();
    if (rowKey === key) return cells[1]?.textContent?.trim() ?? '';
  }
  return null;
}

/**
 * Polls the real Mobile Rider endpoint (services/sessions/mobile-rider-
 * controller.js) for any authored session that has an mrStreamId, rather
 * than relying on session-store.js's currently-mocked poller. Starts polling
 * a given session only once its own scheduled start time arrives — never
 * before — since MR has nothing to report on a session that hasn't started
 * yet.
 *
 * This block never shows a "live" state: the first time MR confirms a
 * session has actually started, `onStarted(startedIds)` fires with the
 * mrStreamIds that just went active, the card is removed, and that
 * session's mrStreamId is permanently excluded from all future polling —
 * there's nothing further to check for it once it's been dropped. Once
 * every MR session has been resolved this way, the interval itself is
 * cleared automatically.
 */
function startMobileRiderPolling(sessions, onStarted) {
  const mrSessions = sessions.filter((s) => s.mrStreamId);
  if (!mrSessions.length) return null;

  const resolvedIds = new Set();
  let intervalId = null;

  function dueIds(nowMs) {
    return [...new Set(
      mrSessions
        .filter((s) => !resolvedIds.has(s.mrStreamId) && (s.sessionTime?.startTimeMillis ?? 0) <= nowMs)
        .map((s) => s.mrStreamId),
    )];
  }

  async function tick() {
    const ids = dueIds(now());
    if (!ids.length) return;
    try {
      const { active } = await mobileRiderController.getMediaStatus(ids);
      const startedIds = ids.filter((id) => active.includes(id));
      if (!startedIds.length) return;
      startedIds.forEach((id) => resolvedIds.add(id));
      onStarted(startedIds);
      if (intervalId && mrSessions.every((s) => resolvedIds.has(s.mrStreamId))) {
        clearInterval(intervalId);
        intervalId = null;
      }
    } catch (error) {
      window.lana?.log(`upcoming-sessions: mobile rider poll failed: ${error.message}`);
    }
  }

  // A per-session kick exactly at its own start time, so polling begins the
  // instant the session starts rather than waiting for the next 30s interval
  // boundary — plus the immediate tick() below for sessions already underway.
  const startTimers = mrSessions
    .map((s) => (s.sessionTime?.startTimeMillis ?? 0) - now())
    .filter((untilStart) => untilStart > 0)
    .map((untilStart) => setTimeout(tick, untilStart));

  tick();
  intervalId = setInterval(tick, MR_POLL_INTERVAL_MS);

  return () => {
    startTimers.forEach(clearTimeout);
    if (intervalId) clearInterval(intervalId);
  };
}

export default async function init(el) {
  performance.mark('upcoming-sessions:init-start');
  try {
    await decorate(el);
  } finally {
    performance.mark('upcoming-sessions:init-end');
    performance.measure('upcoming-sessions:init', 'upcoming-sessions:init-start', 'upcoming-sessions:init-end');
  }
}

async function decorate(el) {
  // Mirrors sessions-hub's own defensive re-init cleanup (sessions-hub.js) —
  // there's no framework-level teardown hook for this block, so if decorate()
  // ever runs again on the same el (re-decoration), tear down the previous
  // instance's timers/polling/subscriptions/listener before building new ones.
  el._upcomingSessionsCleanup?.();

  attachToPrecedingBlock(el);

  const rows = el.querySelectorAll(':scope > div');
  const heading = rows[0]?.textContent?.trim();
  const payload = readSectionMetadata(el, 'upcoming-sessions');

  let sessions = [];
  try {
    sessions = payload ? JSON.parse(payload) : [];
  } catch (error) {
    window.lana?.log(`upcoming-sessions: failed to parse session payload: ${error.message}`);
    el.remove();
    return;
  }

  if (!sessions.length) {
    el.remove();
    return;
  }

  initSessionState();

  el.innerHTML = '';
  el.setAttribute('role', 'region');
  if (heading) el.setAttribute('aria-label', heading);
  // Desktop only shows the scroll arrows when there's more than one card's
  // worth of peeking to scroll to (i.e. more than 2 sessions).
  el.dataset.fewSessions = String(sessions.length <= 2);

  const track = createTag('div', { class: 'upcoming-sessions-track' });
  renderTrack(track, sessions);

  const header = createTag('div', { class: 'upcoming-sessions-header' }, '', { parent: el });
  if (heading) createTag('h6', { class: 'upcoming-sessions-heading' }, heading, { parent: header });
  header.append(buildCarouselControls(track));

  el.append(track);

  // Cards are removed permanently as sessions start (never shown live) — drop
  // a session from both the DOM and this list together so a later full
  // re-render (favorited/scheduled/pending changes) can't resurrect it.
  function dropSession(sessionId) {
    removeCard(el, sessionId);
    sessions = sessions.filter((session) => session.sessionId !== sessionId);
  }

  let timers = scheduleStateTimers(sessions, dropSession);

  // MR confirms a session has actually started -> remove its card and stop
  // polling it (startMobileRiderPolling already excludes resolved ids from
  // future polls); this block never shows a live state in between.
  function onSessionsStarted(startedIds) {
    sessions
      .filter((session) => startedIds.includes(session.mrStreamId))
      .forEach((session) => dropSession(session.sessionId));
  }

  const stopMobileRiderPolling = startMobileRiderPolling(sessions, onSessionsStarted);
  const unsubscribeFavorited = favorited.subscribe(() => renderTrack(track, sessions));
  const unsubscribeScheduled = scheduled.subscribe(() => renderTrack(track, sessions));
  const unsubscribePending = pendingActions.subscribe(() => renderTrack(track, sessions));

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    timers.forEach(clearTimeout);
    timers = scheduleStateTimers(sessions, dropSession);
    renderTrack(track, sessions);
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  el._upcomingSessionsCleanup = () => {
    timers.forEach(clearTimeout);
    if (stopMobileRiderPolling) stopMobileRiderPolling();
    unsubscribeFavorited();
    unsubscribeScheduled();
    unsubscribePending();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
