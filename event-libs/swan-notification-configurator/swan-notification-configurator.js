import { render, html } from '../v1/deps/htm-preact.js';
import { DAProvider } from './context/DAContext.js';
import { NavigationProvider } from './context/NavigationContext.js';
import { ConfigsProvider } from './context/ConfigsContext.js';
import SwanNotificationConfigurator from './SwanNotificationConfigurator.js';

// Standalone/local-dev entry only — production always mounts this via
// tier-1-event-configurator/TierOneEventConfigurator.js's "SWAN Notifications" tab,
// which supplies eventId/eventName props this bare entry point has no way to provide.
// Plain HTML/CSS — no Spectrum Web Components (swan-notification-configurator.css).
async function init() {
  render(
    html`
      <${DAProvider}>
        <${NavigationProvider}>
          <${ConfigsProvider}>
            <${SwanNotificationConfigurator} />
          </${ConfigsProvider}>
        </${NavigationProvider}>
      </${DAProvider}>
    `,
    document.getElementById('app'),
  );
}

init();
