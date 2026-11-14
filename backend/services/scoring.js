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
