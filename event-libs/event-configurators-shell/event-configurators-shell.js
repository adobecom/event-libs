import { render, html } from '../v1/deps/htm-preact.js';
import EventConfiguratorsShell from './EventConfiguratorsShell.js';

// No Spectrum Web Components — plain HTML/CSS (event-configurators-shell.css).
async function init() {
  render(html`<${EventConfiguratorsShell} />`, document.getElementById('app'));
}

init();
