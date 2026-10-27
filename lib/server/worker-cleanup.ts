import { cloudflare } from './cloudflare';
import { readFileMetadata } from '@/lib/storage/file-metadata';
import { isExpired } from '@/lib/storage/expiry-cleanup';

/** One bounded page per cron; recovery archives are deliberately unreachable. */
export async function cleanupWorkerObjects(): Promise<void> {
  const { DB: db, FILES: files } = cloudflare().env;
  const prefixes = ['generated/', 'temp_images/', 'mail-payload/', 'mail-preview/'];
  const state = await db.prepare('SELECT cursor,prefixIndex FROM MaintenanceCursor WHERE id=?')
    .bind('object-expiry').first<{ cursor: string | null; prefixIndex: number }>();
  const index = state?.prefixIndex || 0;
  const prefix = prefixes[index];
  const page = await files.list({ prefix, cursor: state?.cursor || undefined, limit: 50, include: ['customMetadata'] });
  for (let offset = 0; offset < page.objects.length; offset += 4) {
    await Promise.all(page.objects.slice(offset, offset + 4).map(async object => {
      if (prefix === 'mail-payload/') {
        // Preserve active/ambiguous dispatch payloads and allow a full day for
        // concurrent admission before treating an unreferenced upload as debris.
        if (Date.now() - object.uploaded.getTime() <= 86400000) return;
        if (object.key.startsWith('mail-payload/v2/') && await db.prepare(
          'SELECT token FROM EmailPayloadReservation WHERE token=?').bind(object.key.split('/')[2]).first()) return;
        if (await db.prepare('SELECT id FROM EmailItem WHERE payloadKey=?').bind(object.key).first()) return;
      } else if (prefix === 'mail-preview/') {
        if (Date.now() - object.uploaded.getTime() <= 7 * 86400000) return;
      } else {
        const metadata = readFileMetadata(object.customMetadata);
        if (!metadata || !isExpired(metadata)) return;
      }
      await files.delete(object.key);
    }));
  }
  await db.prepare(`INSERT INTO MaintenanceCursor(id,cursor,prefixIndex) VALUES(?,?,?)
    ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor,prefixIndex=excluded.prefixIndex`)
    .bind('object-expiry', page.truncated ? page.cursor : null, page.truncated ? index : (index + 1) % prefixes.length).run();
}
