# Running QueryBoard

This application consists of two parts:

1. **Frontend** (Vue 3 + Vite) - runs on port 5173
2. **Backend Proxy** (Express) - runs on port 3001

## Prerequisites

### 1. Start Docker Services (PostgreSQL + SuperTokens Core)

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** on port 5432
- **SuperTokens Core** on port 3567 (auth service, connects to the same PostgreSQL)

### 2. Install Dependencies

```bash
npm install
cd server && npm install
```

## Quick Start

### Option 1: Run Both Together (Recommended)

```bash
npm run dev:all
```

This will start both the frontend and backend proxy server concurrently.

### Option 2: Run Separately

**Terminal 1 - Backend:**

```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**

```bash
npm run dev
```

## Why the Backend Proxy?

The Claude API doesn't allow direct browser calls due to CORS restrictions. The backend proxy:

- Runs on `localhost:3001`
- Forwards requests to Claude API
- Handles authentication securely
- Returns responses to the frontend

## Environment Variables

Make sure `.env.local` exists with:

```
VITE_CLAUDE_API_KEY=your_api_key_here
VITE_CLAUDE_MODEL=claude-opus-4-20250514
VITE_CLAUDE_PROXY_URL=http://localhost:3001/api/claude/generate
```

## Google OAuth (Optional)

To enable "Sign in with Google", add these to `.env.local`:

```
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
```

To get these credentials:
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add `http://localhost:3001/auth/callback/google` as an Authorized redirect URI
4. Add `http://localhost:5173` as an Authorized JavaScript origin

To restrict login to a specific email domain (e.g. only `@yourcompany.com`), add:

```
ALLOWED_EMAIL_DOMAIN=yourcompany.com
```

If not set, any Google account can sign in.

## Accessing the Application

Once both servers are running:

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Troubleshooting

**CORS errors?**

- Make sure the backend proxy is running on port 3001
- Check that `VITE_CLAUDE_PROXY_URL` is set correctly

**Authentication errors?**

- Verify your Claude API key in `.env.local`
- Check that the backend can read the environment variables

**Port conflicts?**

- Frontend: Change port in `vite.config.ts`
- Backend: Change port in `server/index.js`
