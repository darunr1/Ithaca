// Demo identity: a labeled "viewing as" choice sent as X-Demo-Member. Not authentication.
const IDENTITY_KEY = 'ithaca.demoMember';
export const DEFAULT_MEMBER = 'member-iris';
export function currentMemberId() {
  try { return globalThis.localStorage?.getItem(IDENTITY_KEY) || DEFAULT_MEMBER; } catch { return DEFAULT_MEMBER; }
}
export function setCurrentMemberId(memberId) {
  try { globalThis.localStorage?.setItem(IDENTITY_KEY, memberId); } catch { /* storage unavailable: identity resets on reload */ }
}
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json', 'X-Demo-Member': currentMemberId() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error?.message || `Request failed (${response.status})`), { status: response.status, code: result.error?.code });
  return result;
}
