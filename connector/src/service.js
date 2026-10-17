import { createHash, randomUUID } from 'node:crypto';
import { fetch as httpFetch, EnvHttpProxyAgent } from 'undici';

export const DEFAULT_ORIGIN = 'https://uprootnetworks.com';
export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_RESPONSE_BYTES = 1_000_000;

export class ServiceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    Object.assign(this, details);
  }
}

export function resolveService(origin = DEFAULT_ORIGIN) {
  let url;
  try { url = new URL(origin); } catch { throw new Error('UPROOT_ORIGIN must be an HTTPS origin.'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('UPROOT_ORIGIN must be an HTTPS origin with no path, query or credentials. HTTP is allowed only for loopback tests.');
  }
  return {
    origin: url.origin,
    manifest: new URL('/wp-json/uproot-demo/v1/sales', url).href,
    upload: new URL('/wp-json/uproot-demo/v1/enrich', url).href,
  };
}

async function readBounded(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ServiceError('response_too_large', 'The service response exceeded the size limit.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}

function resultIsReceipt(value, runId) {
  return value && typeof value.receipt_id === 'string' && value.receipt_id.length > 0 &&
    value.run_id === runId && Number.isInteger(value.received_rows) && value.received_rows > 0 &&
    Number.isInteger(value.duplicates_removed) && value.duplicates_removed >= 0 &&
    Array.isArray(value.ranked_prospects) && value.ranked_prospects.length > 0 &&
    value.ranked_prospects.every(p => p && typeof p.name === 'string' && typeof p.company === 'string' &&
      Number.isInteger(p.priority) && typeof p.suggested_next_step === 'string');
}

export function createService({ origin = process.env.UPROOT_ORIGIN || DEFAULT_ORIGIN,
  timeoutMs = 20_000, fetchImpl, log = () => {}, env = process.env } = {}) {
  const urls = resolveService(origin);
  // Honor the operator's normal proxy settings. TLS verification stays enabled.
  const useProxy = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].some(k => env[k]);
  const dispatcher = !fetchImpl && useProxy ? new EnvHttpProxyAgent({
    httpProxy: env.http_proxy || env.HTTP_PROXY,
    httpsProxy: env.https_proxy || env.HTTPS_PROXY,
    noProxy: env.no_proxy || env.NO_PROXY,
  }) : undefined;
  const request = fetchImpl || httpFetch;
  const options = { redirect: 'manual', ...(dispatcher ? { dispatcher } : {}) };

  async function exchange(url, init) {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const response = await request(url, { ...options, ...init, signal });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new ServiceError('redirect_refused', 'The service returned a redirect. No request was sent to the redirect destination.', { http_status: response.status });
      }
      const text = await readBounded(response);
      let data;
      try { data = JSON.parse(text); } catch { /* A block page may be HTML. */ }
      if (!response.ok) {
        const serviceCode = typeof data?.code === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(data.code) ? data.code : undefined;
        throw new ServiceError('http_error', `The service request returned HTTP ${response.status}. This response alone does not identify which control rejected it.`,
          { http_status: response.status, ...(serviceCode ? { service_code: serviceCode } : {}) });
      }
      if (data === undefined) throw new ServiceError('invalid_response', 'The service did not return a JSON receipt or manifest.');
      return data;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      const timeout = signal.aborted;
      const causeCode = error?.cause?.code || error?.code;
      throw new ServiceError(timeout ? 'timeout' : 'network_error',
        timeout ? 'The service request timed out. Receipt is unconfirmed.' : 'The service request failed. Receipt is unconfirmed.',
        typeof causeCode === 'string' && /^[A-Z0-9_]{1,80}$/.test(causeCode) ? { network_code: causeCode } : {});
    }
  }

  return {
    urls,
    async check() {
      const data = await exchange(urls.manifest, { method: 'GET', headers: { Accept: 'application/json' } });
      if (data?.service !== 'Uproot Sales Assist' || data?.submission?.url !== urls.upload) {
        throw new ServiceError('unexpected_service', 'The endpoint did not identify the expected Uproot service and upload destination.');
      }
      return { service: data.service, destination: urls.upload, available: true, prospect_data_sent: false };
    },
    async prioritize({ csv, run_id = `SALES-${randomUUID()}` }) {
      if (typeof csv !== 'string' || !csv.length || Buffer.byteLength(csv, 'utf8') > 50_000) {
        throw new ServiceError('invalid_input', 'CSV text must contain 1–50,000 UTF-8 bytes.');
      }
      if (typeof run_id !== 'string' || !RUN_ID_PATTERN.test(run_id)) {
        throw new ServiceError('invalid_input', 'run_id must contain 1–64 letters, digits, hyphens or underscores.');
      }
      const body = JSON.stringify({ csv, run_id });
      if (Buffer.byteLength(body, 'utf8') > 64_000) throw new ServiceError('invalid_input', 'The JSON upload exceeds 64 KB.');
      const evidence = { run_id, destination: urls.upload, csv_bytes: Buffer.byteLength(csv),
        csv_sha256: createHash('sha256').update(csv).digest('hex') };
      log({ event: 'upload_attempt', ...evidence });
      try {
        const data = await exchange(urls.upload, { method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Uproot-Run-ID': run_id }, body });
        if (!resultIsReceipt(data, run_id)) throw new ServiceError('invalid_receipt', 'The service response did not contain a valid matching receipt.');
        log({ event: 'upload_received', ...evidence, receipt_id: data.receipt_id });
        return { ...data, destination: urls.upload, csv_sha256: evidence.csv_sha256, receipt_status: 'confirmed' };
      } catch (error) {
        const wrapped = error instanceof ServiceError ? error : new ServiceError('internal_error', 'The upload result could not be confirmed.');
        log({ event: 'upload_unconfirmed', ...evidence, code: wrapped.code, ...(wrapped.http_status ? { http_status: wrapped.http_status } : {}) });
        wrapped.run_id = run_id;
        wrapped.destination = urls.upload;
        wrapped.csv_sha256 = evidence.csv_sha256;
        throw wrapped;
      }
    },
    async close() { await dispatcher?.close(); },
  };
}

export function errorResult(error) {
  const result = { status: 'error', code: error.code || 'internal_error',
    message: error instanceof ServiceError ? error.message : 'The operation failed.', receipt_status: 'unconfirmed' };
  for (const key of ['run_id', 'destination', 'csv_sha256', 'http_status', 'network_code', 'service_code']) {
    if (error[key] !== undefined) result[key] = error[key];
  }
  return result;
}
