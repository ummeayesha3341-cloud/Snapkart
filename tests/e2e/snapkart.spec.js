import { test, expect } from '@playwright/test';

const product = {
  id: 'e2e-product', barcode: '8900000000001', name: 'E2E Apples', brand: 'SnapKart',
  category: 'fruits', priceMinor: 19900, currency: 'INR', stock: 12, active: true,
};

function sessionFor(role) {
  const accessToken = `e30.${Buffer.from(JSON.stringify({ sub: `e2e-${role.toLowerCase()}`, aal: 'aal2', amr: [{ method: 'totp' }] })).toString('base64url')}.e2e-signature`;
  const user = {
    id: `e2e-${role.toLowerCase()}`, aud: 'authenticated', role: 'authenticated',
    email: `${role.toLowerCase()}@example.test`, email_confirmed_at: new Date().toISOString(),
    confirmed_at: new Date().toISOString(), user_metadata: { full_name: 'E2E User' },
    app_metadata: { provider: 'email', providers: ['email'] }, factors: [],
  };
  return {
    access_token: accessToken, token_type: 'bearer', expires_in: 3600,
    refresh_token: 'e2e-refresh-token', user,
  };
}

async function mockAppServices(page, role) {
  const session = sessionFor(role);
  let cart = { items: [], subtotalMinor: 0, currency: 'INR' };

  await page.route('https://snapkart-e2e.invalid/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/token')) {
      return route.fulfill({ json: { ...session, expires_at: Math.floor(Date.now() / 1000) + 3600 } });
    }
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: session.user });
    return route.fulfill({ status: 200, json: {} });
  });

  await page.route('http://127.0.0.1:3000/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/auth/me') return route.fulfill({ json: { user: { id: session.user.id, email: session.user.email, role } } });
    if (path === '/cart' && request.method() === 'GET') return route.fulfill({ json: cart });
    if (path === '/products' && request.method() === 'GET') return route.fulfill({ json: { items: [product], total: 1, page: 1 } });
    if (path === `/products/barcode/${product.barcode}`) return route.fulfill({ json: { product } });
    if (path === '/cart/items' && request.method() === 'POST') {
      const { quantity = 1 } = request.postDataJSON();
      cart = { items: [{ ...product, id: 'e2e-cart-item', unitPriceMinor: product.priceMinor, quantity, lineTotalMinor: product.priceMinor * quantity }], subtotalMinor: product.priceMinor * quantity, currency: 'INR' };
      return route.fulfill({ json: { cart } });
    }
    if (path === '/checkout' && request.method() === 'POST') {
      return route.fulfill({ status: 201, json: { order: {
        id: 'e2e-order-1', receiptToken: 'e2e-receipt-token', subtotalMinor: cart.subtotalMinor,
        totalMinor: cart.subtotalMinor, currency: 'INR', createdAt: new Date().toISOString(),
        payment: { provider: 'cash_on_delivery', status: 'PENDING' },
      } } });
    }
    if (path === '/admin/summary') return route.fulfill({ json: { products: 1, orders: 0, lowStock: 0, revenueMinor: 0 } });
    if (path === '/admin/inventory') return route.fulfill({ json: { items: [product], total: 1, page: 1 } });
    if (path === '/admin/orders') return route.fulfill({ json: { items: [], total: 0, page: 1 } });
    if (path === '/admin/analytics/sales') return route.fulfill({ json: { from: '2026-11-01', to: '2026-11-30', interval: 'day', items: [] } });
    if (path === '/admin/analytics/demand') return route.fulfill({ json: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T23:59:59.999Z', items: [] } });
    if (path === '/admin/returns') return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    return route.fulfill({ status: 200, json: {} });
  });
}

test('customer can sign in, scan a barcode, add an item, and check out', async ({ page }) => {
  await mockAppServices(page, 'CUSTOMER');
  await page.goto('/login');
  await page.getByLabel('Email').fill('customer@example.test');
  await page.getByRole('textbox', { name: 'Password' }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByRole('heading', { name: /Good food\. Good mood\./ })).toBeVisible();
  await page.goto('/scan');
  await page.getByLabel('Enter barcode manually').fill(product.barcode);
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByRole('heading', { name: product.name })).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('button', { name: 'View cart' }).click();
  await page.getByRole('button', { name: /Continue to checkout/i }).click();
  await expect(page.getByRole('heading', { name: 'Review your purchase' })).toBeVisible();
  await page.getByRole('button', { name: /Confirm checkout/i }).click();
  await expect(page.getByRole('heading', { name: 'Checkout confirmed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View bill' })).toBeVisible();
});

test('admin sign in opens the owner dashboard', async ({ page }) => {
  await mockAppServices(page, 'ADMIN');
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@example.test');
  await page.getByRole('textbox', { name: 'Password' }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Owner dashboard' })).toBeVisible();
  await expect(page.getByText('Manage inventory and incoming orders')).toBeVisible();
  await page.getByRole('button', { name: 'Sales & demand' }).click();
  await expect(page.getByRole('heading', { name: 'Sales and product demand' })).toBeVisible();
  await page.getByRole('button', { name: 'Returns' }).click();
  await expect(page.getByRole('heading', { name: 'Returns and refunds' })).toBeVisible();
});

test('signup with email confirmation shows the verification-code screen', async ({ page }) => {
  await page.route('https://snapkart-e2e.invalid/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/signup')) {
      return route.fulfill({ json: { user: {
        id: 'e2e-unconfirmed', aud: 'authenticated', role: 'authenticated',
        email: 'new-customer@example.test', email_confirmed_at: null, confirmed_at: null,
        user_metadata: { full_name: 'New Customer' }, app_metadata: { provider: 'email', providers: ['email'] },
      }, session: null } });
    }
    return route.fulfill({ status: 200, json: {} });
  });
  await page.goto('/register');
  await page.getByLabel('Full name').fill('New Customer');
  await page.getByLabel('Email').fill('new-customer@example.test');
  await page.getByLabel('Password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByLabel('Email verification code')).toBeVisible();
});
