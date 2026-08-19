import { readFile } from '@web/test-runner-commands';
import init from '../../../../event-libs/v1/blocks/grid-column/grid-column.js';

const defaultBody = await readFile({ path: './mocks/default.html' });
const emptyBody = await readFile({ path: './mocks/empty.html' });

describe('Grid Column Block', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('does nothing when there is no link', async () => {
    document.body.innerHTML = emptyBody;
    const el = document.querySelector('.grid-column');
    await init(el);
  });

  it('delegates to the authored link without throwing', async () => {
    document.body.innerHTML = defaultBody;
    const el = document.querySelector('.grid-column');
    await init(el);
  });
});
