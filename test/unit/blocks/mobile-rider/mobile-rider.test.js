/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../../../event-libs/v1/blocks/mobile-rider/mobile-rider.js';

const defaultHtml = `
<div class="mobile-rider">
  <div>
    <div>video-id</div>
    <div>test-video-123</div>
  </div>
  <div>
    <div>skin-id</div>
    <div>default-skin</div>
  </div>
  <div>
    <div>autoplay</div>
    <div>true</div>
  </div>
  <div>
    <div>controls</div>
    <div>true</div>
  </div>
  <div>
    <div>muted</div>
    <div>true</div>
  </div>
  <div>
    <div>asl-id</div>
    <div>test-asl-456</div>
  </div>
  <div>
    <div>concurrentenabled</div>
    <div>false</div>
  </div>
</div>
`;

describe('Mobile Rider Module', () => {
  let mockLana;
  let riderInstance = null;

  beforeEach(() => {
    mockLana = { log: sinon.stub() };
    globalThis.lana = mockLana;

    globalThis.mobilerider = { embed: sinon.stub() };

    globalThis.__mr_player = {
      dispose: sinon.stub(),
      off: sinon.stub(),
      on: sinon.stub(),
    };
  });

  afterEach(() => {
    sinon.restore();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete globalThis.lana;
    delete globalThis.mobilerider;
    delete globalThis.__mr_player;
    riderInstance = null;
  });

  describe('init', () => {
    it('should initialize MobileRider with valid element', async () => {
      document.body.innerHTML = defaultHtml;
      const el = document.querySelector('.mobile-rider');
      expect(el).to.not.be.null;

      riderInstance = init(el);
      expect(riderInstance).to.not.be.null;
      expect(riderInstance.el).to.equal(el);

      await new Promise((resolve) => { setTimeout(resolve, 100); });

      const player = el.querySelector('.mobile-rider-player');
      expect(player).to.not.be.null;
      const wrapper = player.querySelector('.video-wrapper');
      expect(wrapper).to.not.be.null;
    });

    it('should handle initialization errors gracefully', async () => {
      document.body.innerHTML = defaultHtml;
      const el = document.querySelector('.mobile-rider');
      const result = init(el);
      expect(result).to.not.be.undefined;
    });

    it('should convert a link-block anchor to a mobile-rider div', () => {
      document.body.innerHTML = `
        <a class="link-block" href="https://example.com/player?videoId=abc123&skinId=skin1&autoplay=true">Watch</a>
      `;
      const anchor = document.querySelector('a');
      riderInstance = init(anchor);
      expect(document.querySelector('.mobile-rider')).to.not.be.null;
      expect(document.querySelector('a')).to.be.null;
    });

    it('should not replace non-link-block anchors', () => {
      document.body.innerHTML = '<a href="/page">Link</a>';
      const anchor = document.querySelector('a');
      const result = init(anchor);
      expect(result.el.tagName).to.equal('A');
    });
  });

  describe('MobileRider class methods', () => {
    let el;

    beforeEach(async () => {
      document.body.innerHTML = defaultHtml;
      el = document.querySelector('.mobile-rider');

      riderInstance = init(el);
      await new Promise((resolve) => { setTimeout(resolve, 100); });

      expect(riderInstance).to.not.be.null;
    });

    describe('injectPlayer', () => {
      beforeEach(() => {
        sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => setTimeout(cb, 0));

        globalThis.__mr_player = {
          dispose: sinon.stub(),
          off: sinon.stub(),
          on: sinon.stub(),
        };

        globalThis.mobilerider.embed = sinon.stub();

        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        el.appendChild(videoWrapper);
        riderInstance.wrap = videoWrapper;
        riderInstance.isEmbedding = false;
      });

      it('should create container with data-videoid', () => {
        riderInstance.injectPlayer('test-video', 'test-skin', 'test-asl');
        const container = riderInstance.wrap.querySelector('.mobile-rider-container');
        expect(container).to.not.be.null;
        expect(container.getAttribute('data-videoid')).to.equal('test-video');
      });

      it('should create video element with correct id and class', () => {
        riderInstance.injectPlayer('test-video', 'test-skin', 'test-asl');
        const video = riderInstance.wrap.querySelector('#idPlayer');
        expect(video).to.not.be.null;
        expect(video.classList.contains('mobileRider_viewport')).to.be.true;
      });

      it('should call mobilerider.embed after next frame', async () => {
        riderInstance.injectPlayer('test-video', 'test-skin', 'test-asl');
        await new Promise((resolve) => { setTimeout(resolve, 50); });
        expect(globalThis.mobilerider.embed.called).to.be.true;
      });

      it('should skip injection when already embedding', () => {
        riderInstance.isEmbedding = true;
        riderInstance.injectPlayer('test-video', 'test-skin');
        expect(riderInstance.wrap.querySelector('.mobile-rider-container')).to.be.null;
      });

      it('should attach end listener when mainID exists in store', async () => {
        riderInstance.mainID = 'main-video';
        riderInstance.store = { get: sinon.stub().returns(true) };
        riderInstance.injectPlayer('test-video', 'test-skin');
        // injectPlayer nulls __mr_player synchronously; restore before RAF fires
        const player = { off: sinon.stub(), on: sinon.stub() };
        globalThis.__mr_player = player;
        await new Promise((resolve) => { setTimeout(resolve, 50); });
        expect(player.off.calledWith('streamend')).to.be.true;
        expect(player.on.calledWith('streamend')).to.be.true;
      });

      it('should attach end listener when vid exists in store but mainID does not', async () => {
        riderInstance.mainID = 'main-video';
        riderInstance.store = {
          get: sinon.stub().callsFake((key) => (key === 'test-video' ? true : undefined)),
        };
        riderInstance.injectPlayer('test-video', 'test-skin');
        const player = { off: sinon.stub(), on: sinon.stub() };
        globalThis.__mr_player = player;
        await new Promise((resolve) => { setTimeout(resolve, 50); });
        expect(player.on.calledWith('streamend')).to.be.true;
      });

      it('should not attach end listener when neither mainID nor vid is in store', async () => {
        riderInstance.mainID = 'main-video';
        riderInstance.store = { get: sinon.stub().returns(undefined) };
        riderInstance.injectPlayer('test-video', 'test-skin');
        const player = { off: sinon.stub(), on: sinon.stub() };
        globalThis.__mr_player = player;
        await new Promise((resolve) => { setTimeout(resolve, 50); });
        expect(player.on.called).to.be.false;
      });

      it('should not attach end listener when store is null', async () => {
        riderInstance.store = null;
        riderInstance.injectPlayer('test-video', 'test-skin');
        const player = { off: sinon.stub(), on: sinon.stub() };
        globalThis.__mr_player = player;
        await new Promise((resolve) => { setTimeout(resolve, 50); });
        expect(player.on.called).to.be.false;
      });
    });

    describe('setStatus', () => {
      it('should use mainID when it exists in store', () => {
        riderInstance.mainID = 'main-video';
        const mockStore = { get: sinon.stub().returns(false), set: sinon.stub() };
        riderInstance.store = mockStore;

        riderInstance.setStatus('test-video', true);

        expect(mockStore.set.calledWith('main-video', true)).to.be.true;
      });

      it('should use videoID when mainID does not exist in store', () => {
        riderInstance.mainID = 'main-video';
        const mockStore = {
          get: sinon.stub().callsFake((key) => {
            if (key === 'main-video') return undefined;
            if (key === 'test-video') return false;
            return undefined;
          }),
          set: sinon.stub(),
        };
        riderInstance.store = mockStore;

        riderInstance.setStatus('test-video', true);

        expect(mockStore.set.calledWith('test-video', true)).to.be.true;
      });

      it('should not call set when neither mainID nor videoID is in store', () => {
        riderInstance.mainID = 'main-video';
        const mockStore = { get: sinon.stub().returns(undefined), set: sinon.stub() };
        riderInstance.store = mockStore;

        riderInstance.setStatus('test-video', true);

        expect(mockStore.set.called).to.be.false;
      });

      it('should not call set when status is unchanged', () => {
        riderInstance.mainID = 'main-video';
        const mockStore = { get: sinon.stub().returns(true), set: sinon.stub() };
        riderInstance.store = mockStore;

        riderInstance.setStatus('test-video', true);

        expect(mockStore.set.called).to.be.false;
      });

      it('should update store when status changes from true to false', () => {
        riderInstance.mainID = 'main-video';
        const mockStore = { get: sinon.stub().returns(true), set: sinon.stub() };
        riderInstance.store = mockStore;

        riderInstance.setStatus('test-video', false);

        expect(mockStore.set.calledWith('main-video', false)).to.be.true;
      });

      it('should use videoID when mainID is null and videoID exists', () => {
        riderInstance.mainID = null;
        const mockStore = { get: sinon.stub().returns(false), set: sinon.stub() };
        riderInstance.store = mockStore;

        riderInstance.setStatus('test-video', true);

        expect(mockStore.set.calledWith('test-video', true)).to.be.true;
      });

      it('should not throw when store is missing', () => {
        expect(() => riderInstance.setStatus('test-video', true)).to.not.throw();
      });

      it('should not call set when id is null', () => {
        riderInstance.store = { get: sinon.stub(), set: sinon.stub() };

        riderInstance.setStatus(null, true);

        expect(riderInstance.store.set.called).to.be.false;
      });
    });

    describe('streamend callback', () => {
      beforeEach(() => {
        sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => setTimeout(cb, 0));
        globalThis.mobilerider.embed = sinon.stub();
      });

      it('should remove drawer, update status, and dispose player on streamend', async () => {
        riderInstance.mainID = 'main-video';
        const mockStore = { get: sinon.stub().returns(true), set: sinon.stub() };
        riderInstance.store = mockStore;
        riderInstance.drawer = { remove: sinon.stub() };

        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        el.appendChild(videoWrapper);
        riderInstance.wrap = videoWrapper;
        riderInstance.isEmbedding = false;

        riderInstance.injectPlayer('test-video', 'test-skin');

        const player = {
          off: sinon.stub(),
          on: sinon.stub(),
          dispose: sinon.stub(),
        };
        globalThis.__mr_player = player;
        await new Promise((resolve) => { setTimeout(resolve, 50); });

        // Extract and invoke the streamend handler
        const onCall = player.on.getCalls().find((c) => c.args[0] === 'streamend');
        expect(onCall).to.not.be.undefined;
        onCall.args[1]();

        expect(riderInstance.drawer).to.be.null;
        expect(mockStore.set.called).to.be.true;
        expect(player.dispose.called).to.be.true;
        expect(globalThis.__mr_player).to.be.null;
      });

      it('should handle streamend when drawer is null', async () => {
        riderInstance.mainID = 'main-video';
        riderInstance.store = { get: sinon.stub().returns(true), set: sinon.stub() };
        riderInstance.drawer = null;

        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        el.appendChild(videoWrapper);
        riderInstance.wrap = videoWrapper;
        riderInstance.isEmbedding = false;

        riderInstance.injectPlayer('test-video', 'test-skin');
        const player = { off: sinon.stub(), on: sinon.stub(), dispose: sinon.stub() };
        globalThis.__mr_player = player;
        await new Promise((resolve) => { setTimeout(resolve, 50); });

        const onCall = player.on.getCalls().find((c) => c.args[0] === 'streamend');
        expect(() => onCall.args[1]()).to.not.throw();
      });
    });

    describe('embed error handling', () => {
      beforeEach(() => {
        sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => setTimeout(cb, 0));
      });

      it('should log Embed Error when embed throws', async () => {
        globalThis.mobilerider.embed = sinon.stub().throws(new Error('embed boom'));

        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        el.appendChild(videoWrapper);
        riderInstance.wrap = videoWrapper;
        riderInstance.isEmbedding = false;

        riderInstance.injectPlayer('test-video', 'test-skin');
        globalThis.__mr_player = null;
        await new Promise((resolve) => { setTimeout(resolve, 50); });

        expect(mockLana.log.calledWithMatch(/Embed Error/)).to.be.true;
      });

      it('should log Inject Error when wrap.innerHTML assignment throws', async () => {
        const badWrap = {};
        Object.defineProperty(badWrap, 'innerHTML', {
          set() { throw new Error('inject boom'); },
        });
        riderInstance.wrap = badWrap;
        riderInstance.isEmbedding = false;

        riderInstance.injectPlayer('test-video', 'test-skin');
        await new Promise((resolve) => { setTimeout(resolve, 50); });

        expect(mockLana.log.calledWithMatch(/Inject Error/)).to.be.true;
      });
    });

    describe('#storeHas error handling', () => {
      it('should return false when store.get throws', () => {
        riderInstance.store = {
          get: sinon.stub().throws(new Error('get boom')),
          set: sinon.stub(),
        };
        riderInstance.mainID = 'main-video';

        riderInstance.setStatus('test-video', true);

        expect(riderInstance.store.set.called).to.be.false;
      });
    });

    describe('#updateStatus error handling', () => {
      it('should log when store.set throws', () => {
        riderInstance.mainID = 'main-video';
        riderInstance.store = {
          get: sinon.stub().returns(false),
          set: sinon.stub().throws(new Error('set boom')),
        };

        riderInstance.setStatus('test-video', true);

        expect(mockLana.log.calledWithMatch(/Status update failed/)).to.be.true;
      });
    });

    describe('#selectInitialVideo', () => {
      it('should select video by ?video= query param', async () => {
        const concurrentHtml = `
          <div class="mobile-rider">
            <div><div>concurrentenabled</div><div>true</div></div>
            <div><div>concurrentvideoid1</div><div>video1</div></div>
            <div><div>concurrentvideoid2</div><div>video2</div></div>
            <div><div>concurrenttitle1</div><div>Title 1</div></div>
            <div><div>concurrenttitle2</div><div>Title 2</div></div>
          </div>
        `;

        const originalSearch = window.location.search;
        const url = new URL(window.location.href);
        url.searchParams.set('video', '2');
        window.history.replaceState({}, '', url.toString());

        document.body.innerHTML = concurrentHtml;
        const concEl = document.querySelector('.mobile-rider');
        const instance = init(concEl);
        await new Promise((resolve) => { setTimeout(resolve, 150); });

        // Restore original search
        window.history.replaceState({}, '', originalSearch ? `?${originalSearch}` : window.location.pathname);

        expect(instance.allVideos).to.have.lengthOf(2);
      });

      it('should select video by sessionStorage concurrentVideoTitle', async () => {
        sessionStorage.setItem('concurrentVideoTitle', 'Title 2');

        const concurrentHtml = `
          <div class="mobile-rider">
            <div><div>concurrentenabled</div><div>true</div></div>
            <div><div>concurrentvideoid1</div><div>video1</div></div>
            <div><div>concurrentvideoid2</div><div>video2</div></div>
            <div><div>concurrenttitle1</div><div>Title 1</div></div>
            <div><div>concurrenttitle2</div><div>Title 2</div></div>
          </div>
        `;

        document.body.innerHTML = concurrentHtml;
        const concEl = document.querySelector('.mobile-rider');
        const instance = init(concEl);
        await new Promise((resolve) => { setTimeout(resolve, 150); });

        expect(sessionStorage.getItem('concurrentVideoTitle')).to.be.null;
        expect(instance.allVideos).to.have.lengthOf(2);
      });
    });

    describe('#initASL', () => {
      it('should add isASL class when ASL button is clicked', async () => {
        sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => setTimeout(cb, 0));
        globalThis.mobilerider.embed = sinon.stub();

        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        el.appendChild(videoWrapper);
        riderInstance.wrap = videoWrapper;
        riderInstance.isEmbedding = false;

        riderInstance.injectPlayer('test-video', 'test-skin', 'test-asl');
        globalThis.__mr_player = { off: sinon.stub(), on: sinon.stub() };
        await new Promise((resolve) => { setTimeout(resolve, 50); });

        const container = riderInstance.wrap.querySelector('.mobile-rider-container');
        const aslBtn = document.createElement('button');
        aslBtn.id = 'asl-button';
        container.appendChild(aslBtn);

        // Wait for the interval check to find the button
        await new Promise((resolve) => { setTimeout(resolve, 200); });

        aslBtn.click();
        expect(container.classList.contains('isASL')).to.be.true;

        // Click again — should not add duplicate
        aslBtn.click();
        expect(container.classList.length).to.equal(2); // mobile-rider-container + isASL
      });
    });
  });

  describe('Configuration parsing', () => {
    it('should parse basic configuration correctly', () => {
      document.body.innerHTML = defaultHtml;
      const el = document.querySelector('.mobile-rider');
      const meta = Object.fromEntries(
        [...el.querySelectorAll(':scope > div > div:first-child')].map((div) => [
          div.textContent.trim().toLowerCase().replace(/ /g, '-'),
          div.nextElementSibling?.textContent?.trim() || '',
        ]),
      );
      expect(meta['video-id']).to.equal('test-video-123');
      expect(meta['skin-id']).to.equal('default-skin');
      expect(meta.autoplay).to.equal('true');
    });

    it('should parse concurrent configuration and set concurrentenabled', async () => {
      const concurrentHtml = `
        <div class="mobile-rider">
          <div><div>concurrentenabled</div><div>true</div></div>
          <div><div>concurrentvideoid1</div><div>video1</div></div>
          <div><div>concurrentvideoid2</div><div>video2</div></div>
          <div><div>concurrenttitle1</div><div>Title 1</div></div>
          <div><div>concurrenttitle2</div><div>Title 2</div></div>
        </div>
      `;

      document.body.innerHTML = concurrentHtml;
      const el = document.querySelector('.mobile-rider');
      const instance = init(el);

      await new Promise((resolve) => { setTimeout(resolve, 100); });

      expect(instance.cfg.concurrentenabled).to.be.true;
      expect(instance.allVideos).to.have.lengthOf(2);
      expect(instance.allVideos[0].videoid).to.equal('video1');
      expect(instance.allVideos[1].videoid).to.equal('video2');
    });

    it('should extract video params from link-block anchor href', () => {
      document.body.innerHTML = `
        <a class="link-block" href="https://example.com/player?videoId=abc123&skinId=skin1&autoplay=false&thumbnail=thumb.jpg">Watch</a>
      `;
      const anchor = document.querySelector('a');
      riderInstance = init(anchor);
      const mrDiv = document.querySelector('.mobile-rider');
      expect(mrDiv.dataset.extractedVideoId).to.equal('abc123');
      expect(mrDiv.dataset.extractedSkinId).to.equal('skin1');
      expect(mrDiv.dataset.extractedAutoplay).to.equal('false');
      expect(mrDiv.dataset.extractedThumbnail).to.equal('thumb.jpg');
    });

    it('should return original element for anchor without videoId', () => {
      document.body.innerHTML = '<a class="link-block" href="https://example.com/page.html">Link</a>';
      const anchor = document.querySelector('a');
      const result = init(anchor);
      expect(result.el.tagName).to.equal('A');
    });
  });

  describe('loadScript', () => {
    it('should early-return when window.mobilerider already exists', async () => {
      globalThis.mobilerider = { embed: sinon.stub() };

      document.body.innerHTML = defaultHtml;
      const el = document.querySelector('.mobile-rider');
      riderInstance = init(el);
      await new Promise((resolve) => { setTimeout(resolve, 150); });

      // No script tag created since mobilerider is already present
      const scriptTag = document.head.querySelector('script[src*="mobilerider"]');
      expect(scriptTag).to.be.null;
    });
  });

  describe('#loadStore', () => {
    it('should attempt to load store when inside a chrono-box', async () => {
      document.body.innerHTML = `
        <div class="chrono-box">
          ${defaultHtml}
        </div>
      `;
      const el = document.querySelector('.mobile-rider');
      riderInstance = init(el);
      await new Promise((resolve) => { setTimeout(resolve, 300); });

      // The plugin file exists so the import succeeds;
      // verify init completed without errors
      expect(riderInstance.el).to.equal(el);
    });
  });

  describe('concurrent drawer interactions', () => {
    it('should render drawer items with thumbnails and handle activation', async () => {
      const concurrentHtml = `
        <div class="mobile-rider">
          <div><div>concurrentenabled</div><div>true</div></div>
          <div><div>skinid</div><div>test-skin</div></div>
          <div><div>concurrentvideoid1</div><div>video1</div></div>
          <div><div>concurrentvideoid2</div><div>video2</div></div>
          <div><div>concurrenttitle1</div><div>Title 1</div></div>
          <div><div>concurrenttitle2</div><div>Title 2</div></div>
          <div><div>concurrentthumbnail1</div><div>https://example.com/t1.jpg</div></div>
          <div><div>concurrentthumbnail2</div><div>https://example.com/t2.jpg</div></div>
        </div>
      `;

      document.body.innerHTML = concurrentHtml;
      const el = document.querySelector('.mobile-rider');
      const instance = init(el);
      await new Promise((resolve) => { setTimeout(resolve, 300); });

      // Verify drawer was created with thumbnail items
      const drawerItems = el.querySelectorAll('.drawer-item');
      expect(drawerItems.length).to.equal(2);

      const thumb = drawerItems[0].querySelector('.drawer-item-thumbnail img');
      expect(thumb).to.not.be.null;

      // Click second item to trigger #activateVideo
      if (drawerItems[1]) {
        drawerItems[1].click();
        await new Promise((resolve) => { setTimeout(resolve, 100); });
      }

      expect(instance).to.not.be.null;
    });
  });
});
