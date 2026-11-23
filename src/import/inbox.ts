/**
 * Files another app handed over through "Open in Budget".
 *
 * `LSSupportsOpeningDocumentsInPlace` is false, so iOS copies each one into
 * the app's inbox (`tmp/<bundle id>-Inbox` on current iOS, `Documents/Inbox` on
 * older versions) before waking the app. That folder, not the URL, is what the
 * app reads: on a cold launch the URL reaches the scene delegate before any JS is
 * listening and React Native's `getInitialURL` only looks at launch options,
 * which a scene-based app never receives — so the URL is lost while the copy
 * is still sitting there.
 */
export type InboxEntry = { uri: string; name: string; modifiedAt: number | null };

/**
 * What still needs opening, oldest first so two files arrive in the order they
 * were sent. `queued` is what is already waiting, so a scan on every return to
 * the foreground cannot offer the same file twice.
 *
 * Every file is offered, whatever its name. iOS only copies the type app.json
 * declares, so an `export` with no extension is still a CSV, and filtering it out
 * would leave it in the Inbox forever, since a file is deleted only when its
 * import sheet closes. A file that turns out unreadable gets the importer's
 * error and is deleted on close like any other.
 */
export function inboxQueue(entries: InboxEntry[], queued: ReadonlySet<string>): InboxEntry[] {
  return entries
    .filter((entry) => !queued.has(entry.uri))
    .sort((a, b) => (a.modifiedAt ?? 0) - (b.modifiedAt ?? 0));
}
