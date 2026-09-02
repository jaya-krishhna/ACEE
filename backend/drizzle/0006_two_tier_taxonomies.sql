-- Migration: 0006_two_tier_taxonomies.sql
-- Add organization_id and is_system to tags and eligibility_categories
-- Backfill existing rows as system rows
-- Replace single UNIQUE constraints with two partial unique indexes per table

-- 1. TAGS TABLE
ALTER TABLE tags ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing tags as system rows
UPDATE tags SET is_system = true, organization_id = NULL;

-- Drop old unique constraints / indexes on tags
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_slug_key;
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key;
DROP INDEX IF EXISTS tags_slug_key;
DROP INDEX IF EXISTS tags_name_key;

-- Create partial unique indexes on tags
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_slug_system ON tags (slug) WHERE is_system = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_org_slug_custom ON tags (organization_id, slug) WHERE is_system = false;


-- 2. ELIGIBILITY CATEGORIES TABLE
ALTER TABLE eligibility_categories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE eligibility_categories ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing eligibility_categories as system rows
UPDATE eligibility_categories SET is_system = true, organization_id = NULL;

-- Re-calculate slug from name for eligibility_categories to respect any user modifications
UPDATE eligibility_categories 
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(name), '\s+', '-', 'g'), '[^a-zA-Z0-9-]', '', 'g'), '-+', '-', 'g'));

-- Drop old unique constraints / indexes on eligibility_categories
ALTER TABLE eligibility_categories DROP CONSTRAINT IF EXISTS eligibility_categories_slug_key;
ALTER TABLE eligibility_categories DROP CONSTRAINT IF EXISTS eligibility_categories_name_key;
DROP INDEX IF EXISTS eligibility_categories_slug_key;
DROP INDEX IF EXISTS eligibility_categories_name_key;

-- Create partial unique indexes on eligibility_categories
CREATE UNIQUE INDEX IF NOT EXISTS idx_eligibility_categories_slug_system ON eligibility_categories (slug) WHERE is_system = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_eligibility_categories_org_slug_custom ON eligibility_categories (organization_id, slug) WHERE is_system = false;
