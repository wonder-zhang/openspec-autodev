# Project Development Constitution / 项目开发宪法

## Core Principles

This project uses OpenSpec + Superpowers fully automated development workflow (via `openspec-autodev` plugin).
**After requirements are confirmed, all phases MUST complete automatically except at one explicit human checkpoint.**

One legitimate human wait point:
1. After Phase 4: Show development summary, wait for user confirmation to finalize

## Phase 0: Requirements Clarification (Only open interaction phase)
- Use `brainstorming` skill, execute `/opsx:explore <feature-name>`
- Display proposal.md, wait for explicit "confirm"
- Write initial state to `.claude/workflow-state.json`

## Phase 1: Spec Generation (Automatic)
- Execute `/opsx:new <feature-name>` then `/opsx:ff`
- Output: proposal.md / specs.md / design.md / tasks.md
- Proceed to Phase 2 immediately

## Phase 2: Environment Setup (Automatic)
- `using-git-worktrees`: Create feat/<feature> branch and Worktree
- `writing-plans`: Decompose tasks.md into 2-5 min micro-tasks
- **Dependency analysis**: Analyze micro-task dependencies + file ownership → generate parallel batches
- Sub-agents MUST read specs.md and design.md, NEVER rely on conversation history

## Phase 3: TDD Execution (Automatic, parallel-batch sub-agents)
- Sub-agents execute in **PARALLEL BATCHES** (independent tasks run simultaneously per batch)
- Batches execute serially: wait for all tasks in current batch before starting next batch
- Strict Red-Green-Refactor cycle per micro-task (unchanged within each sub-agent)
- File-level isolation: sub-agents in the same batch MUST NOT modify the same file
- On failure: `systematic-debugging`, no user pause, max 3 retries per task
- Failed tasks in a batch do NOT block other tasks in the same batch
- Skip after 3 failures, flag in Phase 4 summary

## Phase 4: Wrap-up and Summary
- `verification-before-completion` + `requesting-code-review`
- `/opsx:archive <feature>` + `finishing-a-development-branch`
- **PAUSE: Show summary, wait for user confirmation ①**
- User confirms → Final report → Workflow complete

## Technical Constraints

### Code Standards
- Language/Framework: [Auto-detected or user-specified]
- Test framework: [Auto-detected or user-specified]
- All new files MUST have tests
- Commit: `feat(<feature>): <description>`

### OpenSpec: NEVER modify `openspec/specs/` directly
### Security: NEVER output Secrets/Tokens; NEVER modify .env/credentials/.pem/.key/.crt/.claude/settings.json
### State: Update `.claude/workflow-state.json` after each phase; check on session start
