import { expect } from '@esm-bundle/chai';
import * as preact from '../../../mocks/deps/htm-preact.js';
import { buildRegistrationPrompt } from '../../../../../event-libs/v1/blocks/sessions-guide/components/RegistrationPrompt.js';
import { auth } from '../../../../../event-libs/v1/utils/session-store.js';

describe('RegistrationPrompt', () => {
  it('shows sign-in button when logged out', () => {
    auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
    const Prompt = buildRegistrationPrompt(preact);
    const html = Prompt({});
    expect(html).to.include('Sign in');
    expect(html).to.not.include('Register now');
  });

  it('shows register link when logged in but not registered', () => {
    auth.value = { isLoggedIn: true, isRegistered: false, userFirstName: null };
    const Prompt = buildRegistrationPrompt(preact);
    const html = Prompt({});
    expect(html).to.include('Register now');
    expect(html).to.not.include('Sign in');
  });

  it('renders the prompt container', () => {
    auth.value = { isLoggedIn: false, isRegistered: false, userFirstName: null };
    const Prompt = buildRegistrationPrompt(preact);
    expect(Prompt({})).to.include('sg-reg-prompt');
  });
});
