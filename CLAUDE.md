# CivilCheck Backend

## Tech Stack

- Node.js
- Express

## Stack

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL

## Goal

Help build a production-ready backend while preserving a clean architecture.

---

## Before making changes

Always:

1. Inspect the existing implementation first.
2. Explain your understanding.
3. Explain what you plan to change.
4. Wait for approval before writing code.

Do not assume my documents are always correct.
If the codebase or current library versions suggest a better approach, explain why before proceeding.

---

## Coding Rules

- Keep controllers thin.
- Put business logic into services.
- Use Prisma for database access.
- Use TypeScript strict types.
- Avoid `any`.
- Reuse existing code whenever possible.
- Do not introduce new dependencies unless necessary.

---

## Scope

Only modify files needed for the requested task.

Do not perform unrelated:

- formatting
- renaming
- refactoring
- cleanup

unless explicitly requested.

---

## Quality

Before finishing:

- Review your own code.
- Look for bugs.
- Look for race conditions.
- Look for security issues.
- Mention any improvements you noticed but did not implement.

---

## Response Style

Be concise.

When coding:

1. Explain the plan.
2. Implement.
3. Summarize changes.
4. Mention anything I should test.

- TypeScript
- Prisma
- PostgreSQL

## Architecture Rules

- Controllers contain only request/response logic.
- Business logic belongs in services.
- Database access goes through Prisma.
- Validate all external input with Zod.
- Never use `any` unless explicitly justified.

## Coding Standards

- Follow the existing folder structure.
- Do not rename APIs unless requested.
- Do not introduce new dependencies unless required.
- Keep changes focused on the requested task.
- Preserve backward compatibility where possible.

## Before Every Change

1. Inspect the existing implementation.
2. Explain the current approach.
3. Explain the proposed change.
4. Wait for approval before writing code.

## After Every Change

- Review your implementation.
- Look for edge cases.
- Mention any follow-up work.
