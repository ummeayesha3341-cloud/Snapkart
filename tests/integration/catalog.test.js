import test from 'node:test';
import assert from 'node:assert/strict';

// Read-only integration checks against the deployed API and its configured Postgres DB.
// Override SNAPKART_API_URL to target a dedicated staging deployment.
const baseUrl = (process.env.SNAPKART_API_URL || 'https://snapkart-bql8.onrender.com').replace(/\/$/, '');
const timeoutMs = 90_000; // Render may need time to wake its free instance.

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  let body;
  try { body = await response.json(); } catch { body = null; }
  return { response, body };
}

test('deployed API health endpoint responds', async () => {
  const { response, body } = await getJson('/health');
  assert.equal(response.status, 200, `GET /health returned ${response.status}`);
  assert.equal(body?.status, 'ok');
});

test('product catalog is served from the configured database', async () => {
  const { response, body } = await getJson('/products?limit=5');
  assert.equal(response.status, 200, `GET /products returned ${response.status}`);
  assert.ok(Array.isArray(body?.items), 'catalog response should contain items');
  assert.ok(Number.isInteger(body?.total) && body.total >= body.items.length, 'catalog total should be consistent');
  assert.ok(body.items.length > 0, 'database catalog should contain at least one product');
  for (const item of body.items) {
    assert.equal(typeof item.barcode, 'string');
    assert.equal(typeof item.name, 'string');
    assert.equal(typeof item.priceMinor, 'number');
  }
});

test('barcode lookup returns the matching database product', async () => {
  const catalog = await getJson('/products?limit=1');
  assert.equal(catalog.response.status, 200, `GET /products returned ${catalog.response.status}`);
  const sample = catalog.body?.items?.[0];
  assert.ok(sample?.barcode, 'catalog needs a product barcode for this check');

  const { response, body } = await getJson(`/products/barcode/${encodeURIComponent(sample.barcode)}`);
  assert.equal(response.status, 200, `barcode lookup returned ${response.status}`);
  assert.equal(body?.product?.barcode, sample.barcode);
  assert.equal(body?.product?.id, sample.id);
});
