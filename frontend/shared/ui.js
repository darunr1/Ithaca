export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const e = escapeHtml;
export const heading = (eyebrow, title, subtitle) => `<div class="page-heading"><div><p class="eyebrow">${e(eyebrow)}</p><h1>${e(title)}</h1><p>${e(subtitle)}</p></div><span class="pill outline">Foundation preview</span></div>`;
export const notice = text => `<div class="notice"><span aria-hidden="true">ⓘ</span><span>${e(text)}</span></div>`;
export const initials = name => String(name ?? '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
export const memberLink = (id, name) => `<a class="member-link" href="#member/${encodeURIComponent(id)}">${e(name)}</a>`;
export const sourceCard =contribution => `<article class="evidence-card"><div class="card-top"><span class="pill verified">Officer approved</span><span class="muted">${e(contribution.date)}</span></div><h3>${e(contribution.description)}</h3><div class="tags">${contribution.skills.map(s => `<span>${e(s)}</span>`).join('')}</div><blockquote>${e(contribution.source.excerpt)}</blockquote><small>Source: ${e(contribution.source.title || contribution.source.id)} · Reviewer: ${e(contribution.approvedBy)} · Fictional evidence</small></article>`;
