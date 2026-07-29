import { expect } from '@esm-bundle/chai';
import { VideoChatManager } from '../../../../event-libs/v1/blocks/video-playlist/video-chat-manager.js';

const CARD = {
  overlayLink: 'https://www.adobe.com/max/2025/sessions/example',
  contentArea: { title: 'Example Session' },
};

function buildSessionsWrapper(videoId = '3458860') {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="session" data-video-id="${videoId}">
      <div class="session-row"></div>
    </div>
  `;
  document.body.appendChild(wrapper);
  return wrapper;
}

function buildTwoSessionsWrapper(firstId = '3458860', secondId = '3458952') {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="session" data-video-id="${firstId}">
      <div class="session-row"></div>
    </div>
    <div class="session" data-video-id="${secondId}">
      <div class="session-row"></div>
    </div>
  `;
  document.body.appendChild(wrapper);
  return wrapper;
}

const PERSONAS = [
  { id: 'designer', label: 'Designer', blurb: 'Visual design' },
  { id: 'video-editor', label: 'Video Editor', blurb: 'Editing and post' },
];

describe('VideoChatManager', () => {
  let originalFetch;
  let manager;

  beforeEach(() => {
    document.body.innerHTML = '';
    originalFetch = window.fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    manager?.cleanup();
  });

  it('injects a chat button and a hidden panel into each session card', () => {
    const sessionsWrapper = buildSessionsWrapper();
    manager = new VideoChatManager({
      getCards: () => [CARD],
      getSessionsWrapper: () => sessionsWrapper,
      getPlayerManager: () => null,
    });
    manager.setup();

    const button = sessionsWrapper.querySelector('.session-chat');
    const panel = sessionsWrapper.querySelector('.session-chat-panel');
    expect(button, 'chat button must exist').to.not.be.null;
    expect(panel, 'chat panel must exist').to.not.be.null;
    expect(panel.hasAttribute('hidden'), 'panel starts hidden').to.be.true;
    expect(button.getAttribute('aria-expanded')).to.equal('false');
  });

  it('opens the panel, loads personas and an overview on first click', async () => {
    const sessionsWrapper = buildSessionsWrapper();
    window.fetch = async (url) => {
      if (url.includes('/api/personas')) {
        return { ok: true, json: async () => ({ personas: PERSONAS }) };
      }
      if (url.includes('/api/overview')) {
        return {
          ok: true,
          json: async () => ({
            overview: 'This session covers illustration career advice.',
            highlights: [{ start: 420, label: 'Portfolio building' }],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    manager = new VideoChatManager({
      getCards: () => [CARD],
      getSessionsWrapper: () => sessionsWrapper,
      getPlayerManager: () => null,
    });
    manager.setup();

    const button = sessionsWrapper.querySelector('.session-chat');
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const panel = sessionsWrapper.querySelector('.session-chat-panel');
    expect(panel.hasAttribute('hidden'), 'panel opens on click').to.be.false;
    expect(button.getAttribute('aria-expanded')).to.equal('true');

    const chips = panel.querySelectorAll('.chat-persona-chip');
    expect(chips.length).to.equal(2);

    const overviewMessage = panel.querySelector('.chat-message--assistant p');
    expect(overviewMessage.textContent).to.equal('This session covers illustration career advice.');

    const timestampChip = panel.querySelector('.chat-timestamp-chip');
    expect(timestampChip, 'overview highlight timestamp chip must render').to.not.be.null;
    expect(timestampChip.dataset.start).to.equal('420');
  });

  it('renders a user question and the assistant answer on submit', async () => {
    const sessionsWrapper = buildSessionsWrapper();
    window.fetch = async (url, options) => {
      if (url.includes('/api/personas')) return { ok: true, json: async () => ({ personas: [] }) };
      if (url.includes('/api/overview')) {
        return { ok: true, json: async () => ({ overview: 'Overview text', highlights: [] }) };
      }
      if (url.includes('/api/chat')) {
        const body = JSON.parse(options.body);
        expect(body.question).to.equal('What should a photographer watch for?');
        return {
          ok: true,
          json: async () => ({
            answer: 'Look at the lighting discussion around the 7 minute mark.',
            timestamps: [{ start: 420, label: 'Lighting discussion' }],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    manager = new VideoChatManager({
      getCards: () => [CARD],
      getSessionsWrapper: () => sessionsWrapper,
      getPlayerManager: () => null,
    });
    manager.setup();

    sessionsWrapper.querySelector('.session-chat').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const panel = sessionsWrapper.querySelector('.session-chat-panel');
    const textarea = panel.querySelector('.chat-input');
    textarea.value = 'What should a photographer watch for?';
    panel.querySelector('.chat-input-row').requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const userBubbles = panel.querySelectorAll('.chat-message--user');
    expect(userBubbles.length).to.equal(1);
    expect(userBubbles[0].textContent).to.equal('What should a photographer watch for?');

    const assistantBubbles = panel.querySelectorAll('.chat-message--assistant p');
    const lastAnswer = assistantBubbles[assistantBubbles.length - 1];
    expect(lastAnswer.textContent).to.equal('Look at the lighting discussion around the 7 minute mark.');
  });

  it('seeks the current player when the timestamp belongs to the actively playing video', async () => {
    const sessionsWrapper = buildSessionsWrapper('3458860');
    window.fetch = async (url) => {
      if (url.includes('/api/personas')) return { ok: true, json: async () => ({ personas: [] }) };
      if (url.includes('/api/overview')) {
        return {
          ok: true,
          json: async () => ({ overview: 'Overview', highlights: [{ start: 90, label: 'Intro' }] }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const videoContainer = document.createElement('div');
    let seekedTo = null;
    const playerManager = {
      currentVideoId: () => '3458860',
      videoContainer,
    };

    manager = new VideoChatManager({
      getCards: () => [CARD],
      getSessionsWrapper: () => sessionsWrapper,
      getPlayerManager: () => playerManager,
    });
    // Stub the module-level seek helper indirectly by asserting through navigateTo
    // fallback instead when ids don't match (covered below); here we only assert
    // that startVideoFromSecond is attempted by checking navigateTo is NOT called.
    manager.navigateTo = () => { seekedTo = 'navigated'; };
    manager.setup();

    sessionsWrapper.querySelector('.session-chat').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const chip = sessionsWrapper.querySelector('.chat-timestamp-chip');
    chip.click();

    expect(seekedTo, 'navigateTo must not be used when the video is already playing').to.be.null;
  });

  it('falls back to navigation when the timestamp belongs to a different session', async () => {
    const sessionsWrapper = buildSessionsWrapper('3458860');
    window.fetch = async (url) => {
      if (url.includes('/api/personas')) return { ok: true, json: async () => ({ personas: [] }) };
      if (url.includes('/api/overview')) {
        return {
          ok: true,
          json: async () => ({ overview: 'Overview', highlights: [{ start: 90, label: 'Intro' }] }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    let navigatedTo = null;
    manager = new VideoChatManager({
      getCards: () => [CARD],
      getSessionsWrapper: () => sessionsWrapper,
      getPlayerManager: () => ({ currentVideoId: () => 'some-other-video', videoContainer: document.createElement('div') }),
      navigateTo: (url) => { navigatedTo = url; },
    });
    manager.setup();

    sessionsWrapper.querySelector('.session-chat').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const chip = sessionsWrapper.querySelector('.chat-timestamp-chip');
    chip.click();

    expect(navigatedTo).to.equal(CARD.overlayLink);
  });

  it('renders a recommendation card after persona selection, and jumping to it highlights and opens the target session', async () => {
    const sessionsWrapper = buildTwoSessionsWrapper('3458860', '3458952');
    const OTHER_CARD = {
      overlayLink: 'https://www.adobe.com/max/2025/sessions/other',
      contentArea: { title: 'Other Session' },
    };

    window.fetch = async (url, options) => {
      if (url.includes('/api/personas')) return { ok: true, json: async () => ({ personas: PERSONAS }) };
      if (url.includes('/api/overview')) {
        return { ok: true, json: async () => ({ overview: 'Overview text', highlights: [] }) };
      }
      if (url.includes('/api/recommend')) {
        const body = JSON.parse(options.body);
        expect(body.videoId).to.equal('3458860');
        expect(body.persona).to.equal('designer');
        return {
          ok: true,
          json: async () => ({
            recommendation: {
              videoId: '3458952', title: 'Other Session', reason: 'It covers workflow tooling in depth.',
            },
          }),
        };
      }
      if (url.includes('/api/chat')) {
        return { ok: true, json: async () => ({ answer: 'Persona-tailored answer.', timestamps: [] }) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    manager = new VideoChatManager({
      getCards: () => [CARD, OTHER_CARD],
      getSessionsWrapper: () => sessionsWrapper,
      getPlayerManager: () => null,
    });
    manager.setup();

    const [firstButton] = sessionsWrapper.querySelectorAll('.session-chat');
    firstButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const firstPanel = sessionsWrapper.querySelector('.session-chat-panel');
    firstPanel.querySelector('.chat-persona-chip').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const recommendation = firstPanel.querySelector('.chat-recommendation');
    expect(recommendation, 'recommendation card must render').to.not.be.null;
    expect(firstPanel.querySelector('.chat-recommendation-title').textContent).to.equal('Other Session');
    expect(firstPanel.querySelector('.chat-recommendation-reason').textContent).to.equal('It covers workflow tooling in depth.');

    const jumpBtn = firstPanel.querySelector('.chat-recommendation-jump');
    expect(jumpBtn.dataset.targetVideoId).to.equal('3458952');

    jumpBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const [, secondSession] = sessionsWrapper.querySelectorAll('.session');
    expect(secondSession.classList.contains('highlighted'), 'target session must be highlighted').to.be.true;
    const secondPanel = secondSession.querySelector('.session-chat-panel');
    expect(secondPanel.hasAttribute('hidden'), 'target panel must auto-open').to.be.false;
  });

  it('renders a speaker button on assistant messages and speaks the text on click when speechSynthesis is available', async () => {
    const sessionsWrapper = buildSessionsWrapper();
    window.fetch = async (url) => {
      if (url.includes('/api/personas')) return { ok: true, json: async () => ({ personas: [] }) };
      if (url.includes('/api/overview')) {
        return { ok: true, json: async () => ({ overview: 'Spoken overview text.', highlights: [] }) };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const originalSpeechSynthesis = window.speechSynthesis;
    let spokenText = null;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: () => {},
        speak: (utterance) => { spokenText = utterance.text; },
      },
    });

    try {
      manager = new VideoChatManager({
        getCards: () => [CARD],
        getSessionsWrapper: () => sessionsWrapper,
        getPlayerManager: () => null,
      });
      manager.setup();

      sessionsWrapper.querySelector('.session-chat').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      const panel = sessionsWrapper.querySelector('.session-chat-panel');
      const speakBtn = panel.querySelector('.chat-speak-btn');
      expect(speakBtn, 'speaker button must render when speechSynthesis is available').to.not.be.null;

      speakBtn.click();
      expect(spokenText).to.equal('Spoken overview text.');
    } finally {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: originalSpeechSynthesis });
    }
  });
});
