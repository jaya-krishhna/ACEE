# Event Platform — Database Schema (Updated)

Scope: Hackathons, Workshops, Internships. Multi-organizer (single owner + members), auto-publish,
semantic search via pgvector. Stack: Node.js + PostgreSQL + pgvector.

---

## 1. Organizations & Organizer Accounts

```sql
CREATE TABLE organizations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    org_type            TEXT NOT NULL CHECK (org_type IN ('college','company','community','individual')),
    contact_email       TEXT NOT NULL,
    website_url         TEXT,
    logo_url            TEXT,
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at         TIMESTAMPTZ,
    is_banned           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE organizer_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    email               TEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    role                TEXT NOT NULL CHECK (role IN ('owner','member')),
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),  -- NEW
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()   -- NEW
);


CREATE TABLE organization_invitations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    token_hash          TEXT NOT NULL UNIQUE,
    invited_by_id       UUID NOT NULL REFERENCES organizer_accounts(id),
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','revoked')),
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at         TIMESTAMPTZ
);
```

---

## 2. Locations & Eligibility (lookup + join tables)

```sql
CREATE TABLE locations (
    id                  SERIAL PRIMARY KEY,
    city                TEXT NOT NULL,
    state               TEXT,
    country             TEXT NOT NULL DEFAULT 'India',
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    UNIQUE (city, state, country)
);


CREATE TABLE eligibility_categories (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL UNIQUE,
    slug                TEXT NOT NULL UNIQUE
);

CREATE TABLE event_eligibility (
    event_id                UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    eligibility_category_id INTEGER NOT NULL REFERENCES eligibility_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, eligibility_category_id)
);
```

---

## 3. Tags (reused for hackathon tracks, internship skills, and embeddings)

```sql
CREATE TABLE tags (
    id                  SERIAL PRIMARY KEY,
    name                TEXT NOT NULL UNIQUE,
    slug                TEXT NOT NULL UNIQUE,
    category            TEXT NOT NULL CHECK (category IN ('domain','technology','theme'))
);

CREATE TABLE event_tags (
    event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    tag_id              INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, tag_id)
);
```

---

## 4. Core Events Table

```sql
CREATE TABLE events (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by                  UUID REFERENCES organizer_accounts(id),   -- NEW

    event_type                  TEXT NOT NULL CHECK (event_type IN ('hackathon','workshop','internship')),
    title                       TEXT NOT NULL,
    slug                        TEXT NOT NULL UNIQUE,
    tagline                     TEXT,
    description                 TEXT NOT NULL,

    thumbnail_image_url         TEXT,
    banner_image_url            TEXT,
    document_url                TEXT,
    external_registration_url   TEXT,

    status                      TEXT NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','published','registration_closed','completed','hidden','archived')),
    flagged_reason               TEXT,                        -- set by platform admin if reported/hidden

    mode                        TEXT NOT NULL CHECK (mode IN ('online','offline','hybrid')),
    venue                       TEXT,                        -- NEW: e.g. "Kumaraguru College of Technology" (nullable if online)
    location_id                 INTEGER REFERENCES locations(id),   -- normalized city/state/country, NULL if fully online
    timezone                    TEXT NOT NULL DEFAULT 'Asia/Kolkata',  -- NEW: IANA identifier, not raw offset

    is_paid                     BOOLEAN NOT NULL DEFAULT FALSE,
    registration_fee            NUMERIC(10,2) DEFAULT 0,
    currency                    TEXT NOT NULL DEFAULT 'INR',
    fee_confidence               TEXT CHECK (fee_confidence IN ('explicit','inferred')) DEFAULT 'explicit',

    resume_required              BOOLEAN NOT NULL DEFAULT FALSE,

    registration_open_at         TIMESTAMPTZ,
    registration_close_at         TIMESTAMPTZ,
    event_start_at                 TIMESTAMPTZ NOT NULL,
    event_end_at                     TIMESTAMPTZ,


    eligibility_notes                  TEXT,                       -- freeform fallback, feeds embedding
    eligibility_confidence              TEXT CHECK (eligibility_confidence IN ('explicit','inferred')) DEFAULT 'explicit',

    registration_count                  INTEGER NOT NULL DEFAULT 0,  -- NEW: denormalized counter, updated on registration insert

    -- Search
    embedding                            VECTOR(1536),
    embedding_source_text                 TEXT,
    embedding_updated_at                   TIMESTAMPTZ,
    search_text_tsv                          TSVECTOR,

    created_at                                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at                                TIMESTAMPTZ
);



CREATE INDEX idx_events_search_tsv ON events USING GIN (search_text_tsv);

CREATE OR REPLACE FUNCTION events_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_text_tsv := to_tsvector('english', coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_tsv BEFORE INSERT OR UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION events_tsv_trigger();
```

---

## 5. Type-Specific Extension Tables

```sql
CREATE TABLE hackathon_details (
    event_id                UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,

    max_participants           INTEGER,                       -- NEW: optional cap on total participants/teams

    prize_summary_text             TEXT,                        -- e.g. "1st: 1L, 2nd: 50k + goodies"
    tracks                           TEXT[],                      -- e.g. {'FinTech','HealthTech'} -- could migrate to tags(category='theme') later
    submission_type                    TEXT                          -- 'idea' | 'prototype' | 'full-build'
);



CREATE TABLE workshop_details (
    event_id                 UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    speaker_name                TEXT,
    speaker_bio                   TEXT,
    duration_hours                 NUMERIC(4,1),
    seats_available                   INTEGER,
    certificate_provided                BOOLEAN DEFAULT FALSE,
    prerequisite_skills                    TEXT[]
);

CREATE TABLE internship_details (
    event_id                     UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    stipend_min                     NUMERIC(10,2),
    stipend_max                        NUMERIC(10,2),                -
    duration_months                        NUMERIC(4,1),
    work_mode                                TEXT CHECK (work_mode IN ('remote','onsite','hybrid')),
    positions_available                        INTEGER,
    min_experience_months                        INTEGER DEFAULT 0,
    perks                                          TEXT[]                        -- NEW: e.g. {'PPO','Certificate','LOR'}
    -- "Skills required" intentionally not duplicated here — use event_tags instead
);
```

---

## 6. Custom Registration Fields (NEW — was missing entirely)

```sql
CREATE TABLE event_custom_fields (
    id            SERIAL PRIMARY KEY,
    event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    label         TEXT NOT NULL,
    field_type    TEXT NOT NULL CHECK (field_type IN ('text','textarea','select','multiselect','file','checkbox','date','url')),
    options       JSONB,             -- for select/multiselect
    is_required   BOOLEAN DEFAULT FALSE,
    sort_order    SMALLINT DEFAULT 0
);
```

---

## 7. Event Contacts (per-event coordinator details)

Per-event coordinator contact info (e.g. faculty/student coordinators for a college hackathon).
This is intentionally **not** on the `organizations` table — an organization runs many events over time
with different coordinators each time.

```sql
CREATE TABLE event_contacts (
    id          SERIAL PRIMARY KEY,
    event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    phone       TEXT NOT NULL,
    email       TEXT NOT NULL,
    role_label  TEXT,                        -- e.g. 'Faculty Coordinator', 'Student Lead'
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_contacts_event ON event_contacts(event_id);
```

---

## 8. Registrations

```sql
CREATE TABLE event_registrations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id         UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','confirmed','waitlisted','cancelled')),
    payment_status   TEXT NOT NULL DEFAULT 'not_applicable' CHECK (payment_status IN ('pending','paid','failed','not_applicable')),
    registered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, user_id)
);

CREATE TABLE event_registration_responses (
    id               BIGSERIAL PRIMARY KEY,
    registration_id  UUID NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    field_id         INTEGER NOT NULL REFERENCES event_custom_fields(id) ON DELETE CASCADE,
    value            TEXT
);
```

> Bump `events.registration_count` on insert here (app-level or trigger — your choice).

---

## 9. Users (Students)

```sql
CREATE TABLE users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    email            TEXT NOT NULL UNIQUE,
    password_hash    TEXT,
    auth_provider    TEXT NOT NULL DEFAULT 'email',   -- NEW: 'email' | 'google' etc.
    phone            TEXT,
    resume_url       TEXT,
    college_name     TEXT,
    branch           TEXT,
    year_of_study    SMALLINT,
    city_id          INTEGER REFERENCES locations(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE saved_events (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    saved_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, event_id)
);
```

---

## 10. Search Analytics

```sql
CREATE TABLE search_query_log (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             UUID REFERENCES users(id),
    raw_query           TEXT NOT NULL,
    extracted_filters   JSONB,
    filters_relaxed     JSONB,
    results_count       INTEGER,
    clicked_event_id    UUID REFERENCES events(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 11. Indexes

```sql
CREATE INDEX idx_events_status_type ON events (status, event_type);
CREATE INDEX idx_events_location ON events (location_id);
CREATE INDEX idx_events_dates ON events (event_start_at, registration_close_at);
CREATE INDEX idx_events_embedding ON events USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_event_tags_tag ON event_tags (tag_id);
CREATE INDEX idx_event_eligibility_category ON event_eligibility (eligibility_category_id);
CREATE INDEX idx_event_registrations_event ON event_registrations (event_id);
CREATE INDEX idx_org_invitations_email ON organization_invitations (email);
CREATE INDEX idx_event_contacts_event ON event_contacts (event_id);


3. Ingestion Pipeline (Admin/Organizer Side)
[Organizer fills structured form]
        │
        ▼
1. Native widgets → direct columns (dates from date-pickers, fee from ticket widget,
   team size from number input) → fee_confidence/eligibility_confidence = 'explicit'
        │
        ▼
2. Freeform fields (description, "who can apply" text box) → JSON-mode LLM call
   → fills eligibility_notes/branches/education_levels when not explicitly chosen
   → sets confidence = 'inferred' for anything the LLM had to guess
        │
        ▼
3. Build embedding_source_text = title + tagline + description
   + tag names + eligibility_notes + prize_summary_text
        │
        ▼
4. Call embedding API → store in events.embedding, stamp embedding_updated_at
        │
        ▼
5. INSERT into events + relevant type_details table + event_tags, status='published'

On edit: any change to title/description/tags/eligibility_notes must re-trigger step 3–4 (re-embed). Flag this as a background job trigger, not inline in the request path, so edits stay fast.

Auto-publish safety net (since there's no approval queue):

organizations.is_verified — verify via college/company email domain match, shown as a badge.
Rate-limit new/unverified organizers (e.g., max 2 live listings until verified).
events.status = 'hidden' + flagged_reason — lets platform admins pull a listing instantly if reported, without needing a review queue upfront.
4. Search & Retrieval Flow (Client Side)

Your original flow is right; the one critical addition is progressive filter relaxation, because hard AND-ing every extracted filter will frequently return zero rows for a real event that's a near-match.

1. Extraction LLM → { semantic_term, location, eligibility, date_range, event_type, fee_max, ... }
2. Embedding API → query vector
3. Attempt STRICT query: all filters applied as WHERE clauses
4. If results < MIN_RESULTS (e.g. 3):
      relax filters in priority order and re-run:
        a) drop date_range (keep "upcoming only")
        b) drop eligibility (still show, but flag as "may not match eligibility")
        c) widen location (same state, or drop to online+offline all)
      log which filters were relaxed to search_query_log.filters_relaxed
5. Rank by similarity_score, weighted by:
      - exact tag match boost
      - is_verified organizer boost (optional, minor)
6. Return top N with a flag per result: exact_match | relaxed_match (so UI can show
   "Showing similar results outside Chennai" style messaging)

Example strict → relaxed SQL (illustrative):

sql
-- Strict pass
SELECT id, title, event_type, location_id, event_start_at,
       registration_close_at, eligibility_notes, eligibility_confidence,
       (1 - (embedding <=> $1)) AS similarity_score
FROM events
WHERE status = 'published'
  AND registration_close_at >= now()
  AND event_type = ANY($2)                 -- e.g. ['hackathon']
  AND location_id = $3
  AND $4 = ANY(branches)
  AND event_start_at BETWEEN $5 AND $6
ORDER BY similarity_score DESC
LIMIT 10;

-- If too few rows, re-run dropping location_id / branches predicate, etc

```
