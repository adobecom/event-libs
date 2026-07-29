import { createTag } from '../../utils/utils.js';
import { AI_CHAT_API_BASE, ANALYTICS } from './constants-new.js';
import {
  normalizeVideoId, findCardByVideoId, startVideoFromSecond, logError,
} from './utils-new.js';

const qs = (selector, root = document) => root.querySelector(selector);

const CHAT_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1C4.13 1 1 3.79 1 7.25c0 1.86.93 3.53 2.41 4.68-.09.9-.42 2.02-1.28 3.02 0 0 1.86-.13 3.55-1.31.7.17 1.45.26 2.32.26 3.87 0 7-2.79 7-6.25S11.87 1 8 1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';

const MIC_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="5" y="1" width="4" height="7" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 7a4.5 4.5 0 0 0 9 0M7 11.5V13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

const SPEAKER_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M1 5.5v3h2.5L7 11V2L3.5 5.5H1Z" fill="currentColor"/><path d="M9.5 4.5a3.5 3.5 0 0 1 0 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

let personasPromise = null;
const fetchPersonas = () => {
  if (!personasPromise) {
    personasPromise = fetch(`${AI_CHAT_API_BASE}/api/personas`)
      .then((res) => (res.ok ? res.json() : { personas: [] }))
      .then((data) => data.personas || [])
      .catch((err) => {
        logError(err, 'VideoChatManager.fetchPersonas');
        return [];
      });
  }
  return personasPromise;
};

export class VideoChatManager {
  constructor({
    getCards, getSessionsWrapper, getPlayerManager, navigateTo,
  }) {
    this.getCards = getCards;
    this.getSessionsWrapper = getSessionsWrapper;
    this.getPlayerManager = getPlayerManager;
    this.navigateTo = navigateTo || ((url) => { window.location.href = url; });
    this.cleanupFns = [];
    this.stateByVideoId = new Map();
  }

  setup() {
    const cards = this.getCards?.() ?? [];
    const sessionsWrapper = this.getSessionsWrapper?.();
    if (!sessionsWrapper) return;

    sessionsWrapper
      .querySelectorAll('.session')
      .forEach((sessionEl, index) => {
        const videoId = normalizeVideoId(sessionEl.getAttribute('data-video-id'));
        const card = findCardByVideoId(cards, videoId) || cards[index];
        if (!card || !videoId) return;

        const button = this.createChatButton(card, videoId);
        (sessionEl.querySelector('.session-row') || sessionEl).appendChild(button);

        const panel = this.createChatPanel(card, videoId);
        sessionEl.appendChild(panel);
      });
  }

  cleanup() {
    this.cleanupFns.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        console.debug('VideoChatManager cleanup error:', error);
      }
    });
    this.cleanupFns = [];
    this.stateByVideoId.clear();
  }

  getState(videoId) {
    if (!this.stateByVideoId.has(videoId)) {
      this.stateByVideoId.set(videoId, {
        persona: null, history: [], opened: false, overviewLoaded: false, pendingSpeak: false,
      });
    }
    return this.stateByVideoId.get(videoId);
  }

  createChatButton(card, videoId) {
    const panelId = `video-chat-panel-${videoId}`;
    const button = createTag('button', {
      type: 'button',
      class: 'session-chat',
      'daa-ll': ANALYTICS.CHAT_OPEN,
      'aria-expanded': 'false',
      'aria-controls': panelId,
      'aria-label': `Chat about ${card.contentArea.title}`,
      'data-tooltip': 'Ask about this session',
    }, CHAT_ICON_SVG);

    const onClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.togglePanel(videoId, button);
    };
    button.addEventListener('click', onClick);
    this.cleanupFns.push(() => button.removeEventListener('click', onClick));

    return button;
  }

  createChatPanel(card, videoId) {
    const panel = createTag('div', {
      class: 'session-chat-panel',
      id: `video-chat-panel-${videoId}`,
      hidden: '',
    });

    const personas = createTag('div', { class: 'chat-personas' }, '', { parent: panel });
    const messages = createTag('div', { class: 'chat-messages' }, '', { parent: panel });
    const form = createTag('form', { class: 'chat-input-row' }, '', { parent: panel });
    const input = createTag('textarea', {
      class: 'chat-input',
      rows: '1',
      placeholder: 'Ask about this session...',
    }, '', { parent: form });
    if (SpeechRecognitionCtor) this.createMicButton(form, input, videoId);
    createTag('button', { type: 'submit', class: 'chat-send' }, 'Ask', { parent: form });

    // Delegated listener covers persona chips, timestamp chips, speaker buttons
    // and recommendation jump buttons added later, without needing per-message
    // listener bookkeeping/cleanup.
    const onPanelClick = (event) => {
      const personaChip = event.target.closest('.chat-persona-chip');
      if (personaChip) {
        this.selectPersona(videoId, personaChip.dataset.personaId, personas, card);
        return;
      }
      const timeChip = event.target.closest('.chat-timestamp-chip');
      if (timeChip) {
        this.seek(card, videoId, Number(timeChip.dataset.start));
        return;
      }
      const speakBtn = event.target.closest('.chat-speak-btn');
      if (speakBtn) {
        const text = speakBtn.closest('.chat-message')?.querySelector('p')?.textContent;
        this.speak(text);
        return;
      }
      const jumpBtn = event.target.closest('.chat-recommendation-jump');
      if (jumpBtn) {
        this.jumpToSession(jumpBtn.dataset.targetVideoId);
      }
    };
    panel.addEventListener('click', onPanelClick);
    this.cleanupFns.push(() => panel.removeEventListener('click', onPanelClick));

    const onSubmit = (event) => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question) return;
      input.value = '';
      this.ask(videoId, question, messages, card);
    };
    form.addEventListener('submit', onSubmit);
    this.cleanupFns.push(() => form.removeEventListener('submit', onSubmit));

    const onKeydown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    };
    input.addEventListener('keydown', onKeydown);
    this.cleanupFns.push(() => input.removeEventListener('keydown', onKeydown));

    return panel;
  }

  createMicButton(form, input, videoId) {
    // Created between the textarea and the (not-yet-created) send button, so
    // createTag's own append already lands it in the right visual order.
    const micButton = createTag('button', {
      type: 'button',
      class: 'chat-mic',
      'aria-label': 'Ask by voice',
    }, MIC_ICON_SVG, { parent: form });

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const onMicClick = () => {
      if (micButton.classList.contains('is-listening')) {
        recognition.stop();
        return;
      }
      micButton.classList.add('is-listening');
      recognition.start();
    };
    micButton.addEventListener('click', onMicClick);
    this.cleanupFns.push(() => micButton.removeEventListener('click', onMicClick));

    const onResult = (event) => {
      const transcript = event.results[0][0].transcript;
      input.value = transcript;
      this.getState(videoId).pendingSpeak = true;
      form.requestSubmit();
    };
    const onEnd = () => micButton.classList.remove('is-listening');
    recognition.addEventListener('result', onResult);
    recognition.addEventListener('end', onEnd);
    recognition.addEventListener('error', onEnd);
    this.cleanupFns.push(() => {
      recognition.removeEventListener('result', onResult);
      recognition.removeEventListener('end', onEnd);
      recognition.removeEventListener('error', onEnd);
      recognition.abort();
    });

    return micButton;
  }

  async togglePanel(videoId, button) {
    const panel = qs(`#video-chat-panel-${videoId}`);
    if (!panel) return;
    const nextOpen = panel.hasAttribute('hidden');

    if (nextOpen) {
      panel.removeAttribute('hidden');
    } else {
      panel.setAttribute('hidden', '');
    }
    button.setAttribute('aria-expanded', String(nextOpen));

    const state = this.getState(videoId);
    if (nextOpen && !state.opened) {
      state.opened = true;
      const personas = qs('.chat-personas', panel);
      const messages = qs('.chat-messages', panel);
      await Promise.all([
        this.renderPersonaChips(videoId, personas),
        this.loadOverview(videoId, messages),
      ]);
    }
  }

  async renderPersonaChips(videoId, container) {
    const personas = await fetchPersonas();
    if (!personas.length) return;

    createTag('p', { class: 'chat-personas-label' }, "I'm here as a...", { parent: container });
    const chipRow = createTag('div', { class: 'chat-personas-row' }, '', { parent: container });
    personas.forEach((persona) => {
      const chip = createTag('button', {
        type: 'button',
        class: 'chat-persona-chip',
        'data-persona-id': persona.id,
      }, '', { parent: chipRow });
      chip.textContent = persona.label;
    });
  }

  selectPersona(videoId, personaId, personasContainer, card) {
    const state = this.getState(videoId);
    state.persona = personaId;
    personasContainer.querySelectorAll('.chat-persona-chip').forEach((chip) => {
      chip.classList.toggle('is-selected', chip.dataset.personaId === personaId);
    });

    const panel = qs(`#video-chat-panel-${videoId}`);
    const messages = qs('.chat-messages', panel);
    const persona = personaId.replace('-', ' ');
    this.ask(videoId, `As a ${persona}, what in this session should I pay attention to?`, messages, card, true);
    this.recommend(videoId, personaId, messages);
  }

  async recommend(videoId, personaId, messages) {
    try {
      const res = await fetch(`${AI_CHAT_API_BASE}/api/recommend`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId, persona: personaId }),
      });
      if (!res.ok) throw new Error(`recommend request failed: ${res.status}`);
      const data = await res.json();
      if (data.recommendation) this.renderRecommendation(messages, data.recommendation);
    } catch (err) {
      logError(err, 'VideoChatManager.recommend');
    }
  }

  async loadOverview(videoId, messages) {
    try {
      const res = await fetch(`${AI_CHAT_API_BASE}/api/overview?videoId=${encodeURIComponent(videoId)}`);
      if (!res.ok) throw new Error(`overview request failed: ${res.status}`);
      const data = await res.json();
      this.renderAssistantMessage(messages, data.overview, data.highlights);
    } catch (err) {
      logError(err, 'VideoChatManager.loadOverview');
      this.renderAssistantMessage(messages, "I couldn't load an overview for this session right now.", []);
    }
  }

  async ask(videoId, question, messages, card, hideUserBubble = false) {
    const state = this.getState(videoId);
    const shouldSpeak = state.pendingSpeak;
    state.pendingSpeak = false;
    if (!hideUserBubble) this.renderUserMessage(messages, question);

    const thinking = createTag('div', { class: 'chat-message chat-message--assistant chat-message--pending' }, 'Thinking...', { parent: messages });

    try {
      const res = await fetch(`${AI_CHAT_API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          videoId, persona: state.persona, question, history: state.history,
        }),
      });
      if (!res.ok) throw new Error(`chat request failed: ${res.status}`);
      const data = await res.json();

      thinking.remove();
      this.renderAssistantMessage(messages, data.answer, data.timestamps);
      if (shouldSpeak) this.speak(data.answer);

      state.history.push({ role: 'user', content: question });
      state.history.push({ role: 'assistant', content: data.answer });
    } catch (err) {
      logError(err, 'VideoChatManager.ask');
      thinking.remove();
      this.renderAssistantMessage(messages, "Something went wrong answering that - try again in a moment.", []);
    }
  }

  renderUserMessage(messages, text) {
    const bubble = createTag('div', { class: 'chat-message chat-message--user' }, '', { parent: messages });
    bubble.textContent = text;
    messages.scrollTop = messages.scrollHeight;
  }

  renderAssistantMessage(messages, text, timestamps = []) {
    const bubble = createTag('div', { class: 'chat-message chat-message--assistant' }, '', { parent: messages });
    const paragraph = createTag('p', {}, '', { parent: bubble });
    paragraph.textContent = text;

    if (window.speechSynthesis) {
      createTag('button', {
        type: 'button',
        class: 'chat-speak-btn',
        'aria-label': 'Read this answer aloud',
      }, SPEAKER_ICON_SVG, { parent: bubble });
    }

    if (timestamps?.length) {
      const chips = createTag('div', { class: 'chat-timestamp-chips' }, '', { parent: bubble });
      timestamps.forEach(({ start, label }) => {
        const chip = createTag('button', {
          type: 'button',
          class: 'chat-timestamp-chip',
          'data-start': String(start),
        }, '', { parent: chips });
        chip.textContent = `▶ ${label}`;
      });
    }

    messages.scrollTop = messages.scrollHeight;
  }

  renderRecommendation(messages, recommendation) {
    const bubble = createTag('div', { class: 'chat-message chat-recommendation' }, '', { parent: messages });
    const label = createTag('p', { class: 'chat-recommendation-label' }, '', { parent: bubble });
    label.textContent = 'You might also like:';
    const title = createTag('p', { class: 'chat-recommendation-title' }, '', { parent: bubble });
    title.textContent = recommendation.title;
    const reason = createTag('p', { class: 'chat-recommendation-reason' }, '', { parent: bubble });
    reason.textContent = recommendation.reason;
    const jumpBtn = createTag('button', {
      type: 'button',
      class: 'chat-recommendation-jump',
      'data-target-video-id': recommendation.videoId,
    }, '', { parent: bubble });
    jumpBtn.textContent = 'Jump to this session ▸';

    messages.scrollTop = messages.scrollHeight;
  }

  speak(text) {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  jumpToSession(targetVideoId) {
    const sessionsWrapper = this.getSessionsWrapper?.();
    if (!sessionsWrapper || !targetVideoId) return;

    const targetSession = [...sessionsWrapper.querySelectorAll('.session')].find(
      (el) => normalizeVideoId(el.getAttribute('data-video-id')) === targetVideoId,
    );
    if (!targetSession) return;

    sessionsWrapper.querySelectorAll('.session.highlighted').forEach((el) => el.classList.remove('highlighted'));
    targetSession.classList.add('highlighted');
    targetSession.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const targetButton = targetSession.querySelector('.session-chat');
    const targetPanel = targetSession.querySelector('.session-chat-panel');
    if (targetButton && targetPanel?.hasAttribute('hidden')) {
      this.togglePanel(targetVideoId, targetButton);
    }
  }

  seek(card, videoId, seconds) {
    if (Number.isNaN(seconds)) return;
    const playerManager = this.getPlayerManager?.();
    const isCurrentVideo = playerManager
      && normalizeVideoId(playerManager.currentVideoId()) === videoId;

    if (isCurrentVideo && playerManager.videoContainer) {
      startVideoFromSecond(playerManager.videoContainer, seconds);
      return;
    }

    this.navigateTo(card.overlayLink);
  }
}
