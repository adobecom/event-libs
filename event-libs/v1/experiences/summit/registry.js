/*
 * summit experience registry (explicit allowlist of C2 block names).
 * Do not spread EVENT_BLOCKS_C2 here: new MAX registrations must not widen this catalog.
 * Blocks that Milo itself owns (for example faq) do not belong in this list.
 */
export const SUMMIT_BLOCKS = [
  'event-card',
  'event-carousel',
  'event-marquee',
];
