# Vercel deployment

The deployment-fix branch uses Vercel's native Express function entry point at `api/index.js`. `vercel.json` rewrites `/api/*` to that function and serves the existing `frontend/` directory without a framework or build step. Local `npm start` remains unchanged.

## Dashboard settings

- Framework preset: **Other**
- Root directory: repository root
- Build command: empty
- Output directory: empty
- Install command: `npm install`
- Node.js version: 22.x

Add these variables to the **Production** environment (use a separate fictional database for Preview testing):

```text
DATA_MODE=atlas
MONGODB_URI=<Atlas connection string>
MONGODB_DB=ithaca_vercel_demo
AI_MODE=live
GEMINI_API_KEY=<Gemini server key>
GEMINI_MODEL=gemini-2.5-flash
ATHENE_ENABLED=true
ATHENE_GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
MONGODB_VECTOR_INDEX=athene_chunks_vector
ATHENE_CHUNK_SIZE=1400
ATHENE_CHUNK_OVERLAP=200
ATHENE_TOP_K=6
ATHENE_MIN_SCORE=0.65
AUTH_JWKS_URL=https://<issuer>/.well-known/jwks.json
AUTH_ISSUER=<issuer>
AUTH_AUDIENCE=<audience>
NODE_ENV=production
```

Do not set `ATHENE_DEV_TOKEN` in Vercel. It is rejected in production and exists only for localhost development. Never prefix secrets with `NEXT_PUBLIC_` or expose them in frontend code.

Athena uploads are limited to a combined 4 MiB per request to stay below Vercel's 4.5 MiB function request limit. The browser enforces the same limit before submitting. For larger files, use an authenticated direct-to-storage design (for example, signed object-storage uploads) before increasing this limit.

## Deploy

1. Link the repository with Vercel and select the deployment-fix branch.
2. Add the variables above and allow the Vercel deployment IP range in Atlas Network Access.
3. Ensure the Atlas vector index named by `MONGODB_VECTOR_INDEX` exists; run the Athene setup against the deployment database before enabling traffic.
4. Deploy, then verify `/`, `/#athena`, `/api/health`, upload/listing, a grounded question, and citations with a real authenticated user.

The local development session endpoint is loopback-only and is unavailable when `NODE_ENV=production`; production requests must carry the configured JWT accepted by the existing member authorization model.
