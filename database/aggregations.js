// One derived ledger: attendance and approved contributions are the two sources.
// Never copy totals onto member documents.
export function leaderboardPipeline(clubId, start = '0000-01-01') {
  return [
    { $match: { clubId, status: 'approved', date: { $gte: start } } },
    { $project: { memberId: 1, points: 1 } },
    { $unionWith: { coll: 'attendance', pipeline: [{ $match: { clubId, date: { $gte: start } } }, { $project: { memberId: 1, points: 1 } }] } },
    { $group: { _id: '$memberId', points: { $sum: '$points' } } },
    { $setWindowFields: { sortBy: { points: -1 }, output: { rank: { $rank: {} } } } },
    { $lookup: { from: 'members', localField: '_id', foreignField: 'id', as: 'member' } },
    { $unwind: '$member' },
    { $project: { _id: 0, memberId: '$_id', name: '$member.name', points: 1, rank: 1 } },
    { $sort: { points: -1, memberId: 1 } }
  ];
}
// Most approved contributions per member across every club at one university.
export function universityContributorsPipeline(universityId) {
  return [
    { $match: { universityId, status: 'approved' } },
    { $group: { _id: '$memberId', contributions: { $sum: 1 }, points: { $sum: '$points' }, clubIds: { $addToSet: '$clubId' } } },
    { $lookup: { from: 'members', localField: '_id', foreignField: 'id', as: 'member' } },
    { $unwind: '$member' },
    { $project: { _id: 0, memberId: '$_id', name: '$member.name', contributions: 1, points: 1, clubIds: 1 } },
    { $sort: { contributions: -1, points: -1, memberId: 1 } }
  ];
}
// Approved contribution totals per university.
export function universityTotalsPipeline() {
  return [
    { $match: { status: 'approved' } },
    { $group: { _id: '$universityId', contributions: { $sum: 1 }, points: { $sum: '$points' }, members: { $addToSet: '$memberId' }, clubs: { $addToSet: '$clubId' } } },
    { $lookup: { from: 'universities', localField: '_id', foreignField: 'id', as: 'university' } },
    { $unwind: '$university' },
    { $project: { _id: 0, universityId: '$_id', name: '$university.name', contributions: 1, points: 1, contributors: { $size: '$members' }, clubs: { $size: '$clubs' } } },
    { $sort: { contributions: -1, points: -1, universityId: 1 } }
  ];
}
export function memberHistoryPipeline(memberId) {
  return [{ $match: { memberId, status: 'approved' } }, { $sort: { date: -1, id: 1 } }, { $project: { _id: 0 } }];
}
