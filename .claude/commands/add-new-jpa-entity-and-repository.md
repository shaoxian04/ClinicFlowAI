---
name: add-new-jpa-entity-and-repository
description: Workflow command scaffold for add-new-jpa-entity-and-repository in ClinicFlowAI.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-new-jpa-entity-and-repository

Use this workflow when working on **add-new-jpa-entity-and-repository** in `ClinicFlowAI`.

## Goal

Adds a new JPA entity and its corresponding repository in the backend domain layer.

## Common Files

- `backend/src/main/java/my/cliniflow/domain/biz/*/model/*Model.java`
- `backend/src/main/java/my/cliniflow/domain/biz/*/repository/*Repository.java`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create a new Model class in backend/src/main/java/my/cliniflow/domain/biz/[context]/model/
- Create a new Repository interface in backend/src/main/java/my/cliniflow/domain/biz/[context]/repository/

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.