let clientPromise;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (globalThis.supabase?.createClient) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('The secure authentication client could not be loaded.'));
    document.head.append(script);
  });
}

export function loadSupabase() {
  clientPromise ||= (async () => {
    const response = await fetch('/api/auth/config', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Authentication configuration is unavailable.');
    const { data } = await response.json();
    if (data.mode !== 'supabase') return null;
    if (!data.supabaseUrl || !data.publishableKey) throw new Error('Supabase authentication is not configured.');
    await loadScript('/vendor/supabase.js');
    return globalThis.supabase.createClient(data.supabaseUrl, data.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  })();
  return clientPromise;
}

export async function getAccessToken() {
  const client = await loadSupabase();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session?.access_token || null;
}
