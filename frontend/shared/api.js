import { getAccessToken } from '../supabase.js';

// Demo identity is retained only for the explicitly fictional local mode.
const IDENTITY_KEY = 'ithaca.demoMember';
export const DEFAULT_MEMBER = 'member-iris';
export function currentMemberId() { try { return globalThis.localStorage?.getItem(IDENTITY_KEY) || DEFAULT_MEMBER; } catch { return DEFAULT_MEMBER; } }
export function setCurrentMemberId(memberId) { try { globalThis.localStorage?.setItem(IDENTITY_KEY, memberId); } catch { /* storage unavailable */ } }

export async function api(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const headers = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : { 'X-Demo-Member': currentMemberId() }) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error?.message || `Request failed (${response.status})`), { status: response.status, code: result.error?.code });
  return result;
}

export async function apiJson(path, body) { return api(path, { method: 'POST', body }); }

export async function apiUpload(path, files) {
  const form = new FormData(); for (const file of files) form.append('files', file);
  const token = await getAccessToken();
  const response = await fetch(`/api${path}`, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: form });
  const result = await response.json();
  if (!response.ok && response.status !== 207) throw Object.assign(new Error(result.error?.message || `Upload failed (${response.status})`), { status: response.status, code: result.error?.code });
  return result;
}
