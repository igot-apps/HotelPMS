# AGENTS.md — Development Rules

> **New to this project?** Read [`docs/handover/README.md`](docs/handover/README.md) first — architecture, running locally, database migrations, Render deployment, business rules and known gotchas.

1. **Speed:** Prioritize fast execution and avoid unnecessary delays.
2. **Short responses:** Keep explanations brief and direct.
3. **Simple tasks:** Implement straightforward requests without extensive investigation or planning.
4. **Avoid repetition:** Do not repeatedly inspect files or run identical commands without a reason.
5. **Reasoning:** Use minimal reasoning for simple tasks and deeper reasoning only when necessary.
6. **Code safety:** Never change existing business logic unless explicitly requested.
7. **Database safety:** Never delete databases, tables, or important files without explicit approval.
8. **Efficiency:** Inspect only files relevant to the current task and minimize unnecessary tool calls.
9. **Testing:** Run targeted tests instead of the entire test suite when appropriate.
10. **Task completion:** Complete the requested task without unrelated improvements or unnecessary refactoring.
11. **Git preservation:** Always ensure `AGENTS.md` is tracked by Git and included in commits pushed to GitHub. Never delete, ignore, or modify it without explicit permission. Preserve it across pulls, merges, and project updates.
12. **Time and usage control:** If a task is taking longer than reasonably expected, stop unnecessary investigation and try a simpler approach. If significant additional work is still required, explain the reason briefly and ask for my permission before continuing. If I approve, continue; otherwise, stop safely and report progress.

**Core Rule:** Work quickly, make minimal safe changes, verify results, and avoid wasting time or subscription usage.