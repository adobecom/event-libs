import { expect } from '@esm-bundle/chai';
import {
  isBlockComplete,
  isScheduleComplete,
  sortBlocks,
  processSchedules,
  prepareScheduleForClient,
  assignIdToBlocks,
  prepareScheduleForServer,
  ScheduleURLUtility,
  validateSchedule,
  setScheduleTitle,
  addBlockToSchedule,
  updateBlockInSchedule,
  deleteBlockFromSchedule,
  reorderBlocksInSchedule,
  convertSheetRowsToBlocks,
} from '../../../event-libs/schedule-maker/utils.js';

function makeBlock(overrides = {}) {
  return {
    id: 'block-1',
    title: 'Keynote',
    fragmentPath: '/events/frag',
    startDateTime: 1000,
    ...overrides,
  };
}

function makeSchedule(overrides = {}) {
  return {
    scheduleId: 'sched-1',
    title: 'My Schedule',
    createdTime: '2026-01-01T00:00:00.000Z',
    modificationTime: '2026-01-01T00:00:00.000Z',
    blocks: [],
    ...overrides,
  };
}

describe('schedule-maker utils', () => {
  describe('isBlockComplete', () => {
    it('is true when title, fragmentPath and startDateTime are present', () => {
      expect(isBlockComplete(makeBlock())).to.be.true;
    });

    it('is false when title is missing', () => {
      expect(isBlockComplete(makeBlock({ title: '' }))).to.be.false;
    });

    it('is false when fragmentPath is missing', () => {
      expect(isBlockComplete(makeBlock({ fragmentPath: '' }))).to.be.false;
    });

    it('is false when startDateTime is missing', () => {
      expect(isBlockComplete(makeBlock({ startDateTime: 0 }))).to.be.false;
    });

    it('requires a streamId when live stream is included', () => {
      const block = makeBlock({ includeLiveStream: true, liveStream: { streamId: '' } });
      expect(isBlockComplete(block)).to.be.false;
    });

    it('is complete with a live stream that has a streamId', () => {
      const block = makeBlock({ includeLiveStream: true, liveStream: { streamId: 'abc' } });
      expect(isBlockComplete(block)).to.be.true;
    });
  });

  describe('isScheduleComplete', () => {
    it('is false when there are no blocks', () => {
      expect(isScheduleComplete(makeSchedule({ blocks: [] }))).to.be.false;
    });

    it('is true when every block is complete', () => {
      const schedule = makeSchedule({ blocks: [makeBlock(), makeBlock({ id: 'block-2' })] });
      expect(isScheduleComplete(schedule)).to.be.true;
    });

    it('is false when any block is incomplete', () => {
      const schedule = makeSchedule({ blocks: [makeBlock(), makeBlock({ id: 'block-2', title: '' })] });
      expect(isScheduleComplete(schedule)).to.be.false;
    });
  });

  describe('sortBlocks', () => {
    it('sorts blocks by ascending startDateTime without mutating the input', () => {
      const input = [
        makeBlock({ id: 'a', startDateTime: 300 }),
        makeBlock({ id: 'b', startDateTime: 100 }),
        makeBlock({ id: 'c', startDateTime: 200 }),
      ];
      const sorted = sortBlocks(input);
      expect(sorted.map((b) => b.id)).to.deep.equal(['b', 'c', 'a']);
      expect(input.map((b) => b.id)).to.deep.equal(['a', 'b', 'c']);
    });

    it('returns falsy input unchanged', () => {
      expect(sortBlocks(undefined)).to.equal(undefined);
      expect(sortBlocks(null)).to.equal(null);
    });
  });

  describe('validateSchedule', () => {
    it('returns no errors for a valid schedule', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      expect(validateSchedule(schedule)).to.deep.equal([]);
    });

    it('flags a missing schedule title', () => {
      const errors = validateSchedule(makeSchedule({ title: '  ' }));
      expect(errors).to.include('Schedule title is required');
    });

    it('flags a block with a missing title', () => {
      const schedule = makeSchedule({ blocks: [makeBlock({ title: '' })] });
      const errors = validateSchedule(schedule);
      expect(errors.some((e) => e.includes('Block 1: Title is required'))).to.be.true;
    });

    it('flags an invalid fragment path', () => {
      const schedule = makeSchedule({ blocks: [makeBlock({ fragmentPath: 'not a url' })] });
      const errors = validateSchedule(schedule);
      expect(errors.some((e) => e.includes('Fragment path must be a valid'))).to.be.true;
    });

    it('accepts a relative fragment path with query and hash', () => {
      const schedule = makeSchedule({ blocks: [makeBlock({ fragmentPath: '/events/frag?x=1#top' })] });
      expect(validateSchedule(schedule)).to.deep.equal([]);
    });

    it('accepts an absolute fragment path', () => {
      const schedule = makeSchedule({ blocks: [makeBlock({ fragmentPath: 'https://example.com/frag' })] });
      expect(validateSchedule(schedule)).to.deep.equal([]);
    });
  });

  describe('prepareScheduleForServer', () => {
    it('returns null for a falsy schedule', () => {
      expect(prepareScheduleForServer(null)).to.equal(null);
    });

    it('strips client-only fields and sets modificationTime', () => {
      const schedule = makeSchedule({
        isComplete: true,
        blocks: [makeBlock({ isEditingBlockTitle: true, isComplete: true })],
      });
      const result = prepareScheduleForServer(schedule);
      expect(result).to.not.have.property('isComplete');
      const [block] = result.blocks;
      expect(block).to.not.have.property('id');
      expect(block).to.not.have.property('isEditingBlockTitle');
      expect(block).to.not.have.property('isComplete');
      expect(result.modificationTime).to.be.a('string');
    });

    it('drops liveStream when not included and fragmentPath when empty', () => {
      const schedule = makeSchedule({
        blocks: [makeBlock({ includeLiveStream: false, liveStream: { streamId: 'x' }, fragmentPath: '' })],
      });
      const [block] = prepareScheduleForServer(schedule).blocks;
      expect(block).to.not.have.property('liveStream');
      expect(block).to.not.have.property('fragmentPath');
    });

    it('keeps liveStream when included', () => {
      const schedule = makeSchedule({
        blocks: [makeBlock({ includeLiveStream: true, liveStream: { streamId: 'x' } })],
      });
      const [block] = prepareScheduleForServer(schedule).blocks;
      expect(block.liveStream).to.deep.equal({ streamId: 'x' });
    });

    it('does not mutate the original schedule', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      prepareScheduleForServer(schedule);
      expect(schedule.blocks[0]).to.have.property('id', 'block-1');
    });
  });

  describe('prepareScheduleForClient', () => {
    it('returns null for a falsy schedule', () => {
      expect(prepareScheduleForClient(null)).to.equal(null);
    });

    it('assigns ids, defaults, and completeness flags to blocks', () => {
      const schedule = makeSchedule({ scheduleId: undefined, createdTime: undefined, blocks: [makeBlock()] });
      const result = prepareScheduleForClient(schedule);
      expect(result.scheduleId).to.be.a('string');
      expect(result.createdTime).to.be.a('string');
      const [block] = result.blocks;
      expect(block.id).to.match(/^block-/);
      expect(block.isEditingBlockTitle).to.be.false;
      expect(block.liveStream).to.deep.equal({ provider: 'MobileRider', streamId: '' });
      expect(block.isComplete).to.be.true;
      expect(result.isComplete).to.be.true;
    });

    it('sorts blocks by startDateTime', () => {
      const schedule = makeSchedule({
        blocks: [makeBlock({ startDateTime: 300 }), makeBlock({ startDateTime: 100 })],
      });
      const result = prepareScheduleForClient(schedule);
      expect(result.blocks.map((b) => b.startDateTime)).to.deep.equal([100, 300]);
    });
  });

  describe('processSchedules', () => {
    it('returns an empty array for falsy input', () => {
      expect(processSchedules(null)).to.deep.equal([]);
    });

    it('sorts schedules by most recent modificationTime first', () => {
      const schedules = [
        makeSchedule({ scheduleId: 'old', modificationTime: '2026-01-01T00:00:00.000Z', blocks: [makeBlock()] }),
        makeSchedule({ scheduleId: 'new', modificationTime: '2026-06-01T00:00:00.000Z', blocks: [makeBlock()] }),
      ];
      const result = processSchedules(schedules);
      expect(result[0].scheduleId).to.equal('new');
      expect(result[1].scheduleId).to.equal('old');
    });
  });

  describe('assignIdToBlocks', () => {
    it('assigns a unique id to each block in place', () => {
      const schedule = makeSchedule({ blocks: [makeBlock({ id: undefined }), makeBlock({ id: undefined })] });
      assignIdToBlocks(schedule);
      const [a, b] = schedule.blocks;
      expect(a.id).to.match(/^block-/);
      expect(b.id).to.match(/^block-/);
      expect(a.id).to.not.equal(b.id);
    });
  });

  describe('ScheduleURLUtility', () => {
    it('round-trips a schedule through createScheduleURL and extractScheduleFromURL', async () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      const url = ScheduleURLUtility.createScheduleURL(schedule, 'myorg', 'myrepo');
      expect(url).to.include('myorg');
      expect(url).to.include('myrepo');
      const extracted = await ScheduleURLUtility.extractScheduleFromURL(url);
      expect(extracted.title).to.equal('My Schedule');
      expect(extracted.blocks).to.have.lengthOf(1);
    });

    it('extracts a schedule from a hash-fragment URL', async () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      const queryUrl = ScheduleURLUtility.createScheduleURL(schedule, 'o', 'r');
      const encoded = new URL(queryUrl).searchParams.get('schedule');
      const hashUrl = `https://da.live/app/o/r/tools#schedule=${encoded}`;
      const extracted = await ScheduleURLUtility.extractScheduleFromURL(hashUrl);
      expect(extracted.title).to.equal('My Schedule');
    });

    it('throws when the URL has no schedule parameter', async () => {
      let threw = false;
      try {
        await ScheduleURLUtility.extractScheduleFromURL('https://da.live/app/o/r/tools');
      } catch (e) {
        threw = true;
      }
      expect(threw).to.be.true;
    });
  });

  describe('setScheduleTitle', () => {
    it('updates the title and recomputes completeness', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      const result = setScheduleTitle(schedule, 'New Title');
      expect(result.title).to.equal('New Title');
      expect(result.isComplete).to.be.true;
    });

    it('returns the input untouched when falsy', () => {
      expect(setScheduleTitle(null, 'x')).to.equal(null);
    });

    it('does not mutate the original schedule', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      setScheduleTitle(schedule, 'New Title');
      expect(schedule.title).to.equal('My Schedule');
    });
  });

  describe('addBlockToSchedule', () => {
    it('appends a block and recomputes completeness', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      const result = addBlockToSchedule(schedule, makeBlock({ id: 'block-2' }));
      expect(result.blocks).to.have.lengthOf(2);
      expect(result.isComplete).to.be.true;
    });

    it('marks the schedule incomplete when the added block is incomplete', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      const result = addBlockToSchedule(schedule, makeBlock({ id: 'block-2', title: '' }));
      expect(result.isComplete).to.be.false;
    });

    it('returns the input untouched when falsy', () => {
      expect(addBlockToSchedule(null, makeBlock())).to.equal(null);
    });

    it('does not mutate the original blocks array', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      addBlockToSchedule(schedule, makeBlock({ id: 'block-2' }));
      expect(schedule.blocks).to.have.lengthOf(1);
    });
  });

  describe('updateBlockInSchedule', () => {
    it('applies updates to the matching block and recomputes completeness', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      const result = updateBlockInSchedule(schedule, 'block-1', { title: 'Updated' });
      expect(result.blocks[0].title).to.equal('Updated');
      expect(result.blocks[0].isComplete).to.be.true;
    });

    it('marks a block incomplete when an update removes a required field', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      const result = updateBlockInSchedule(schedule, 'block-1', { title: '' });
      expect(result.blocks[0].isComplete).to.be.false;
      expect(result.isComplete).to.be.false;
    });

    it('returns the schedule unchanged when the block id is not found', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      const result = updateBlockInSchedule(schedule, 'missing', { title: 'x' });
      expect(result).to.equal(schedule);
    });

    it('returns the input untouched when falsy', () => {
      expect(updateBlockInSchedule(null, 'block-1', {})).to.equal(null);
    });

    it('does not mutate the original block', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      updateBlockInSchedule(schedule, 'block-1', { title: 'Updated' });
      expect(schedule.blocks[0].title).to.equal('Keynote');
    });
  });

  describe('deleteBlockFromSchedule', () => {
    it('removes the matching block and recomputes completeness', () => {
      const schedule = makeSchedule({ blocks: [makeBlock(), makeBlock({ id: 'block-2' })] });
      const result = deleteBlockFromSchedule(schedule, 'block-2');
      expect(result.blocks).to.have.lengthOf(1);
      expect(result.blocks[0].id).to.equal('block-1');
    });

    it('becomes incomplete when the last block is removed', () => {
      const schedule = makeSchedule({ blocks: [makeBlock()] });
      const result = deleteBlockFromSchedule(schedule, 'block-1');
      expect(result.blocks).to.have.lengthOf(0);
      expect(result.isComplete).to.be.false;
    });

    it('returns the input untouched when falsy', () => {
      expect(deleteBlockFromSchedule(null, 'block-1')).to.equal(null);
    });
  });

  describe('reorderBlocksInSchedule', () => {
    it('moves the dragged block to sit before the target block', () => {
      const schedule = makeSchedule({
        blocks: [
          makeBlock({ id: 'a' }),
          makeBlock({ id: 'b' }),
          makeBlock({ id: 'c' }),
        ],
      });
      const result = reorderBlocksInSchedule(schedule, 'c', 'a');
      expect(result.blocks.map((b) => b.id)).to.deep.equal(['c', 'a', 'b']);
    });

    it('returns the schedule unchanged when dragged equals target', () => {
      const schedule = makeSchedule({ blocks: [makeBlock({ id: 'a' })] });
      expect(reorderBlocksInSchedule(schedule, 'a', 'a')).to.equal(schedule);
    });

    it('returns the schedule unchanged when an id is not found', () => {
      const schedule = makeSchedule({ blocks: [makeBlock({ id: 'a' })] });
      expect(reorderBlocksInSchedule(schedule, 'a', 'missing')).to.equal(schedule);
    });

    it('returns the input untouched when falsy', () => {
      expect(reorderBlocksInSchedule(null, 'a', 'b')).to.equal(null);
    });

    it('does not mutate the original blocks array', () => {
      const schedule = makeSchedule({ blocks: [makeBlock({ id: 'a' }), makeBlock({ id: 'b' })] });
      reorderBlocksInSchedule(schedule, 'b', 'a');
      expect(schedule.blocks.map((b) => b.id)).to.deep.equal(['a', 'b']);
    });
  });

  describe('convertSheetRowsToBlocks', () => {
    const mapping = {
      startDateTime: 'When',
      title: 'Name',
      streamId: 'Stream',
      fragmentPath: 'Fragment',
    };

    it('returns an empty array when there is no data row', () => {
      expect(convertSheetRowsToBlocks([], mapping)).to.deep.equal([]);
      expect(convertSheetRowsToBlocks([['When', 'Name']], mapping)).to.deep.equal([]);
    });

    it('maps columns to block properties by header name', () => {
      const sheet = [
        ['When', 'Name', 'Stream', 'Fragment'],
        ['2026-01-01T10:00:00Z', 'Keynote', 'stream-1', '/events/frag'],
      ];
      const [block] = convertSheetRowsToBlocks(sheet, mapping);
      expect(block.title).to.equal('Keynote');
      expect(block.fragmentPath).to.equal('/events/frag');
      expect(block.startDateTime).to.equal(new Date('2026-01-01T10:00:00Z').getTime());
      expect(block.liveStream).to.deep.equal({ provider: 'MobileRider', streamId: 'stream-1' });
      expect(block.includeLiveStream).to.be.true;
      expect(block.id).to.match(/^block-/);
      expect(block.isComplete).to.be.false;
      expect(block.isEditingBlockTitle).to.be.false;
    });

    it('defaults an empty live stream when no streamId column is mapped', () => {
      const sheet = [
        ['When', 'Name'],
        ['2026-01-01T10:00:00Z', 'Keynote'],
      ];
      const [block] = convertSheetRowsToBlocks(sheet, { startDateTime: 'When', title: 'Name', streamId: '', fragmentPath: '' });
      expect(block.liveStream).to.deep.equal({ provider: 'MobileRider', streamId: '' });
      expect(block.includeLiveStream).to.be.false;
    });

    it('drops rows missing a title or a valid start time', () => {
      const sheet = [
        ['When', 'Name'],
        ['2026-01-01T10:00:00Z', 'Valid'],
        ['2026-01-01T11:00:00Z', ''],
        ['not-a-date', 'No Time'],
      ];
      const blocks = convertSheetRowsToBlocks(sheet, { startDateTime: 'When', title: 'Name', streamId: '', fragmentPath: '' });
      expect(blocks).to.have.lengthOf(1);
      expect(blocks[0].title).to.equal('Valid');
    });

    it('assigns a unique id to each produced block', () => {
      const sheet = [
        ['When', 'Name'],
        ['2026-01-01T10:00:00Z', 'A'],
        ['2026-01-01T11:00:00Z', 'B'],
      ];
      const blocks = convertSheetRowsToBlocks(sheet, { startDateTime: 'When', title: 'Name', streamId: '', fragmentPath: '' });
      expect(blocks[0].id).to.not.equal(blocks[1].id);
    });
  });
});
