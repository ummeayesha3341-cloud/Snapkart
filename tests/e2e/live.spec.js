import { test, expect } from '@playwright/test';

const email = process.env.E2E_TEST_EMAIL;
const password = process.env.E2E_TEST_PASSWORD;
const barcode = process.env.E2E_TEST_BARCODE;

test('real customer login, Neon catalog, cart, checkout, and bill', async ({ page }) => {
  test.skip(!email || !password || !barcode, 'Set E2E_TEST_EMAIL, E2E_TEST_PASSWORD, and E2E_TEST_BARCODE for the isolated test branch.');

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.getByRole('textbox', { name: 'Password' }).fill('');

  await expect(page.getByRole('heading', { name: /Good food\. Good mood\./ })).toBeVisible();
  await page.goto('/scan');
  await page.getByLabel('Enter barcode manually').fill(barcode);
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByRole('heading', { name: /Product not found/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to cart' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.getByRole('button', { name: 'View cart' }).click();

  await expect(page.getByRole('heading', { name: 'Your basket' })).toBeVisible();
  await page.getByRole('button', { name: /Continue to checkout/i }).click();
  await expect(page.getByRole('heading', { name: 'Review your purchase' })).toBeVisible();
  await page.getByRole('button', { name: /Confirm checkout/i }).click();

  await expect(page.getByRole('heading', { name: 'Checkout confirmed' })).toBeVisible();
  await page.getByRole('button', { name: 'View bill' }).click();
  await expect(page.getByRole('heading', { name: /Order #/ })).toBeVisible();
});
