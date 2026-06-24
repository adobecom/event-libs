import { html, useEffect, useRef, useState } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { DrawerHeader } from './DrawerHeader.js';
import { ViewRouter } from './ViewRouter.js';
import { SessionDetailOverlay } from './SessionDetailOverlay.js';
import { FilterPanel } from './FilterPanel.js';
import { setSessionsParam, clearSessionParams } from '../utils/url.js';

// No top gap on mobile/tablet (drawer covers the full screen); 20px gap on desktop.
const getTopMargin = () => (window.matchMedia('(max-width: 1279px)').matches ? 0 : 20);

export function DrawerShell() {
  const { state, dispatch } = useSessionGuide();
  const drawerRef = useRef(null);
  const currentTopRef = useRef(0);
  const expandedRef = useRef(false);
  const touchPrevYRef = useRef(0);
  const drawerStateRef = useRef(state.drawerState);
  const [filterOpen, setFilterOpen] = useState(false);

  // Keep drawerStateRef in sync so gesture handlers always have current value
  useEffect(() => {
    drawerStateRef.current = state.drawerState;
  }, [state.drawerState]);

  function setTop(top, animate) {
    const el = drawerRef.current;
    if (!el) return;
    el.style.transition = animate
      ? 'top 0.45s cubic-bezier(0.4, 0, 0.2, 1)'
      : 'top 0.08s linear';
    el.style.top = `${top}px`;
    currentTopRef.current = top;
  }

  // Animate drawer in response to committed drawerState changes
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    const { drawerState } = state;

    if (drawerState === 'peek') {
      expandedRef.current = false;
      document.body.style.overflow = 'hidden';
      // ≤1440px viewport width → 55% of viewport height; >1440px → 65%
      const peekHeight = Math.round(window.innerHeight * (window.innerWidth > 1440 ? 0.65 : 0.55));
      const peekTop = Math.max(getTopMargin(), window.innerHeight - peekHeight);
      el.style.transition = 'none';
      el.style.top = '100vh';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTop(peekTop, true));
      });
    } else if (drawerState === 'expanded' && !expandedRef.current) {
      document.body.style.overflow = 'hidden';
      expandedRef.current = true;
      el.style.transition = 'none';
      el.style.top = '100vh';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTop(getTopMargin(), true));
      });
    } else if (drawerState === 'hidden') {
      el.style.transition = 'top 0.45s cubic-bezier(0.4, 0, 0.2, 1)';
      el.style.top = '100vh';
      document.body.style.overflow = '';
      expandedRef.current = false;
      currentTopRef.current = 0;
      setFilterOpen(false);
    }
  }, [state.drawerState]);

  // Gesture handlers — attached once on mount, use refs for current values
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return undefined;

    function onWheel(e) {
      if (drawerStateRef.current === 'hidden' || expandedRef.current) return;
      e.preventDefault();
      if (e.deltaY > 0) {
        const topMargin = getTopMargin();
        const newTop = Math.max(topMargin, currentTopRef.current - Math.abs(e.deltaY) * 1.2);
        if (newTop <= topMargin) {
          expandedRef.current = true;
          setTop(topMargin, true);
          dispatch({ type: 'SET_DRAWER', drawer: 'expanded' });
        } else {
          setTop(newTop, false);
        }
      }
    }

    function onTouchStart(e) {
      touchPrevYRef.current = e.touches[0].clientY;
    }

    function onTouchMove(e) {
      if (drawerStateRef.current === 'hidden' || expandedRef.current) return;
      const delta = touchPrevYRef.current - e.touches[0].clientY;
      touchPrevYRef.current = e.touches[0].clientY;
      if (delta > 0) {
        const topMargin = getTopMargin();
        const newTop = Math.max(topMargin, currentTopRef.current - delta * 1.5);
        if (newTop <= topMargin) {
          expandedRef.current = true;
          setTop(topMargin, true);
          dispatch({ type: 'SET_DRAWER', drawer: 'expanded' });
        } else {
          setTop(newTop, false);
        }
        e.preventDefault();
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  // URL deep-linking on mount: open drawer for ?sessions, open detail for ?session=slug
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('sessions') || params.has('session')) {
      dispatch({ type: 'SET_DRAWER', drawer: 'expanded' });
    }
  }, []);

  // URL deep-linking: resolve ?session=slug once sessions are loaded
  useEffect(() => {
    if (state.sessionsStatus !== 'ready') return;
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    if (!sessionParam) return;
    // URL format: slug-rfCode (rfCode is after the last dash)
    const lastDash = sessionParam.lastIndexOf('-');
    const rfCode = lastDash >= 0 ? sessionParam.slice(lastDash + 1) : sessionParam;
    const found = state.sessions.find((s) => s.rfCode === rfCode || s.id === sessionParam);
    if (found) dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: found.id });
  }, [state.sessionsStatus]);

  // Keep sessionsRef current so the popstate handler always sees the latest list
  const sessionsRef = useRef(state.sessions);
  useEffect(() => { sessionsRef.current = state.sessions; }, [state.sessions]);

  // popstate listener — restores state from URL without pushing new history entries
  // Registered once (stable []); reads sessions via ref to avoid re-registering on every poll.
  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      if (params.has('session')) {
        const sessionParam = params.get('session');
        const lastDash = sessionParam.lastIndexOf('-');
        const rfCode = lastDash >= 0 ? sessionParam.slice(lastDash + 1) : sessionParam;
        const found = sessionsRef.current.find((s) => s.rfCode === rfCode || s.id === sessionParam);
        dispatch({ type: 'SET_DRAWER', drawer: 'expanded' });
        dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: found ? found.id : null });
      } else if (params.has('sessions')) {
        dispatch({ type: 'SET_DRAWER', drawer: 'expanded' });
        dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: null });
      } else {
        dispatch({ type: 'SET_DRAWER', drawer: 'hidden' });
        dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: null });
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const { drawerState, sessionsStatus, activeSessionId } = state;
  const isOpen = drawerState !== 'hidden';
  const isExpanded = drawerState === 'expanded';
  const hasDetail = !!activeSessionId;

  function closeDrawer() {
    dispatch({ type: 'SET_DRAWER', drawer: 'hidden' });
    dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: null });
    history.pushState({}, '', clearSessionParams());
  }

  function openDrawer() {
    const isNarrow = window.matchMedia('(max-width: 1279px)').matches;
    dispatch({ type: 'SET_DRAWER', drawer: isNarrow ? 'expanded' : 'peek' });
    history.pushState({}, '', setSessionsParam());
  }

  function handleDetailBack() {
    dispatch({ type: 'SET_ACTIVE_SESSION', sessionId: null });
    history.pushState({}, '', setSessionsParam());
  }

  function handleFilterToggle() {
    setFilterOpen((prev) => !prev);
  }

  function handleFilterClose() {
    setFilterOpen(false);
  }

  return html`
    <div class="sg-shell">
      ${isOpen && html`<div class="sg-backdrop" onclick=${closeDrawer} aria-hidden="true"></div>`}
      <div
        class=${'sg-drawer' + (hasDetail ? ' sg-drawer--detail-open' : '')}
        ref=${drawerRef}
        role=${isOpen ? 'dialog' : undefined}
        aria-modal=${isOpen ? 'true' : undefined}
        aria-label=${isOpen ? 'Sessions guide' : undefined}
      >
        <${DrawerHeader}
          onClose=${closeDrawer}
          onFilterToggle=${handleFilterToggle}
          filterOpen=${filterOpen}
          hideControls=${hasDetail}
        />
        <div class="sg-drawer__body">
          <div class=${`sg-body-scroll${isExpanded ? ' sg-body-scroll--scrollable' : ''}`}>
            ${sessionsStatus === 'loading' && html`<div class="sg-loading">Loading sessions…</div>`}
            ${sessionsStatus === 'error' && html`<div class="sg-error">Failed to load sessions.</div>`}
            ${sessionsStatus === 'ready' && html`<${ViewRouter} />`}
          </div>
          <div class=${'sg-detail-panel' + (hasDetail ? ' sg-detail-panel--open' : '')}>
            ${hasDetail && html`<${SessionDetailOverlay} onBack=${handleDetailBack} />`}
          </div>
        </div>
        ${filterOpen && html`<${FilterPanel} onClose=${handleFilterClose} />`}
      </div>
      ${!isOpen && html`<button class="sg-cta-btn" onclick=${openDrawer} type="button">
        See all sessions
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <path d="M15.75 3H13.75V2C13.75 1.58594 13.4141 1.25 13 1.25C12.5859 1.25 12.25 1.58594 12.25 2V3H7.75V2C7.75 1.58594 7.41406 1.25 7 1.25C6.58594 1.25 6.25 1.58594 6.25 2V3H4.25C3.00928 3 2 4.00977 2 5.25V15.75C2 16.9902 3.00928 18 4.25 18H15.75C16.9907 18 18 16.9902 18 15.75V5.25C18 4.00977 16.9907 3 15.75 3ZM4.25 4.5H6.25V5C6.25 5.41406 6.58594 5.75 7 5.75C7.41406 5.75 7.75 5.41406 7.75 5V4.5H12.25V5C12.25 5.41406 12.5859 5.75 13 5.75C13.4141 5.75 13.75 5.41406 13.75 5V4.5H15.75C16.1636 4.5 16.5 4.83691 16.5 5.25V7H3.5V5.25C3.5 4.83691 3.83643 4.5 4.25 4.5ZM15.75 16.5H4.25C3.83643 16.5 3.5 16.1631 3.5 15.75V8.5H16.5V15.75C16.5 16.1631 16.1636 16.5 15.75 16.5Z" fill="currentColor"/>
          <path d="M7 11C7 10.4477 6.55228 10 6 10C5.44772 10 5 10.4477 5 11C5 11.5523 5.44772 12 6 12C6.55228 12 7 11.5523 7 11Z" fill="currentColor"/>
          <path d="M11 11C11 10.4477 10.5523 10 10 10C9.44772 10 9 10.4477 9 11C9 11.5523 9.44772 12 10 12C10.5523 12 11 11.5523 11 11Z" fill="currentColor"/>
          <path d="M15 11C15 10.4477 14.5523 10 14 10C13.4477 10 13 10.4477 13 11C13 11.5523 13.4477 12 14 12C14.5523 12 15 11.5523 15 11Z" fill="currentColor"/>
          <path d="M7 14C7 13.4477 6.55228 13 6 13C5.44772 13 5 13.4477 5 14C5 14.5523 5.44772 15 6 15C6.55228 15 7 14.5523 7 14Z" fill="currentColor"/>
          <path d="M11 14C11 13.4477 10.5523 13 10 13C9.44772 13 9 13.4477 9 14C9 14.5523 9.44772 15 10 15C10.5523 15 11 14.5523 11 14Z" fill="currentColor"/>
          <path d="M15 14C15 13.4477 14.5523 13 14 13C13.4477 13 13 13.4477 13 14C13 14.5523 13.4477 15 14 15C14.5523 15 15 14.5523 15 14Z" fill="currentColor"/>
        </svg>
      </button>`}
    </div>
  `;
}
