---
name: add-or-update-backend-api-endpoint
description: Workflow command scaffold for add-or-update-backend-api-endpoint in ClinicFlowAI.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-update-backend-api-endpoint

Use this workflow when working on **add-or-update-backend-api-endpoint** in `ClinicFlowAI`.

## Goal

Implements a new backend API endpoint or updates an existing one, including request/response DTOs and controller wiring.

## Common Files

- `backend/src/main/java/my/cliniflow/controller/biz/*/*.java`
- `backend/src/main/java/my/cliniflow/controller/biz/*/request/*.java`
- `backend/src/main/java/my/cliniflow/controller/biz/*/response/*.java`
- `backend/src/main/java/my/cliniflow/application/biz/*/*.java`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Add or update a Controller class in backend/src/main/java/my/cliniflow/controller/biz/[context]/
- Add or update Request/Response DTOs in backend/src/main/java/my/cliniflow/controller/biz/[context]/request/ and /response/
- Add or update Application Service logic in backend/src/main/java/my/cliniflow/application/biz/[context]/

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.