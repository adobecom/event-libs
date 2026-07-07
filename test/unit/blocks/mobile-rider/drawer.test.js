/* eslint-disable no-unused-vars */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import createDrawer from '../../../../event-libs/v1/blocks/mobile-rider/drawer.js';

describe('Mobile Rider Drawer', () => {
  let mockLana;

  beforeEach(() => {
    // Mock lana
    mockLana = { log: sinon.stub() };
    globalThis.lana = mockLana;
  });

  afterEach(() => {
    sinon.restore();
    document.body.innerHTML = '';
    delete globalThis.lana;
  });

  describe('createDrawer', () => {
    it('should create drawer with valid root element', () => {
      const root = document.createElement('div');
      root.id = 'test-root';
      document.body.appendChild(root);

      const items = [
        { videoid: 'video1', title: 'Video 1', description: 'Description 1' },
        { videoid: 'video2', title: 'Video 2', description: 'Description 2' },
      ];

      const renderItem = (item) => {
        const div = document.createElement('div');
        div.textContent = item.title;
        return div;
      };

      const onItemClick = sinon.stub();

      const drawer = createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      expect(drawer).to.not.be.null;
      expect(drawer.itemsEl).to.not.be.null;
      expect(drawer.itemsEl.children.length).to.equal(2);
    });

    it('should handle missing root element', () => {
      const items = [{ videoid: 'video1', title: 'Video 1' }];
      const renderItem = (_item) => document.createElement('div');
      const onItemClick = sinon.stub();

      const drawer = createDrawer(null, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      // The actual implementation catches the error and returns null
      expect(drawer).to.be.null;
    });

    it('should handle empty items array', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const renderItem = (_item) => document.createElement('div');
      const onItemClick = sinon.stub();

      const drawer = createDrawer(root, {
        items: [],
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      expect(drawer).to.not.be.null;
      expect(drawer.itemsEl.children.length).to.equal(0);
    });

    it('should handle missing renderItem function', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const items = [{ videoid: 'video1', title: 'Video 1' }];
      const onItemClick = sinon.stub();

      const drawer = createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        onItemClick,
      });

      // The actual implementation provides a default renderItem
      expect(drawer).to.not.be.null;
    });

    it('should handle missing onItemClick function', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const items = [{ videoid: 'video1', title: 'Video 1' }];
      const renderItem = (_item) => document.createElement('div');

      const drawer = createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
      });

      // The actual implementation provides a default onClick
      expect(drawer).to.not.be.null;
    });

    it('should create drawer with proper ARIA attributes', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const items = [{ videoid: 'video1', title: 'Video 1' }];
      const renderItem = (item) => {
        const div = document.createElement('div');
        div.textContent = item.title;
        return div;
      };
      const onItemClick = sinon.stub();

      createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      const drawerElement = root.querySelector('.drawer');
      expect(drawerElement.getAttribute('aria-label')).to.equal('Test Drawer');
    });

    it('should handle item click events', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const items = [{ videoid: 'video1', title: 'Video 1' }];
      const renderItem = (item) => {
        const div = document.createElement('div');
        div.textContent = item.title;
        return div;
      };
      const onItemClick = sinon.stub();

      const drawer = createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      const firstItem = drawer.itemsEl.firstChild;
      firstItem.click();

      expect(onItemClick.called).to.be.true;
      expect(onItemClick.firstCall.args[0]).to.equal(firstItem);
      expect(onItemClick.firstCall.args[1]).to.deep.equal(items[0]);
    });

    it('should handle keyboard navigation', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const items = [
        { videoid: 'video1', title: 'Video 1' },
        { videoid: 'video2', title: 'Video 2' },
      ];
      const renderItem = (item) => {
        const div = document.createElement('div');
        div.textContent = item.title;
        return div;
      };
      const onItemClick = sinon.stub();

      const drawer = createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      const firstItem = drawer.itemsEl.firstChild;
      const secondItem = drawer.itemsEl.children[1];

      // Test Enter key
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      firstItem.dispatchEvent(enterEvent);

      expect(onItemClick.called).to.be.true;

      // Test Space key
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
      secondItem.dispatchEvent(spaceEvent);

      expect(onItemClick.callCount).to.equal(2);
    });

    it('should handle drawer with custom styling', () => {
      const root = document.createElement('div');
      root.className = 'custom-drawer-root';
      document.body.appendChild(root);

      const items = [{ videoid: 'video1', title: 'Video 1' }];
      const renderItem = (item) => {
        const div = document.createElement('div');
        div.className = 'custom-item';
        div.textContent = item.title;
        return div;
      };
      const onItemClick = sinon.stub();

      const drawer = createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      expect(drawer.itemsEl).to.not.be.null;
      expect(drawer.itemsEl.firstChild.className).to.include('custom-item');
    });

    it('should handle drawer with complex item structure', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const items = [
        {
          videoid: 'video1',
          title: 'Video 1',
          description: 'Description 1',
          thumbnail: 'thumb1.jpg',
        },
      ];

      const renderItem = (item) => {
        const div = document.createElement('div');
        div.className = 'drawer-item';

        if (item.thumbnail) {
          const img = document.createElement('img');
          img.src = item.thumbnail;
          img.alt = item.title;
          div.appendChild(img);
        }

        const titleDiv = document.createElement('div');
        titleDiv.className = 'item-title';
        titleDiv.textContent = item.title;
        div.appendChild(titleDiv);

        if (item.description) {
          const descDiv = document.createElement('div');
          descDiv.className = 'item-description';
          descDiv.textContent = item.description;
          div.appendChild(descDiv);
        }

        return div;
      };

      const onItemClick = sinon.stub();

      const drawer = createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      const item = drawer.itemsEl.firstChild;
      expect(item.className).to.include('drawer-item');
      expect(item.querySelector('.item-title')).to.not.be.null;
      expect(item.querySelector('.item-description')).to.not.be.null;
      expect(item.querySelector('img')).to.not.be.null;
    });

    it('should set first item as current by default', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const items = [
        { videoid: 'video1', title: 'Video 1' },
        { videoid: 'video2', title: 'Video 2' },
      ];
      const renderItem = (item) => {
        const div = document.createElement('div');
        div.textContent = item.title;
        return div;
      };
      const onItemClick = sinon.stub();

      const drawer = createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      const firstItem = drawer.itemsEl.firstChild;
      expect(firstItem.classList.contains('current')).to.be.true;
    });
  });

  describe('Error handling', () => {
    it('should handle renderItem function that throws', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const items = [{ videoid: 'video1', title: 'Video 1' }];
      const renderItem = () => {
        throw new Error('Render error');
      };
      const onItemClick = sinon.stub();

      const drawer = createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      // The actual implementation catches errors and returns null
      expect(drawer).to.be.null;
    });

    it('should handle onItemClick function that throws', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const items = [{ videoid: 'video1', title: 'Video 1' }];
      const renderItem = (item) => {
        const div = document.createElement('div');
        div.textContent = item.title;
        return div;
      };
      const onItemClick = () => {
        throw new Error('Click error');
      };

      const drawer = createDrawer(root, {
        items,
        ariaLabel: 'Test Drawer',
        renderItem,
        onItemClick,
      });

      const item = drawer.itemsEl.firstChild;

      // Should not throw when clicked
      expect(() => {
        item.click();
      }).to.not.throw();
    });
  });

  describe('Drawer methods coverage', () => {
    let drawer;
    let items;
    let root;

    beforeEach(() => {
      items = [
        { videoid: 'vid1', title: 'Video 1' },
        { videoid: 'vid2', title: 'Video 2' },
      ];
      root = document.createElement('div');
      document.body.appendChild(root);
      const renderItem = (item) => {
        const div = document.createElement('div');
        div.className = 'drawer-item';
        div.setAttribute('data-id', item.videoid);
        return div;
      };
      drawer = createDrawer(root, { items, renderItem });
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should apply current class to target element in setActiveById', () => {
      drawer.setActiveById('vid2');
      const vid1El = drawer.itemsEl.querySelector('[data-id="vid1"]');
      const vid2El = drawer.itemsEl.querySelector('[data-id="vid2"]');
      expect(vid1El.classList.contains('current')).to.be.false;
      expect(vid2El.classList.contains('current')).to.be.true;
    });

    it('should do nothing if id not found in setActiveById', () => {
      const vid1El = drawer.itemsEl.querySelector('[data-id="vid1"]');
      expect(() => drawer.setActiveById('vidX')).to.not.throw();
      expect(vid1El.classList.contains('current')).to.be.true;
    });

    it('should do nothing when itemsEl is null', () => {
      drawer.itemsEl = null;
      expect(() => drawer.setActiveById('vid1')).to.not.throw();
    });

    it('should do nothing when id is not provided', () => {
      expect(() => drawer.setActiveById(null)).to.not.throw();
    });

    it('should not throw when clicked without onItemClick handler', () => {
      const item = drawer.itemsEl.firstChild;
      expect(() => { item.click(); }).to.not.throw();
    });

    it('remove() should remove the drawer element from the root', () => {
      expect(root.querySelector('.drawer')).to.not.be.null;
      drawer.remove();
      expect(root.querySelector('.drawer')).to.be.null;
    });

    it('remove() should not throw when drawer element is already gone', () => {
      drawer.remove();
      expect(() => drawer.remove()).to.not.throw();
    });
  });
});
