# The Continuous Build Workflow

Every time you finish a logical chunk of work, follow these 4 steps:

1. **Finish & Test**

   * Build and verify the new feature.

2. **Run "Context Sync"**

   * Prompt the AI to update the documentation.

3. **Update the Documentation**

   * Move the feature to **Completed** in `CURRENT_PROGRESS.md` and set the new **Next Up**.
   * Add the new endpoints to `API.md`.
   * Only update `BUSINESS_RULES.md` or `CODING_STANDARDS.md` if new logic or coding patterns were introduced.

4. **Output Only Modified Files**

   * Tell the AI to output **only the modified files** so you can copy and paste them into your project.
