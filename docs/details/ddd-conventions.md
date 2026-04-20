# DDD Layering & Java Naming Conventions

Reference: [eyebluecn/smart-classroom-misc](https://github.com/eyebluecn/smart-classroom-misc). Follow this layering and the naming suffixes below for all Spring Boot code. Treat these as rules, not suggestions — reviewers will reject deviations.

## Module / package layering

The reference repo uses Maven sub-modules (`scm-domain`, `scm-application`, `scm-controller`, `scm-facade`, `scm-facade-impl`, `scm-infrastructure`, `scm-repository`, `scm-main`, `scm-utility`). For our MVP we collapse this into Java packages inside the `backend/` Gradle/Maven module, but the **dependency direction is identical**:

```
controller → application → domain ← infrastructure
```

Package layout under `backend/src/main/java/my/cliniflow/`:

```
domain/biz/<aggregate>/model/         — aggregate root + child entities + value objects (XxxModel)
domain/biz/<aggregate>/repository/    — repository interface + query objects
domain/biz/<aggregate>/service/       — domain services (XxxXxxDomainService)
domain/biz/<aggregate>/enums/         — enums (XxxStatus, XxxType)
domain/biz/<aggregate>/event/         — domain events (XxxDomainEvent)
domain/biz/<aggregate>/info/          — domain-layer DTOs / info carriers (XxxInfo)
application/biz/<aggregate>/          — application services (XxxReadAppService, XxxWriteAppService)
controller/biz/<route-group>/         — REST controller + request/response DTOs + converters
controller/base/                      — BaseController, WebResult, ResultCode
controller/config/                    — Web/Security/Exception config, interceptors
infrastructure/repository/<aggregate>/— repository implementations (JPA)
infrastructure/client/                — outbound clients (agent service, STT, GLM)
```

### Domain / application / infrastructure: organized by **aggregate**, not journey phase

Four aggregates, one package each:

- **`visit`** — `VisitModel` (root) owns `PreVisitReportModel`, `MedicalReportModel`, `PostVisitSummaryModel`, `MedicationModel` as child entities. All three patient-journey phases live under this one aggregate.
- **`patient`** — `PatientModel`.
- **`user`** — `UserModel` + RBAC.
- **`adaptiverule`** — `AdaptiveRuleModel` (Hermes). Primary storage is Neo4j via the agent service; Spring Boot keeps a thin read-side projection for the doctor-UI.

Do **not** split by patient-journey phase (previsit / visit / postvisit). The phases are HTTP-route concepts, not aggregate boundaries — splitting them at the domain layer violates the Visit aggregate rule and forces cross-package imports.

Do not cross-import between `biz/<aggregate>` packages — if two aggregates need to talk, go through an application service or a domain event.

### Controllers: organized by **HTTP route group**, not aggregate

Journey-phase URLs stay intact for the frontend, so controllers are grouped by URL path — multiple controllers may call into the same application service:

```
controller/biz/previsit/   → /api/pre-visit/**    → calls VisitWriteAppService
controller/biz/visit/      → /api/visits/**       → calls VisitRead / VisitWriteAppService
controller/biz/postvisit/  → /api/post-visit/**   → calls VisitReadAppService
controller/biz/patient/    → /api/patients/**     → calls PatientRead / PatientWriteAppService
controller/biz/auth/       → /api/auth/**         → calls UserReadAppService (login)
```

This separation keeps aggregate boundaries invisible to HTTP, while letting the UI path structure mirror the patient journey.

## Class naming conventions

Apply the matching suffix **exactly**. Read these as contracts, not stylistic preferences.

| Suffix | Layer | Role | Examples for our domain |
|---|---|---|---|
| `XxxModel` | domain/model | Aggregate root or entity. Owns invariants; exposes behavior, not setters where avoidable. | `VisitModel`, `MedicalReportModel`, `PatientModel`, `PreVisitReportModel`, `PostVisitSummaryModel`, `MedicationModel`, `AdaptiveRuleModel` |
| `XxxRepository` | domain/repository (interface) | Domain-owned persistence contract. **One per aggregate root only** — no `MedicalReportRepository` or `PreVisitReportRepository`. | `VisitRepository`, `PatientRepository`, `UserRepository`, `AdaptiveRuleRepository` |
| `XxxRepositoryImpl` | infrastructure/repository | JPA/Hibernate implementation of the domain interface. Maps `XxxModel` ↔ JPA entity. | `VisitRepositoryImpl` |
| `XxxQuery` | domain/repository/query | Query object for repository reads (pagination, filters). | `VisitPageQuery`, `PatientPageQuery` |
| `VerbNounDomainService` | domain/service | **One domain service per use-case / state transition**, not one per aggregate. Stateless. | `PreVisitReportCreateDomainService`, `MedicalReportGenerateDomainService`, `MedicalReportFinalizeDomainService`, `VisitStartDomainService`, `AdaptiveRuleProposeDomainService` |
| `XxxDomainEvent` | domain/event | Immutable event published when state transitions. | `VisitFinalizedDomainEvent`, `MedicalReportAmendedDomainEvent`, `PrescriptionIssuedDomainEvent` |
| `XxxInfo` / `XxxPayload` | domain/info | Domain-layer carriers (not JPA, not JSON). Used for cross-service calls or event payloads. | `AgentAgentRequestInfo`, `TranscriptInfo`, `RuleFeedbackPayload` |
| `XxxStatus` / `XxxType` / `XxxMethod` | domain/enums | Enums. | `VisitStatus`, `ReportStatus`, `UserRole`, `InputMethod` |
| `XxxReadAppService` | application | Orchestrates **read** use cases. Loads aggregates, maps to DTOs via a converter, returns to controller. **One per aggregate.** | `VisitReadAppService`, `PatientReadAppService`, `UserReadAppService`, `AdaptiveRuleReadAppService` |
| `XxxWriteAppService` | application | Orchestrates **write** use cases. `@Transactional`. Invokes domain services, publishes events. **One per aggregate.** | `VisitWriteAppService`, `PatientWriteAppService`, `AdaptiveRuleWriteAppService` |
| `XxxController` | controller | Thin REST layer. HTTP only — validation, auth, routing. Never contains business logic. | `VisitController`, `PreVisitController`, `PostVisitController` |
| `XxxRequest` | controller/.../request | Inbound HTTP DTO. Validated with Bean Validation. | `MedicalReportFinalizeRequest`, `PreVisitStartRequest`, `AudioUploadRequest` |
| `XxxDTO` | controller/.../response | Outbound HTTP DTO. No domain leaks. | `VisitDTO`, `MedicalReportDTO`, `PostVisitSummaryDTO` |
| `XxxModel2DTOConverter` | controller/.../converter | Explicit hand-written converter (or MapStruct interface). One per direction. | `VisitModel2DTOConverter`, `MedicalReportModel2DTOConverter` |
| `XxxClient` | infrastructure/client | Outbound client to an external service. Wraps resilience (Resilience4j) and correlation-ID propagation. | `AgentServiceClient`, `SpeechToTextClient`, `GlmClient` |

## CQRS split (read vs write)

The reference repo splits both application services and facades into Read / Write. **Adopt this.** Reads go through `XxxReadAppService`, writes through `XxxWriteAppService`. This makes it obvious where transactions apply (writes) and where caching is safe (reads).

Read services return DTOs directly. Write services return only the aggregate ID (or nothing) and let the caller re-read if it needs the full state.

## Domain service rule: one per state transition

Prefer `PaymentPaidDomainService`-style naming over `PaymentDomainService` catch-alls. A class like `VisitDomainService` is a red flag — break it into `VisitStartDomainService`, `VisitFinalizeDomainService`, etc. This keeps each service focused on one invariant and testable in isolation.

## Aggregate rule: `Visit` is the root

Per SAD §2.3.3, a `VisitModel` owns its three phase artifacts (`PreVisitReportModel`, `MedicalReportModel`, `PostVisitSummaryModel`). Access those children only through the `VisitModel`. Do not write `PreVisitReportRepository.save()` from outside the Visit aggregate boundary — go through `VisitWriteAppService`.

## Repository rule: interface in domain, impl in infrastructure

```
domain/biz/visit/repository/VisitRepository.java         — interface, no framework imports
infrastructure/repository/visit/VisitRepositoryImpl.java — @Repository bean, Spring Data JPA inside
```

One `XxxRepository` per aggregate root — not per child entity. There is **no** `PreVisitReportRepository` or `MedicalReportRepository`; children are loaded and saved through the root `VisitRepository`.

Application services depend on the **interface** (`VisitRepository`), never on the impl. Domain services too.

## Controller rule: no business logic, no direct repository calls

Controllers do three things: validate the request (Bean Validation), call one application service, wrap the result in `WebResult`. Anything more belongs in an `XxxReadAppService` / `XxxWriteAppService`.

## Converter rule: explicit, one per direction

`VisitModel2DTOConverter` goes from domain to controller DTO. Request DTOs are mapped into domain-layer info objects (`XxxInfo`) by the application service, not by the controller. Avoid auto-magic mapping on security-critical fields (role, visit ownership, `is_finalized`).

## Base classes / cross-cutting

- `BaseController` — common response wrapping, correlation-ID propagation
- `WebResult<T>` + `ResultCode` — unified response envelope for all endpoints
- `GlobalExceptionConfiguration` (`@ControllerAdvice`) — maps domain exceptions to HTTP status + `ResultCode`
- `AuthInterceptor` — JWT validation, role check, populates `SecurityContext`

## Example end-to-end slice: "Doctor finalizes medical report"

```
Controller:   VisitController.finalizeReport(id, MedicalReportFinalizeRequest)
              → VisitWriteAppService.finalizeReport(id, request.toInfo())
              → wraps result in WebResult

App service:  VisitWriteAppService
              - loads VisitModel via VisitRepository
              - calls MedicalReportFinalizeDomainService.finalize(visit, reportInfo)
              - saves VisitModel via VisitRepository
              - publishes MedicalReportAmendedDomainEvent (for adaptive-rule engine)

Domain svc:   MedicalReportFinalizeDomainService
              - enforces invariants (SOAP sections non-empty, contraindication flags acknowledged)
              - transitions MedicalReportModel.status → FINALIZED
              - computes edit diff vs AI original
              - sets gmt_modified

Repository:   VisitRepositoryImpl (infrastructure) persists via JPA

Event flow:   MedicalReportAmendedDomainEvent → AgentServiceClient.postRuleFeedback(diff)
              → Python agent learns a style rule (Hermes flow)
```

Keep every slice flowing controller → application → domain → infrastructure, in that order, with no back-references.
