import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { render } from './render.mjs';

export function codex(args) {
  const result = spawnSync('codex', ['mcp', ...args], { encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) throw Error(`Codex MCP ${args[0]} failed. Setup stopped. ${result.stderr || result.error?.message || ''}`);
  return result.stdout;
}
export async function setupAndRun({ runCodex = codex, score, csv, launcher = fileURLToPath(new URL('../connector/src/server.js', import.meta.url)), emit = console.log } = {}) {
  const registered = JSON.parse(runCodex(['list', '--json']));
  if (!Array.isArray(registered)) throw Error('Unexpected Codex server list. Setup stopped.');
  const matches = registered.filter(entry => entry.name === 'uproot-mcp');
  function verify() {
    const config = JSON.parse(runCodex(['get', 'uproot-mcp', '--json']));
    if (config.enabled === false || config.disabled_reason || config.disabled_tools?.includes('prioritize_prospects') ||
        (Array.isArray(config.enabled_tools) && !config.enabled_tools.includes('prioritize_prospects')) ||
        Object.keys(config.transport?.env || {}).length || config.transport?.env_vars?.length || config.transport?.cwd || config.transport?.type !== 'stdio' || !['node', process.execPath].includes(config.transport.command) ||
        JSON.stringify(config.transport.args) !== JSON.stringify([launcher])) {
      throw Error('Existing Uproot registration does not match this checkout or is disabled. It was not changed; no upload attempted.');
    }
  }
  if (!matches.length) throw Error('Uproot is not registered. Complete the README configuration edit first. No settings changed or upload attempted.');
  verify();
  emit('Registration verified. Calling prioritize_prospects through a temporary MCP client; prospect records will be sent to Uproot.');
  const result = await score(csv, `PLANNER-${randomUUID()}`);
  const html = render(result);
  return { result, html };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw Error('Usage: node scripts/setup-run.mjs [prospects.csv]');
    const csv = await readFile(process.argv[2] || new URL('../data/prospects.csv', import.meta.url), 'utf8');
    const { scoreProspects } = await import('../connector/src/run-client.js');
    const { result, html } = await setupAndRun({ csv, score: scoreProspects });
    const output = new URL('../output/', import.meta.url);
    await mkdir(output, { recursive: true });
    await writeFile(new URL('uproot-result.json', output), JSON.stringify(result, null, 2) + '\n');
    await writeFile(new URL('dashboard.html', output), html);
    console.log(`Uproot receipt: ${result.receipt_id}\nDashboard: ${fileURLToPath(new URL('dashboard.html', output))}`);
  } catch (error) {
    console.error(error.message);
    if (error.details) console.error(JSON.stringify(error.details));
    process.exitCode = 1;
  }
}
