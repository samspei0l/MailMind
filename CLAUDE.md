# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server at http://localhost:3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint via Next.js
```

No test framework is configured.

## Environment Setup

Copy `.env.local.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (used for GPT-4.1 enrichment + Whisper voice transcription)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Gmail OAuth)
- `NEXTAUTH_URL` / `NEXTAUTH_SECRET`

## Architecture

MailMind is an AI-powered SaaS email assistant built on **Next.js 14 App Router** with full TypeScript. Users connect up to 5 Gmail accounts, then interact via natural language chat or voice commands.

**Core data flow:**
```
User input (chat/voice) → OpenAI intent parser → Action executor → Gmail API / Supabase → AI-generated response
```

### Key layers

**`/src/app/api/`** — All backend logic lives in Next.js route handlers:
- `/emails` — Sync and fetch emails from Gmail
- `/chat` — Parse natural language intent and execute email actions
- `/compose` — AI email composition with tone selection
- `/voice` — Whisper transcription → compose/send
- `/auth/gmail/connect` + `/auth/gmail/callback` — Gmail OAuth flow
- `/connections` — Multi-account CRUD (max 5 per user)
- `/gmail/status` — Connection health check

**`/src/lib/`** — Business logic, organized by domain:
- `ai/openai.ts` — All GPT-4.1 calls: email enrichment, intent parsing, reply generation, composition
- `email/gmail.ts` — Gmail API client (fetch, send, OAuth token handling)
- `email/actions.ts` — Email business logic (filter, reply, summarize, search)
- `email/compose.ts` — Voice and compose workflows
- `email/token.ts` — OAuth token storage/retrieval
- `supabase/client.ts` — Supabase client factories (browser vs. server vs. admin)
- `supabase/db.ts` — Database query helpers

**`/src/components/`** — React UI organized by feature: `inbox/`, `chat/`, `compose/`, `layout/`, `ui/`

**`/src/types/index.ts`** — All shared TypeScript types in a single file

### Database (Supabase + PostgreSQL)

Two migrations in `supabase/migrations/`:
1. Initial schema: `profiles`, `email_connections`, `emails`, `chat_sessions`, `chat_messages`, `email_replies`
2. Multi-account additions: extends `email_connections` to allow multiple accounts; adds `composed_emails` and `voice_transcriptions` tables

All tables have RLS policies — users only access their own data. API routes use the **service role** (admin) Supabase client; the browser client uses the anon key.

### AI capabilities

**Email enrichment** — every synced email gets AI-generated: `summary`, `priority` (HIGH/MEDIUM/LOW), `category`, `type`, `requires_reply`, `intent`, `suggested_reply`.

**Intent parsing** — natural language maps to structured actions: `filter`, `reply`, `summary`, `search`, `compose`.

**Tone selection** — compose/reply supports: professional, friendly, formal, assertive, concise, apologetic, persuasive.

**Voice** — audio (webm/mp4/wav, max 25 MB) → Whisper transcription → GPT-4.1 composition → optional send.

### Auth

Supabase Auth handles user sessions (email/password). Gmail OAuth tokens are stored server-side in `email_connections` and never sent to the client. Every API route validates the user session before accessing Gmail or database resources.

### Path aliases

`@/*` maps to `/src/*` (configured in `tsconfig.json`).
