-- Run purge-deleted-photos at the top of every hour instead of once a day at 03:00 KST,
-- so a deleted photo is removed within an hour of its two days passing (2026-11-02 user decision).
select cron.alter_job((select jobid from cron.job where jobname = 'purge-deleted-photos'), schedule := '0 * * * *');
