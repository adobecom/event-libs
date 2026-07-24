import { render } from '../v1/deps/htm-preact.js';
import { html } from './htm-wrapper.js';
import { DAProvider } from './context/DAContext.js';
import { NavigationProvider } from './context/NavigationContext.js';
import { ConfigsProvider } from './context/ConfigsContext.js';
import TierOneEventConfigurator from './TierOneEventConfigurator.js';

// No Spectrum Web Components — plain HTML/CSS (tier-1-event-configurator.css)
// instead. This app fought SWC's shadow-DOM styling model more than it
// benefited from it (static-color="black" overrides, etc.), and skipping 8
// remote script loads is a real win for a small internal tool.
async function init() {
  render(
    html`
      <${DAProvider}>
        <${NavigationProvider}>
          <${ConfigsProvider}>
            <${TierOneEventConfigurator} />
          </${ConfigsProvider}>
        </${NavigationProvider}>
      </${DAProvider}>
    `,
    document.getElementById('app'),
  );
}

init();
