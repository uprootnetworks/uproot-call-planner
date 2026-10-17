# Bundled connector

Source: https://github.com/uprootnetworks/uproot-mcp/tree/v1.1.0

The src files, pinned dependency lockfile, CSV fixture and JavaScript tests are copied from v1.1.0. Optional standalone client/upload scripts and WordPress files are omitted. Package scripts are reduced to start and test. No scoring or transport behavior is changed. Dependencies are installed by the agent using npm ci --ignore-scripts. No node_modules are distributed.
