# Event Platform — Build Plan (Reconciled)

Stack: Monorepo → `/backend` (Express + TypeScript + Drizzle ORM) + `/frontend`
(Next.js App Router, TypeScript, Tailwind, route groups `/admin/*` and
`/(student)/*`) + Docker Postgres with `pgvector`.

This document supersedes the earlier per-phase plans and prompts. It reflects
what was actually implemented across Phases 0–4, corrected against
`schema-design-updated.md` (the current source of truth for the database).
Where an earlier phase prompt assumed tables/columns that no longer exist,
or omitted ones that do, this doc calls it out explicitly rather than
silently carrying the discrepancy forward. See **Section: Schema
Reconciliation Notes** at the end for the full list of decisions made and
open items still needing your call.

Run phases in order. Don't start Phase N+1 until Phase N's acceptance
criteria pass.

---

## Phase 0 — Project Scaffolding & Environment ✅ Completed

**Objective:** Empty-but-running skeleton for both apps + database.

**Delivered:**

- Monorepo root: `/backend`, `/frontend`, root `docker-compose.yml`, root `README.md`
- `docker-compose.yml`: Postgres via `pgvector/pgvector:pg16`, named persistent
  volume, port 5432, database `eventdb`
- Backend: Express + TypeScript, folders `src/routes`, `src/controllers`,
  `src/services`, `src/middleware`, `src/utils`, `src/config`, `src/db`
- Backend `.env.example`: `DATABASE_URL`, `JWT_SECRET`, `PORT=4000`
- `GET /health` → `{ status: "ok" }`
- `ts-node-dev`/nodemon for `npm run dev`
- **Swagger/OpenAPI scaffolded and exposed at `/api-docs`** (added in the
  refined prompt; not in the original plan — carried forward as a permanent
  requirement for every later phase)
- Frontend: Next.js App Router + TS + Tailwind, route groups `app/(student)/`
  and `app/admin/` with placeholder pages, shared root layout
- Root ESLint + Prettier shared config
- No Drizzle, no DB models, no auth — scaffolding only

**Acceptance criteria (met):**

- `docker compose up` starts Postgres cleanly
- `cd backend && npm run dev` → `GET /health` returns 200
- `cd frontend && npm run dev` → home page renders at `localhost:3000`

**Note:** the original build-plan's task list also asked for a `drizzle/`
migrations folder and `drizzle.config.ts` inside Phase 0. Both Phase 0
prompts explicitly deferred all Drizzle installation to Phase 1, and that's
what was actually built. Phase 1 below is the correct source of truth for
Drizzle setup.

---

## Phase 1 — Database Schema & Migrations (Drizzle) ✅ Completed, rewritten to match updated schema

**Objective:** Full schema live in Postgres via Drizzle ORM, matching
`schema-design-updated.md` exactly, seeded with reference data.

**Tables** (`src/db/schema.ts`, matches updated schema §1–§9 — supersedes
the original Phase 1 task list, which named `event_prizes` and
`event_rounds`, tables that do not exist in the updated schema, and omitted
several tables the updated schema does define):

- `organizations` — including `contact_name`, `contact_phone`, `updated_at` (all `NEW` in updated schema)
- `organizer_accounts` — including `status` (`active`/`removed`) and `updated_at` (both `NEW`; the original inline spec in Phase 1 omitted these)
- `organization_invitations`
- `locations`
- `eligibility_categories`
- `event_eligibility` (join)
- `tags`
- `event_tags` (join)
- `events` — full column set per updated schema §4, including `venue`,
  `timezone`, `fee_confidence`, `eligibility_confidence`,
  `registration_count`, `embedding` / `embedding_source_text` /
  `embedding_updated_at`, `search_text_tsv`
- `hackathon_details`, `workshop_details`, `internship_details` — per updated
  schema §5 (no `event_prizes`/`event_rounds` tables — prize structure lives
  in `hackathon_details.prize_summary_text` as freeform text)
- `event_custom_fields` (§6 — dynamic registration form builder; not yet
  used by any phase implemented so far, wired for a future registration
  phase)
- `event_registrations`, `event_registration_responses` (§7 — same: schema
  is in place, no endpoint uses them yet — see Reconciliation Notes)
- `users` — including `auth_provider`, `resume_url`, `college_name`,
  `branch`, `year_of_study`, `city_id`
- `saved_events`
- `search_query_log`

**Drizzle specifics:**

- `drizzle.config.ts` → `src/db/schema.ts`, output `./drizzle`
- `src/db/client.ts` exports the Drizzle `db` instance via `DATABASE_URL`
- `events.embedding`: native `vector('embedding', { dimensions: 1536 })`
  column, HNSW index via `.using('hnsw', table.embedding.op('vector_cosine_ops'))`
- Two raw-SQL migrations (not expressible in Drizzle's schema DSL):
  1. `CREATE EXTENSION IF NOT EXISTS vector;` — must run before the
     migration that creates `events.embedding`
  2. `search_text_tsv` column + `events_tsv_trigger()` function + trigger,
     exactly as defined in updated schema §4
- Indexes: all of updated schema §10 —
  `idx_events_status_type`, `idx_events_location`, `idx_events_dates`,
  `idx_events_embedding` (HNSW), `idx_event_tags_tag`,
  `idx_event_eligibility_category`, `idx_event_registrations_event`,
  `idx_org_invitations_email`, plus `idx_events_search_tsv` (GIN on
  `search_text_tsv`). **The original Phase 1 prompt's GIN indexes on
  `branches`/`education_levels` arrays are dropped — those columns don't
  exist in the updated schema.** Eligibility filtering is handled via the
  `event_eligibility` join table instead.

**Seed (`src/db/seed.ts`):**

- 18 major Indian cities into `locations` (city, state, country='India', approx lat/lng)
- ~20 tags across `domain` (AI, Web3, FinTech, HealthTech, Sustainability,
  EdTech, IoT), `technology` (React, Python, Blockchain, ML), `theme`
  (Beginner-friendly, Open Source, Social Good)
- `npm run db:seed` (ts-node)

**Acceptance criteria:**

- `npx drizzle-kit generate` + `npx drizzle-kit migrate` run clean against Dockerized Postgres
- `npx drizzle-kit studio` shows all tables with correct relations
- Seed script populates locations + tags without error

---

## Phase 2 — Authentication & Organizer Account Onboarding ✅ Completed

**Objective:** Students and Organizer Accounts register/login
independently; owner-only member invitation flow works; role-guarded
routes work. Backend only — no frontend auth pages in this phase (this
explicitly reverses the original build-plan's Phase 2, which specified
`app/(student)/auth/*` and `app/admin/auth/*` pages plus an `AuthProvider`
context; the refined prompt scoped Phase 2 to backend-only and that is
what was built — see Reconciliation Notes for what this means for the
frontend).

### 1. Student authentication

- `POST /api/auth/student/register` — **name, email, password only.**
  `confirmPassword` may be accepted for request-level validation but is
  never persisted. Does **not** collect `college_name`, `branch`,
  `year_of_study`, or `city_id` at registration — those are completed later
  via a student profile update endpoint that is **not yet implemented**
  (open item, not part of Phases 0–4).
- `POST /api/auth/student/login`
- Against the `users` table.

### 2. Organizer registration

- `POST /api/auth/organizer/register` — creates an `organizations` row and
  an `organizer_accounts` row with `role='owner'` in a single transaction.
  Client-supplied `role` or `organization_id` is rejected.
  Request: organization `name`, `org_type`, `contact_email`; owner
  `name`, `email`, `password`.

### 3. Organizer login

- `POST /api/auth/organizer/login` — single endpoint used by both `owner`
  and `member` accounts. No separate member login endpoint.

### 4. Password security

- bcrypt for all password hashing. Duplicate emails rejected (both `users`
  and `organizer_accounts`).

### 5. JWT + refresh tokens

- Access token: 15 min. Payload distinguishes **application-level role**
  (`'student' | 'organizer'`) from **organization membership role**
  (`'owner' | 'member'`), which travels alongside `organizationId` for
  organizer tokens:
  ```json
  {
    "id": "<account-id>",
    "role": "organizer",
    "organizationId": "<org-id>",
    "membershipRole": "owner"
  }
  ```
- Refresh token: long-lived, httpOnly cookie, secure in production,
  practical dev config locally.
- `POST /api/auth/refresh`, `POST /api/auth/logout`.
- Refresh-token revocation: refresh tokens are validated against a stored
  reference (hashed) at refresh time; `logout` invalidates that reference so
  the cookie can no longer be redeemed, without requiring a full denylist
  of every access token issued (access tokens simply expire in 15 min).

### 6. Auth middleware

- `requireAuth` — validates access token, rejects missing/invalid/expired.
- `requireRole(...roles)` — checks `role` claim (`student`/`organizer`).
  Organization-level checks (`organizationId` match, `membershipRole ===
'owner'`) are enforced separately at the route/service layer using the
  context `requireAuth` attaches — this is what Phase 3's ownership checks
  build on.

### 7. Organizer member invitation

- `organization_invitations` (already defined in the updated schema §1 —
  no additional migration was needed beyond what Phase 1 already created:
  `token_hash`, `invited_by_id`, `status` (`pending`/`accepted`/`expired`/`revoked`),
  `expires_at`, `accepted_at`).
- `POST /api/organizer/members/invite` — owner-only, invitee email
  validated, invitation always tied to the authenticated owner's
  `organization_id`.
- `POST /api/auth/organizer/accept-invite` — validates an unexpired,
  pending invitation by hashed token; expired-but-still-`pending`
  invitations are treated as expired at validation time based on
  `expires_at`, with no background job required to flip their status.
  Creates `organizer_accounts` row with `role='member'`, sets password,
  marks the invitation `accepted`. Reuse of an already-accepted or expired
  invitation is rejected.
- No email-sending service — dev-only mechanism to obtain the invite token
  (documented in the walkthrough, not exposed insecurely).

### 8. Authorization / multi-tenancy

- Every organizer belongs to exactly one organization; `organizationId`
  and `membershipRole` are carried in auth context for all downstream
  authorization (used directly by Phase 3).

### 9. Swagger

- All Phase 2 endpoints documented in the existing `/api-docs` setup:
  student register/login, organizer register/login, refresh, logout,
  member invite, accept-invite. Security scheme for bearer auth defined.

### 10. Testing

- Integration tests against the real Express + Drizzle + Postgres stack
  (not mocked) covering registration/login for both identities, transaction
  atomicity of organizer registration, full invite→accept→login lifecycle,
  token claims/expiry, refresh/logout, and owner-vs-member authorization.

**Note:** `requireRole('platform_admin')` appeared in the original Phase 2
plan's middleware but was dropped in the refined prompt — no platform-admin
functionality has been implemented in any phase provided. `events.status =
'hidden'` + `flagged_reason` (the schema's admin-moderation mechanism) has
no corresponding endpoint yet.

---

## Phase 3 — Organizer Event Management APIs ✅ Completed, corrected to match updated schema

**Objective:** Authenticated organizers create/edit/publish/delete events of
all three types. Backend only, builds on Phase 2 auth as-is.

**This phase required the most correction against the updated schema.**
The original task list assumed a data model (`event_prizes`, `event_rounds`
tables; `education_levels`/`branches` array columns; team-size range
columns) that the updated schema does not contain. Rather than silently
implement against fields that don't exist, this build follows the updated
schema as authoritative. See Reconciliation Notes for what was cut and why.

### 1. Event creation — `POST /api/organizer/events`

- `requireAuth + requireRole('organizer')`. `organizationId` and
  `created_by` are always taken from the authenticated JWT.
  **`organization_id` must not appear in the request body at all — if
  present, reject with 400 rather than silently ignoring it.**
- Default `status = 'draft'`.
- Core fields (matches `events` table columns exactly):
  `title`, `event_type`, `tagline`, `description`, `mode`, `venue`,
  `location_id`, `timezone`, `is_paid`, `registration_fee`, `currency`,
  `resume_required`, `registration_open_at`, `registration_close_at`,
  `event_start_at`, `event_end_at`, `eligibility_notes`.
  _(Renamed from the original prompt's `registration_fee_inr` to match the
  schema's actual `registration_fee` + `currency` pair.)_
- Eligibility: `eligibility_category_ids: number[]` populates
  `event_eligibility`. _(Replaces the original prompt's
  `education_levels`/`branches` array columns and `min/max_year_of_study`,
  none of which exist on `events` in the updated schema — eligibility is
  categorical via `eligibility_categories` plus the freeform
  `eligibility_notes` fallback.)_
- `tag_ids: number[]` populates `event_tags`.
- Type-specific nested object, required based on `event_type` (Zod
  discriminated union):
  - `hackathon`: `hackathon_details` — `max_participants`,
    `prize_summary_text`, `tracks: string[]`, `submission_type`.
    _(No `total_prize_inr` numeric field, no `prizes[]`/`rounds[]` arrays —
    these don't exist in the updated schema; prize structure is a single
    freeform text field. See Reconciliation Notes if structured
    prize/round data is actually wanted going forward.)_
  - `workshop`: `workshop_details` — `speaker_name`, `speaker_bio`,
    `duration_hours`, `seats_available`, `certificate_provided`,
    `prerequisite_skills: string[]`.
  - `internship`: `internship_details` — `stipend_min`, `stipend_max`,
    `duration_months`, `work_mode`, `positions_available`,
    `min_experience_months`, `perks: string[]`.

### 2. Validation

- Zod, discriminated union on `event_type` enforcing the matching
  `*_details` object. Rejects missing/mismatched details, invalid enums,
  invalid dates, invalid UUIDs, malformed tag/eligibility IDs. HTTP 400 on
  failure, no silent field-dropping. Database CHECK constraints act as a
  second safety layer.

### 3. Transactional creation

- Single transaction across `events` + the relevant `*_details` row +
  `event_tags` + `event_eligibility`. Full rollback on any failure —
  verified by an integration test that checks Postgres directly for
  leftover rows after a simulated mid-transaction failure, not just the
  HTTP response.

### 4. Update — `PUT /api/organizer/events/:id`

- Same Zod validation. Updates core event, replaces `*_details` row,
  replaces `event_tags` and `event_eligibility`. Ownership verified against
  JWT `organizationId` — cross-org update returns 403; non-existent event
  returns 404. Transactional.

### 5. Publish / unpublish

- `PATCH /api/organizer/events/:id/publish` — `draft → published`, sets
  `published_at` only on first publish (not overwritten on republish).
- `PATCH /api/organizer/events/:id/unpublish` — `published → draft`.
- No other status transitions through these endpoints. Ownership-checked.

### 6. Delete — `DELETE /api/organizer/events/:id`

- Hard delete, ownership-checked, relies on existing `ON DELETE CASCADE`
  foreign keys (no manual cascade deletes).

### 7. List — `GET /api/organizer/events`

- Own-organization events only, all statuses, newest first, paginated
  (`page`/`limit` + metadata: current page, page size, total items, total
  pages).

### 8. Banner upload — `POST /api/organizer/events/:id/banner`

- Single image upload, ownership-checked. **Accepted MIME types: exactly
  JPEG, PNG, WebP** (GIF removed per correction — keeps the MIME-type list
  consistent). Reasonable file-size limit. Stored to local `/uploads` for
  now, with a code comment flagging replacement by S3/cloud storage before
  production. Saves URL to `events.banner_image_url`.

### 9. Error handling

- 400 validation/invalid state transition, 401 missing/invalid auth, 403
  ownership/role, 404 not found, 409 where relevant. No leaked DB errors.

### 10. Swagger

- All Phase 3 endpoints added to the existing `/api-docs`, reusing Phase
  2's bearer auth scheme, including multipart/form-data docs for the
  banner endpoint.

### 11. Testing

- Full integration suite against the real stack: creation (incl. rejecting
  client-supplied `organization_id`, type-specific validation, tag/eligibility
  association, transactional rollback verified at the DB level), update
  (incl. cross-org 403, replace semantics), publish/unpublish
  (`published_at` behavior), delete (cascade verified), list (isolation,
  pagination, ordering), banner (valid/invalid/oversized/cross-org),
  authorization (401/403 boundaries, student tokens rejected), Swagger
  presence and Try-it-out.

---

## Phase 4 — Student-Facing Public APIs ✅ Completed, corrected to match updated schema

**Objective:** Anyone can browse published events with filters; logged-in
students can save events. Backend only.

### 1. Venue / location display

- No city/state/country duplicated onto `events` — `location_id` stays the
  single source of normalized geography, joined at read time.
- The updated schema already has an events column named **`venue`** (added
  as `NEW` in Phase 1) — the original Phase 4 prompt's request to add a new
  `venue_name` field is therefore already satisfied; no new column or
  migration is needed. Organizer create/update (Phase 3) already accepts
  `venue` directly.
- **Card view** (`GET /api/events` lightweight shape):
  - `mode = 'online'` → `"location": "Online Event"`
  - otherwise → city only, e.g. `"location": "Coimbatore"`
  - full venue/address is never exposed in the card shape.
- **Detail view** (`GET /api/events/:slug`):
  ```json
  {
    "venue": "Kumaraguru College of Technology",
    "location": { "city": "Coimbatore", "state": "Tamil Nadu", "country": "India" }
  }
  ```
  Online event: `{ "venue": null, "location": "Online Event" }`.
  If an offline/hybrid event has no `venue` set, return `venue: null` — never fabricate one.

### 2. Public listing — `GET /api/events`

- Public, `status = 'published'` only.
- Filters (all combined with AND across categories):
  `event_type`, `city_id` (via `location_id`; syntactically invalid → 400,
  valid-but-nonexistent → empty result, not an error), `mode`
  (`online`/`offline`/`hybrid`), `is_paid` (boolean), `fee_max` (≤
  `registration_fee`), `date_from`/`date_to` (against `event_start_at`),
  `tag_ids` (comma-separated, **ANY-match** OR logic within the tag filter
  itself, combined with everything else via AND).
- Pagination: `page ≥ 1`, `1 ≤ limit ≤ 100`, documented defaults. Response
  includes `page`, `limit`, `total`, `totalPages`, `data`.
- Sorting: default `event_start_at ASC, id ASC`; `?sort=newest` →
  `published_at DESC, id DESC`. Deterministic secondary sort on `id` in
  both cases to avoid unstable ordering on tied timestamps.

### 3. Lightweight card shape

`id`, `slug`, `title`, `tagline`, `event_type`, `banner_image_url`,
`location` (per §1 rules), `event_start_at`, `registration_close_at`,
`is_paid`, `registration_fee`. For hackathons, also include
`prize_summary_text` from `hackathon_details`. _(Replaces the original
prompt's `total_prize_inr`, which has no backing column — see
Reconciliation Notes.)_

### 4. Full detail — `GET /api/events/:slug`

- `status = 'published'` only; draft/hidden/archived/completed all return
  404, **even to a requester holding a valid organizer JWT** for that
  event's own organization (organizers view their unpublished events via
  the Phase 3 organizer-scoped endpoints instead).
- Returns core fields, `venue` + normalized `location` (§1), organization
  public fields only (`name`, `logo_url`, `is_verified`, `org_type`,
  `website_url` — never `contact_email`, `contact_phone`, or anything from
  `organizer_accounts`), the matching type-specific details object, tags.
  _(No `prizes`/`rounds` arrays in the response — those tables don't exist;
  prize info is `hackathon_details.prize_summary_text`.)_

### 5. Saved events

- `POST /api/events/:id/save`, `DELETE /api/events/:id/save` —
  `requireAuth + requireRole('student')`.
- Saving a draft/hidden/unpublished/non-existent event → 404.
- `POST` is idempotent via `ON CONFLICT DO NOTHING` on the `saved_events`
  composite primary key — repeated saves never error or duplicate.

### 6. Saved event listing — `GET /api/users/me/saved`

- `requireAuth + requireRole('student')`, returns only the authenticated
  student's own saved events, and only ones that are **currently**
  published (a saved-then-unpublished event's row stays in `saved_events`
  but is excluded from this response).
- Same lightweight card shape as `GET /api/events` (intentional, so the
  frontend can reuse one card component for both surfaces). No `savedAt`
  in the response for now.
- Same pagination rules as §2 (`page ≥ 1`, `1 ≤ limit ≤ 100`), deterministic
  `id` secondary ordering.

### 7. Authentication behavior

- `GET /api/events` and `GET /api/events/:slug` work unauthenticated.
- Save endpoints: unauthenticated → 401, organizer token → 403, student
  token → allowed. One student can never see another student's saved list.

### 8. Validation & errors

- Zod for all query params. 400 for invalid `page`/`limit`/`event_type`/
  `mode`/booleans/dates/`city_id` format/`tag_ids` format/`sort`. A
  valid-format-but-nonexistent `city_id` is **not** a validation error —
  empty result set. Clear 400/401/403/404 distinction throughout.

### 9. Swagger

- All Phase 4 endpoints documented at `/api-docs`, including query params,
  pagination shape, auth requirements, and the online/offline location
  response variants, without disturbing Phase 0–3 documentation.

### 10. Testing

- Full integration suite: listing (status filtering, every query filter
  individually and combined with AND, tag ANY-match, pagination bounds,
  default vs. newest sort with deterministic tiebreak), location display
  (card and detail, online vs. offline/hybrid, missing-venue behavior),
  detail (published/draft/hidden/nonexistent → 200/404/404/404,
  organization field scoping, type-specific details), saved events
  (save/unsave, idempotency, unpublished rejection, cross-student
  isolation, role rejection, pagination), Swagger presence.

---

## Schema Reconciliation Notes

Decisions made while reconciling the four phases against
`schema-design-updated.md`, and open items that still need your input.

### Resolved by following the updated schema as authoritative

1. **`event_prizes` / `event_rounds` tables** — referenced throughout the
   original Phase 1 and Phase 3 materials (structured prize tiers, judging
   rounds), but they don't exist in the updated schema. `hackathon_details`
   only has `prize_summary_text` (freeform). Build followed the schema:
   no prize/round tables, no `prizes[]`/`rounds[]` in create/update
   payloads or detail responses.
2. **`education_levels`, `branches` (array columns), `min/max_year_of_study`,
   `min/max_team_size`** — none exist on `events` in the updated schema.
   Eligibility is instead handled via `eligibility_notes` (freeform) +
   `eligibility_confidence` + the `eligibility_categories`/`event_eligibility`
   join tables. Build followed the schema: organizer create/update accepts
   `eligibility_category_ids[]` + `eligibility_notes`, no team-size fields
   anywhere. **Team size (min/max participants per team) appears to be
   genuinely absent from the schema, not just renamed** — if the product
   needs it, it should be added as a real column (likely on
   `hackathon_details`, alongside the existing `max_participants`).
3. **`registration_fee_inr` → `registration_fee` + `currency`** — renamed
   to match the schema's actual columns (which also support non-INR
   currencies via the `currency` field, defaulting `'INR'`).
4. **`total_prize_inr`** — no such column exists; replaced with
   `hackathon_details.prize_summary_text` in card/detail responses.
5. **Phase 4's `venue_name`** — the schema already has `venue`
   (added in Phase 1); no new column was needed, just consistent naming.
6. **`requireRole('platform_admin')`** — present in the original Phase 2
   plan, dropped by the refined prompt; no admin functionality has been
   built in any phase reviewed.

### Open items — not covered by any phase reviewed, flagged rather than assumed

1. **Actual event registration is not implemented.** The schema has full
   support for it — `event_registrations`, `event_registration_responses`,
   `event_custom_fields`, and `events.registration_count` as a denormalized
   counter meant to be bumped on registration insert — but no phase
   provided implements a `POST /api/events/:id/register` flow, custom-field
   definition by organizers, or the counter update. "Saved events" (Phase 4) is a bookmark, not a registration. This looks like the natural scope
   of a future phase.
2. **Student profile completion.** Phase 2 explicitly deferred
   `college_name`/`branch`/`year_of_study`/`city_id` to "later," but no
   phase implements that update endpoint.
3. **Frontend auth.** The original Phase 2 plan's frontend auth pages
   (`app/(student)/auth/*`, `app/admin/auth/*`, `AuthProvider`, route
   guards) were explicitly dropped by the refined prompt's backend-only
   scope, and no later phase reintroduced them. The frontend currently has
   only the Phase 0 placeholder pages with no auth integration at all.
4. **Search & discovery (embedding-based / progressive filter relaxation)
   and the AI ingestion pipeline** described in the schema (§3–§4 of the
   design doc's narrative section) are out of scope for all phases
   reviewed here — the original build-plan document is explicitly titled
   "Pre-Search Phase." Treat as a distinct future project stage.
5. **Platform admin / moderation** (`events.status='hidden'` +
   `flagged_reason`, organizer verification/rate-limiting) has schema
   support but no implementing endpoints in any phase reviewed.
6. **Team size fields** — see resolved item 2 above; flagged again here
   because it's a product decision (add the columns, or confirm team size
   isn't tracked) rather than a naming fix.
