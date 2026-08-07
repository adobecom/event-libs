import { expect } from '@esm-bundle/chai';
import { resolveSessionGuideRequest } from '../../../../../event-libs/v1/blocks/sessions-guide/components/DrawerShell.js';

const SESSION = { id: 'session-1', title: 'Building with AI' };

function makeContext(overrides = {}) {
  return {
    sessionsStatusValue: 'ready',
    sessionsValue: [SESSION],
    authValue: { isLoggedIn: null, isRegistered: undefined, userFirstName: null },
    ...overrides,
  };
}

describe('resolveSessionGuideRequest', () => {
  it('returns null for a null request', () => {
    expect(resolveSessionGuideRequest(null, makeContext())).to.be.null;
  });

  it('returns null when sessions are not yet ready (drops requests fired before load)', () => {
    const context = makeContext({ sessionsStatusValue: 'loading' });
    expect(resolveSessionGuideRequest({ sessionId: 'session-1' }, context)).to.be.null;
  });

  it('returns found: false when the sessionId does not match any session', () => {
    const result = resolveSessionGuideRequest({ sessionId: 'nope' }, makeContext());
    expect(result).to.deep.equal({ found: false, sessionId: 'nope' });
  });

  it('resolves the matching session with defaultView live-upcoming when not registered', () => {
    const result = resolveSessionGuideRequest({ sessionId: 'session-1' }, makeContext());
    expect(result).to.deep.equal({ found: true, sessionId: 'session-1', defaultView: 'live-upcoming' });
  });

  it('resolves defaultView my-sessions when the user is registered', () => {
    const context = makeContext({ authValue: { isLoggedIn: true, isRegistered: true, userFirstName: 'Daniel' } });
    const result = resolveSessionGuideRequest({ sessionId: 'session-1' }, context);
    expect(result.defaultView).to.equal('my-sessions');
  });
});
