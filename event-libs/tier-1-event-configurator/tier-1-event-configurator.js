import { render, html } from '../v1/deps/htm-preact.js';
import { DAProvider } from './context/DAContext.js';
import { NavigationProvider } from './context/NavigationContext.js';
import { ConfigsProvider } from './context/ConfigsContext.js';
import { EventEnvProvider } from './context/EventEnvContext.js';
import TierOneEventConfigurator from './TierOneEventConfigurator.js';

// No Spectrum Web Components — plain HTML/CSS (tier-1-event-configurator.css).
async function init() {
  render(
    html`
      <${DAProvider}>
        <${EventEnvProvider}>
          <${NavigationProvider}>
            <${ConfigsProvider}>
              <${TierOneEventConfigurator} />
            </${ConfigsProvider}>
          </${NavigationProvider}>
        </${EventEnvProvider}>
      </${DAProvider}>
    `,
    document.getElementById('app'),
  );
}

init();
