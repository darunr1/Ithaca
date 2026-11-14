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
// Academic terms by calendar month: Spring Jan–May, Summer Jun–Jul, Fall Aug–Dec.
// `key` sorts chronologically (e.g. "2026-3" is Fall 2026).
export function semesterOf(date) {
  weekStart(date);
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  const [term, order] = month <= 5 ? ['Spring', 1] : month <= 7 ? ['Summer', 2] : ['Fall', 3];
  return { key: `${year}-${order}`, label: `${term} ${year}` };
}
