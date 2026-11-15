// Every person, organization, source excerpt and accomplishment in this file is fictional.
import { weekStart } from '../backend/services/scoring.js';
export const universities = [{ id: 'uni-aster', name: 'Aster University', state: 'Texas', timezone: 'America/Chicago', semesterStart: '2026-08-24' }];
export const clubs = [
  { id: 'club-rocketry', universityId: 'uni-aster', name: 'Aster Rocketry', category: 'Avionics & flight systems', project: 'Project Argos · flight computer', officerIds: ['member-iris', 'member-leo'] },
  { id: 'club-electric', universityId: 'uni-aster', name: 'Aster Electric Racing', category: 'Battery systems & mobility', project: 'Helios EV · battery pack', officerIds: ['member-nora'] },
  { id: 'club-robotics', universityId: 'uni-aster', name: 'Aster Robotics', category: 'Autonomy & sensing', project: 'Talos · autonomous rover', officerIds: ['member-eli'] }
];
export const members = [
  { id: 'member-iris', name: 'Iris Vale', major: 'Electrical Engineering', year: 4, clubIds: ['club-rocketry'], visibleToCompanies: true, openToNewClubs: false, skills: ['Avionics', 'PCB design'] },
  { id: 'member-leo', name: 'Leo Marin', major: 'Computer Engineering', year: 3, clubIds: ['club-rocketry'], visibleToCompanies: true, openToNewClubs: true, skills: ['C firmware', 'CAN', 'Hardware validation'] },
  { id: 'member-sana', name: 'Sana Reed', major: 'Computer Science', year: 2, clubIds: ['club-rocketry'], visibleToCompanies: false, openToNewClubs: false, skills: ['Sensor integration', 'Python'] },
  { id: 'member-nora', name: 'Nora Ash', major: 'Electrical Engineering', year: 3, clubIds: ['club-electric'], visibleToCompanies: true, openToNewClubs: true, skills: ['Battery-management firmware', 'CAN'] },
  { id: 'member-eli', name: 'Eli Rowan', major: 'Mechanical Engineering', year: 3, clubIds: ['club-robotics'], visibleToCompanies: true, openToNewClubs: true, skills: ['Robotics software', 'Sensor integration'] }
].map(m => ({ universityId: 'uni-aster', ...m }));
const dates = ['2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14'];
export const sessions = dates.map((date, i) => ({ id: `session-${i + 1}`, clubId: 'club-rocketry', date, week: weekStart(date), title: ['Sensor bench tests', 'Avionics integration', 'Flight computer validation', 'Launch readiness review'][i], takenBy: 'member-iris' }));
export const attendance = sessions.flatMap(s => ['member-iris', 'member-leo', 'member-sana'].map(memberId => ({ id: `attendance-${s.id}-${memberId}`, sessionId: s.id, clubId: s.clubId, memberId, date: s.date, week: s.week, points: 10, recordedBy: 'member-iris' })));
const work = [
  ['member-leo', 'Reproduced and fixed the CAN frame timeout in avionics firmware.', ['C firmware', 'CAN'], 'high', 90],
  ['member-sana', 'Integrated the pressure sensor and documented calibration offsets.', ['Sensor integration', 'Python'], 'medium', 60],
  ['member-iris', 'Designed the flight computer PCB power stage and completed its review.', ['PCB design', 'Avionics'], 'high', 90],
  ['member-leo', 'Validated the firmware fix across 200 simulated flight cycles.', ['Hardware validation', 'C firmware'], 'medium', 60]
];
export const contributions = work.map(([memberId, description, skills, level, points], i) => ({
  id: `contribution-${i + 1}`, clubId: 'club-rocketry', universityId: 'uni-aster', memberId,
  sessionId: sessions[i].id, date: dates[i], week: weekStart(dates[i]), description, skills, level, points,
  status: 'approved', approvedBy: memberId === 'member-iris' ? 'member-leo' : 'member-iris',
  source: { id: `notes-${i + 1}`, title: sessions[i].title, excerpt: `${members.find(m => m.id === memberId).name}: ${description}`, fictional: true },
  createdAt: `${dates[i]}T20:00:00.000Z`
}));
export const drafts = [{ id: 'draft-1', clubId: 'club-rocketry', sessionId: 'session-4', memberId: 'member-sana', description: 'Documented sensor calibration steps for the next avionics team.', skills: ['Documentation', 'Sensor integration'], suggestedLevel: 'low', source: { id: 'notes-4-draft', excerpt: 'Sana Reed documented sensor calibration steps for the next avionics team.', fictional: true }, status: 'pending', origin: 'mock' }];
export const applications = [{ id: 'application-1', clubId: 'club-rocketry', memberId: 'member-leo', role: 'Avionics Lead', consent: true, profile: 'I can volunteer five hours per week.', status: 'pending' }];
export const companies = [{ id: 'company-aegean', name: 'Aegean Flight Systems', approved: true, fictional: true }];
export const connections = [];
export const auditLogs = contributions.map(c => ({ id: `audit-${c.id}`, entryId: c.id, action: 'approve', before: null, after: c, reviewerId: c.approvedBy, createdAt: c.createdAt }));
export const fixtures = { universities, clubs, members, sessions, attendance, contributions, drafts, applications, companies, connections, auditLogs };
