-- Every day at 18:00 UTC (03:00 KST) call purge-deleted-photos, which removes photos deleted more than two days ago.
select cron.schedule(
 'purge-deleted-photos',
 '0 18 * * *',
 $$
 select net.http_post(
  url := 'https://uibxoupqmjhotswsgcdn.supabase.co/functions/v1/purge-deleted-photos',
  headers := jsonb_build_object('Content-Type','application/json','x-purge-secret',(select decrypted_secret from vault.decrypted_secrets where name='photo_purge_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
 );
 $$
);
