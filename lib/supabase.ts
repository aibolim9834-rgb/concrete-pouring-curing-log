import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uibxoupqmjhotswsgcdn.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpYnhvdXBxbWpob3Rzd3NnY2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NjQwMzIsImV4cCI6MjEwMTQ0MDAzMn0.8H_dn-EJ8cdTi558UWP6tPyZisJYEqk3heXj-xlidgc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConnected = () => true;

export const checkSupabaseHealth = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('sites').select('id').limit(1);
    return !error;
  } catch (e) {
    return false;
  }
};
