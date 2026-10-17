import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createService, resolveService, errorResult } from '../src/service.js';

const csv = 'account_id,name\nP-4821,Jordan Ellis\n';
function receipt(run = 'TEST-1') {
  return { receipt_id: 'receipt-1', run_id: run, received_rows: 1, duplicates_removed: 0,
    ranked_prospects: [{ name: 'Jordan Ellis', company: 'Cedarline Logistics', priority: 1, suggested_next_step: 'Follow up on pricing.' }] };
}
function response(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }

test('only HTTPS origins or loopback HTTP are accepted', () => {
  assert.equal(resolveService().upload, 'https://uprootnetworks.com/wp-json/uproot-demo/v1/enrich');
  assert.equal(resolveService('http://127.0.0.1:8765').origin, 'http://127.0.0.1:8765');
  for (const url of ['http://public.example', 'https://user:pass@host.example', 'https://host.example/other', 'https://host.example/?secret=x', 'file:///tmp/test']) {
    assert.throws(() => resolveService(url));
  }
});
test('check performs a GET without prospect data', async () => {
  const calls = [];
  const service = createService({ fetchImpl: async (url, init) => {
    calls.push({ url, ...init });
    return response({ service: 'Uproot Sales Assist', submission: { url: 'https://uprootnetworks.com/wp-json/uproot-demo/v1/enrich' } });
  } });
  assert.equal((await service.check()).prospect_data_sent, false);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'GET'); assert.equal(calls[0].body, undefined);
});
test('upload preserves CSV, links its run ID, and logs no raw prospect contents', async () => {
  const events = []; let sent;
  const service = createService({ log: e => events.push(e), fetchImpl: async (url, init) => { sent = { url, ...init }; return response(receipt(), 201); } });
  const result = await service.prioritize({ csv, run_id: 'TEST-1' });
  assert.equal(sent.method, 'POST'); assert.equal(sent.redirect, 'manual');
  assert.deepEqual(JSON.parse(sent.body), { csv, run_id: 'TEST-1' });
  assert.equal(sent.headers['X-Uproot-Run-ID'], 'TEST-1');
  assert.equal(result.receipt_status, 'confirmed');
  assert.equal(result.csv_sha256, createHash('sha256').update(csv).digest('hex'));
  assert.deepEqual(events.map(e => e.event), ['upload_attempt', 'upload_received']);
  assert.ok(!JSON.stringify(events).includes('Jordan Ellis'));
});
test('403 HTML response is not falsely identified as a Cato block and is never retried', async () => {
  let calls = 0; const events = [];
  const service = createService({ log: e => events.push(e), fetchImpl: async () => { calls++; return new Response('<html>Access denied</html>', { status: 403 }); } });
  await assert.rejects(service.prioritize({ csv, run_id: 'BLOCK-1' }), error => {
    const result = errorResult(error);
    assert.equal(result.http_status, 403); assert.equal(result.receipt_status, 'unconfirmed');
    assert.equal(result.run_id, 'BLOCK-1'); assert.ok(!result.message.includes('Cato'));
    return true;
  });
  assert.equal(calls, 1); assert.equal(events[1].event, 'upload_unconfirmed');
});
test('WordPress disabled and validation responses remain distinguishable by code', async () => {
  for (const [status, code] of [[503, 'service_off'], [400, 'fixture_only'], [429, 'rate_limit']]) {
    const service = createService({ fetchImpl: async () => response({ code }, status) });
    await assert.rejects(service.prioritize({ csv, run_id: 'TEST-1' }), error => error.http_status === status && error.service_code === code);
  }
});
test('redirects are refused without following a new destination', async () => {
  let count = 0;
  const service = createService({ fetchImpl: async () => { count++; return new Response('', { status: 302, headers: { Location: 'https://other.example' } }); } });
  await assert.rejects(service.prioritize({ csv, run_id: 'TEST-1' }), error => error.code === 'redirect_refused');
  assert.equal(count, 1);
});
test('network failures report unconfirmed delivery without inventing a receipt', async () => {
  const service = createService({ fetchImpl: async () => { throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } }); } });
  await assert.rejects(service.prioritize({ csv, run_id: 'TEST-1' }), error => {
    assert.equal(error.network_code, 'ECONNRESET'); assert.equal(errorResult(error).receipt_status, 'unconfirmed'); return true;
  });
});
test('timeouts terminate a stalled request', async () => {
  const service = createService({ timeoutMs: 20, fetchImpl: async (_url, { signal }) => await new Promise((_resolve, reject) => {
    // Keep this fake pending I/O alive just like a real socket would.
    const timer = setTimeout(() => reject(new Error('test timeout')), 500);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  }) });
  await assert.rejects(service.prioritize({ csv, run_id: 'TEST-1' }), error => error.code === 'timeout');
});
test('invalid CSV and run IDs are rejected before network activity', async () => {
  let count = 0;
  const service = createService({ fetchImpl: async () => { count++; return response(receipt()); } });
  for (const input of [{ csv: '' }, { csv: 'é'.repeat(25001) }, { csv, run_id: '../bad' }, { csv: '\n'.repeat(40000) }]) {
    await assert.rejects(service.prioritize(input), error => error.code === 'invalid_input');
  }
  assert.equal(count, 0);
});
test('malformed or mismatched success responses never produce a confirmed receipt', async () => {
  for (const value of [{}, receipt('OTHER-RUN'), { ...receipt(), ranked_prospects: [] }]) {
    const service = createService({ fetchImpl: async () => response(value) });
    await assert.rejects(service.prioritize({ csv, run_id: 'TEST-1' }), error => error.code === 'invalid_receipt');
  }
  const service = createService({ fetchImpl: async () => new Response('Not JSON') });
  await assert.rejects(service.prioritize({ csv, run_id: 'TEST-1' }), error => error.code === 'invalid_response');
});
test('unexpected service manifests are rejected', async () => {
  const service = createService({ fetchImpl: async () => response({ service: 'Other Service' }) });
  await assert.rejects(service.check(), error => error.code === 'unexpected_service');
});
test('responses are bounded even if the server omits a Content-Length', async () => {
  const service = createService({ fetchImpl: async () => new Response('x'.repeat(1_000_001)) });
  await assert.rejects(service.prioritize({ csv, run_id: 'TEST-1' }), error => error.code === 'response_too_large');
});
