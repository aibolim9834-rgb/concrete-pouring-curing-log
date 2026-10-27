import { supabase } from './supabase';
import { PouringLog, Site } from './types';
import { validateLogs, validateSites } from './log-data';

// Read every page; a failed page must never become a successful partial list.
async function readRows(table: 'sites' | 'pouring_logs', column: string, ascending: boolean) {
  const rows: Record<string, unknown>[] = [], ids = new Set<string>();
  for (let offset = 0; ; ) {
    const { data, error } = await supabase.from(table).select('*')
      .order(column, { ascending }).order('id', { ascending: true }).range(offset, offset + 499);
    if (error || !data) throw new Error('DB 자료를 불러오지 못했습니다. 연결과 권한을 확인해주세요.');
    if (!data.length) return rows;
    for (const row of data) {
      if (typeof row.id !== 'string' || ids.has(row.id)) throw new Error('조회 중 서버 자료가 변경되었습니다. 새로고침 후 다시 확인해주세요.');
      ids.add(row.id); rows.push(row);
    }
    offset += data.length;
  }
}

export async function loadCloudLogData(): Promise<{ sites: Site[]; logs: PouringLog[] }> {
  const [sites, records] = await Promise.all([readRows('sites', 'name', true), readRows('pouring_logs', 'date', false)]);
  const logs = records.map(log => ({ ...log, remicon_company: log.remicon_company ?? '', curing_watering: log.curing_watering ?? '', curing_protection: log.curing_protection ?? '' }));
  validateSites(sites); validateLogs(logs);
  return { sites, logs };
}
