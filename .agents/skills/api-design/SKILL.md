---
name: api-design
description: Reviews HTTP APIs and SDKs for clarity, consistency, and safety. Use when designing new endpoints or services.
---

# API Design Skill

## When to use

- When defining a new REST/GraphQL/gRPC API.
- When revising an existing API that is hard to use.
- When writing a client library or SDK around an API.

## Design checklist

1. **Names**:
   - Are resources and operations named consistently and intuitively?
2. **Structure**:
   - Are endpoints grouped logically and versioned clearly?
3. **Error handling**:
   - Are HTTP status codes used correctly?
   - Are error responses machine‑ and human‑readable?
4. **Contracts**:
   - Are request/response schemas clearly documented (e.g., OpenAPI or similar)?
5. **Security**:
   - Are authentication and rate‑limiting built in from the start?

## How to provide feedback

- Suggest concrete endpoint names and example JSON bodies.
- Propose a small, consistent convention for pagination, filtering, and sorting.
- Recommend documentation or schema tools that fit the project.