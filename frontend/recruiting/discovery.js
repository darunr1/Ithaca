import { api } from '../shared/api.js';

export async function getDiscoveryOptions() {
  const { data } = await api('/recruiter/discovery-options');
  return data;
}

// Integration boundary for a future profile service. Keep public response fields stable.
export async function searchProfiles(filters = {}) {
  const query = new URLSearchParams();
  for (const field of ['name', 'skill', 'major', 'university', 'year', 'club', 'state']) {
    const value = String(filters[field] ?? '').trim();
    if (value) query.set(field, value);
  }
  const { data } = await api(`/recruiter/profiles${query.size ? `?${query}` : ''}`);
  return data;
}
