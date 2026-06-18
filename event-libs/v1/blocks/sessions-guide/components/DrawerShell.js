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
      const headerEl = el.querySelector('.sg-header');
      const liveEl = el.querySelector('.sg-live-section');
      const rowEl = el.querySelector('.sg-time-row');
      const headerH = headerEl ? headerEl.offsetHeight : 80;
      const liveH = (liveEl && liveEl.offsetHeight > 0) ? liveEl.offsetHeight : 0;
      const rowH = rowEl ? rowEl.offsetHeight : 0;
      const peekTop = Math.max(
        getTopMargin(),
        Math.round(window.innerHeight - (headerH + liveH + rowH * 0.5)),
      );
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
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    dispatch({ type: 'SET_DRAWER', drawer: isMobile ? 'expanded' : 'peek' });
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
      ${!isOpen && html`<button class="sg-cta-btn" onclick=${openDrawer} type="button">Browse Sessions</button>`}
    </div>
  `;
}
