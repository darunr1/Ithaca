export const LEVEL_POINTS = Object.freeze({ low: 30, medium: 60, high: 90 });
export function contributionPoints(level, customPoints) {
  if (Object.hasOwn(LEVEL_POINTS, level)) return LEVEL_POINTS[level];
  if (level !== 'custom' || !Number.isInteger(customPoints) || customPoints < 10 || customPoints > 100 || customPoints % 10 !== 0) {
    throw new Error('Custom points must be 10–100 in increments of 10.');
  }
  return customPoints;
}
export function validateReviewer({ memberId, reviewerId, officerIds }) {
  if (memberId === reviewerId || !officerIds.includes(reviewerId)) throw new Error('A different club officer must approve this contribution.');
}
// Dates are club-local ISO calendar dates, not UTC instants. Weeks start Monday.
export function weekStart(date) {
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.valueOf()) || day.toISOString().slice(0, 10) !== date) throw new Error('Invalid calendar date.');
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}
// Academic terms by calendar month: Spring Feb–May, Summer Jun–Jul, Fall Aug–Nov,
// Winter Dec–Jan (Winter 2026 = Dec 2026 + Jan 2027). `start` inclusive, `end` exclusive.
// `key` sorts chronologically (e.g. "2026-3" is Fall 2026); `id` is the URL form ("2026-fall").
const TERMS = ['spring', 'summer', 'fall', 'winter'];
const TERM_MONTHS = { spring: ['02', '06'], summer: ['06', '08'], fall: ['08', '12'], winter: ['12', '02'] };
export const FIRST_TERM = '2026-spring';
export function termInfo(year, term) {
  const order = TERMS.indexOf(term);
  if (order < 0 || !Number.isInteger(year)) throw new Error('Invalid term.');
  const [from, to] = TERM_MONTHS[term];
  return { id: `${year}-${term}`, key: `${year}-${order + 1}`, label: `${term[0].toUpperCase()}${term.slice(1)} ${year}`, start: `${year}-${from}-01`, end: `${term === 'winter' ? year + 1 : year}-${to}-01` };
}
export function parseTerm(id) {
  const match = /^(\d{4})-(spring|summer|fall|winter)$/.exec(String(id));
  return match ? termInfo(Number(match[1]), match[2]) : null;
}
export function semesterOf(date) {
  weekStart(date);
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  if (month === 1) return termInfo(year - 1, 'winter');
  return termInfo(year, month === 12 ? 'winter' : month <= 5 ? 'spring' : month <= 7 ? 'summer' : 'fall');
}
const nextTerm = ({ id }) => { const [y, t] = id.split('-'), i = TERMS.indexOf(t); return i === 3 ? termInfo(Number(y) + 1, 'spring') : termInfo(Number(y), TERMS[i + 1]); };
// Terms from FIRST_TERM through the term containing `today`, plus the next upcoming one.
export function termsThrough(today) {
  const current = semesterOf(today), last = nextTerm(current), terms = [];
  for (let term = parseTerm(FIRST_TERM); term.key.localeCompare(last.key, undefined, { numeric: true }) <= 0; term = nextTerm(term)) terms.push(term);
  return terms;
}
