import { render } from '../v1/deps/htm-preact.js';
import { html } from './htm-wrapper.js';
import { DAProvider } from './context/DAContext.js';
import { SchedulesProvider } from './context/SchedulesContext.js';
import { NavigationProvider } from './context/NavigationContext.js';
import ScheduleMaker from './ScheduleMaker.js';

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
    import(`${LIBS}/features/spectrum-web-components/dist/checkbox.js`),
    import(`${LIBS}/features/spectrum-web-components/dist/field-label.js`),
    import(`${LIBS}/features/spectrum-web-components/dist/picker.js`),
    import(`${LIBS}/features/spectrum-web-components/dist/search.js`),
  ]);
}

async function init() {
  await loadSpectrumComponents();

  render(
    html`
      <${DAProvider}>
        <${NavigationProvider}>
          <${SchedulesProvider}>
            <${ScheduleMaker} />
          </${SchedulesProvider}>
        </${NavigationProvider}>
      </${DAProvider}>
    `,
    document.getElementById('app'),
  );
}

init();
