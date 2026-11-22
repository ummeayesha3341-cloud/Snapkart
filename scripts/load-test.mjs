import { performance } from 'node:perf_hooks';

const base = new URL(process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:3000');
const durationSeconds = Math.min(60, Math.max(1, Number(process.env.LOAD_TEST_SECONDS || 10)));
const concurrency = Math.min(20, Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY || 3)));
const maxP95Ms = Math.max(1, Number(process.env.LOAD_TEST_MAX_P95_MS || 1000));
const remote = !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
if (remote && process.env.LOAD_TEST_ALLOW_REMOTE !== 'true') {
  throw new Error('Refusing to load-test a remote host. Set LOAD_TEST_ALLOW_REMOTE=true only for a system you own and a planned test window.');
}
if (!['http:', 'https:'].includes(base.protocol)) throw new Error('LOAD_TEST_BASE_URL must use HTTP or HTTPS.');

const endpoints = ['/health', '/products?limit=20'];
const samples = [];
let requests = 0;
let errors = 0;
let nextEndpoint = 0;
const deadline = performance.now() + durationSeconds * 1000;
async function worker() {
  while (performance.now() < deadline) {
    const endpoint = endpoints[nextEndpoint++ % endpoints.length];
    const started = performance.now();
    try {
      const response = await fetch(new URL(endpoint, base), { signal: AbortSignal.timeout(5000) });
      if (!response.ok) errors++;
      else await response.arrayBuffer();
    } catch { errors++; }
    samples.push(performance.now() - started);
    requests++;
  }
}
const startedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsed = (performance.now() - startedAt) / 1000;
samples.sort((a, b) => a - b);
const percentile = p => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)] || 0;
const summary = { base: base.origin, requests, errors, seconds: Number(elapsed.toFixed(2)), requestsPerSecond: Number((requests / elapsed).toFixed(2)), p50Ms: Number(percentile(.5).toFixed(1)), p95Ms: Number(percentile(.95).toFixed(1)), p99Ms: Number(percentile(.99).toFixed(1)), maxP95Ms };
console.log(JSON.stringify(summary, null, 2));
if (!requests || errors || summary.p95Ms > maxP95Ms) process.exitCode = 1;
