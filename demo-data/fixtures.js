// Every person, organization, source excerpt and accomplishment in this file is fictional.
import { weekStart } from '../backend/services/scoring.js';
export const universities = [
  { id: 'uni-aster', name: 'Aster University', timezone: 'America/Chicago', semesterStart: '2026-08-24' },
  { id: 'uni-meridian', name: 'Meridian Institute of Technology', timezone: 'America/Denver', semesterStart: '2026-08-17' }
];
export const clubs = [
  // `organization` is the national organization the club is a chapter of (acronym from backend/data/engineering-organizations.csv).
  { id: 'club-rocketry', universityId: 'uni-aster', name: 'Aster Rocketry', organization: 'AIAA', category: 'Avionics & flight systems', project: 'Project Argos · flight computer', officerIds: ['member-iris', 'member-leo'] },
  { id: 'club-electric', universityId: 'uni-aster', name: 'Aster Electric Racing', organization: 'SAE', category: 'Battery systems & mobility', project: 'Helios EV · battery pack', officerIds: ['member-nora', 'member-kai'] },
  { id: 'club-robotics', universityId: 'uni-aster', name: 'Aster Robotics', organization: 'IEEE', category: 'Autonomy & sensing', project: 'Talos · autonomous rover', officerIds: ['member-eli'] },
  { id: 'club-meridian-space', universityId: 'uni-meridian', name: 'Meridian Space Systems', organization: 'AIAA', category: 'Propulsion & ground systems', project: 'Kestrel · hybrid sounding rocket', officerIds: ['member-tomas', 'member-ada'] }
];
export const members = [
  { id: 'member-iris', name: 'Iris Vale', major: 'Electrical Engineering', year: 4, clubIds: ['club-rocketry'], visibleToCompanies: true, openToNewClubs: false, skills: ['Avionics', 'PCB design'] },
  { id: 'member-leo', name: 'Leo Marin', major: 'Computer Engineering', year: 3, clubIds: ['club-rocketry'], visibleToCompanies: true, openToNewClubs: true, skills: ['C firmware', 'CAN', 'Hardware validation'] },
  { id: 'member-sana', name: 'Sana Reed', major: 'Computer Science', year: 2, clubIds: ['club-rocketry'], visibleToCompanies: false, openToNewClubs: false, skills: ['Sensor integration', 'Python'] },
  { id: 'member-nora', name: 'Nora Ash', major: 'Electrical Engineering', year: 3, clubIds: ['club-electric'], visibleToCompanies: true, openToNewClubs: true, skills: ['Battery-management firmware', 'CAN'] },
  { id: 'member-kai', name: 'Kai Brook', major: 'Mechanical Engineering', year: 4, clubIds: ['club-electric'], visibleToCompanies: false, openToNewClubs: false, skills: ['Mechanical design'] },
  { id: 'member-eli', name: 'Eli Rowan', major: 'Mechanical Engineering', year: 3, clubIds: ['club-robotics'], visibleToCompanies: true, openToNewClubs: true, skills: ['Robotics software', 'Sensor integration'] },
  { id: 'member-tomas', name: 'Tomas Kerr', major: 'Aerospace Engineering', year: 4, universityId: 'uni-meridian', clubIds: ['club-meridian-space'], visibleToCompanies: true, openToNewClubs: false, skills: ['Thermal analysis'] },
  { id: 'member-ada', name: 'Ada Quill', major: 'Mechanical Engineering', year: 3, universityId: 'uni-meridian', clubIds: ['club-meridian-space'], visibleToCompanies: true, openToNewClubs: true, skills: ['Propulsion testing', 'Documentation'] },
  { id: 'member-juno', name: 'Juno Park', major: 'Computer Science', year: 2, universityId: 'uni-meridian', clubIds: ['club-meridian-space'], visibleToCompanies: false, openToNewClubs: true, skills: ['Ground station software'] }
].map(m => ({ universityId: 'uni-aster', ...m }));
const dates = ['2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14'];
export const sessions = dates.map((date, i) => ({ id: `session-${i + 1}`, clubId: 'club-rocketry', date, week: weekStart(date), title: ['Sensor bench tests', 'Avionics integration', 'Flight computer validation', 'Launch readiness review'][i], takenBy: 'member-iris' }));
export const attendance = sessions.flatMap(s => ['member-iris', 'member-leo', 'member-sana'].map(memberId => ({ id: `attendance-${s.id}-${memberId}`, sessionId: s.id, clubId: s.clubId, memberId, date: s.date, week: s.week, points: 10, recordedBy: 'member-iris' })));
const LEVELS = { low: 30, medium: 60, high: 90 };
// [memberId, clubId, date, description, skills, level, approvedBy, sessionId?, sourceTitle?]
const work = [
  ['member-leo', 'club-rocketry', dates[0], 'Reproduced and fixed the CAN frame timeout in avionics firmware.', ['C firmware', 'CAN'], 'high', 'member-iris', 'session-1'],
  ['member-sana', 'club-rocketry', dates[1], 'Integrated the pressure sensor and documented calibration offsets.', ['Sensor integration', 'Python'], 'medium', 'member-iris', 'session-2'],
  ['member-iris', 'club-rocketry', dates[2], 'Designed the flight computer PCB power stage and completed its review.', ['PCB design', 'Avionics'], 'high', 'member-leo', 'session-3'],
  ['member-leo', 'club-rocketry', dates[3], 'Validated the firmware fix across 200 simulated flight cycles.', ['Hardware validation', 'C firmware'], 'medium', 'member-iris', 'session-4'],
  // Earlier semesters, so officers have a semester-by-semester history to compare.
  ['member-iris', 'club-rocketry', '2025-10-15', 'Drafted the first flight computer block diagram.', ['Avionics', 'PCB design'], 'medium', 'member-leo', null, 'Fall design review notes'],
  ['member-iris', 'club-rocketry', '2026-03-12', 'Led the avionics bay layout review for the spring test launch.', ['Avionics'], 'medium', 'member-leo', null, 'Spring launch prep notes'],
  ['member-leo', 'club-rocketry', '2026-04-02', 'Wrote the CAN bus logging tool for the spring static fire.', ['C firmware', 'CAN'], 'high', 'member-iris', null, 'Static fire debrief'],
  ['member-sana', 'club-rocketry', '2026-04-20', 'Assembled the sensor harness for the spring static fire.', ['Sensor integration'], 'low', 'member-iris', null, 'Static fire debrief'],
  // Other clubs and a second university, for university-wide leaderboards.
  ['member-nora', 'club-electric', '2026-09-18', 'Tuned cell-balancing thresholds in battery-management firmware.', ['Battery-management firmware'], 'high', 'member-kai', null, 'Pack bring-up notes'],
  ['member-kai', 'club-electric', '2026-10-09', 'Designed the battery enclosure mounting brackets.', ['Mechanical design'], 'medium', 'member-nora', null, 'Enclosure review notes'],
  ['member-ada', 'club-meridian-space', '2026-09-10', 'Ran the hot-fire test sequence for the hybrid motor.', ['Propulsion testing'], 'high', 'member-tomas', null, 'Hot-fire log'],
  ['member-juno', 'club-meridian-space', '2026-09-24', 'Built the ground station telemetry dashboard.', ['Ground station software'], 'medium', 'member-tomas', null, 'Ground systems sync'],
  ['member-tomas', 'club-meridian-space', '2026-10-08', 'Completed thermal analysis of the payload bay.', ['Thermal analysis'], 'medium', 'member-ada', null, 'Payload review notes'],
  ['member-ada', 'club-meridian-space', '2026-10-22', 'Documented the motor test stand safety checklist.', ['Documentation'], 'low', 'member-tomas', null, 'Test stand walkthrough'],
  ['member-juno', 'club-meridian-space', '2026-11-05', 'Added packet-loss alerts to the ground station.', ['Ground station software'], 'low', 'member-ada', null, 'Ground systems sync']
];
export const contributions = work.map(([memberId, clubId, date, description, skills, level, approvedBy, sessionId, sourceTitle], i) => ({
  id: `contribution-${i + 1}`, clubId, universityId: clubs.find(c => c.id === clubId).universityId, memberId,
  ...(sessionId ? { sessionId } : {}), date, week: weekStart(date), description, skills, level, points: LEVELS[level],
  status: 'approved', approvedBy,
  source: { id: `notes-${i + 1}`, title: sessionId ? sessions.find(s => s.id === sessionId).title : sourceTitle, excerpt: `${members.find(m => m.id === memberId).name}: ${description}`, fictional: true },
  createdAt: `${date}T20:00:00.000Z`
}));
export const drafts = [{ id: 'draft-1', clubId: 'club-rocketry', sessionId: 'session-4', memberId: 'member-sana', description: 'Documented sensor calibration steps for the next avionics team.', skills: ['Documentation', 'Sensor integration'], suggestedLevel: 'low', source: { id: 'notes-4-draft', excerpt: 'Sana Reed documented sensor calibration steps for the next avionics team.', fictional: true }, status: 'pending', origin: 'mock' }];
export const applications = [{ id: 'application-1', clubId: 'club-rocketry', memberId: 'member-leo', role: 'Avionics Lead', consent: true, profile: 'I can volunteer five hours per week.', status: 'pending' }];
export const companies = [{ id: 'company-aegean', name: 'Aegean Flight Systems', approved: true, fictional: true }];
export const connections = [];
export const auditLogs = contributions.map(c => ({ id: `audit-${c.id}`, entryId: c.id, action: 'approve', before: null, after: c, reviewerId: c.approvedBy, createdAt: c.createdAt }));
export const fixtures = { universities, clubs, members, sessions, attendance, contributions, drafts, applications, companies, connections, auditLogs };
