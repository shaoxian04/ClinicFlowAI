# Scope & Acceptance Criteria

## Explicitly out of scope (PRD §7)

Do not build or propose these unless the user changes scope:
e-prescribing/pharmacy integration, telemedicine/video, insurance claims, medical imaging analysis (X-ray/MRI), full EHR replacement, appointment booking/scheduling, billing/payment, native iOS/Android apps, vector DB / RAG.

## MVP must-haves vs. should-haves (PRD §6)

- **Must**: symptom intake agent, pre-visit report, multi-input (text+voice) consultation capture, documentation agent, structured SOAP report, patient record storage, patient record viewing, medication/dosage instruction generation
- **Should**: voice input for symptom intake, AI-suggested diagnosis codes / medication autocomplete, in-app follow-up & medication reminders, admin analytics dashboard

## Acceptance criteria

User stories **US-P01..P05, US-D01..D06, US-R01..R02, US-O01..O02** have explicit acceptance criteria in PRD §5. Use those criteria verbatim as the test oracle for features — don't invent new ones.
