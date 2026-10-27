import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uibxoupqmjhotswsgcdn.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpYnhvdXBxbWpob3Rzd3NnY2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NjQwMzIsImV4cCI6MjEwMTQ0MDAzMn0.8H_dn-EJ8cdTi558UWP6tPyZisJYEqk3heXj-xlidgc';

// Set in the launch process only; keep existing browser data and DB settings intact.
const localOnly = process.env.NEXT_PUBLIC_CON1_LOCAL_ONLY === 'true' || process.env.NEXT_PUBLIC_CON1_QA === 'true';
export const supabase = createClient(supabaseUrl, supabaseAnonKey, localOnly ? {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async () => { throw new Error('로컬 전용 실행에서는 Supabase 요청을 보내지 않습니다.'); } },
} : undefined);

export const checkSupabaseHealth = async (): Promise<boolean> => {
  if (localOnly) return false;
  try {
    const { error } = await supabase.from('sites').select('id').limit(1);
    if (error) throw error;
    return true;
  } catch (e) {
    throw new Error('서버 연결을 확인하지 못했습니다. 로컬 자료로 전환하지 않고 입력을 중지했습니다. 연결 상태를 확인한 뒤 새로고침해주세요.');
  }
};
