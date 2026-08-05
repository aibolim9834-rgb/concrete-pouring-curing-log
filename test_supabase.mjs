import { createClient } from '@supabase/supabase-js';

const url = 'https://uibxoupqmjhotswsgcdn.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpYnhvdXBxbWpob3Rzd3NnY2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NjQwMzIsImV4cCI6MjEwMTQ0MDAzMn0.8H_dn-EJ8cdTi558UWP6tPyZisJYEqk3heXj-xlidgc';

const supabase = createClient(url, key);

async function test() {
  console.log('Checking Supabase connection...');
  
  const { data: sites, error: sitesError } = await supabase.from('sites').select('*');
  if (sitesError) {
    console.error('SITES_ERROR:', sitesError.message, sitesError.details);
  } else {
    console.log('SITES_SUCCESS: Found', sites.length, 'sites in DB.');
  }

  const { data: logs, error: logsError } = await supabase.from('pouring_logs').select('*');
  if (logsError) {
    console.error('LOGS_ERROR:', logsError.message, logsError.details);
  } else {
    console.log('LOGS_SUCCESS: Found', logs.length, 'pouring logs in DB.');
  }
}

test();
