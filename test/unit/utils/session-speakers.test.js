import { expect } from '@esm-bundle/chai';
import { sortSessionSpeakers } from '../../../event-libs/v1/utils/session-speakers.js';

const ref = (speakerId, speakerType, ordinal) => ({ speakerId, speakerType, ordinal });
const ids = (list) => list.map((s) => s.speakerId);

// GS1 (Opening Keynote) as its page metadata is deployed today: ascending speakerId.
const GS1 = [
  ['364ea287-e809-4566-8400-c7e83859c9b2', 'Shantanu Narayen', 'Speaker', 1],
  ['3d857617-fe36-427d-a27d-b632a4a90f9e', 'Kelly Weldon', 'Presenter', 3],
  ['57b02520-38f8-44c1-be63-272325b4bf1e', 'Veronica Peitong Chen', 'Presenter', 5],
  ['695ea5ff-d1c5-4206-a2fd-0c38ca030f7d', 'Elise Swopes', 'Presenter', 2],
  ['698544f0-44d1-4af4-b894-3ffbca7bc76d', 'Forest Key', 'Presenter', 9],
  ['731f5245-171d-4569-b07f-f7c22a97ba5f', 'Paul Trani', 'Presenter', 4],
  ['803dff5b-dd89-477f-b41b-652455417b90', 'Michael Fugoso', 'Presenter', 6],
  ['812777ae-407a-40cb-9361-3c72ca793e0f', 'Anil Chakravarthy', 'Speaker', 2],
  ['8b77192a-24f4-4890-866d-71c097e72a31', 'Lucy Street', 'Presenter', 8],
  ['9f3e7822-48f6-4dd4-931b-ddf26aeaba6b', 'Anna McNaught', 'Presenter', 1],
  ['bdfa2e45-0c4e-4060-8a51-b2948fdad4e5', 'Deepa Subramaniam', 'Presenter', 10],
  ['ef1e7f75-813e-4dcc-a8d7-f906758e7c76', 'Dacia Sáenz', 'Presenter', 7],
].map(([speakerId, name, speakerType, ordinal]) => ({ speakerId, name, speakerType, ordinal }));

const GS1_ORDER = [
  'Shantanu Narayen', 'Anil Chakravarthy', 'Anna McNaught', 'Elise Swopes', 'Kelly Weldon',
  'Paul Trani', 'Veronica Peitong Chen', 'Michael Fugoso', 'Dacia Sáenz', 'Lucy Street',
  'Forest Key', 'Deepa Subramaniam',
];

describe('sortSessionSpeakers', () => {
  let logged;
  let originalLana;

  beforeEach(() => {
    logged = [];
    originalLana = window.lana;
    window.lana = { log: (msg, options) => logged.push({ msg, options }) };
  });

  afterEach(() => {
    window.lana = originalLana;
  });

  it('lists GS1 Speakers first, then Co-Presenters, each by ordinal', () => {
    expect(sortSessionSpeakers(GS1).map((s) => s.name)).to.deep.equal(GS1_ORDER);
    expect(logged).to.have.lengthOf(0);
  });

  it('orders S6331 by ordinal within the Speaker role', () => {
    const sorted = sortSessionSpeakers([
      { name: 'Nathan Goldman', speakerType: 'Speaker', ordinal: 2 },
      { name: 'Dan Kuhlken', speakerType: 'Speaker', ordinal: 1 },
    ]);
    expect(sorted.map((s) => s.name)).to.deep.equal(['Dan Kuhlken', 'Nathan Goldman']);
  });

  it('keeps speakers with the same role and ordinal in their incoming order', () => {
    const tied = [ref('a', 'Presenter', 1), ref('b', 'Presenter', 1), ref('c', 'Presenter', 1)];
    expect(ids(sortSessionSpeakers(tied))).to.deep.equal(['a', 'b', 'c']);
    expect(ids(sortSessionSpeakers([...tied].reverse()))).to.deep.equal(['c', 'b', 'a']);

    const many = Array.from({ length: 30 }, (_, i) => ref(`p${i}`, 'Presenter', i % 3));
    const expected = [0, 1, 2].flatMap((ordinal) => ids(many.filter((s) => s.ordinal === ordinal)));
    expect(ids(sortSessionSpeakers(many))).to.deep.equal(expected);
  });

  it('returns a new array and leaves the input untouched', () => {
    const input = GS1.map((s) => ({ ...s }));
    const before = JSON.stringify(input);
    const sorted = sortSessionSpeakers(input);
    expect(sorted).to.not.equal(input);
    expect(JSON.stringify(input)).to.equal(before);
    expect(sorted).to.have.members(input);

    const alreadySorted = [ref('a', 'Speaker', 1)];
    expect(sortSessionSpeakers(alreadySorted)).to.not.equal(alreadySorted);
  });

  it('returns [] for anything but an array, without logging', () => {
    [undefined, null, {}, 'speakers', 42].forEach((value) => {
      expect(sortSessionSpeakers(value)).to.deep.equal([]);
    });
    expect(sortSessionSpeakers([])).to.deep.equal([]);
    expect(logged).to.have.lengthOf(0);
  });

  it('puts other and missing speakerTypes after the Presenters, never with the Speakers', () => {
    const sorted = sortSessionSpeakers([
      ref('host', 'Host', 2),
      ref('untyped', undefined, 1),
      ref('presenter-2', 'Presenter', 2),
      ref('speaker-3', 'Speaker', 3),
      ref('presenter-1', 'Presenter', 1),
    ]);
    expect(ids(sorted)).to.deep.equal([
      'speaker-3', 'presenter-1', 'presenter-2', 'untyped', 'host',
    ]);
  });

  it('sorts a missing or non-numeric ordinal last within its own group', () => {
    const sorted = sortSessionSpeakers([
      ref('speaker-none', 'Speaker'),
      ref('presenter-nan', 'Presenter', 'abc'),
      ref('speaker-2', 'Speaker', 2),
      ref('presenter-3', 'Presenter', 3),
      ref('presenter-null', 'Presenter', null),
      ref('presenter-1', 'Presenter', 1),
    ]);
    expect(ids(sorted)).to.deep.equal([
      'speaker-2', 'speaker-none', 'presenter-1', 'presenter-3', 'presenter-nan', 'presenter-null',
    ]);
  });

  it('treats 0 and numeric strings as real ordinals', () => {
    const sorted = sortSessionSpeakers([
      ref('ten', 'Speaker', '10'),
      ref('one', 'Speaker', 1),
      ref('nine', 'Speaker', '9'),
      ref('zero', 'Speaker', 0),
    ]);
    expect(ids(sorted)).to.deep.equal(['zero', 'one', 'nine', 'ten']);
    expect(logged).to.have.lengthOf(0);
  });

  it('logs one diagnostic per call, with ids and ordering fields but no names', () => {
    sortSessionSpeakers([
      { ...ref('host-1', 'Host', 1), firstName: 'Moderator' },
      ref('untyped', undefined, 2),
      ref('no-ordinal', 'Presenter'),
      ref('clean-speaker', 'Speaker', 1),
    ], 'GS1');
    expect(logged).to.have.lengthOf(1);
    const [{ msg, options }] = logged;
    expect(options).to.deep.equal({ tags: 'session-speakers', severity: 'warning' });
    expect(msg).to.include('[session-speakers] GS1: 3 of 4 speaker(s) ordered by fallback');
    expect(msg).to.include('{"speakerId":"host-1","speakerType":"Host","ordinal":1}');
    expect(msg).to.include('{"speakerId":"untyped","speakerType":null,"ordinal":2}');
    expect(msg).to.include('{"speakerId":"no-ordinal","speakerType":"Presenter","ordinal":null}');
    expect(msg).to.not.include('clean-speaker');
    expect(msg).to.not.include('firstName');

    sortSessionSpeakers([ref('host-2', 'Host', 1)]);
    expect(logged).to.have.lengthOf(2);
    expect(logged[1].msg).to.include('[session-speakers] 1 of 1 speaker(s) ordered by fallback');
  });

  it('never throws on malformed entries, keeping them after the valid ones', () => {
    const valid = ref('speaker', 'Speaker', 1);
    let sorted;
    expect(() => { sorted = sortSessionSpeakers([null, undefined, 7, 'x', valid]); }).to.not.throw();
    expect(sorted).to.deep.equal([valid, null, undefined, 7, 'x']);
    expect(logged).to.have.lengthOf(1);
  });
});
