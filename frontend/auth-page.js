import { loadClerk } from './clerk.js';
const error = document.querySelector('#auth-error');
try {
  const clerk = await loadClerk();
  document.querySelector('#auth-loading').remove();
  if (!clerk) throw new Error('Clerk is not configured. Local demo mode is available at /app.');
  if (clerk.isSignedIn) location.replace('/app');
  else if (location.pathname === '/sign-up') clerk.mountSignUp(document.querySelector('#clerk-auth'), { signInUrl: '/sign-in', fallbackRedirectUrl: '/app' });
  else clerk.mountSignIn(document.querySelector('#clerk-auth'), { signUpUrl: '/sign-up', fallbackRedirectUrl: '/app' });
} catch (cause) { error.textContent = cause.message; document.querySelector('#auth-loading')?.remove(); }
