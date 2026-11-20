// Explicitly fictional, browser-only presentation data for HackUTA judging.
// Never write these records to Atlas, award real credit, or expose them to recruiters.
export const SAMPLE_NOTICE = 'SAMPLE PREVIEW — Fictional contributions and rankings for demonstration only. No real people, universities, or clubs are being evaluated.';

export const sampleUniversities = [
  { id: 'sample-utd', name: 'UT Dallas (sample)', state: 'Texas' },
  { id: 'sample-uta', name: 'UT Arlington (sample)', state: 'Texas' }
];

export const sampleClubs = [
  { id: 'sample-ithaca', name: 'Ithaca Project Team (sample)', universityId: 'sample-utd', project: 'Engineering knowledge and recognition platform' },
  { id: 'sample-robotics', name: 'Comet Robotics (sample)', universityId: 'sample-utd', project: 'Autonomous systems and robotics' },
  { id: 'sample-ai', name: 'Maverick AI Society (sample)', universityId: 'sample-uta', project: 'Machine learning and accessibility' },
  { id: 'sample-makers', name: 'Maverick Makers (sample)', universityId: 'sample-uta', project: 'Rapid prototyping and student tools' }
];

// Expanded, strictly browser-only examples to make a new account's demo informative.
sampleClubs.push(
  {"id":"sample-cyber","name":"Comet Cybersecurity (sample)","universityId":"sample-utd","project":"Secure systems and incident response"},
  {"id":"sample-solar","name":"Maverick Solar Racing (sample)","universityId":"sample-uta","project":"Solar vehicle power and telemetry"}
);

const people = [
  ['darun', 'Darun (sample)', 'Computer Engineering', 'sample-ithaca', ['RAG', 'MongoDB Atlas']],
  ['sriram', 'Sriram (sample)', 'Computer Engineering', 'sample-ithaca', ['Data modeling', 'Node.js']],
  ['teja', 'Teja (sample)', 'Computer Science', 'sample-ithaca', ['UI development', 'Accessibility']],
  ['vaibhav', 'Vaibhav (sample)', 'Computer Science', 'sample-ithaca', ['Testing', 'Analytics']],
  ['maya', 'Maya Chen (sample)', 'Electrical Engineering', 'sample-robotics', ['ROS', 'CAN']],
  ['noah', 'Noah Patel (sample)', 'Computer Engineering', 'sample-robotics', ['Firmware', 'Python']],
  ['elena', 'Elena Brooks (sample)', 'Mechanical Engineering', 'sample-robotics', ['CAD', 'Controls']],
  ['ari', 'Ari Lopez (sample)', 'Computer Science', 'sample-ai', ['Machine learning', 'Python']],
  ['noor', 'Noor Shah (sample)', 'Software Engineering', 'sample-ai', ['React', 'TypeScript']],
  ['sophie', 'Sophie Nguyen (sample)', 'Computer Science', 'sample-ai', ['Testing', 'NLP']],
  ['jordan', 'Jordan Ellis (sample)', 'Computer Engineering', 'sample-makers', ['Embedded systems', 'C++']],
  ['samir', 'Samir Rao (sample)', 'Mechanical Engineering', 'sample-makers', ['Prototyping', 'CAD']]
];
people.push(
  ["harper","Harper Stone (sample)","Computer Science","sample-ithaca",["Backend APIs","RAG"]],
  ["priya","Priya Shah (sample)","Software Engineering","sample-ithaca",["Search","TypeScript"]],
  ["mateo","Mateo Cruz (sample)","Computer Engineering","sample-ithaca",["Testing","Data modeling"]],
  ["lina","Lina Ahmed (sample)","Computer Engineering","sample-robotics",["Embedded C","CAN"]],
  ["ethan","Ethan Park (sample)","Electrical Engineering","sample-robotics",["Motor control","PCB design"]],
  ["fatima","Fatima Noor (sample)","Computer Science","sample-robotics",["ROS","Computer vision"]],
  ["henry","Henry Ward (sample)","Computer Science","sample-ai",["Model evaluation","Python"]],
  ["zoya","Zoya Khan (sample)","Software Engineering","sample-ai",["Data visualization","React"]],
  ["micah","Micah Green (sample)","Computer Engineering","sample-ai",["Edge inference","Testing"]],
  ["ruby","Ruby Kim (sample)","Mechanical Engineering","sample-makers",["CAD","Prototyping"]],
  ["david","David Okafor (sample)","Computer Science","sample-makers",["IoT","Node.js"]],
  ["keira","Keira Singh (sample)","Electrical Engineering","sample-makers",["PCB design","Testing"]],
  ["owen","Owen Pierce (sample)","Computer Science","sample-cyber",["Threat modeling","Python"]],
  ["amara","Amara Iyer (sample)","Computer Engineering","sample-cyber",["Secure firmware","Code review"]],
  ["jonah","Jonah Brooks (sample)","Software Engineering","sample-cyber",["API security","TypeScript"]],
  ["isla","Isla Vega (sample)","Computer Science","sample-cyber",["Incident response","Logging"]],
  ["talia","Talia Rivera (sample)","Electrical Engineering","sample-solar",["Power electronics","Battery systems"]],
  ["felix","Felix Chen (sample)","Mechanical Engineering","sample-solar",["Thermal design","CAD"]],
  ["neha","Neha Rao (sample)","Computer Engineering","sample-solar",["Telemetry","CAN"]],
  ["caleb","Caleb Moss (sample)","Computer Science","sample-solar",["Data pipelines","Python"]]
);

export const sampleMembers = people.map(([id, name, major, clubId, skills]) => ({
  id: 'sample-member-' + id, name, major, skills, clubIds: [clubId],
  universityId: sampleClubs.find(c => c.id === clubId).universityId,
  officer: ['darun', 'maya', 'ari', 'jordan', 'harper', 'amara', 'talia'].includes(id),
  sample: true
}));

// Work descriptions are invented solely for sample previews. They must never be
// interpreted as completed or independently verified work by the named students.
const work = [
  ['darun', '2026-11-14', 'Designed a cited RAG question-answer workflow using Gemini and Atlas Vector Search.', 'high'],
  ['darun', '2026-11-12', 'Outlined authenticated API boundaries for the document retrieval service.', 'medium'],
  ['darun', '2026-11-10', 'Documented an example evaluation checklist for retrieved source passages.', 'low'],
  ['sriram', '2026-11-14', 'Modeled club membership and contribution-review collections.', 'high'],
  ['sriram', '2026-11-11', 'Built an example roster statistics API and sample ranking aggregation.', 'medium'],
  ['teja', '2026-11-14', 'Designed an accessible member dashboard and officer nomination prototype.', 'high'],
  ['teja', '2026-11-12', 'Created responsive navigation and form feedback components.', 'medium'],
  ['vaibhav', '2026-11-14', 'Implemented a sample leaderboard view and cross-university filtering.', 'high'],
  ['vaibhav', '2026-11-10', 'Prepared test scenarios for profile, ranking and membership flows.', 'medium'],
  ['maya', '2026-11-14', 'Reviewed the example rover CAN interface and error states.', 'high'],
  ['maya', '2026-11-07', 'Mapped sensor calibration requirements for a prototype rover.', 'medium'],
  ['noah', '2026-11-14', 'Drafted firmware diagnostics for a sample motor controller.', 'medium'],
  ['noah', '2026-11-07', 'Wrote a sample Python test harness for telemetry packets.', 'medium'],
  ['elena', '2026-11-12', 'Prepared CAD clearance checks for an illustrative rover chassis.', 'medium'],
  ['elena', '2026-11-04', 'Documented drivetrain assembly assumptions.', 'low'],
  ['ari', '2026-11-14', 'Built an illustrative text-classification evaluation workflow.', 'high'],
  ['ari', '2026-11-07', 'Prepared baseline metrics and confusion-matrix examples.', 'medium'],
  ['noor', '2026-11-13', 'Designed a sample web application for model comparison.', 'medium'],
  ['sophie', '2026-11-12', 'Created synthetic prompts for an NLP edge-case test suite.', 'low'],
  ['jordan', '2026-11-12', 'Outlined a microcontroller telemetry board bring-up checklist.', 'high'],
  ['samir', '2026-11-11', 'Prepared a sample enclosure prototype and measurement notes.', 'medium']
];
// Example work is invented and does not represent real accomplishments.
work.push(
  ["harper","2026-11-17","Built a fictional API endpoint for searching archived project decisions.","high"],
  ["harper","2026-10-22","Documented retry and timeout behavior for the sample retrieval pipeline.","medium"],
  ["priya","2026-11-16","Implemented a sample keyword-highlighting interface for project documents.","medium"],
  ["priya","2026-10-24","Added keyboard navigation checks for the example search panel.","low"],
  ["mateo","2026-11-15","Created a fictional integration test suite for club invitation workflows.","high"],
  ["mateo","2026-10-27","Reviewed sample database constraints and member access rules.","medium"],
  ["lina","2026-11-13","Validated example CAN frames from the autonomous rover controller.","high"],
  ["lina","2026-11-05","Documented fault-recovery steps for the rover firmware test stand.","medium"],
  ["ethan","2026-11-12","Reviewed a sample motor-driver schematic and current limits.","medium"],
  ["ethan","2026-11-09","Prepared a fictional power-rail bring-up checklist.","low"],
  ["fatima","2026-11-17","Prototyped a sample rover obstacle-detection evaluation script.","medium"],
  ["fatima","2026-10-22","Captured representative failure cases for a fictional camera pipeline.","medium"],
  ["henry","2026-11-16","Established sample precision and recall metrics for the text classifier.","high"],
  ["henry","2026-10-24","Audited example mislabeled records in the evaluation set.","low"],
  ["zoya","2026-11-15","Built an example confusion-matrix visualization for model results.","medium"],
  ["zoya","2026-10-27","Added accessible tooltips to the fictional analytics dashboard.","low"],
  ["micah","2026-11-13","Benchmarked a hypothetical edge-inference pipeline on test inputs.","high"],
  ["micah","2026-11-05","Documented resource-usage assumptions for the sample deployment.","medium"],
  ["ruby","2026-11-12","Designed a fictional sensor mounting bracket for prototype testing.","medium"],
  ["ruby","2026-11-09","Created a tolerance-check worksheet for an illustrative enclosure.","low"],
  ["david","2026-11-17","Implemented an example device telemetry ingestion API.","high"],
  ["david","2026-10-22","Tested sample event deduplication and retry behavior.","medium"],
  ["keira","2026-11-16","Reviewed a mock sensor-breakout PCB layout for manufacturing checks.","medium"],
  ["keira","2026-10-24","Prepared continuity-test steps for a fictional prototype board.","low"],
  ["owen","2026-11-15","Performed a fictional threat-model review of the member portal.","high"],
  ["owen","2026-10-27","Drafted mitigations for the sample access-control attack paths.","medium"],
  ["amara","2026-11-13","Reviewed illustrative secure-boot checks in a firmware design.","high"],
  ["amara","2026-11-05","Created sample static-analysis rules for dependency updates.","medium"],
  ["jonah","2026-11-12","Added an example role-based API authorization test suite.","medium"],
  ["jonah","2026-11-09","Documented sample rate-limit thresholds for the portal.","medium"],
  ["isla","2026-11-17","Created a fictional incident triage checklist for authentication events.","medium"],
  ["isla","2026-10-22","Implemented a sample log-correlation query for failed sign-ins.","low"],
  ["talia","2026-11-16","Calculated example solar pack efficiency across simulated load profiles.","high"],
  ["talia","2026-10-24","Reviewed fictional battery disconnect and fuse-selection checks.","medium"],
  ["felix","2026-11-15","Modeled a sample battery enclosure cooling duct.","medium"],
  ["felix","2026-10-27","Prepared an illustrative vibration and fastener inspection plan.","low"],
  ["neha","2026-11-13","Developed a fictional CAN telemetry parser for solar vehicle diagnostics.","high"],
  ["neha","2026-11-05","Validated example packet-loss recovery during a bench replay.","medium"],
  ["caleb","2026-11-12","Implemented a sample time-series ingestion and anomaly report.","medium"],
  ["caleb","2026-11-09","Documented schema checks for the hypothetical solar dataset.","low"],
  ["darun","2026-10-18","Drafted an illustrative end-to-end retrieval latency benchmark.","medium"],
  ["sriram","2026-10-21","Documented fictional indexing and data-retention assumptions.","low"],
  ["teja","2026-10-24","Created an example responsive layout audit for smaller screens.","low"],
  ["vaibhav","2026-10-25","Built a mock smoke-test checklist for staged releases.","medium"],
  ["maya","2026-10-19","Outlined a rover sensor calibration sign-off form.","low"],
  ["noah","2026-10-22","Tested representative telemetry reconnection cases in a demo.","medium"],
  ["ari","2026-10-27","Prepared a fictional model drift-monitoring checklist.","low"],
  ["jordan","2026-10-28","Documented a prototype component inventory and revision log.","low"]
);

const scores = { high: 90, medium: 60, low: 30 };
function monday(date) {
  const d = new Date(date + 'T12:00:00Z');
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}
export const sampleContributions = work.map(([shortId, date, description, level], index) => {
  const member = sampleMembers.find(m => m.id === 'sample-member-' + shortId);
  const club = sampleClubs.find(c => c.id === member.clubIds[0]);
  const peers = sampleMembers.filter(m => m.clubIds.includes(club.id) && m.id !== member.id);
  return {
    id: 'sample-contribution-' + (index + 1), clubId: club.id, universityId: club.universityId,
    memberId: member.id, name: member.name, date, week: monday(date), description,
    skills: member.skills.slice(0, 2), level, points: scores[level], status: 'approved',
    approvedBy: peers[index % peers.length].id,
    source: { id: 'sample-evidence-' + (index + 1), title: 'Fictional example', excerpt: 'Illustrative sample contribution; not independently verified.' },
    sample: true
  };
});
const sessions = [
  ['sample-ithaca', '2026-11-14', 'Example sprint review'],
  ['sample-ithaca', '2026-11-07', 'Example integration session'],
  ['sample-ithaca', '2026-10-31', 'Example kickoff'],
  ['sample-robotics', '2026-11-14', 'Example robotics lab'],
  ['sample-robotics', '2026-11-07', 'Example sensor review'],
  ['sample-ai', '2026-11-14', 'Example model workshop'],
  ['sample-makers', '2026-11-14', 'Example prototype review']
];
sessions.push(
  ["sample-ithaca","2026-11-18","Example search quality review"],
  ["sample-ithaca","2026-10-24","Example data model workshop"],
  ["sample-robotics","2026-11-18","Example rover validation sync"],
  ["sample-robotics","2026-10-24","Example motor control review"],
  ["sample-ai","2026-11-18","Example model evaluation debrief"],
  ["sample-ai","2026-10-25","Example labeling workshop"],
  ["sample-makers","2026-11-18","Example prototype acceptance review"],
  ["sample-makers","2026-10-24","Example PCB prototype lab"],
  ["sample-cyber","2026-11-18","Example security design review"],
  ["sample-cyber","2026-11-11","Example threat-model workshop"],
  ["sample-cyber","2026-10-28","Example logging and incident drill"],
  ["sample-solar","2026-11-18","Example solar pack integration"],
  ["sample-solar","2026-11-11","Example telemetry bench test"],
  ["sample-solar","2026-10-28","Example power systems design review"]
);

export const sampleSessions = sessions.map(([clubId, date, title], index) => ({
  id: 'sample-session-' + (index + 1), clubId, date, week: monday(date), title, sample: true
}));
export const sampleAttendance = sampleSessions.flatMap(session =>
  sampleMembers.filter(member => member.clubIds.includes(session.clubId)).map(member => ({
    id: session.id + '-' + member.id, clubId: session.clubId, sessionId: session.id,
    memberId: member.id, date: session.date, week: session.week, points: 10, sample: true
  }))
);
function rankRows(rows, metric) {
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name));
  return sorted.map((row, index) => ({
    ...row, rank: sorted.findIndex(item => item[metric] === row[metric]) + 1
  }));
}
export function sampleLedger(clubId = 'sample-ithaca') {
  const club = sampleClubs.find(c => c.id === clubId) || sampleClubs[0];
  const contributions = sampleContributions.filter(c => c.clubId === club.id);
  const attendance = sampleAttendance.filter(a => a.clubId === club.id);
  const members = sampleMembers.filter(m => m.clubIds.includes(club.id)).map(m => {
    const approved = contributions.filter(c => c.memberId === m.id);
    const visits = attendance.filter(a => a.memberId === m.id);
    return { ...m, contributions: approved.length, sessions: visits.length,
      points: [...approved, ...visits].reduce((total, row) => total + row.points, 0) };
  });
  return { club, members: rankRows(members, 'points'), contributions: [...contributions].sort((a, b) => b.date.localeCompare(a.date)), sessions: sampleSessions.filter(s => s.clubId === club.id) };
}
export function sampleCourt(mode = 'clubs', clubId = 'sample-ithaca', universityId = 'sample-utd') {
  const club = sampleClubs.find(c => c.id === clubId) || sampleClubs[0];
  const university = sampleUniversities.find(u => u.id === universityId) || sampleUniversities[0];
  const eligible = mode === 'clubs' ? sampleMembers.filter(m => m.clubIds.includes(club.id)) :
    mode === 'university' ? sampleMembers.filter(m => m.universityId === university.id) : sampleMembers;
  const rows = eligible.map(m => {
    const contribs = sampleContributions.filter(c => c.memberId === m.id &&
      (mode !== 'clubs' || c.clubId === club.id));
    const attendance = mode === 'clubs' ? sampleAttendance.filter(a => a.memberId === m.id && a.clubId === club.id) : [];
    return { memberId: m.id, name: m.name, major: m.major, universityId: m.universityId,
      contributions: contribs.length, points: [...contribs, ...attendance].reduce((n, v) => n + v.points, 0),
      clubs: m.clubIds.map(cid => sampleClubs.find(c => c.id === cid).name) };
  }).filter(m => m.contributions || m.points);
  const universities = sampleUniversities.map(u => {
    const mine = sampleContributions.filter(c => c.universityId === u.id);
    return { ...u, universityId: u.id, contributors: new Set(mine.map(c => c.memberId)).size,
      contributions: mine.length, points: mine.reduce((n, c) => n + c.points, 0) };
  }).sort((a, b) => b.contributions - a.contributions || b.points - a.points);
  return { club, university, rows: rankRows(rows, mode === 'clubs' ? 'points' : 'contributions'), universities };
}
