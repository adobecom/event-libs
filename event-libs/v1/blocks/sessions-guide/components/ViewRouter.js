import { html } from '../../../deps/htm-preact.js';
import { useSessionGuide } from '../store/index.js';
import { LiveUpcomingView } from './LiveUpcomingView.js';
import { MySessionsView } from './MySessionsView.js';
import { MyFavoritesView } from './MyFavoritesView.js';
import { OnDemandView } from './OnDemandView.js';

export const buildViewRouter = () => ViewRouter;

export function ViewRouter() {
  const { state } = useSessionGuide();
  const { activeView } = state;
  if (activeView === 'my-sessions') return html`<${MySessionsView} />`;
  if (activeView === 'my-favorites') return html`<${MyFavoritesView} />`;
  if (activeView === 'on-demand') return html`<${OnDemandView} />`;
  return html`<${LiveUpcomingView} />`;
}
