## Debugging Protocol

Once the server is run, (bun run dev).
it is available at http://localhost:5173

Use the webapp-testing skill at
/mnt/skills/user/webapp-testing/SKILL.md
or
/Users/andrew.harrison/.claudework/skills/webapp-testing/SKILL.md

For debugging, follow this sequence every time:
1. Take a screenshot to see current state
2. Capture browser console logs — prose-ai uses [prose-ai] prefixed warnings
   for all LLM/validation issues
3. Interact with the UI (type text, click analyze, click accept/reject)
4. Capture console output after each interaction
5. Take another screenshot to see result

Console log capture is in: skills/webapp-testing/examples/console_logging.py

For prose-ai specifically, the relevant console output is:
- [prose-ai] warn messages from validateOutput (dropped suggestions)
- [prose-ai] info messages from mapper (fuzzy matches)
- [prose-ai] error messages from the toolbar catch block
- Any uncaught JS errors (type: error in console capture)
