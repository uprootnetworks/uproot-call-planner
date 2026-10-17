import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverPath = fileURLToPath(new URL('../src/server.js', import.meta.url));
const csv = await readFile(new URL('../fixtures/prospects.csv', import.meta.url), 'utf8');
async function connect(origin) {
  let diagnostics = '';
  const env = { ...process.env, UPROOT_ORIGIN: origin };
  // The fixture HTTP server lives on loopback, independent of corporate proxies.
  for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']) delete env[key];
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], env, stderr: 'pipe' });
  transport.stderr?.on('data', chunk => { diagnostics += chunk.toString(); });
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  await client.connect(transport);
  return { client, diagnostics: () => diagnostics, close: () => client.close() };
}
async function receiver(status = 201) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    requests.push({ method: req.method, path: req.url, body: JSON.parse(raw), run: req.headers['x-uproot-run-id'] });
    if (status !== 201) { res.writeHead(status); res.end('Denied by test fixture'); return; }
    const body = JSON.parse(raw);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ receipt_id: 'stdio-test-receipt', run_id: body.run_id, received_rows: 7, duplicates_removed: 1,
      ranked_prospects: Array.from({ length: 6 }, (_, i) => ({ name: 'Prospect ' + i, company: 'Fictional Company', priority: i + 1, suggested_next_step: 'Follow up.' })) }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { requests, origin: `http://127.0.0.1:${server.address().port}`, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

test('stdio discovery has no HTTP side effects; tool call performs one upload', async () => {
  const target = await receiver(); let connection;
  try {
    connection = await connect(target.origin);
    const { tools } = await connection.client.listTools();
    assert.deepEqual(tools.map(t => t.name), ['prioritize_prospects']);
    assert.equal(tools[0].annotations.readOnlyHint, false);
    assert.equal(target.requests.length, 0);
    const result = await connection.client.callTool({ name: 'prioritize_prospects', arguments: { csv, run_id: 'STDIO-1' } });
    assert.ok(!result.isError); assert.equal(result.structuredContent.receipt_id, 'stdio-test-receipt');
    assert.equal(target.requests.length, 1); assert.equal(target.requests[0].path, '/wp-json/uproot-demo/v1/enrich');
    assert.equal(target.requests[0].body.csv, csv); assert.equal(target.requests[0].run, 'STDIO-1');
    assert.ok(!connection.diagnostics().includes('jordan.ellis@'));
  } finally { await connection?.close(); await target.close(); }
});
test('denied HTTP becomes MCP tool error without retry or fake receipt', async () => {
  const target = await receiver(403); let connection;
  try {
    connection = await connect(target.origin);
    const result = await connection.client.callTool({ name: 'prioritize_prospects', arguments: { csv, run_id: 'STDIO-DENY' } });
    assert.equal(result.isError, true); assert.equal(result.structuredContent.http_status, 403);
    assert.equal(result.structuredContent.receipt_status, 'unconfirmed');
    assert.equal(result.structuredContent.receipt_id, undefined); assert.equal(target.requests.length, 1);
  } finally { await connection?.close(); await target.close(); }
});
test('MCP argument validation prevents malformed uploads', async () => {
  const target = await receiver(); let connection;
  try {
    connection = await connect(target.origin);
    const result = await connection.client.callTool({ name: 'prioritize_prospects', arguments: { csv, run_id: 'not/a/run' } });
    assert.equal(result.isError, true); assert.equal(target.requests.length, 0);
  } finally { await connection?.close(); await target.close(); }
});
