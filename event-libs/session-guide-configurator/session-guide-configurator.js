import { render, html } from '../v1/deps/htm-preact.js';
import { DAProvider } from './context/DAContext.js';
import { NavigationProvider } from './context/NavigationContext.js';
import { ConfigsProvider } from './context/ConfigsContext.js';
import { EventEnvProvider } from './context/EventEnvContext.js';
import SessionGuideConfigurator from './SessionGuideConfigurator.js';

// Plain HTML/CSS — no Spectrum Web Components (session-guide-configurator.css).
async function init() {
  render(
    html`
      <${DAProvider}>
        <${EventEnvProvider}>
          <${NavigationProvider}>
            <${ConfigsProvider}>
              <${SessionGuideConfigurator} />
            </${ConfigsProvider}>
          </${NavigationProvider}>
        </${EventEnvProvider}>
      </${DAProvider}>
    `,
    document.getElementById('app'),
  );
}

init();
