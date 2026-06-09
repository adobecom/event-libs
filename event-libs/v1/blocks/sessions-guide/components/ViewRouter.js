import { buildLiveUpcomingView } from './LiveUpcomingView.js';
import { buildMySessionsView } from './MySessionsView.js';
import { buildMyFavoritesView } from './MyFavoritesView.js';
import { buildOnDemandView } from './OnDemandView.js';

export function buildViewRouter(preact, store) {
  const { html } = preact;
  const { useSessionGuide } = store;
  const LiveUpcomingView = buildLiveUpcomingView(preact, store);
  const MySessionsView = buildMySessionsView(preact, store);
  const MyFavoritesView = buildMyFavoritesView(preact, store);
  const OnDemandView = buildOnDemandView(preact, store);

  return function ViewRouter() {
    const { state } = useSessionGuide();
    const { activeView } = state;
    if (activeView === 'my-sessions') return html`<${MySessionsView} />`;
    if (activeView === 'my-favorites') return html`<${MyFavoritesView} />`;
    if (activeView === 'on-demand') return html`<${OnDemandView} />`;
    return html`<${LiveUpcomingView} />`;
  };
}
