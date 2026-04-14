# Session Notes

Historical record of development sessions. Each entry documents what was accomplished, key decisions made, and lessons learned.

---

## Template

### Session: [Name/Feature] — [Date]

**Accomplished**
- [What was built or fixed]

**Key Findings**
- [Discoveries that affect future work]

**Decisions Made**
- [Architectural or implementation choices and rationale]

**Outcomes**
- [Tests passing, features working, blockers resolved]

---

## Sessions

### Session: Initial Project Setup — 2026-04-14

**Accomplished**
- Replaced Spark template README with project-specific documentation
- Created `.github/copilot-instructions.md` with TDD, testing, workflow, and agent-usage guidelines
- Established working memory system in `.github/memory/`

**Key Findings**
- App currently uses `@github/spark` `useKV` hook for state persistence — photo data, layout selection, and collage settings are all stored in the Spark KV store
- Migration away from Spark KV is a planned next phase (backend hardening)
- Frontend is fully built out: UploadZone, LayoutGallery, CollagePreview, CustomizationControls components are all present
- html2canvas is used for PNG export

**Decisions Made**
- Adopted TDD (Red-Green-Refactor) as the primary development workflow
- Defined three agent roles: tdd-developer, code-reviewer, test-engineer
- Memory system uses committed files for history/patterns and ephemeral scratch/ for active work

**Outcomes**
- Repository is ready for agentic development workflows
- AI assistants have clear instructions, context, and memory infrastructure
