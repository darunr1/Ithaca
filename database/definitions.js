const string = { bsonType: 'string' };
const strings = { bsonType: 'array', items: string };
const boolean = { bsonType: 'bool' };
const schema = (required, properties) => ({ $jsonSchema: { bsonType: 'object', required: ['id', ...required], properties: { id: string, ...properties } } });
const reference = { clubId: string, memberId: string, sessionId: string, date: { bsonType: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, week: string };
export const definitions = {
  universities: schema(['name', 'timezone', 'semesterStart'], { name: string, state: string, timezone: string, semesterStart: string }),
  clubs: schema(['name', 'universityId', 'officerIds'], { name: string, universityId: string, officerIds: strings }),
  members: schema(['name', 'universityId', 'clubIds', 'visibleToCompanies', 'openToNewClubs'], { name: string, email: string, clerkUserId: string, universityId: string, major: string, year: { bsonType: ['int', 'long'] }, clubIds: strings, visibleToCompanies: boolean, openToNewClubs: boolean, skills: strings }),
  userProfiles: schema(['internalMemberId', 'authProvider', 'authProviderUserId', 'name', 'email', 'clubIds', 'role', 'visibleToCompanies', 'openToNewClubs', 'onboarded', 'createdAt', 'updatedAt'], {
    internalMemberId: string, authProvider: { enum: ['clerk'] }, authProviderUserId: string, name: string, email: string,
    universityId: { bsonType: ['string', 'null'] }, major: { bsonType: ['string', 'null'] }, clubIds: strings,
    role: { enum: ['member'] }, visibleToCompanies: boolean, openToNewClubs: boolean, onboarded: boolean, createdAt: string, updatedAt: string
  }),
  sessions: schema(['clubId', 'date', 'week', 'title', 'takenBy'], { ...reference, title: string, takenBy: string }),
  attendance: schema(['clubId', 'memberId', 'sessionId', 'date', 'week', 'points', 'recordedBy'], { ...reference, points: { enum: [10] }, recordedBy: string }),
  contributions: { $and: [schema(['clubId', 'memberId', 'date', 'week', 'description', 'skills', 'level', 'points', 'status', 'source', 'approvedBy'], {
    ...reference, description: string, skills: strings, level: { enum: ['low', 'medium', 'high', 'custom'] },
    points: { bsonType: ['int', 'long', 'double'], minimum: 10, maximum: 100, multipleOf: 10 },
    status: { enum: ['approved', 'deleted'] }, approvedBy: string,
    source: { bsonType: 'object', required: ['id', 'excerpt'], properties: { id: string, excerpt: { bsonType: 'string', minLength: 1 } } }
  }), { $expr: { $and: [ { $ne: ['$memberId', '$approvedBy'] }, { $or: [ { $eq: ['$level', 'custom'] }, { $and: [{ $eq: ['$level', 'low'] }, { $eq: ['$points', 30] }] }, { $and: [{ $eq: ['$level', 'medium'] }, { $eq: ['$points', 60] }] }, { $and: [{ $eq: ['$level', 'high'] }, { $eq: ['$points', 90] }] } ] } ] } }] },
  drafts: schema(['clubId', 'memberId', 'description', 'status', 'source'], { ...reference, memberId: { bsonType: ['string', 'null'] }, description: string, status: { enum: ['pending', 'approved', 'rejected'] }, source: { bsonType: 'object' } }),
  auditLogs: schema(['entryId', 'action', 'before', 'after', 'reviewerId', 'createdAt'], { entryId: string, action: { enum: ['approve', 'edit', 'delete', 'attendance'] }, reviewerId: string, createdAt: string }),
  applications: schema(['clubId', 'memberId', 'role', 'consent', 'status'], { ...reference, role: string, consent: boolean, status: { enum: ['pending', 'withdrawn', 'invited', 'accepted'] } }),
  companies: schema(['name', 'approved'], { name: string, approved: boolean }),
  connections: schema(['companyId', 'memberId', 'status', 'createdAt'], { companyId: string, memberId: string, status: { enum: ['requested', 'accepted', 'declined', 'withdrawn'] }, createdAt: string })
};
export const indexes = {
  clubs: [{ key: { universityId: 1 } }], members: [{ key: { clubIds: 1 } }, { key: { visibleToCompanies: 1 } }, { key: { clerkUserId: 1 }, unique: true, sparse: true }],
  userProfiles: [{ key: { authProviderUserId: 1 }, unique: true }, { key: { internalMemberId: 1 }, unique: true }, { key: { email: 1 } }],
  sessions: [{ key: { clubId: 1, date: -1 } }],
  attendance: [{ key: { sessionId: 1, memberId: 1 }, unique: true }, { key: { clubId: 1, week: 1 } }],
  contributions: [{ key: { clubId: 1, date: -1, status: 1 } }, { key: { clubId: 1, week: 1 } }, { key: { universityId: 1, week: 1 } }, { key: { memberId: 1, date: -1 } }],
  drafts: [{ key: { clubId: 1, status: 1 } }], auditLogs: [{ key: { entryId: 1, createdAt: -1 } }],
  applications: [{ key: { clubId: 1, memberId: 1, role: 1 }, unique: true }],
  connections: [{ key: { companyId: 1, memberId: 1 }, unique: true, partialFilterExpression: { status: 'requested' } }]
};
export async function setupCollections(db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name));
  for (const [name, validator] of Object.entries(definitions)) {
    if (existing.has(name)) await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
    else await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
    await db.collection(name).createIndex({ id: 1 }, { unique: true });
    for (const { key, ...options } of indexes[name] || []) await db.collection(name).createIndex(key, options);
  }
}
