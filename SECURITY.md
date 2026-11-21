# Security policy

Ithaca is currently an **early beta** and is not yet approved for sensitive student or organizational data.

## Report a vulnerability privately

Please do not publish exploit details, example credentials, private member data or cross-club access findings in a public GitHub issue. If private vulnerability reporting is enabled for this repository, use **GitHub → Security → Report a vulnerability**. Otherwise, contact a repository maintainer privately through an established channel before sharing details. This repository does not publish an official security email address.

Include a description, affected endpoints/versions, minimal reproduction using fictional data, expected versus actual behavior and relevant logs stripped of secrets.

## Required security review before broader adoption

- Verify Supabase identity and token handling on every protected route.
- Exhaustively test tenant isolation, authorization and private-data projections across old and new APIs.
- Apply rate limits, input limits, secure document storage, retention and deletion policies.
- Protect backups and production credentials; rehearse restoration.
- Audit all AI-generated output and prevent unauthorized information retrieval across club documents.
- Use realistic recovery paths for partially failed writes, and audit critical changes transactionally.

Only deploy with fictional data until the relevant deployment and privacy checks have passed.
