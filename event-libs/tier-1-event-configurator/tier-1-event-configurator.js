import { render } from '../v1/deps/htm-preact.js';
import { html } from './htm-wrapper.js';
import { DAProvider } from './context/DAContext.js';
import { NavigationProvider } from './context/NavigationContext.js';
import { ConfigsProvider } from './context/ConfigsContext.js';
import TierOneEventConfigurator from './TierOneEventConfigurator.js';

const LIBS = 'https://www.adobe.com/libs';

async function loadSpectrumComponents() {
  await Promise.all([
    import(`${LIBS}/deps/lit-all.min.js`),
    import(`${LIBS}/features/spectrum-web-components/dist/theme.js`),
    import(`${LIBS}/features/spectrum-web-components/dist/button.js`),
    import(`${LIBS}/features/spectrum-web-components/dist/action-button.js`),
    import(`${LIBS}/features/spectrum-web-components/dist/progress-circle.js`),
    import(`${LIBS}/features/spectrum-web-components/dist/icon.js`),
    import(`${LIBS}/features/spectrum-web-components/dist/textfield.js`),
    import(`${LIBS}/features/spectrum-web-components/dist/toast.js`),
  ]);
}

async function init() {
  await loadSpectrumComponents();

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
