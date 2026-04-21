```markdown
# ClinicFlowAI Development Patterns

> Auto-generated skill from repository analysis

## Overview

ClinicFlowAI is a TypeScript-based project (no major frontend framework detected) that implements both backend (Java, JPA) and frontend (React, TypeScript) components. The repository follows clear, conventional commit patterns and organizes code for modularity and maintainability. This skill documents the coding conventions and common workflows for contributing to ClinicFlowAI, including backend entity/repository creation, API endpoint development, frontend UI expansion, CSS theming, and end-to-end feature delivery.

## Coding Conventions

**File Naming**
- Use PascalCase for TypeScript/JavaScript files and components.
  - Example: `PatientList.tsx`, `UserProfile.tsx`
- CSS files follow standard lowercase with dashes.
  - Example: `globals.css`

**Import Style**
- Mixed: Both absolute and relative imports are used.
  - Example:
    ```typescript
    import React from 'react';
    import { Button } from '../components/Button';
    ```

**Export Style**
- Named exports are preferred.
  - Example:
    ```typescript
    export function PatientList() { ... }
    ```

**Commit Messages**
- Follows [Conventional Commits](https://www.conventionalcommits.org/).
  - Prefixes: `feat`, `fix`
  - Example: `feat: add patient search component`

## Workflows

### Add New JPA Entity and Repository
**Trigger:** When introducing a new domain model/table in the backend.  
**Command:** `/new-entity`

1. Create a new Model class in  
   `backend/src/main/java/my/cliniflow/domain/biz/[context]/model/`
   - Example: `PatientModel.java`
2. Create a new Repository interface in  
   `backend/src/main/java/my/cliniflow/domain/biz/[context]/repository/`
   - Example: `PatientRepository.java`

**Example:**
```java
// PatientModel.java
@Entity
public class PatientModel { ... }

// PatientRepository.java
public interface PatientRepository extends JpaRepository<PatientModel, Long> { ... }
```

---

### Add or Update Backend API Endpoint
**Trigger:** When exposing new backend functionality via REST API.  
**Command:** `/new-api-endpoint`

1. Add or update a Controller class in  
   `backend/src/main/java/my/cliniflow/controller/biz/[context]/`
2. Add or update Request/Response DTOs in  
   `backend/src/main/java/my/cliniflow/controller/biz/[context]/request/` and `/response/`
3. Add or update Application Service logic in  
   `backend/src/main/java/my/cliniflow/application/biz/[context]/`

**Example:**
```java
// PatientController.java
@RestController
public class PatientController { ... }

// CreatePatientRequest.java, CreatePatientResponse.java
public class CreatePatientRequest { ... }
public class CreatePatientResponse { ... }
```

---

### Add Frontend Component and Integrate
**Trigger:** When adding a new UI feature or visual element.  
**Command:** `/new-frontend-component`

1. Create a new component in  
   `frontend/app/components/` or a feature-specific subfolder.
   - Example: `PatientCard.tsx`
2. Update one or more page files in  
   `frontend/app/[section]/[...]/page.tsx` to use the new component.
3. Update `frontend/app/globals.css` with supporting styles if needed.

**Example:**
```typescript
// PatientCard.tsx
export function PatientCard({ patient }) { ... }
```

---

### Add Frontend Page or Section
**Trigger:** When introducing a new top-level or nested route in the frontend.  
**Command:** `/new-frontend-page`

1. Create a new page file in  
   `frontend/app/[section]/[subsection]/page.tsx`
2. Optionally create or update navigation components or layout wrappers.
3. Update `frontend/app/globals.css` if new styles are needed.

**Example:**
```typescript
// frontend/app/patients/list/page.tsx
export default function PatientListPage() { ... }
```

---

### Add or Update Shared CSS Theme
**Trigger:** When changing global styles, adding tokens, or improving accessibility.  
**Command:** `/update-css-theme`

1. Edit `frontend/app/globals.css` to add or update CSS variables, classes, or accessibility rules.
2. Optionally update related components or page files to use the new styles.

**Example:**
```css
:root {
  --primary-color: #0070f3;
}
```

---

### Implement Fullstack Feature with Both Backend and Frontend
**Trigger:** When delivering a new end-to-end feature or workflow.  
**Command:** `/new-fullstack-feature`

1. Add or update backend model/entity and repository.
2. Add or update backend application service and controller (API endpoint).
3. Add or update frontend page/component to consume the new API.
4. Update `frontend/app/globals.css` as needed.

**Example:**
- Backend: Add `AppointmentModel.java`, `AppointmentRepository.java`, `AppointmentController.java`
- Frontend: Add `AppointmentForm.tsx`, update `appointments/page.tsx`

---

## Testing Patterns

- Test files use the pattern `*.test.*` (e.g., `PatientList.test.tsx`)
- Testing framework is not explicitly detected; check project documentation or package.json for specifics.
- Place test files alongside the modules they test or in a dedicated `__tests__` folder.

**Example:**
```typescript
// PatientList.test.tsx
import { render } from '@testing-library/react';
import { PatientList } from './PatientList';

test('renders patient list', () => {
  ...
});
```

## Commands

| Command                | Purpose                                                        |
|------------------------|----------------------------------------------------------------|
| /new-entity            | Scaffold a new JPA entity and repository in the backend        |
| /new-api-endpoint      | Add or update a backend API endpoint and its DTOs              |
| /new-frontend-component| Create a new frontend React component and integrate it          |
| /new-frontend-page     | Add a new frontend page or section                             |
| /update-css-theme      | Update or extend the global CSS theme                          |
| /new-fullstack-feature | Implement a new feature spanning backend and frontend           |
```