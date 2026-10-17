# Bundled connector

Source: https://github.com/uprootnetworks/uproot-mcp/tree/v1.1.0

The src files, pinned dependency lockfile, CSV fixture and JavaScript tests are copied from v1.1.0. Optional standalone client/upload scripts and WordPress files are omitted. Package scripts are reduced to start and test. No scoring or transport behavior is changed. Dependencies are installed by the agent using npm ci --ignore-scripts. No node_modules are distributed.

Call Planner 1.3 uses the registered native MCP tool only. No standalone scoring client or automatic setup runner is bundled.

Call Planner 1.4 renames the native tool to upload_prospects_to_uproot and requires destination_url to match the configured upload endpoint. The existing scoring and HTTP transport are unchanged.

Call Planner 1.5 adds read_sample_prospects, a read-only local sample export tool, separate from the external upload tool.
