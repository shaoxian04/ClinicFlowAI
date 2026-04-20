# API Surface (SAD §2.2.2)

## Spring Boot (external, JWT-authenticated)

- `POST /api/pre-visit/start`
- `GET /api/visits/{id}`
- `POST /api/visits/{id}/audio`
- `POST /api/visits/{id}/notes-text`
- `PUT /api/visits/{id}/report`
- `GET /api/post-visit/{visitId}/summary`

## Python agent (internal, service-token-authenticated)

- `POST /agents/pre-visit/start` + continue step
- `POST /agents/visit/generate` (body: transcript or text)
- `POST /agents/post-visit/generate`
- `POST /agents/rules/feedback`

The Python agent service is **never** exposed through Nginx. Only Spring Boot may reach it.
