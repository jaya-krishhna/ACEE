-- TSVector trigger for full-text search on events
-- This trigger automatically updates search_text_tsv on every INSERT or UPDATE

CREATE OR REPLACE FUNCTION events_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_text_tsv := to_tsvector('english', coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_tsv
BEFORE INSERT OR UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION events_tsv_trigger();
