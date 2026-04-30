-- =============================================================================
-- CliniFlow AI — V10: Bootstrap initial admin user
-- Apply manually in Supabase SQL editor (Flyway is NOT used).
-- Idempotent: safe to re-run.
-- Prerequisites: V9__registration.sql applied.
--
-- The bcrypt hash below is for the literal password "ChangeMe-Admin-12345"
-- generated with BCrypt cost 12 (matches PasswordEncoder bean).
-- Generate a fresh hash if you want a different password:
--   python3 -c "import bcrypt; print(bcrypt.hashpw(b'YOUR-PASSWORD', bcrypt.gensalt(12)).decode())"
-- The admin will be forced to change this password on first login.
-- =============================================================================

INSERT INTO users (
    email,
    password_hash,
    role,
    full_name,
    is_active,
    must_change_password
)
VALUES (
    'admin@cliniflow.local',
    '$2a$12$/27p/HgrVXv3aOQJVuVWB.ctNIbTQczdHZ6bQd4MTKx.c6IGEMigq',
    'ADMIN',
    'Initial Administrator',
    true,
    true
)
ON CONFLICT (email) DO NOTHING;
