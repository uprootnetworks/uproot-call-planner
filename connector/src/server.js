#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createUprootServer } from './app.js';
import { createService } from './service.js';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
  console.error('uproot-mcp requires Node.js 22.19 or newer.');
  process.exit(1);
}
try {
  const service = createService({ log(event) { process.stderr.write(JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n'); } });
  const server = createUprootServer({ service });
  const transport = new StdioServerTransport();
  const originalClose = transport.onclose;
  transport.onclose = () => { originalClose?.(); void service.close(); };
  await server.connect(transport);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    await server.close(); await service.close(); process.exit(0);
  });
} catch {
  console.error('uproot-mcp could not start. Check Node.js, dependencies and UPROOT_ORIGIN configuration.');
  process.exitCode = 1;
}
