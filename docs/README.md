# Documentation Index

A map of the documentation set, intended to make it obvious which file to read for a given task and
which audience it serves.

| File                                          | Audience               | Purpose                                                                      |
| --------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| `README.md`                                   | Users, evaluators      | Quick start, project overview, and entry points to commands/examples.        |
| `examples/README.md`                          | Users                  | Lists available examples and how to run them (generic runner, showcase).     |
| `examples/showcase/README.md`                 | Users                  | Deep dive into the HTMX showcase routes, demos, and endpoints.               |
| `docs/README.md`                              | Everyone               | This index—explains where to find design docs, guides, and historical notes. |
| `CLAUDE.md`                                   | Maintainers, AI agents | Comprehensive architecture brief for assistants collaborating on the repo.   |
| `AGENTS.md`                                   | Contributors           | High-level repository guardrails (structure, workflow expectations).         |
| `TODO.md`                                     | Maintainers            | Active backlog items that did not make the current release.                  |
| `MIGRATION_STATUS.md`                         | Maintainers            | Status log of the interface-based effects migration (kept for context).      |
| `docs/troubleshooting.md`                     | Users, operators       | Common runtime/dev issues and fixes.                                         |
| `docs/TESTING.md`                             | Contributors           | Testing strategy, targets, and known gaps.                                   |
| `docs/TEST_COVERAGE_REPORT.md`                | Contributors           | Snapshot of module-level coverage health.                                    |
| `docs/resource-usage.md`                      | Contributors           | How to use `use()`/resource scopes safely.                                   |
| `docs/resource-raii-design.md`                | Contributors           | Design rationale behind the resource/RAII handler architecture.              |
| `docs/cancellation-design.md`                 | Contributors           | Comprehensive cancellation design spec (context + decisions).                |
| `docs/cancellation-implementation-summary.md` | Contributors           | Concise summary of what shipped for cancellation plus examples touched.      |
| `docs/improvements.md`                        | Maintainers            | Brainstormed enhancements and medium/long-term ideas.                        |
| `docs/archive/guide-v0.2.md`                  | Historical             | Archived guide for the pre-cancellation surface (read-only).                 |
| `docs/archive/migration-v0.3.md`              | Historical             | Archived migration instructions from v0.2 → v0.3 (kept for posterity).       |

This table intentionally excludes generated artifacts (coverage reports, build outputs) so readers
can focus on maintained content.
