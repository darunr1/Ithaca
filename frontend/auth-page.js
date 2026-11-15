import { loadSupabase } from './supabase.js';

const form = document.querySelector('#auth-form');
const status = document.querySelector('#auth-status');
const route = location.pathname;
const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };

try {
  const client = await loadSupabase();
  if (!client) throw new Error('Secure authentication is not configured. The fictional local demo remains available at /dashboard.');
  const { data: { session } } = await client.auth.getSession();
  if (session && ['/login', '/signup'].includes(route)) location.replace('/dashboard');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const values = Object.fromEntries(new FormData(form));
    button.disabled = true;
    setStatus('Working…');
    try {
      if (route === '/login') {
        const { error } = await client.auth.signInWithPassword({ email: values.email, password: values.password });
        if (error) throw error;
        location.replace('/dashboard');
      } else if (route === '/signup') {
        const { data, error } = await client.auth.signUp({ email: values.email, password: values.password, options: { data: { full_name: values.name }, emailRedirectTo: `${location.origin}/dashboard` } });
        if (error) throw error;
        if (data.session) location.replace('/dashboard');
        else { form.reset(); setStatus('Check your email and open the verification link to continue.'); }
      } else if (route === '/forgot-password') {
        const { error } = await client.auth.resetPasswordForEmail(values.email, { redirectTo: `${location.origin}/reset-password` });
        if (error) throw error;
        form.reset();
        setStatus('If an account exists for that address, a reset link has been sent.');
      } else if (route === '/reset-password') {
        const { data: recovery } = await client.auth.getSession();
        if (!recovery.session) throw new Error('Open the password-reset link from your email before choosing a new password.');
        const { error } = await client.auth.updateUser({ password: values.password });
        if (error) throw error;
        setStatus('Password updated. Redirecting…');
        setTimeout(() => location.replace('/dashboard'), 700);
      }
    } catch (cause) {
      setStatus(cause.message || 'Authentication failed. Try again.', true);
      button.disabled = false;
    }
  });
} catch (cause) {
  setStatus(cause.message, true);
  form.querySelector('button').disabled = true;
}
