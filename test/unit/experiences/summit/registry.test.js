import { expect } from '@esm-bundle/chai';
import { SUMMIT_BLOCKS } from '../../../../event-libs/v1/experiences/summit/registry.js';
import { EVENT_BLOCKS_C2 } from '../../../../event-libs/v1/libs.js';

describe('summit experience registry', () => {
  it('is a non-empty list of unique block names', () => {
    expect(SUMMIT_BLOCKS).to.be.an('array').that.is.not.empty;
    expect(new Set(SUMMIT_BLOCKS).size).to.equal(SUMMIT_BLOCKS.length);
  });

  it('only selects blocks that already exist in the C2 catalog', () => {
    SUMMIT_BLOCKS.forEach((blockName) => expect(EVENT_BLOCKS_C2, blockName).to.include(blockName));
  });
});
