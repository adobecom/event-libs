import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildStore } from '../../../../../event-libs/v1/blocks/sessions-guide/store/index.js';
import { buildRegistrationPrompt } from '../../../../../event-libs/v1/blocks/sessions-guide/components/RegistrationPrompt.js';

function makeStore(isLoggedIn) {
  const store = buildStore(preact);
  store.SessionGuideContext._current = {
    state: { isLoggedIn, isRegistered: false, eventConfig: {}, scheduled: new Set(), favorited: new Set() },
    dispatch: () => {},
  };
  return store;
}

describe('RegistrationPrompt', () => {
  it('shows sign-in button when logged out', () => {
    const store = makeStore(false);
    const Prompt = buildRegistrationPrompt(preact, store);
    const html = Prompt({});
    expect(html).to.include('Sign in');
    expect(html).to.not.include('Register now');
  });

  it('shows register link when logged in but not registered', () => {
    const store = makeStore(true);
    const Prompt = buildRegistrationPrompt(preact, store);
    const html = Prompt({});
    expect(html).to.include('Register now');
    expect(html).to.not.include('Sign in');
  });

  it('renders the prompt container', () => {
    const store = makeStore(false);
    const Prompt = buildRegistrationPrompt(preact, store);
    expect(Prompt({})).to.include('sg-reg-prompt');
  });
});
