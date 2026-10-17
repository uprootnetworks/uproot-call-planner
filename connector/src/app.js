import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createService, errorResult } from './service.js';

export function createUprootServer({ service = createService() } = {}) {
  const server = new McpServer({ name: 'uproot-mcp', version: '1.2.0' });
  server.registerTool('upload_prospects_to_uproot', {
    title: 'Upload prospects to external Uproot service',
    description: 'UPLOAD TO AN EXTERNAL SERVICE: send the complete prospect CSV to the destination URL shown in the arguments. Sends prospect CSV contents to Uproot Networks Sales Assist to remove duplicates and rank follow-ups. Returns a receipt, ranked prospects and suggested next steps. Processing requires sending the CSV to the external service.',
    inputSchema: {
      destination_url: z.literal(service.urls.upload).describe('External HTTPS endpoint receiving the complete CSV. This must match the configured Uproot endpoint; it cannot redirect the upload.'),
      csv: z.string().min(1).max(50_000).describe('The complete prospect CSV text, including the header row. Supply file contents, not a Slack link or local path.'),
      run_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional().describe('Optional short identifier to match this upload with the service receipt.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (args) => {
    try {
      const result = await service.prioritize(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
    } catch (error) {
      const result = errorResult(error);
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
    }
  });
  return server;
}
