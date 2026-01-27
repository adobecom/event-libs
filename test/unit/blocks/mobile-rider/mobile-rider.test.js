/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import init from '../../../../event-libs/v1/blocks/mobile-rider/mobile-rider.js';

describe('Mobile Rider Block', () => {
  let clock;
  let mockStore;

  beforeEach(() => {
    // 1. Initialize fake timers
    clock = sinon.useFakeTimers();
    globalThis.lana = { log: sinon.stub() };
    
    // 2. Mock rAF to be synchronous. This ensures that the code inside 
    // injectPlayer's rAF block runs immediately without waiting for a frame.
    sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => cb());
    
    // 3. Mock the 3rd party library
    globalThis.mobilerider = {
      embed: sinon.stub().callsFake(() => {
        // Crucial: Assign the global player IMMEDIATELY so listeners can be attached
        globalThis.__mr_player = {
          on: sinon.stub(),
          off: sinon.stub(),
          dispose: sinon.stub(),
        };
      }),
    };

    globalThis.__mr_player = null;
    mockStore = { get: sinon.stub(), set: sinon.stub() };
    document.body.innerHTML = '';
  });

  afterEach(() => {
    sinon.restore();
    clock.restore();
    delete globalThis.mobilerider;
    delete globalThis.__mr_player;
  });

  /**
   * Helper to resolve promises and advance the clock
   */
  const advanceLogic = async (ms = 500) => {
    await Promise.resolve(); // Handle microtasks (async/await)
    clock.tick(ms);          // Handle macrotasks (setInterval/setTimeout)
    await Promise.resolve(); // Handle any follow-up microtasks
  };

  describe('ASL (Adaptive Stream Library)', () => {
    it('should detect the ASL button and apply the toggle class', async () => {
      const el = document.createElement('div');
      el.className = 'mobile-rider';
      el.innerHTML = `
        <div><div>videoid</div><div>asl-test-id</div></div>
        <div><div>asl-id</div><div>asl-key-123</div></div>
      `;
      document.body.appendChild(el);
    
      // 1. Start initialization
      const initPromise = init(el);
    
      // 2. We need to wait for the block to transform enough to create the container
      // but NOT necessarily for the whole async init to finish if it clears intervals at the end.
      await Promise.resolve(); 
    
      const container = document.querySelector('#mr-adobe');
      expect(container, 'Container #mr-adobe should exist').to.exist;
    
      // 3. Manually inject the button BEFORE we tick the clock
      const btn = document.createElement('button');
      btn.id = 'asl-button';
      container.appendChild(btn);
    
      // 4. Tick the clock to trigger the setInterval check inside #initASL
      // Your code likely checks every 100ms. 200ms ensures at least one check fires.
      clock.tick(200); 
    
      // 5. Now that the interval has fired, the click listener should be attached.
      btn.click();
    
      // 6. Finalize any pending async logic
      await initPromise;
      await advanceLogic();
    
      expect(container.classList.contains('isASL'), 'isASL class not applied').to.be.true;
    });
  });
  describe('Store Integration & Stream End', () => {
    it('should detect the ASL button and apply the toggle class', async () => {
      const el = document.createElement('div');
      el.className = 'mobile-rider';
      // Note: ensure 'videoid' and 'asl-id' match the keys your JS uses
      el.innerHTML = `
        <div><div>videoid</div><div>asl-test-id</div></div>
        <div><div>asl-id</div><div>asl-key-123</div></div>
      `;
      document.body.appendChild(el);
    
      // Start initialization
      init(el); 
    
      // Wait for the async chain (loadScript -> injectPlayer -> rAF) to land in the DOM
      await Promise.resolve();
      await Promise.resolve();
    
      const container = document.querySelector('#mr-adobe');
      
      // If it's still null, your JS might be using a dynamic ID like `mr-${videoid}`
      // Check your JS for: createTag('div', { id: ... })
      expect(container, 'Container #mr-adobe should exist').to.exist;
    
      // Now that the container exists, inject the button
      const btn = document.createElement('button');
      btn.id = 'asl-button';
      container.appendChild(btn);
    
      // Tick the clock to let the setInterval logic in your JS find the button
      clock.tick(5000); 
      
      btn.click();
      expect(container.classList.contains('isASL'), 'isASL class not applied').to.be.true;
    });
  });
});
