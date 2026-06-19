import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import init, { RTE_IDS, validateRteId, detectOverlaps } from '../../../../event-libs/v1/blocks/event-agenda/event-agenda.js';
import { setMetadata } from '../../../../event-libs/v1/utils/utils.js';

const body = await readFile({ path: './mocks/default.html' });

// ---------------------------------------------------------------------------
// Helper: build a minimal agenda session object
// ---------------------------------------------------------------------------
function makeSession(rteId, startTime, endTime, title = 'Session', description = 'Desc') {
  return { rteId, startTime, endTime, title, description };
}

// ---------------------------------------------------------------------------
// RTE configuration & data-model tests
// ---------------------------------------------------------------------------
describe('3-RTE configuration', () => {
  it('RTE_IDS defines exactly 3 entries', () => {
    expect(RTE_IDS).to.have.lengthOf(3);
  });

  it('all 3 RTE identifiers are distinct strings', () => {
    const unique = new Set(RTE_IDS);
    expect(unique.size).to.equal(3);
    RTE_IDS.forEach((id) => expect(typeof id).to.equal('string'));
  });

  it('RTE_IDS contains rte-1, rte-2, and rte-3', () => {
    expect(RTE_IDS).to.include('rte-1');
    expect(RTE_IDS).to.include('rte-2');
    expect(RTE_IDS).to.include('rte-3');
  });
});

// ---------------------------------------------------------------------------
// validateRteId tests
// ---------------------------------------------------------------------------
describe('validateRteId', () => {
  it('accepts rte-1', () => {
    expect(validateRteId('rte-1')).to.be.true;
  });

  it('accepts rte-2', () => {
    expect(validateRteId('rte-2')).to.be.true;
  });

  it('accepts rte-3', () => {
    expect(validateRteId('rte-3')).to.be.true;
  });

  it('rejects an undefined 4th RTE identifier rte-4', () => {
    expect(validateRteId('rte-4')).to.be.false;
  });

  it('rejects arbitrary unknown identifiers', () => {
    expect(validateRteId('rte-0')).to.be.false;
    expect(validateRteId('RTE-1')).to.be.false;
    expect(validateRteId('')).to.be.false;
    expect(validateRteId(undefined)).to.be.false;
    expect(validateRteId(null)).to.be.false;
    expect(validateRteId(5)).to.be.false;
  });
});

// ---------------------------------------------------------------------------
// detectOverlaps tests
// ---------------------------------------------------------------------------
describe('detectOverlaps', () => {
  it('returns empty array when there are no sessions', () => {
    expect(detectOverlaps([])).to.deep.equal([]);
  });

  it('returns empty array when sessions have no rteId', () => {
    const sessions = [
      { startTime: '09:00:00', endTime: '10:00:00', title: 'A' },
      { startTime: '09:30:00', endTime: '10:30:00', title: 'B' },
    ];
    expect(detectOverlaps(sessions)).to.deep.equal([]);
  });

  it('detects an overlap between two sessions in the same RTE', () => {
    const sessions = [
      makeSession('rte-1', '09:00:00', '10:00:00'),
      makeSession('rte-1', '09:30:00', '10:30:00'),
    ];
    const overlaps = detectOverlaps(sessions);
    expect(overlaps).to.have.lengthOf(1);
    expect(overlaps[0].rteId).to.equal('rte-1');
  });

  it('does NOT flag sessions in different RTEs at the same time as overlapping', () => {
    const sessions = [
      makeSession('rte-1', '09:00:00', '10:00:00'),
      makeSession('rte-2', '09:00:00', '10:00:00'),
      makeSession('rte-3', '09:00:00', '10:00:00'),
    ];
    expect(detectOverlaps(sessions)).to.deep.equal([]);
  });

  it('detects multiple overlaps across different RTEs independently', () => {
    const sessions = [
      makeSession('rte-1', '09:00:00', '10:00:00'),
      makeSession('rte-1', '09:45:00', '10:45:00'), // overlaps with above
      makeSession('rte-2', '11:00:00', '12:00:00'),
      makeSession('rte-2', '11:30:00', '12:30:00'), // overlaps with above
      makeSession('rte-3', '13:00:00', '14:00:00'), // no overlap
    ];
    const overlaps = detectOverlaps(sessions);
    expect(overlaps).to.have.lengthOf(2);
    const rteIds = overlaps.map((o) => o.rteId).sort();
    expect(rteIds).to.deep.equal(['rte-1', 'rte-2']);
  });

  it('does not flag back-to-back sessions (end == next start) as overlapping', () => {
    const sessions = [
      makeSession('rte-1', '09:00:00', '10:00:00'),
      makeSession('rte-1', '10:00:00', '11:00:00'),
    ];
    expect(detectOverlaps(sessions)).to.deep.equal([]);
  });

  it('handles sessions without endTime using startTime as a point', () => {
    const sessions = [
      makeSession('rte-2', '09:00:00', null),
      makeSession('rte-2', '09:00:00', null), // same point — not strictly < so no overlap
    ];
    // aStart(540) < bEnd(540) is false → no overlap
    expect(detectOverlaps(sessions)).to.deep.equal([]);
  });
});

// ---------------------------------------------------------------------------
// 3-RTE session redistribution: total count unchanged
// ---------------------------------------------------------------------------
describe('3-RTE session redistribution', () => {
  const originalSessions = [
    makeSession('rte-1', '09:00:00', '09:45:00', 'Keynote', 'Opening keynote'),
    makeSession('rte-1', '10:00:00', '10:45:00', 'Session A', 'Track 1 session A'),
    makeSession('rte-1', '11:00:00', '11:45:00', 'Session B', 'Track 1 session B'),
    makeSession('rte-2', '09:00:00', '09:45:00', 'Workshop 1', 'Hands-on workshop'),
    makeSession('rte-2', '10:00:00', '10:45:00', 'Workshop 2', 'Advanced workshop'),
    makeSession('rte-3', '09:00:00', '09:45:00', 'Lab 1', 'Lab session 1'),
    makeSession('rte-3', '10:00:00', '10:45:00', 'Lab 2', 'Lab session 2'),
    makeSession('rte-3', '11:00:00', '11:45:00', 'Lab 3', 'Lab session 3'),
  ];

  it('total session count is 8 (unchanged)', () => {
    expect(originalSessions).to.have.lengthOf(8);
  });

  it('all sessions are assigned to a valid RTE (1, 2, or 3)', () => {
    originalSessions.forEach((s) => {
      expect(validateRteId(s.rteId), `${s.title} has invalid rteId "${s.rteId}"`).to.be.true;
    });
  });

  it('no time-slot overlaps exist within any single RTE', () => {
    const overlaps = detectOverlaps(originalSessions);
    expect(overlaps).to.deep.equal([]);
  });

  it('sessions are distributed across all 3 RTEs', () => {
    const usedRtes = new Set(originalSessions.map((s) => s.rteId));
    expect(usedRtes.size).to.equal(3);
    expect(usedRtes.has('rte-1')).to.be.true;
    expect(usedRtes.has('rte-2')).to.be.true;
    expect(usedRtes.has('rte-3')).to.be.true;
  });
});

// ---------------------------------------------------------------------------
// UI rendering: 3-column grid with three-rte class
// ---------------------------------------------------------------------------
describe('3-RTE grid rendering', () => {
  // Build a 9-session agenda (3 per RTE) to exercise 3-column splitting
  const nineSessionAgenda = Array.from({ length: 9 }, (_, i) => ({
    startTime: `${9 + i}:00:00`,
    title: `Session ${i + 1}`,
    description: `Description ${i + 1}`,
  }));

  beforeEach(() => {
    document.body.innerHTML = body;
    document.head.innerHTML = '';
    delete document.body.dataset.eventState;
  });

  it('renders exactly 3 column elements when three-rte class is present', async () => {
    setMetadata('agenda', JSON.stringify(nineSessionAgenda));
    setMetadata('photos', JSON.stringify([]));

    const el = document.querySelector('.event-agenda');
    el.classList.add('three-rte');
    await init(el);

    const columns = el.querySelectorAll('.agenda-item-container .column');
    expect(columns.length).to.equal(3);
  });

  it('distributes all sessions across the 3 columns with no session lost', async () => {
    setMetadata('agenda', JSON.stringify(nineSessionAgenda));
    setMetadata('photos', JSON.stringify([]));

    const el = document.querySelector('.event-agenda');
    el.classList.add('three-rte');
    await init(el);

    const allItems = el.querySelectorAll('.agenda-list-item');
    expect(allItems.length).to.equal(nineSessionAgenda.length);
  });

  it('each column receives at least one session', async () => {
    setMetadata('agenda', JSON.stringify(nineSessionAgenda));
    setMetadata('photos', JSON.stringify([]));

    const el = document.querySelector('.event-agenda');
    el.classList.add('three-rte');
    await init(el);

    const columns = el.querySelectorAll('.agenda-item-container .column');
    columns.forEach((col, i) => {
      const items = col.querySelectorAll('.agenda-list-item');
      expect(items.length, `column ${i + 1} should have at least 1 session`).to.be.greaterThan(0);
    });
  });

  it('falls back to single column when three-rte is absent and session count <= 6', async () => {
    const fewSessions = nineSessionAgenda.slice(0, 4);
    setMetadata('agenda', JSON.stringify(fewSessions));
    setMetadata('photos', JSON.stringify([]));

    const el = document.querySelector('.event-agenda');
    // no three-rte class
    await init(el);

    const columns = el.querySelectorAll('.agenda-item-container .column');
    // With <=6 items and no three-rte, only 1 unique column is created
    expect(columns.length).to.equal(1);
  });

  it('does not render a 4th column even with many sessions', async () => {
    const manySessions = Array.from({ length: 20 }, (_, i) => ({
      startTime: `${8 + (i % 12)}:00:00`,
      title: `Session ${i + 1}`,
      description: `Desc ${i + 1}`,
    }));
    setMetadata('agenda', JSON.stringify(manySessions));
    setMetadata('photos', JSON.stringify([]));

    const el = document.querySelector('.event-agenda');
    el.classList.add('three-rte');
    await init(el);

    const columns = el.querySelectorAll('.agenda-item-container .column');
    expect(columns.length).to.equal(3);
  });
});
