// 알폼핀 원본 보관: once the office PC (tools/photo-archive) has saved an original to its own drive and checked it,
// this points the photo at the 2048px copy the PC uploaded and removes the original file from storage.
// Only that PC can call it: x-archive-secret must match the SHA-256 kept by photo_archive_secret_matches()
// (migration 20261109100000). The app's public key still cannot remove files.
//   POST {"action":"archive", id, original_path, original_hash, reduced_path, reduced_hash, archive_name}
//   POST {"action":"retry_removals"}  removes originals whose removal failed on an earlier run
import { createClient } from 'npm:@supabase/supabase-js@2';

const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? JSON.parse(secretKeys!).default, { auth: { persistSession: false } });
const bucket = () => admin.storage.from('site-photos');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const hex = async (data: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
const text = (v: unknown, max = 600) => typeof v === 'string' && v.length > 0 && v.length <= max;

// Removes an original and clears its pending mark; a failure leaves the mark for the next run.
async function removeOriginal(id: string, path: string) {
  const { error } = await bucket().remove([path]);
  if (error) return false;
  const { error: clearError } = await admin.from('site_photos').update({ original_removal_pending: null }).eq('id', id).eq('original_removal_pending', path);
  return !clearError;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const allowed = await admin.rpc('photo_archive_secret_matches', { candidate: req.headers.get('x-archive-secret') ?? '' });
  if (allowed.error) return json({ error: allowed.error.message }, 500);
  if (allowed.data !== true) return json({ error: 'forbidden' }, 403);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;

  if (body?.action === 'retry_removals') {
    const { data, error } = await admin.from('site_photos').select('id,original_removal_pending').not('original_removal_pending', 'is', null).limit(200);
    if (error) return json({ error: error.message }, 500);
    let removed = 0;
    for (const row of data as { id: string; original_removal_pending: string }[]) if (await removeOriginal(row.id, row.original_removal_pending)) removed++;
    return json({ pending: data.length, removed });
  }

  if (body?.action !== 'archive') return json({ error: 'unknown action' }, 400);
  const { id, original_path, original_hash, reduced_path, reduced_hash, archive_name } = body;
  if (![id, original_path, original_hash, reduced_path, reduced_hash].every(v => text(v)) || !text(archive_name, 1000)) return json({ error: 'missing fields' }, 400);

  const { data: row, error } = await admin.from('site_photos').select('id,site_id,metadata,original_path,original_hash,archived_at').eq('id', id as string).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!row) return json({ error: 'not found' }, 404);
  if (row.archived_at) return json({ error: 'already archived' }, 409);
  // The PC saved exactly this original: same file on the server, same hash, photo not deleted meanwhile.
  if (row.original_path !== original_path || row.original_hash !== original_hash) return json({ error: 'photo changed' }, 409);
  if (typeof row.metadata?.deletedAt === 'number') return json({ error: 'photo deleted' }, 409);
  if (reduced_path !== `${row.site_id}/${row.id}/reduced-2048-${reduced_hash}`) return json({ error: 'unexpected reduced path' }, 400);

  // The 2048px copy must already be on the server and be the file the PC made.
  const { data: reduced, error: readError } = await bucket().download(reduced_path as string);
  if (readError || !reduced) return json({ error: 'reduced copy missing' }, 400);
  const buffer = await reduced.arrayBuffer();
  if (buffer.byteLength === 0 || await hex(buffer) !== reduced_hash) return json({ error: 'reduced copy does not match' }, 400);

  // One conditional update: a second run or a concurrent change finds no row to switch.
  const { data: switched, error: updateError } = await admin.from('site_photos')
    .update({ original_path: reduced_path, reduced_hash, archived_at: new Date().toISOString(), archive_name, original_removal_pending: row.original_path })
    .eq('id', row.id).is('archived_at', null).eq('original_path', row.original_path).select('id');
  if (updateError) return json({ error: updateError.message }, 500);
  if (!switched?.length) return json({ error: 'photo changed' }, 409);

  const removed = await removeOriginal(row.id, row.original_path);
  return json({ archived: true, removed });
});
