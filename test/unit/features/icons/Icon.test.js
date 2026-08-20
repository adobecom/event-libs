import { expect } from '@esm-bundle/chai';
import { Icon } from '../../../../event-libs/v1/features/icons/Icon.js';

// The shared htm-preact test mock stubs useEffect as a no-op (see
// test/unit/mocks/deps/htm-preact.js), so the async resolveIcon()->ref population
// never runs here. These tests cover the synchronous render shape only.
describe('Icon', () => {
  it('renders without throwing', () => {
    expect(() => Icon({ name: 'mainstage' })).to.not.throw();
  });

  it('renders a wrapper span with the sg-icon class and aria-hidden', () => {
    const markup = String(Icon({ name: 'mainstage' }));
    expect(markup).to.include('sg-icon');
    expect(markup).to.include('aria-hidden="true"');
  });

  it('includes a custom className alongside sg-icon', () => {
    const markup = String(Icon({ name: 'mainstage', className: 'sg-detail__channel-icon' }));
    expect(markup).to.include('sg-detail__channel-icon');
    expect(markup).to.include('sg-icon');
  });

  it('accepts a custom resolve function without throwing', () => {
    const customResolve = () => Promise.resolve(null);
    expect(() => Icon({ name: 'photoshop-64', resolve: customResolve })).to.not.throw();
  });
});
