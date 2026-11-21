# Legacy write authorization changes (Day 1 PR 04)

Production ledger actions now validate the **verified Supabase identity and current Atlas club membership** before creating requests or reviewing/rejecting work. A review/rejection resolves the target's owning club from the stored draft/contribution, not an untrusted body field, then requires an officer of that club. Demo paths retain explicit fictional identity semantics.

Organization writes share the same officer/membership helper, while invitation acceptance re-checks the invitation's stored club and current university. Appointments update only the verified club and current officer scope, and continue requiring a candidate's accepted nomination and (where applicable) owner consent.

Regression coverage in `tests/organizations.test.js`: forged invitation responder, cross-club draft review ID, revoked officer attempting invite/appoint/review, and non-officer appointment/invitation. Run `npm run build`.

**Known follow-up:** some multi-document invitation/member and succession/appointment writes are not transactions; this PR hardens authorization but does not claim atomic multi-document updates. Production deployment should use MongoDB transaction or compensating workflow for failure recovery.
