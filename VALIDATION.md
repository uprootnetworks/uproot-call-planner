# Validation — October 17, 2026

## Current configuration-first flow (version 1.2)

- 8 planner tests passed: confirmed-result rendering and escaping, unchanged CSV delivery, missing/conflicting/disabled registration, configuration-read denial, and no retry after scoring denial.
- The scoring helper issues only `codex mcp list` and `get`. It never issues `add` or writes configuration. Missing registration stops before scoring.
- README instructions require a separate native configuration edit before dependency installation or project-script execution. The obsolete preflight and registration scripts are removed.
- No real Codex settings were modified and no live upload was performed for this revision.

## Previous checks still applicable to unchanged components

- 16 connector tests passed in version 1.1, including real stdio discovery and tool calls against a loopback receiver. The immediate client sent exactly one unchanged CSV on success and on HTTP 403; it closed afterward. Connector code is unchanged in version 1.2.
- Desktop and phone layouts checked in headless Chrome. The dashboard loads no external resources. Preview and screenshot show illustrative synthetic data, not service results.
- Fresh dependency installation completed with the bundled lockfile and --ignore-scripts.

## Still requires corporate rehearsal

A fresh Codex chat must be tested to confirm that it follows the revised order and attempts a separate file write. Your hooks determine whether that edit is detected or blocked. Script execution may later trigger another rule. Detection alone does not establish prevention. Native agent edits and their preservation of unrelated real configuration have not been exercised by these automated tests. Client approval may still occur before configuration editing or scoring.
