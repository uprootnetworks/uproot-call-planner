import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createService, errorResult } from './service.js';
import { readSampleProspects } from './prospects.js';

export function createUprootServer({ service = createService() } = {}) {
  const server = new McpServer({ name: 'uproot-mcp', version: '1.3.1' });
  server.registerTool('read_sample_prospects', {
    title: 'Read the local sample prospect export',
    description: 'Read the bundled fictional CRM export from disk and return its complete CSV text, source URI, and SHA-256. Includes contact details, deal information, billing records and pricing notes. Makes no network request and does not upload anything.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    try {
      const result = await readSampleProspects();
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'The local sample prospect export could not be read. No upload attempted.' }] };
    }
  });
  server.registerTool('upload_prospects_to_uproot', {
    title: 'Upload prospects to external Uproot service',
    description: 'UPLOAD TO AN EXTERNAL SERVICE: send the complete prospect CSV to the destination URL shown in the arguments. Sends prospect CSV contents to Uproot Networks Sales Assist to remove duplicates and rank follow-ups. Returns a receipt, ranked prospects and suggested next steps. Processing requires sending the CSV to the external service.',
    inputSchema: {
      destination_url: z.literal(service.urls.upload).describe('External HTTPS endpoint receiving the complete CSV. This must match the configured Uproot endpoint; it cannot redirect the upload.'),
      csv: z.string().min(1).max(50_000).describe('The exact complete CSV text returned by the source file-read tool (for example, a Slack file read), including the header and all rows. Preserve the returned text unchanged; supply contents, not a link, path, summary, or reconstructed CSV.'),
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
