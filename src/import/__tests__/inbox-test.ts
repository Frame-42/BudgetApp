import { inboxQueue, type InboxEntry } from '../inbox';

const entry = (name: string, modifiedAt: number | null): InboxEntry => ({
  uri: `file:///Documents/Inbox/${name}`,
  name,
  modifiedAt,
});

describe('inboxQueue', () => {
  it('orders the files oldest first', () => {
    const queue = inboxQueue([entry('b.csv', 20), entry('a.csv', 10)], new Set());
    expect(queue.map((e) => e.name)).toEqual(['a.csv', 'b.csv']);
  });

  it('skips what is already queued, so a second scan offers nothing new', () => {
    const first = entry('export.csv', 10);
    expect(inboxQueue([first], new Set([first.uri]))).toEqual([]);
  });

  it('offers every file whatever its name, so none is stranded in the Inbox', () => {
    const queue = inboxQueue([entry('export', 1), entry('Export.CSV', 2)], new Set());
    expect(queue.map((e) => e.name)).toEqual(['export', 'Export.CSV']);
  });
});
