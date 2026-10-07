import { expect } from '@esm-bundle/chai';

// MWPW-210137: on a short full page, header popovers must not be clipped at the footer.
describe('Short full-page Session Guide popovers', () => {
  let frame;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    frame = document.createElement('iframe');
    frame.style.border = '0';
    frame.style.width = '1440px';
    frame.style.height = '900px';
  });

  afterEach(() => {
    frame.remove();
  });

  async function loadFrame() {
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
      frame.src = '/test/unit/c2/blocks/sessions-guide/mocks/full-page-popover-clip.html';
      document.body.append(frame);
    });
    return frame.contentDocument;
  }

  // True when, scrolled into view, nothing (e.g. the footer) covers the element's centre.
  function isReachable(el) {
    el.scrollIntoView({ block: 'center' });
    const box = el.getBoundingClientRect();
    const hit = el.ownerDocument.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit === el || el.contains(hit);
  }

  function openFilterPanel(doc) {
    const panel = doc.createElement('div');
    panel.className = 'sg-filter-panel';
    panel.innerHTML = `
      <div style="flex: 1"></div>
      <div class="sg-filter-panel__actions">
        <button class="sg-filter-panel__apply" type="button">Apply</button>
        <button class="sg-filter-panel__reset" type="button">Reset all</button>
      </div>`;
    doc.querySelector('.sg-filter-wrap').append(panel);
    return panel;
  }

  function openViewMenu(doc) {
    const menu = doc.createElement('ul');
    menu.className = 'sg-view-menu';
    menu.setAttribute('role', 'listbox');
    menu.innerHTML = ['Live & upcoming', 'My sessions', 'My favorites', 'On demand']
      .map((label) => `<li class="sg-view-menu-item" role="option">${label}</li>`).join('');
    doc.querySelector('.sg-view-dropdown-wrap').append(menu);
    return menu;
  }

  it('keeps the page short enough to reproduce the bug (panel extends past the section)', async () => {
    const doc = await loadFrame();
    const panel = openFilterPanel(doc);
    const section = doc.querySelector('.section');
    expect(panel.getBoundingClientRect().bottom).to.be.greaterThan(section.getBoundingClientRect().bottom);
  });

  it('keeps the filter panel\'s Apply and Reset all reachable above the footer', async () => {
    const doc = await loadFrame();
    const panel = openFilterPanel(doc);
    expect(isReachable(panel.querySelector('.sg-filter-panel__apply'))).to.equal(true);
    expect(isReachable(panel.querySelector('.sg-filter-panel__reset'))).to.equal(true);
  });

  it('keeps every view menu option reachable', async () => {
    const doc = await loadFrame();
    const options = [...openViewMenu(doc).querySelectorAll('.sg-view-menu-item')];
    options.forEach((option) => expect(isReachable(option), option.textContent).to.equal(true));
  });

  it('only unclips vertically, and only while a popover is open', async () => {
    const doc = await loadFrame();
    const section = doc.querySelector('.section');
    const view = frame.contentWindow;
    expect(view.getComputedStyle(section).overflowY).to.equal('clip');

    const panel = openFilterPanel(doc);
    expect(view.getComputedStyle(section).overflowY).to.equal('visible');
    expect(view.getComputedStyle(section).overflowX).to.equal('clip');

    panel.remove();
    expect(view.getComputedStyle(section).overflowY).to.equal('clip');
  });
});
