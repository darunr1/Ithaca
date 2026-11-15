let loading;
function script(src, attributes = {}) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script'); element.src = src; element.async = true; element.crossOrigin = 'anonymous';
    for (const [key, value] of Object.entries(attributes)) element.dataset[key] = value;
    element.onload = resolve; element.onerror = () => reject(new Error('The secure authentication service could not load.'));
    document.head.appendChild(element);
  });
}
export async function loadClerk() {
  if (loading) return loading;
  loading = (async () => {
    const response = await fetch('/api/auth/config', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Authentication configuration is unavailable.');
    const { data } = await response.json();
    if (data.mode !== 'clerk') return null;
    const encoded = data.publishableKey.split('_')[2];
    if (!encoded) throw new Error('The Clerk publishable key is invalid.');
    const domain = atob(encoded.replace(/-/g, '+').replace(/_/g, '/')).slice(0, -1);
    await script(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`);
    await script(`https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, { clerkPublishableKey: data.publishableKey });
    await window.Clerk.load({ signInUrl: '/sign-in', signUpUrl: '/sign-up', afterSignOutUrl: '/', ui: { ClerkUI: window.__internal_ClerkUICtor } });
    return window.Clerk;
  })();
  return loading;
}
