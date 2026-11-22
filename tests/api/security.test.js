import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.METRICS_TOKEN = 'api-test-metrics-token';
const { app } = await import('../../src/server.ts');

before(async () => app.ready());
after(async () => app.close());

test('health is available and catalog validation rejects malformed paging', async () => {
  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(health.statusCode, 200);
  assert.deepEqual(health.json(), { status: 'ok' });
  const invalid = await app.inject({ method: 'GET', url: '/products?page=0' });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error, 'VALIDATION_ERROR');
});

test('customer and admin data stay inaccessible without configured auth', async () => {
  for (const url of ['/cart', '/orders', '/admin/summary', '/admin/orders', '/admin/analytics/sales', '/admin/analytics/demand', '/admin/returns']) {
    const response = await app.inject({ method: 'GET', url });
    assert.notEqual(response.statusCode, 200, `${url} must never disclose protected data`);
    assert.ok([401, 503].includes(response.statusCode), `${url} returned ${response.statusCode}`);
  }
});

test('metrics endpoint fails closed and requires its bearer token', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/metrics' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer wrong' } })).statusCode, 404);
  const response = await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer api-test-metrics-token' } });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /snapkart_http_requests_total/);
  assert.match(response.body, /snapkart_http_request_duration_seconds/);
  assert.doesNotMatch(response.body, /api-test-metrics-token/);
});

test('unapproved browser origins are not granted CORS access', async () => {
  const response = await app.inject({ method: 'OPTIONS', url: '/health', headers: { origin: 'https://attacker.example', 'access-control-request-method': 'GET' } });
  assert.notEqual(response.headers['access-control-allow-origin'], 'https://attacker.example');
});
