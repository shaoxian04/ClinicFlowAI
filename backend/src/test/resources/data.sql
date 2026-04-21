-- Seed data for integration tests. BCrypt hash = "password" (cost 10).

INSERT INTO users (id, email, password_hash, role, full_name, is_active) VALUES
    ('00000000-0000-0000-0000-000000000001',
     'doctor@demo.local',
     '$2a$10$7EqJtq98hPqEX7fNZaFWoOa8B.M5oVbJgPdK0ZaVqfPPpP3gbAOoa',
     'DOCTOR', 'Dr. Demo', TRUE),
    ('00000000-0000-0000-0000-000000000002',
     'patient@demo.local',
     '$2a$10$7EqJtq98hPqEX7fNZaFWoOa8B.M5oVbJgPdK0ZaVqfPPpP3gbAOoa',
     'PATIENT', 'Pat Demo', TRUE);

INSERT INTO patients (id, user_id, full_name, date_of_birth, gender, phone, email) VALUES
    ('00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000002',
     'Pat Demo', '1990-01-01', 'OTHER', '+60-12-000-0000', 'patient@demo.local');
