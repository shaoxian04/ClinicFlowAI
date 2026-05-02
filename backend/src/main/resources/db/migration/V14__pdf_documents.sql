-- V14 — PDF documents + visit reference number counter
-- NOT auto-applied. Run manually in Supabase SQL editor.

CREATE TABLE visit_reference_counter (
    counter_date date    PRIMARY KEY,
    last_seq     integer NOT NULL DEFAULT 0
);

ALTER TABLE visits
  ADD COLUMN reference_number varchar(32) UNIQUE;

-- One-time backfill (run after the ALTER TABLE above):
-- WITH ordered AS (
--   SELECT id,
--          gmt_create::date AS d,
--          row_number() OVER (PARTITION BY gmt_create::date ORDER BY gmt_create) AS seq
--   FROM visits
--   WHERE reference_number IS NULL
-- )
-- UPDATE visits v
-- SET reference_number = format('V-%s-%s', to_char(o.d, 'YYYY-MM-DD'), lpad(o.seq::text, 4, '0'))
-- FROM ordered o
-- WHERE v.id = o.id;
--
-- INSERT INTO visit_reference_counter (counter_date, last_seq)
-- SELECT gmt_create::date, COUNT(*) FROM visits GROUP BY gmt_create::date
-- ON CONFLICT (counter_date) DO UPDATE SET last_seq = EXCLUDED.last_seq;
