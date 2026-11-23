import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { inboxQueue } from '../import/inbox';

export type OpenedFile = { uri: string; name: string; text: string };

/**
 * Where iOS leaves a copied file. Current iOS uses `tmp/<bundle id>-Inbox`, found
 * by its suffix so the bundle id isn't repeated here. Older iOS used
 * `Documents/Inbox`, which is still read.
 */
function inboxFolders(): Directory[] {
  const folders = [new Directory(Paths.document, 'Inbox')];
  const tmp = new Directory(Paths.document.parentDirectory, 'tmp');
  if (tmp.exists) {
    for (const item of tmp.list()) {
      if (item instanceof Directory && item.name.endsWith('-Inbox')) folders.push(item);
    }
  }
  return folders.filter((folder) => folder.exists);
}

/**
 * Moves whatever iOS left in its inboxes into `Documents/Opened`, and returns
 * what is waiting there. The inbox is `tmp/`, which iOS purges when it likes,
 * and it did, more than once in testing, while an import sheet was still open
 * on the file. A folder the app owns is what makes "offered again after a
 * relaunch" hold.
 */
function collectOpened(): File[] {
  const opened = new Directory(Paths.document, 'Opened');
  opened.create({ idempotent: true });
  for (const inbox of inboxFolders()) {
    for (const item of inbox.list()) {
      try {
        // Nothing the app accepts is a folder, and left here it would never go.
        if (item instanceof File) item.moveSync(opened);
        else item.delete();
      } catch {
        // A file of the same name is still waiting. This one moves on a later
        // scan, once that one is done with.
      }
    }
  }
  return opened.list().filter((item): item is File => item instanceof File);
}

/**
 * CSVs handed over by "Open in Budget", one at a time. See `import/inbox.ts`
 * for why this reads a folder rather than the URL.
 *
 * A file stays in `Documents/Opened` until `done` is called with it, so one
 * that arrives mid-onboarding, or just before the app is killed, is offered
 * again on the next launch rather than lost.
 */
export function useOpenedFiles() {
  const [queue, setQueue] = useState<OpenedFile[]>([]);
  const queued = useRef(new Set<string>());

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let alive = true;

    const scan = async () => {
      const files = collectOpened();
      const fresh = inboxQueue(
        files.map((f) => ({ uri: f.uri, name: f.name, modifiedAt: f.modificationTime })),
        queued.current,
      );
      // Claimed before the first await, so the launch scan and an immediate
      // foreground scan cannot both pick up the same file.
      for (const entry of fresh) queued.current.add(entry.uri);
      for (const entry of fresh) {
        // An unreadable file is still offered: the importer's own error says
        // what went wrong, where silently dropping it would say nothing.
        const text = await new File(entry.uri).text().catch(() => '');
        if (alive) setQueue((current) => [...current, { uri: entry.uri, name: entry.name, text }]);
      }
    };

    scan().catch(() => {});
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') scan().catch(() => {});
    });
    // A warm open can arrive while already active; the URL itself is only a nudge.
    const link = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith('file:')) scan().catch(() => {});
    });
    return () => {
      alive = false;
      foreground.remove();
      link.remove();
    };
  }, []);

  /* Imported or dismissed, either way it is finished with: the copy is ours,
     and the user can open the original again from wherever it came from. */
  const done = useCallback((file: OpenedFile) => {
    try {
      new File(file.uri).delete();
    } catch {
      // Already gone; nothing to tidy.
    }
    queued.current.delete(file.uri);
    setQueue((current) => current.filter((f) => f.uri !== file.uri));
  }, []);

  return { file: queue[0] ?? null, done };
}
