# Development Memory System

This directory is the **working memory** for AI-assisted development on the Collage Maker project. It complements the persistent instructions in `.github/copilot-instructions.md` with session-specific discoveries, patterns, and active work notes.

## Purpose

Track patterns, decisions, and lessons learned during development so that:
- AI assistants can provide context-aware suggestions based on past discoveries
- Team knowledge accumulates over time rather than being lost between sessions
- Debugging patterns and solutions are reusable across similar problems

## Two Types of Memory

| Type | Location | Committed? | Purpose |
|------|----------|-----------|---------|
| **Persistent** | `.github/copilot-instructions.md` | ✅ Yes | Foundational principles, workflows, agent roles — stable across all sessions |
| **Working** | `.github/memory/` | Varies | Session discoveries, patterns, active notes — evolves with the project |

## Directory Structure

```
.github/memory/
├── README.md                  # This file — explains the system
├── session-notes.md           # Historical session summaries (committed)
├── patterns-discovered.md     # Accumulated code patterns (committed)
└── scratch/
    ├── .gitignore             # Ignores all files in this directory
    └── working-notes.md       # Active session notes (NOT committed)
```

### `session-notes.md` — Historical Record
- Documents completed sessions as permanent reference
- Written at the **end of a session** by summarizing key findings
- **Is committed to git** — becomes part of the project's institutional memory
- Future AI sessions read this to understand what has been tried, decided, and learned

### `patterns-discovered.md` — Accumulated Patterns
- Documents recurring code patterns, idioms, and architectural decisions
- Added to whenever a new pattern emerges during development
- **Is committed to git** — grows over the life of the project
- AI reads this to apply established patterns consistently

### `scratch/working-notes.md` — Active Session Notes
- Captures your thinking during the **current session only**
- Used during TDD cycles, debugging, and refactoring
- **NOT committed** (`.gitignore` excludes all files in `scratch/`)
- At session end: summarize key findings into `session-notes.md`, then discard

## When to Use Each File

### During a TDD Cycle
1. **Start**: Read `patterns-discovered.md` for relevant test patterns
2. **During RED phase**: Note failing test approach in `scratch/working-notes.md`
3. **During GREEN phase**: Note implementation decisions in `scratch/working-notes.md`
4. **After REFACTOR**: If a new pattern emerged, add it to `patterns-discovered.md`
5. **End of session**: Summarize cycle outcomes in `session-notes.md`

### During Debugging
1. **Start**: Check `session-notes.md` for prior encounters with similar issues
2. **During investigation**: Log hypotheses and findings in `scratch/working-notes.md`
3. **After resolution**: Document root cause and fix pattern in `patterns-discovered.md`
4. **End of session**: Add to `session-notes.md` if it was a significant discovery

### During Linting / Code Quality Work
1. **Start**: Check `patterns-discovered.md` for known lint patterns
2. **During work**: Track issue categories in `scratch/working-notes.md`
3. **After completion**: Document any systematic patterns found

## How AI Reads and Applies These Patterns

At the start of each session, AI assistants should:
1. Read `.github/copilot-instructions.md` for foundational context
2. Read `.github/memory/patterns-discovered.md` for established code patterns
3. Read `.github/memory/session-notes.md` for recent history and decisions
4. Check `.github/memory/scratch/working-notes.md` if continuing an active session

During development, the AI applies patterns from `patterns-discovered.md` automatically — for example, if a pattern documents that service arrays should be initialized as `[]` (not `null`), the AI will apply this consistently without being told each time.

## The Session Lifecycle

```
Session Start
    │
    ▼
Read session-notes.md + patterns-discovered.md
    │
    ▼
Create/update scratch/working-notes.md (active work)
    │
    ▼
    ... development work ...
    │
    ▼
Session End: summarize into session-notes.md
    │
    ▼
If new patterns found: add to patterns-discovered.md
    │
    ▼
scratch/working-notes.md is ephemeral — not committed
```
