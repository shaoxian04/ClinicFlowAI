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

-- Seed doctor row for schedule-related integration tests (Phase 1+).
-- doctor_id = 00000000-0000-0000-0000-000000000020
-- user_id   = 00000000-0000-0000-0000-000000000001 (DOCTOR user seeded above)
MERGE INTO doctors (id, user_id, mmc_number, specialty, is_accepting_patients) KEY(id) VALUES
    ('00000000-0000-0000-0000-000000000020',
     '00000000-0000-0000-0000-000000000001',
     'MMC-DEMO', 'General', TRUE);

-- Seed STAFF user for ScheduleController integration tests (Task 4.2).
-- user_id = 00000000-0000-0000-0000-000000000003
-- password = "password" (bcrypt cost 10)
MERGE INTO users (id, email, password_hash, role, full_name, is_active) KEY(id) VALUES
    ('00000000-0000-0000-0000-000000000003',
     'staff@demo.local',
     '$2a$10$AdJhIOYNdcRG/jSVWK.V7u6300yExmv1Z5/.AcFRYZwS9nfyHIZai',
     'STAFF', 'Staff Demo', TRUE);

-- Seed ADMIN user for ScheduleTemplateController integration tests (Task 4.3).
-- user_id = 00000000-0000-0000-0000-000000000004
-- password = "password" (bcrypt cost 10)
MERGE INTO users (id, email, password_hash, role, full_name, is_active) KEY(id) VALUES
    ('00000000-0000-0000-0000-000000000004',
     'admin@demo.local',
     '$2a$10$AdJhIOYNdcRG/jSVWK.V7u6300yExmv1Z5/.AcFRYZwS9nfyHIZai',
     'ADMIN', 'Admin Demo', TRUE);
