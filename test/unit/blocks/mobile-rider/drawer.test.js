/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import initDrawers from '../../../../event-libs/v1/blocks/mobile-rider/drawer.js';
import { createTag } from '../../../../event-libs/v1/utils/utils.js';

describe('Drawer Module', () => {
  let root;
  const mockItems = [
    { videoid: 'v1', title: 'Video 1' },
    { videoid: 'v2', title: 'Video 2' },
  ];

  beforeEach(() => {
    root = document.createElement('div');
    root.className = 'root';
    document.body.appendChild(root);
    
    // Mock Lana logger
    globalThis.lana = { log: sinon.stub() };

    // FIX: Mock scrollIntoView because JSDOM doesn't support it
    window.HTMLElement.prototype.scrollIntoView = sinon.stub();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sinon.restore();
    delete globalThis.lana;
  });

  describe('Initialization and Rendering', () => {
    it('should handle missing root gracefully via init function', () => {
      const instance = initDrawers(null);
      expect(instance).to.be.null;
      expect(globalThis.lana.log.calledWith(sinon.match(/Drawer init failed/))).to.be.true;
    });

    it('should render the correct DOM structure', () => {
      initDrawers(root, { items: mockItems });

      const drawer = root.querySelector('.drawer');
      const content = drawer.querySelector('.drawer-content');
      const itemsContainer = content.querySelector('.drawer-items');

      expect(drawer).to.exist;
      expect(content).to.exist;
      expect(itemsContainer).to.exist;
      expect(itemsContainer.children.length).to.equal(2);
    });

    it('should apply the "current" class to the first item by default', () => {
      initDrawers(root, {
        items: mockItems,
        renderItem: (data) => createTag('div', { class: 'drawer-item', 'data-id': data.videoid }, data.title),
      });

      const items = root.querySelectorAll('.drawer-item');
      expect(items[0].classList.contains('current')).to.be.true;
    });
  });

  describe('Events and Interactivity', () => {
    it('should trigger onItemClick callback when an item is clicked', async () => {
      const onClickSpy = sinon.spy();
      initDrawers(root, {
        items: mockItems,
        onItemClick: onClickSpy,
        renderItem: (data) => createTag('div', { class: 'drawer-item' }, data.title),
      });

      const secondItem = root.querySelectorAll('.drawer-item')[1];
      secondItem.click();

      expect(onClickSpy.calledOnce).to.be.true;
      expect(secondItem.classList.contains('current')).to.be.true;
      expect(root.querySelectorAll('.drawer-item')[0].classList.contains('current')).to.be.false;
    });

    it('should handle keyboard navigation (Enter key)', () => {
      const onClickSpy = sinon.spy();
      initDrawers(root, {
        items: mockItems,
        onItemClick: onClickSpy,
        renderItem: (data) => createTag('div', { class: 'drawer-item' }, data.title),
      });

      const secondItem = root.querySelectorAll('.drawer-item')[1];
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      secondItem.dispatchEvent(event);

      expect(onClickSpy.calledOnce).to.be.true;
      expect(secondItem.classList.contains('current')).to.be.true;
    });
  });

  describe('Specific Method Coverage', () => {
    describe('setActive()', () => {
      it('should update visuals and execute onClick even if onClick is async', async () => {
        let callbackFinished = false;
        const asyncOnClick = async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          callbackFinished = true;
        };

        const drawer = initDrawers(root, {
          items: mockItems,
          onItemClick: asyncOnClick,
          renderItem: (data) => createTag('div', { class: 'drawer-item', 'data-id': data.videoid }, data.title),
        });

        const secondItem = root.querySelectorAll('.drawer-item')[1];
        
        // Directly call the method on the instance
        await drawer.setActive(secondItem, mockItems[1]);

        expect(secondItem.classList.contains('current')).to.be.true;
        expect(callbackFinished).to.be.true;
        expect(window.HTMLElement.prototype.scrollIntoView.called).to.be.true;
      });

      it('should log to Lana if the onClick callback throws an error', async () => {
        const errorOnClick = () => { throw new Error('Callback Crash'); };
        const drawer = initDrawers(root, { items: mockItems, onItemClick: errorOnClick });
        const item = root.querySelector('.drawer-item');
        
        await drawer.setActive(item, mockItems[0]);

        expect(globalThis.lana.log.calledWith(sinon.match(/Click callback failed: Callback Crash/))).to.be.true;
      });
    });

    describe('remove()', () => {
      it('should remove the .drawer element from the root', () => {
        const drawer = initDrawers(root, { items: mockItems });
        expect(root.querySelector('.drawer')).to.exist;

        drawer.remove();
        expect(root.querySelector('.drawer')).to.be.null;
      });

      it('should not throw if remove() is called but element is already gone', () => {
        const drawer = initDrawers(root, { items: mockItems });
        root.querySelector('.drawer').remove();
        expect(() => drawer.remove()).to.not.throw();
      });
    });
  });
});
