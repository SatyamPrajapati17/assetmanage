# AssetFlow on Vercel

Two Vercel projects (monorepo):

1. **API** — Root Directory: `server`
   - Vercel auto-detects `server/api/index.js` as a serverless function
     (every `/api/*` request is routed to it).
   - Environment Variables:
     - `MONGO_URI` = your MongoDB Atlas SRV connection string
     - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` = long random strings
     - `CLIENT_ORIGIN` = the client project's URL (comma-separated list OK, or `*` to allow all origins — the API uses Bearer tokens, not cookies)
     - `UPLOAD_DIR` = `/tmp/uploads`
   - Build: none needed (functions only). Node 20+ runtime.

2. **Client** — Root Directory: `client`
   - Framework preset: Vite (see `client/vercel.json`).
   - Environment Variables:
     - `VITE_API_BASE_URL` = `https://<api-project-url>/api/v1`

## Deploy (CLI)

```bash
# from repo root
vercel link            # create/select the team + project
vercel environments pull .env.vercel.local   # optional

# API project
cd server
vercel --prod          # first run: answer "link to existing/new project"

# Client project
cd client
vercel --prod
```

After both are up, set each project's env vars (Dashboard → Settings →
Environment Variables, or `vercel env add`), then redeploy.

## Local cloud parity

```bash
vercel dev             # in server/  → http://localhost:3000 (API)
vercel dev             # in client/  → http://localhost:5173 (SPA)
```
