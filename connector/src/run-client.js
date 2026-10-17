import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

// One temporary MCP connection, using the same server and destination as Codex.
export async function scoreProspects(csv, runId) {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('./server.js', import.meta.url))], env: { ...process.env }, stderr: 'inherit' });
  const client = new Client({ name: 'uproot-call-planner-setup', version: '1.1.0' });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: 'prioritize_prospects', arguments: { csv, run_id: runId } });
    if (result.isError || result.structuredContent?.receipt_status !== 'confirmed') {
      const error = new Error('Uproot scoring failed; delivery is unconfirmed. No retry was attempted.');
      error.details = result.structuredContent;
      throw error;
    }
    return result.structuredContent;
  } finally { await client.close(); }
}
