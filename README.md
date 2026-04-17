# MailMind — AI-Powered Email Assistant

A production-ready SaaS application that lets users interact with their Gmail inbox using natural language, powered by OpenAI GPT-4.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js 14 (App Router)               │
├───────────────┬─────────────────┬───────────────────────┤
│   Frontend    │   API Routes    │    Server Actions      │
│  (React/TSX)  │  (/api/*)       │                        │
├───────────────┼─────────────────┼───────────────────────┤
│  Supabase Auth│  OpenAI GPT-4   │   Gmail API            │
│  (Sessions)   │  (AI Engine)    │   (OAuth + Messages)   │
├───────────────┴─────────────────┴───────────────────────┤
│              Supabase PostgreSQL (Database + RLS)        │
└─────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
email-assistant/
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout
│   │   ├── page.tsx                    # Redirect handler
│   │   ├── globals.css                 # Design tokens + global styles
│   │   ├── auth/
│   │   │   ├── layout.tsx              # Auth pages layout
│   │   │   ├── login/page.tsx          # Login page
│   │   │   └── register/page.tsx       # Registration page
│   │   ├── dashboard/
│   │   │   ├── layout.tsx              # Dashboard layout (auth guard)
│   │   │   ├── inbox/page.tsx          # Inbox page (server)
│   │   │   ├── chat/page.tsx           # Chat page
│   │   │   └── settings/page.tsx       # Settings page
│   │   └── api/
│   │       ├── auth/gmail/
│   │       │   ├── connect/route.ts    # Redirect to Google OAuth
│   │       │   └── callback/route.ts   # Handle OAuth callback
│   │       ├── emails/route.ts         # GET (list) / POST (sync)
│   │       ├── chat/route.ts           # POST (chat) / GET (history)
│   │       └── gmail/status/route.ts   # GET/DELETE connection status
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   └── Sidebar.tsx             # Navigation sidebar
│   │   ├── inbox/
│   │   │   ├── InboxClient.tsx         # Inbox list + filters
│   │   │   └── EmailDetailPanel.tsx    # Email detail + AI reply
│   │   ├── chat/
│   │   │   ├── ChatInterface.tsx       # ChatGPT-like chat UI
│   │   │   └── EmailCardMini.tsx       # Email card in chat results
│   │   └── ui/
│   │       └── toaster.tsx             # Toast notifications
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts               # Supabase client factories
│   │   │   └── db.ts                   # Database helper functions
│   │   ├── ai/
│   │   │   └── openai.ts               # OpenAI integration (enrich, parse, reply)
│   │   └── email/
│   │       ├── gmail.ts                # Gmail API integration
│   │       └── actions.ts              # Business logic (sync, filter, reply)
│   │
│   └── types/
│       └── index.ts                    # TypeScript type definitions
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql      # Complete DB schema
│
├── .env.local.example                  # Environment variables template
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Step-by-Step Setup Guide

### Step 1: Clone and Install Dependencies

```bash
git clone <your-repo>
cd email-assistant
npm install
```

### Step 2: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy your **Project URL** and **anon key** from Settings > API
3. Copy your **service_role key** (keep this secret)
4. Go to SQL Editor → run the file `supabase/migrations/001_initial_schema.sql`
5. Go to Authentication > URL Configuration, add:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/**`

### Step 3: Set Up Google Cloud (Gmail API)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project: "MailMind"
3. Enable APIs:
   - **Gmail API**
   - **Google People API**
   - **OAuth2 API**
4. Go to APIs & Services > Credentials > Create OAuth Client ID
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/api/auth/gmail/callback`
5. Copy **Client ID** and **Client Secret**
6. OAuth Consent Screen:
   - User Type: **External**
   - Add scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `userinfo.email`
   - Add test users (your Gmail) while in testing

### Step 4: Set Up OpenAI

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an API key
3. Ensure your account has access to `gpt-4.1` (or update `MODEL` in `src/lib/ai/openai.ts`)

### Step 5: Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Google OAuth
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/gmail/callback

# App
NEXTAUTH_SECRET=generate-32-char-random-string
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Generate a secret: `openssl rand -base64 32`

### Step 6: Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`

---

## User Flow

```
1. Register / Login (Supabase Auth)
        ↓
2. Connect Gmail (OAuth flow → /settings)
        ↓
3. Sync Emails (Sidebar button or /settings)
     → Gmail API fetches 50 latest emails
     → Stored in Supabase `emails` table
     → OpenAI enriches each email (priority, category, summary, etc.)
        ↓
4. Use Chat Interface
     User types: "Show all high priority sales emails"
        ↓
     OpenAI parses intent → { action: "filter", filters: { priority: "HIGH", category: "Sales" } }
        ↓
     Query Supabase → return matching emails
        ↓
     OpenAI generates conversational response
        ↓
     Display emails + response in chat

5. Reply to emails
     User types: "Reply to all quotation emails saying I'll send them tomorrow"
        ↓
     OpenAI parses → { action: "reply", filters: { type: "Quotation" }, message: "..." }
        ↓
     Find matching emails → Generate professional reply for each
        ↓
     Send via Gmail API (preserving threadId)
        ↓
     Log to email_replies table
```

---

## API Reference

### `POST /api/emails` — Sync emails
```json
{ "maxResults": 50 }
// Returns: { "synced": 50, "enriched": 20 }
```

### `GET /api/emails` — List emails with filters
```
?priority=HIGH&category=Sales&requires_reply=true&search=quotation&limit=20
// Returns: { "emails": [...], "message": "Found 5 emails" }
```

### `POST /api/chat` — Chat with AI
```json
{ "message": "Show high priority emails from yesterday", "sessionId": "optional" }
// Returns: { "sessionId": "...", "message": "...", "action": {...}, "result": { "emails": [...] } }
```

### `GET /api/gmail/status` — Connection status
```json
{ "connected": true, "email": "you@gmail.com", "last_sync_at": "..." }
```

### `DELETE /api/gmail/status` — Disconnect Gmail

---

## AI Enrichment Schema

For each email, OpenAI returns:

```json
{
  "summary": "Client requesting revised quotation for Q1 2025 project",
  "priority": "HIGH",
  "category": "Sales",
  "type": "Quotation",
  "requires_reply": true,
  "intent": "Wants updated pricing before end of week",
  "suggested_reply": "Dear [Name], Thank you for reaching out..."
}
```

## Intent Parsing Examples

| User says | Parsed action |
|-----------|--------------|
| "Show important emails" | `{ action: "filter", filters: { priority: "HIGH" } }` |
| "Show all sales emails" | `{ action: "filter", filters: { category: "Sales" } }` |
| "Summarise yesterday" | `{ action: "summary", date_range: "yesterday" }` |
| "Show emails needing reply" | `{ action: "filter", filters: { requires_reply: true } }` |
| "Reply to quotation emails saying I'll send tomorrow" | `{ action: "reply", filters: { type: "Quotation" }, message: "..." }` |
| "Find emails from John" | `{ action: "search", query: "John" }` |

---

## Database Schema Summary

| Table | Purpose |
|-------|---------|
| `profiles` | User profile (extends Supabase auth) |
| `email_connections` | OAuth tokens for Gmail/Outlook |
| `emails` | Emails + AI enrichment fields |
| `chat_sessions` | Groups chat conversations |
| `chat_messages` | Individual messages + action/result data |
| `email_replies` | Audit trail of sent replies |

All tables have Row Level Security (RLS) — users can only access their own data.

---

## Production Deployment

### Deploy to Vercel

```bash
npm install -g vercel
vercel deploy
```

Add all environment variables in Vercel dashboard under Project > Settings > Environment Variables.

Update these after deployment:
- `NEXT_PUBLIC_APP_URL` → your Vercel URL
- `GOOGLE_REDIRECT_URI` → `https://your-app.vercel.app/api/auth/gmail/callback`
- Google Cloud Console: add production redirect URI

### Supabase Production

- Enable email confirmations in Supabase Auth settings
- Set up a custom SMTP provider for production emails
- Update Supabase redirect URLs to production domain

---

## Future Enhancements

| Feature | Status | Notes |
|---------|--------|-------|
| Outlook/Microsoft 365 | Placeholder | See `OutlookProvider` in `gmail.ts` |
| Daily email digest (scheduled) | Planned | Use Vercel Cron + `generateDailySummary()` |
| WhatsApp notifications | Placeholder | Integrate Twilio/WhatsApp Business API |
| Bulk actions | Planned | Select multiple → bulk reply/archive |
| Email threading | Planned | Group emails by `thread_id` |
| Smart folders | Planned | Auto-organized by AI category |
| Mobile app | Future | React Native with Expo |

---

## Security Checklist

- [x] Supabase RLS on all tables
- [x] OAuth tokens stored server-side (never exposed to client)
- [x] All secrets in environment variables
- [x] Admin client (service role) only used in API routes
- [x] User session validated on every API route
- [x] Input validation on all API endpoints
- [ ] Rate limiting (add middleware for production)
- [ ] Token refresh logic (implement OAuth refresh flow)
- [ ] Audit logging for sent emails

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS, Custom design tokens |
| Auth | Supabase Auth (email/password) |
| Database | Supabase PostgreSQL + RLS |
| AI | OpenAI GPT-4.1 (enrichment, intent parsing, reply gen) |
| Email | Gmail API via Google APIs Node.js client |
| Deployment | Vercel (recommended) |
