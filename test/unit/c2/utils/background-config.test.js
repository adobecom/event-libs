import { expect } from '@esm-bundle/chai';
import { readBackgroundConfig } from '../../../../event-libs/v1/c2/utils/background-config.js';

function row(key, value) {
  const r = document.createElement('div');
  const k = document.createElement('div');
  k.textContent = key;
  const v = document.createElement('div');
  v.textContent = value;
  r.append(k, v);
  return r;
}

describe('readBackgroundConfig', () => {
  it('returns the value of a "Background" row', () => {
    const el = document.createElement('div');
    el.append(row('Background', '#f00'));
    expect(readBackgroundConfig(el)).to.equal('#f00');
  });

  it('matches the key case-insensitively', () => {
    const el = document.createElement('div');
    el.append(row('background', 'rgb(0, 0, 0)'));
    expect(readBackgroundConfig(el)).to.equal('rgb(0, 0, 0)');
  });

  it('trims whitespace around the value', () => {
    const el = document.createElement('div');
    el.append(row('Background', '  linear-gradient(red, yellow)  '));
    expect(readBackgroundConfig(el)).to.equal('linear-gradient(red, yellow)');
  });

  it('ignores unrelated rows', () => {
    const el = document.createElement('div');
    el.append(row('Title', 'Some title'));
    expect(readBackgroundConfig(el)).to.be.null;
  });

  it('returns null when there are no rows', () => {
    const el = document.createElement('div');
    expect(readBackgroundConfig(el)).to.be.null;
  });
});
