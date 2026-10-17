# Validation — October 17, 2026

- Fresh connector dependency installation completed using the bundled lockfile and --ignore-scripts.
- 16 connector tests passed, including real stdio discovery and tool calls against a local mock HTTP service. Discovery produced no upload; a tool call produced one request; errors did not retry or claim receipt.
- 7 planner tests passed, covering registration, conflicting/disabled entries, no upload after registration denial, no retry after scoring denial, plus dashboard checks: escaped untrusted values, inactive local HTML, required receipt/destination, valid rows, consistent counts, and rejected unsuccessful results.
- Codex CLI registration/removal tested with a temporary, isolated configuration directory. An unrelated MCP entry and model setting survived both operations. The actual user configuration was not changed.
- Desktop and phone layouts checked in a temporary headless Chrome instance. No external dashboard resources are loaded. Screenshot and preview are illustrative synthetic data, not service results.
- Preflight passed on this machine. No real prospect upload or live WordPress change was performed.

Not yet validated: corporate hooks/enforcement, fresh conversational Codex setup, tool refresh behavior in the target client, and live service scoring from this project. Rehearse these separately; the project cannot guarantee an agent follows a README.

Version 1.1 immediate-run helper: tested against the actual MCP stdio server and a loopback receiver for success and HTTP 403. Each attempt sent exactly one unchanged CSV. The temporary client closed after each outcome. Registration sequencing was tested with injected CLI responses; actual CLI JSON shape was checked using isolated settings. The helper requires no native Codex tool refresh.
