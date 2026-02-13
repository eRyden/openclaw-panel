# Pipeline Stage Definitions

Each pipeline stage has a specific role, model, and skill set. When spawning agents for a stage, use the corresponding prompt template and skill instructions.

## Stage: Implement
**Model (code):** openai-codex/gpt-5.2-codex
**Model (creative):** anthropic/claude-sonnet-4-5
**Skills:** Coding Agent, Brainstorming (for architecture decisions)
**Role:** Build the thing. Read the spec, write the code, commit changes.
**Prompt includes:**
- Task spec and acceptance criteria
- Project repo path
- "You are a coding agent. Implement ALL changes directly. Do NOT spawn sub-agents."
- File context (which files to edit)

## Stage: Verify
**Model (code):** openai-codex/gpt-5.2-codex
**Skills:** Systematic Debugging (Phase 1-2: investigation + pattern analysis)
**Role:** Code review against spec. Find bugs, ID mismatches, missing error handling.
**Prompt includes:**
- Systematic debugging methodology (root cause investigation, pattern analysis)
- The task spec (what was supposed to be built)
- The git diff from Implement step
- "Review this code change against the spec. DO NOT fix anything — only report issues."
- If issues found: call /fail endpoint with details
- If clean: call /advance endpoint

## Stage: Test
**Model:** openai-codex/gpt-5.2-codex (needs to run code)
**Skills:** Systematic Debugging (Phase 3-4: hypothesis testing + verification)
**Role:** Actually run the code. Hit endpoints, verify behavior, check edge cases.
**Prompt includes:**
- Systematic debugging testing methodology
- The task spec as acceptance criteria
- Instructions to start server if needed, curl endpoints, verify responses
- "Test each acceptance criterion. Report pass/fail for each."
- If all pass: call /advance
- If failures: call /fail with specific test results

## Stage: Deploy
**Model:** openai-codex/gpt-5.2-codex
**Skills:** None (straightforward)
**Role:** Merge, restart, verify deployment.
**Prompt includes:**
- Git merge instructions (if using worktrees)
- PM2 restart command
- Quick smoke test (curl the endpoint, verify 200)
- Call /advance when deployed

## Creative Pipeline (task_type: creative)
Creative tasks skip Verify/Test/Deploy. Only stage is Implement (renamed "In Progress").
**Model:** anthropic/claude-sonnet-4-5
**Role:** Draft the content, save to appropriate location.
**On completion:** Advance straight to Done.
