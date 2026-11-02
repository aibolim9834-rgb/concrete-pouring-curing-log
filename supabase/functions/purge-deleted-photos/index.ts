// Permanently removes photos deleted in the app more than two days ago: their rows first, then their files.
// Called once a day by pg_cron (migration 20261102051000) with the Vault secret in x-purge-secret.
// POST {"dry_run": true} lists the photos that would go without removing anything.
import { createClient } from 'npm:@supabase/supabase-js@2';

const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? JSON.parse(secretKeys!).default, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const allowed = await admin.rpc('photo_purge_secret_matches', { candidate: req.headers.get('x-purge-secret') ?? '' });
  if (allowed.error) return json({ error: allowed.error.message }, 500);
  if (allowed.data !== true) return json({ error: 'forbidden' }, 403);
  const dryRun = (await req.json().catch(() => ({})))?.dry_run === true;

  // The row delete is one statement, so a photo restored in the meantime is never caught half way.
  const { data: rows, error } = await admin.rpc('purge_deleted_site_photos', { dry_run: dryRun });
  if (error) return json({ error: error.message }, 500);
  const photos = rows as { id: string; original_path: string; thumbnail_path: string }[];
  if (dryRun) return json({ dry_run: true, photos: photos.map(p => p.id) });

  // Rows are already gone; a file that fails here is only left over, never a broken photo in the app.
  const paths = photos.flatMap(p => [p.original_path, p.thumbnail_path]), failed: string[] = [];
  for (let i = 0; i < paths.length; i += 500) {
    const batch = paths.slice(i, i + 500), { error: removeError } = await admin.storage.from('site-photos').remove(batch);
    if (removeError) failed.push(...batch);
  }
  console.log(JSON.stringify({ purgedPhotos: photos.length, removedFiles: paths.length - failed.length, failedFiles: failed }));
  return json({ purgedPhotos: photos.length, removedFiles: paths.length - failed.length, failedFiles: failed });
});
