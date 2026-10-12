import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { YouTubeChat } from '../../../../event-libs/v1/c2/blocks/event-youtube/event-youtube.js';

const defaultHtml = await readFile({ path: './mocks/default.html' });
const modulePath = '../../../../event-libs/v1/c2/blocks/event-youtube/event-youtube.js';

function createBlock() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = defaultHtml;
  return wrapper.firstElementChild;
}

describe('Event YouTube Module', () => {
  let sandbox;
  let readyState;
  let satelliteDescriptor;
  let clock;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    clock = sandbox.useFakeTimers();
    readyState = sandbox.stub(document, 'readyState').get(() => 'complete');
    satelliteDescriptor = Object.getOwnPropertyDescriptor(window, '_satellite');
    Object.defineProperty(window, '_satellite', {
      configurable: true,
      writable: true,
      value: { track: sandbox.spy() },
    });
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    YouTubeChat.preconnected = false;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    readyState.get(() => 'complete');
    document.dispatchEvent(new Event('readystatechange'));
    document.head.innerHTML = '';
    sandbox.restore();
    if (satelliteDescriptor) Object.defineProperty(window, '_satellite', satelliteDescriptor);
    else delete window._satellite;
  });

  describe('YouTubeChat Class', () => {
    let youtubeChat;

    beforeEach(async () => {
      const { YouTubeChat } = await import(modulePath);
      youtubeChat = new YouTubeChat();
    });

    describe('isAutoplayEnabled', () => {
      it('should return correct autoplay state', () => {
        youtubeChat.config = { autoplay: 'true' };
        expect(youtubeChat.isAutoplayEnabled()).to.be.true;

        youtubeChat.config = { autoplay: 'false' };
        expect(youtubeChat.isAutoplayEnabled()).to.be.false;

        youtubeChat.config = {};
        expect(youtubeChat.isAutoplayEnabled()).to.be.false;
      });
    });

    describe('buildUrlParams', () => {
      beforeEach(() => {
        youtubeChat.videoId = 'dQw4w9WgXcQ';
      });

      it('should build URL parameters correctly', () => {
        youtubeChat.config = {
          'show-controls': 'true',
          'show-player-title-actions': 'true',
          'show-suggestions-after-video-ends': 'true',
        };

        const params = youtubeChat.buildUrlParams();
        expect(params).to.include('controls=1');
        expect(params).to.include('modestbranding=1');
        expect(new URLSearchParams(params).getAll('rel')).to.deep.equal(['0']);

        youtubeChat.config = {
          'show-controls': 'false',
          'show-player-title-actions': 'false',
          'show-suggestions-after-video-ends': 'false',
        };

        const requiredParams = new URLSearchParams(youtubeChat.buildUrlParams());
        expect(Object.fromEntries(requiredParams)).to.deep.equal({
          enablejsapi: '1', rel: '0', videotype: 'vod',
        });
      });
    });

    describe('buildEmbedUrl', () => {
      beforeEach(() => {
        youtubeChat.videoId = 'dQw4w9WgXcQ';
      });

      it('should build embed URL with correct parameters', () => {
        youtubeChat.config = {
          'show-controls': 'true',
          'show-player-title-actions': 'true',
        };

        const autoplayUrl = youtubeChat.buildEmbedUrl(true);
        expect(autoplayUrl).to.include('https://www.youtube.com/embed/dQw4w9WgXcQ');
        expect(autoplayUrl).to.include('autoplay=1');
        expect(autoplayUrl).to.include('mute=1');
        expect(autoplayUrl).to.include('controls=1');
        expect(autoplayUrl).to.include('modestbranding=1');
        expect(new URL(autoplayUrl).searchParams.getAll('autoplay')).to.deep.equal(['1']);

        const noAutoplayUrl = youtubeChat.buildEmbedUrl(false);
        expect(noAutoplayUrl).to.include('https://www.youtube.com/embed/dQw4w9WgXcQ');
        expect(noAutoplayUrl).to.not.include('autoplay=1');
        expect(noAutoplayUrl).to.not.include('mute=1');
        expect(noAutoplayUrl).to.include('controls=1');
      });
    });

    describe('buildChatSection', () => {
      beforeEach(() => {
        youtubeChat.videoId = 'dQw4w9WgXcQ';
      });

      it('should create chat section with correct placeholder', () => {
        youtubeChat.config = { autoplay: 'true' };
        const chatSection = youtubeChat.buildChatSection();

        expect(chatSection.classList.contains('youtube-chat-container')).to.be.true;

        const placeholder = chatSection.querySelector('.youtube-chat-placeholder');
        expect(placeholder.textContent).to.equal('Loading chat...');

        youtubeChat.config = { autoplay: 'false' };
        const chatSection2 = youtubeChat.buildChatSection();
        const placeholder2 = chatSection2.querySelector('.youtube-chat-placeholder');
        expect(placeholder2.textContent).to.equal('Chat will load when video is played');
      });
    });

    describe('loadChat', () => {
      beforeEach(() => {
        youtubeChat.videoId = 'dQw4w9WgXcQ';
        youtubeChat.chatContainer = document.createElement('div');
        youtubeChat.chatContainer.innerHTML = '<div class="placeholder">Loading...</div>';
      });

      it('should load chat iframe when container exists', () => {
        youtubeChat.loadChat();

        const iframe = youtubeChat.chatContainer.querySelector('iframe.youtube-chat');
        expect(iframe).to.not.be.null;
        expect(iframe.src).to.include('youtube.com/live_chat');
        expect(iframe.title).to.equal('YouTube live chat');
      });

      it('should not load chat when container is null', () => {
        youtubeChat.chatContainer = null;
        expect(() => youtubeChat.loadChat()).to.not.throw();
      });
    });

    describe('buildStream', () => {
      beforeEach(() => {
        youtubeChat.videoId = 'dQw4w9WgXcQ';
        youtubeChat.config = { videotitle: 'Test Video' };
      });

      it('should build stream with correct layout based on configuration', () => {
        // Chat enabled + autoplay enabled
        youtubeChat.chatEnabled = true;
        youtubeChat.config.autoplay = 'true';
        const stream1 = youtubeChat.buildStream();
        expect(stream1.classList.contains('youtube-stream')).to.be.true;
        expect(stream1.classList.contains('has-chat')).to.be.true;
        expect(stream1.classList.contains('single-column')).to.be.false;
        expect(stream1.querySelector('.youtube-chat-container')).to.not.be.null;

        // Chat disabled
        youtubeChat.chatEnabled = false;
        const stream2 = youtubeChat.buildStream();
        expect(stream2.classList.contains('single-column')).to.be.true;
        expect(stream2.querySelector('.youtube-chat-container')).to.be.null;

        // Chat enabled + autoplay disabled
        youtubeChat.chatEnabled = true;
        youtubeChat.config.autoplay = 'false';
        const stream3 = youtubeChat.buildStream();
        expect(stream3.classList.contains('single-column')).to.be.true;
        expect(stream3.querySelector('.youtube-chat-container')).to.be.null;
        expect(youtubeChat.pendingChatSection).to.not.be.null;
      });
    });

    describe('preconnect', () => {
      it('should add preconnect links for YouTube domains', async () => {
        const originalHead = document.head.innerHTML;

        const { YouTubeChat } = await import(modulePath);
        YouTubeChat.preconnect();

        const links = document.querySelectorAll('link[rel="preconnect"]');
        expect(links.length).to.be.greaterThan(0);

        const hrefs = Array.from(links).map((link) => link.href);
        expect(hrefs).to.include('https://www.youtube.com/');
        expect(hrefs).to.not.include('https://www.youtube-nocookie.com/');
        expect(hrefs).to.include('https://www.youtube.com/');
        expect(hrefs).to.not.include('https://www.youtube-nocookie.com/');

        document.head.innerHTML = originalHead;
      });

      it('should only add preconnect links once', async () => {
        const originalHead = document.head.innerHTML;

        const { YouTubeChat } = await import(modulePath);
        YouTubeChat.preconnect();
        const firstCount = document.querySelectorAll('link[rel="preconnect"]').length;

        YouTubeChat.preconnect();
        const secondCount = document.querySelectorAll('link[rel="preconnect"]').length;

        expect(firstCount).to.equal(secondCount);

        document.head.innerHTML = originalHead;
      });
    });

    describe('getVideoTitle', () => {
      it('should return correct video title', () => {
        youtubeChat.config = { title: 'Authored Title', videotitle: 'Legacy Title' };
        expect(youtubeChat.getVideoTitle()).to.equal('Authored Title');

        youtubeChat.config = { videotitle: 'Custom Video Title' };
        expect(youtubeChat.getVideoTitle()).to.equal('Custom Video Title');

        youtubeChat.config = { title: ' ', videotitle: ' Legacy Title ' };
        expect(youtubeChat.getVideoTitle()).to.equal('Legacy Title');

        youtubeChat.config = {};
        expect(youtubeChat.getVideoTitle()).to.equal('YouTube video player');
      });
    });

    describe('createVideoIframe', () => {
      it('should create iframe with correct attributes', () => {
        youtubeChat.config = { videotitle: 'Test Video' };
        youtubeChat.videoId = 'dQw4w9WgXcQ';
        const src = 'https://www.youtube.com/embed/test';
        const iframe = youtubeChat.createVideoIframe(src);

        expect(iframe.classList.contains('youtube-video')).to.be.true;
        expect(iframe.id).to.equal('player-dQw4w9WgXcQ');
        expect(iframe.src).to.equal(src);
        expect(iframe.title).to.equal('Test Video');
        expect(iframe.loading).to.equal('lazy');
        expect(iframe.hasAttribute('allowfullscreen')).to.be.true;
        expect(iframe.getAttribute('allow')).to.equal('accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture');
      });
    });

    describe('activateLitePlayer', () => {
      beforeEach(() => {
        youtubeChat.videoId = 'dQw4w9WgXcQ';
        youtubeChat.config = { videotitle: 'Test Video' };
        youtubeChat.chatEnabled = true;
      });

      it('should activate lite player with chat enabled', () => {
        const liteYT = document.createElement('lite-youtube');
        const container = document.createElement('div');
        container.className = 'youtube-stream single-column';
        container.appendChild(liteYT);
        document.body.appendChild(container);

        // Test with pending chat section
        youtubeChat.pendingChatSection = youtubeChat.buildChatSection();
        const loadChatSpy = sandbox.spy(youtubeChat, 'loadChat');

        youtubeChat.activateLitePlayer(liteYT);

        expect(youtubeChat.videoLoaded).to.be.true;
        expect(liteYT.classList.contains('lyt-activated')).to.be.true;
        expect(liteYT.parentNode).to.be.null; // Should be removed
        expect(container.classList.contains('single-column')).to.be.false;
        expect(container.querySelector('.youtube-chat-container')).to.not.be.null;
        expect(loadChatSpy.called).to.be.true;
      });

      it('should activate lite player without chat enabled', () => {
        youtubeChat.chatEnabled = false;
        const liteYT = document.createElement('lite-youtube');
        const container = document.createElement('div');
        container.appendChild(liteYT);
        document.body.appendChild(container);

        const loadChatSpy = sandbox.spy(youtubeChat, 'loadChat');
        youtubeChat.activateLitePlayer(liteYT);

        expect(loadChatSpy.called).to.be.false;
      });

      it('should not activate if already loaded', () => {
        youtubeChat.videoLoaded = true;
        const liteYT = document.createElement('lite-youtube');
        const container = document.createElement('div');
        container.appendChild(liteYT);
        document.body.appendChild(container);

        const originalIframeCount = container.querySelectorAll('iframe').length;
        youtubeChat.activateLitePlayer(liteYT);

        expect(container.querySelectorAll('iframe').length).to.equal(originalIframeCount);
      });
    });
  });

  describe('Heartbeat player contract', () => {
    let player;
    let parent;

    beforeEach(() => {
      player = new YouTubeChat();
      player.videoId = 'dQw4w9WgXcQ';
      player.config = { autoplay: 'true' };
      parent = document.createElement('div');
      document.body.append(parent);
    });

    ['true', 'false'].forEach((autoplay) => {
      ['vod', 'live', undefined].forEach((videotype) => {
        it(`renders the required iframe contract with autoplay=${autoplay} and videotype=${videotype}`, () => {
          player.config = {
            autoplay,
            videotype,
            title: 'Authored video title',
            'show-suggestions-after-video-ends': 'true',
            'show-controls': 'true',
          };
          player.mountStream(parent);
          if (autoplay === 'false') {
            expect(parent.querySelector('iframe')).to.be.null;
            expect(window._satellite.track.called).to.be.false;
            const facade = parent.querySelector('lite-youtube');
            expect(facade.getAttribute('playlabel')).to.equal('Authored video title');
            expect(facade.querySelector('button').textContent).to.equal('Authored video title');
            facade.querySelector('button').click();
          }

          const iframe = parent.querySelector('iframe.youtube-video');
          const url = new URL(iframe.src);
          expect(iframe.id).to.equal('player-dQw4w9WgXcQ');
          expect(iframe.title).to.equal('Authored video title');
          expect(url.origin).to.equal('https://www.youtube.com');
          expect(url.pathname).to.equal('/embed/dQw4w9WgXcQ');
          expect(url.searchParams.getAll('enablejsapi')).to.deep.equal(['1']);
          expect(url.searchParams.getAll('rel')).to.deep.equal(['0']);
          expect(url.searchParams.getAll('videotype')).to.deep.equal([videotype || 'vod']);
          expect(url.searchParams.getAll('autoplay')).to.deep.equal(['1']);
          expect(url.searchParams.getAll('mute')).to.deep.equal(['1']);
          expect(url.searchParams.get('controls')).to.equal('1');
          expect(window._satellite.track.calledOnceWithExactly('trackYoutube')).to.be.true;
        });
      });
    });

    it('normalizes videotype without using chat to infer it', () => {
      player.config.videotype = ' LIVE ';
      player.mountStream(parent);
      expect(new URL(parent.querySelector('iframe').src).searchParams.get('videotype')).to.equal('live');
      expect(parent.querySelector('.youtube-chat-container')).to.be.null;

      player.config = { autoplay: 'true' };
      player.chatEnabled = true;
      const stream = player.mountStream(parent);
      expect(new URL(stream.querySelector('iframe').src).searchParams.get('videotype')).to.equal('vod');
    });

    it('logs invalid videotype and defaults to vod without breaking playback', () => {
      const log = sandbox.spy(window.lana, 'log');
      player.config.videotype = 'invalid';
      player.mountStream(parent);
      expect(new URL(parent.querySelector('iframe').src).searchParams.get('videotype')).to.equal('vod');
      expect(log.calledOnce).to.be.true;
      expect(log.firstCall.args[0]).to.include('Invalid videotype; defaulting to vod');
      expect(log.firstCall.args[1].severity).to.equal('warning');
      expect(window._satellite.track.calledOnce).to.be.true;
    });

    it('gives duplicate videos unique IDs across autoplay, click, and shared mounts', async () => {
      const { default: init } = await import(modulePath);
      const block = createBlock();
      document.body.append(block);
      await init(block);

      player.config.autoplay = 'false';
      player.mountStream(parent);
      parent.querySelector('button').click();

      const broadcastPlayer = new YouTubeChat();
      broadcastPlayer.videoId = player.videoId;
      broadcastPlayer.config = { autoplay: 'true', videotype: 'live' };
      broadcastPlayer.mountStream(parent);

      const frames = [...document.querySelectorAll('iframe.youtube-video')];
      expect(frames).to.have.length(3);
      expect(new Set(frames.map((iframe) => iframe.id)).size).to.equal(3);
      frames.forEach((iframe) => expect(iframe.id).to.match(/^player-/));
      expect(window._satellite.track.callCount).to.equal(3);
      clock.tick(100);
      expect(window._satellite.track.callCount).to.equal(3);
      expect(block.querySelector('iframe.youtube-chat').id).to.equal('');
    });

    it('avoids IDs already used by another player on the page', () => {
      const first = player.createVideoIframe(player.buildEmbedUrl());
      document.body.append(first);
      const second = player.createVideoIframe(player.buildEmbedUrl());
      expect(first.id).to.equal('player-dQw4w9WgXcQ');
      expect(second.id).to.match(/^player-dQw4w9WgXcQ-\d+$/);
      expect(second.id).not.to.equal(first.id);
    });

    it('falls back to a counter ID when the video ID has no usable characters', () => {
      player.videoId = '!!';
      const iframe = player.createVideoIframe(player.buildEmbedUrl());
      expect(iframe.id).to.match(/^player-\d+$/);
    });

    it('does not track detached construction or iframe creation', () => {
      const stream = player.buildStream();
      const iframe = stream.querySelector('iframe');
      player.trackVideo(iframe);
      player.createVideoIframe(player.buildEmbedUrl());
      expect(window._satellite.track.called).to.be.false;
      parent.append(stream);
      player.trackVideo(iframe);
      expect(window._satellite.track.calledOnce).to.be.true;
    });

    it('tracks only after mounting the iframe into the document', () => {
      const track = sandbox.stub().callsFake((eventName) => {
        expect(eventName).to.equal('trackYoutube');
        const iframe = parent.querySelector('iframe.youtube-video');
        expect(iframe).not.to.be.null;
        expect(iframe.isConnected).to.be.true;
      });
      window._satellite.track = track;
      const stream = player.mountStream(parent);
      expect(track.calledOnce).to.be.true;
      player.trackVideo(stream.querySelector('iframe'));
      document.dispatchEvent(new Event('readystatechange'));
      expect(track.calledOnce).to.be.true;
    });

    it('waits for document completion and removes the once-only readiness listener', () => {
      readyState.get(() => 'loading');
      const addListener = sandbox.spy(document, 'addEventListener');
      const removeListener = sandbox.spy(document, 'removeEventListener');
      const stream = player.mountStream(parent);
      const iframe = stream.querySelector('iframe');
      player.trackVideo(iframe);
      expect(window._satellite.track.called).to.be.false;

      readyState.get(() => 'interactive');
      document.dispatchEvent(new Event('readystatechange'));
      expect(window._satellite.track.called).to.be.false;

      const listener = addListener.getCalls().find((call) => call.args[0] === 'readystatechange').args[1];
      readyState.get(() => 'complete');
      document.dispatchEvent(new Event('readystatechange'));
      document.dispatchEvent(new Event('readystatechange'));
      player.trackVideo(iframe);
      expect(window._satellite.track.calledOnceWithExactly('trackYoutube')).to.be.true;
      expect(removeListener.calledWithExactly('readystatechange', listener)).to.be.true;
    });

    it('does not track a player removed before document completion', () => {
      readyState.get(() => 'loading');
      const stream = player.mountStream(parent);
      stream.remove();
      readyState.get(() => 'complete');
      document.dispatchEvent(new Event('readystatechange'));
      parent.append(stream);
      document.dispatchEvent(new Event('readystatechange'));
      expect(window._satellite.track.called).to.be.false;
    });

    it('registers a click-to-play iframe only once even after repeated clicks', () => {
      player.config.autoplay = 'false';
      player.chatEnabled = true;
      player.mountStream(parent);
      const facade = parent.querySelector('lite-youtube');
      expect(window._satellite.track.called).to.be.false;
      facade.click();
      facade.click();
      expect(parent.querySelectorAll('iframe.youtube-video')).to.have.length(1);
      expect(parent.querySelector('iframe.youtube-chat')).not.to.be.null;
      expect(window._satellite.track.calledOnceWithExactly('trackYoutube')).to.be.true;
    });

    it('waits for document completion on the click-to-play path', () => {
      readyState.get(() => 'loading');
      player.config.autoplay = 'false';
      player.mountStream(parent);
      parent.querySelector('button').click();
      expect(window._satellite.track.called).to.be.false;
      readyState.get(() => 'complete');
      document.dispatchEvent(new Event('readystatechange'));
      expect(window._satellite.track.calledOnceWithExactly('trackYoutube')).to.be.true;
    });

    [undefined, {}].forEach((satellite) => {
      it(`logs unavailable Launch (${satellite ? 'no track method' : 'absent'}) without removing the player`, async () => {
        window._satellite = satellite;
        const log = sandbox.spy(window.lana, 'log');
        const block = createBlock();
        document.body.append(block);
        const { default: init } = await import(modulePath);
        await init(block);
        clock.tick(100);
        expect(block.isConnected).to.be.true;
        expect(block.querySelector('iframe.youtube-video')).not.to.be.null;
        expect(block.querySelector('iframe.youtube-chat')).not.to.be.null;
        expect(log.calledOnce).to.be.true;
        expect(log.firstCall.args[0]).to.include('YouTube tracking unavailable');
        expect(log.firstCall.args[1].severity).to.equal('warning');
      });
    });

    ['true', 'false'].forEach((autoplay) => {
      it(`logs thrown tracking errors without breaking playback or chat with autoplay=${autoplay}`, () => {
        window._satellite.track = sandbox.stub().throws(new Error('Launch failure'));
        const log = sandbox.spy(window.lana, 'log');
        player.config.autoplay = autoplay;
        player.chatEnabled = true;
        expect(() => player.mountStream(parent)).not.to.throw();
        if (autoplay === 'false') parent.querySelector('button').click();
        clock.tick(100);
        expect(parent.querySelector('iframe.youtube-video')).not.to.be.null;
        expect(parent.querySelector('iframe.youtube-chat')).not.to.be.null;
        expect(window._satellite.track.calledOnce).to.be.true;
        expect(log.calledOnce).to.be.true;
        expect(log.firstCall.args[0]).to.include('failed to register YouTube tracking');
        expect(log.firstCall.args[0]).to.include('Launch failure');
        expect(log.firstCall.args[1].severity).to.equal('error');
      });
    });
  });

  describe('Default Export Function', () => {
    let block;

    beforeEach(() => {
      block = createBlock();
      document.body.appendChild(block);
    });

    afterEach(() => {
      if (block.parentNode) {
        document.body.removeChild(block);
      }
    });

    it('should export init function and handle initialization', async () => {
      const { default: init, YouTubeChat } = await import(modulePath);

      expect(typeof init).to.equal('function');
      expect(typeof YouTubeChat).to.equal('function');

      const youtubeChat = new YouTubeChat();
      expect(youtubeChat).to.be.instanceOf(YouTubeChat);

      const result = init(block);
      expect(result).to.be.instanceOf(Promise);

      await result;
      expect(block.querySelector('iframe.youtube-video')).not.to.be.null;
    });

    it('applies the authored title and registers the connected autoplay iframe', async () => {
      const { default: init } = await import(modulePath);
      await init(block);
      const iframe = block.querySelector('iframe.youtube-video');
      expect(iframe.title).to.equal('My Custom Video Title');
      expect(window._satellite.track.calledOnceWithExactly('trackYoutube')).to.be.true;
      expect(iframe.isConnected).to.be.true;
    });

    it('should default live chat to off when no chatenabled row is authored', async () => {
      block.innerHTML = `
        <div>
          <div>videoid</div>
          <div>dQw4w9WgXcQ</div>
        </div>
        <div>
          <div>autoplay</div>
          <div>true</div>
        </div>
      `;

      const { default: init } = await import(modulePath);
      await init(block);

      expect(block.querySelector('.youtube-chat-container')).to.be.null;
      expect(block.querySelector('.youtube-stream').classList.contains('single-column')).to.be.true;
    });

    it('should keep live chat off when chatenabled is authored as anything other than "true"', async () => {
      block.innerHTML = `
        <div>
          <div>videoid</div>
          <div>dQw4w9WgXcQ</div>
        </div>
        <div>
          <div>autoplay</div>
          <div>true</div>
        </div>
        <div>
          <div>chatenabled</div>
          <div>false</div>
        </div>
      `;

      const { default: init } = await import(modulePath);
      await init(block);

      expect(block.querySelector('.youtube-chat-container')).to.be.null;
      expect(block.querySelector('.youtube-stream').classList.contains('single-column')).to.be.true;
    });

    it('should tolerate authored whitespace around "true" when enabling live chat', async () => {
      block.innerHTML = `
        <div>
          <div>videoid</div>
          <div>dQw4w9WgXcQ</div>
        </div>
        <div>
          <div>autoplay</div>
          <div>true</div>
        </div>
        <div>
          <div>chatenabled</div>
          <div> true </div>
        </div>
      `;

      const { default: init } = await import(modulePath);
      await init(block);

      expect(block.querySelector('.youtube-chat-container')).to.not.be.null;
      expect(block.querySelector('.youtube-stream').classList.contains('has-chat')).to.be.true;
    });
  });
});
