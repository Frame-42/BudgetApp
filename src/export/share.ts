import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Hands a CSV to the system share sheet, which is where "get this off the
 * device" actually happens — Files, iCloud Drive, Mail, AirDrop.
 *
 * The file is written to the cache rather than the document directory: it is a
 * copy of data the database still holds, so letting the system reclaim it is
 * right, and a stale export sitting in Files-visible storage would be a second
 * copy nobody updates.
 */
export async function shareCsv(text: string, filename: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(text);

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export transactions',
  });
}
