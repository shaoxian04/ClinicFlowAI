-- Seed data for integration tests.
-- BCrypt hash below = "password" (cost 10), generated via BCryptPasswordEncoder.encode("password").
-- MERGE INTO ... KEY(id) is H2-native upsert: idempotent across multiple context startups.

MERGE INTO users (id, email, password_hash, role, full_name, is_active) KEY(id) VALUES
    ('00000000-0000-0000-0000-000000000001',
     'doctor@demo.local',
     '$2a$10$AdJhIOYNdcRG/jSVWK.V7u6300yExmv1Z5/.AcFRYZwS9nfyHIZai',
     'DOCTOR', 'Dr. Demo', TRUE);

MERGE INTO users (id, email, password_hash, role, full_name, is_active) KEY(id) VALUES
    ('00000000-0000-0000-0000-000000000002',
     'patient@demo.local',
     '$2a$10$AdJhIOYNdcRG/jSVWK.V7u6300yExmv1Z5/.AcFRYZwS9nfyHIZai',
     'PATIENT', 'Pat Demo', TRUE);

MERGE INTO patients (id, user_id, full_name, date_of_birth, gender, phone, email) KEY(id) VALUES
    ('00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000002',
     'Pat Demo', '1990-01-01', 'OTHER', '+60-12-000-0000', 'patient@demo.local');
