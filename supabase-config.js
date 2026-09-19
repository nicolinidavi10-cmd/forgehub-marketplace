/*
  BRENNTAG + SUPABASE
  Cole aqui apenas a URL do projeto e a Publishable Key.
  NUNCA coloque a Secret Key ou Service Role Key neste arquivo.
*/

const SUPABASE_URL = 'https://cyqudohwjllouvwisshk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rGTTzsaJ1n80K1PWBL3NUg_6uIrSWoE';

const isSupabaseConfigured =
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('COLE_AQUI') &&
  SUPABASE_PUBLISHABLE_KEY &&
  !SUPABASE_PUBLISHABLE_KEY.includes('COLE_AQUI');

window.brenntagSupabaseConfigured = isSupabaseConfigured;
window.brenntagSupabase = isSupabaseConfigured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  : null;
