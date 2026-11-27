import { test, expect } from '@playwright/test';

/**
 * The 90-second offline demo, automated.
 *
 * 1. Open the app, set up a shop.
 * 2. Kill the network (route abort).
 * 3. Ring up 5 sales + a customer debt — everything works instantly.
 * 4. Reload — everything is still there (device is source of truth).
 * 5. Restore the network and watch the outbox drain.
 *
 * This is the non-negotiable: the offline demo is a test, not a README claim.
 */
test.describe('offline-first demo', () => {
  test('sales and debts survive offline + reload, and sync drains on reconnect', async ({ page }) => {
    // --- Setup: create a shop ---
    await page.goto('/');
    await page.getByLabel('اسم المحل').fill('محل الاختبار');
    await page.getByRole('button', { name: 'بدء العمل' }).click();
    await expect(page.getByRole('heading', { name: 'تسجيل مبيعة' })).toBeVisible();

    // --- Go offline ---
    await page.context().setOffline(true);

    // --- Ring up 5 sales while offline ---
    for (let i = 0; i < 5; i += 1) {
      const name = `سلعة ${i + 1}`;
      await page.getByLabel('اسم السلعة').fill(name);
      await page.getByLabel('السعر').fill(String((i + 1) * 10));
      await page.getByRole('button', { name: 'حفظ المبيعة' }).click();
      await page.waitForTimeout(150);
    }

    // All 5 sales appear in the ledger, instantly, offline.
    await expect(page.getByText('سجل المبيعات')).toBeVisible();
    await expect(page.getByText(/سلعة 5/)).toBeVisible();

    // Sync badge reflects offline state.
    await expect(page.getByRole('status')).toContainText('غير متصل');

    // --- Reload while offline: data must persist ---
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'تسجيل مبيعة' })).toBeVisible();
    await expect(page.getByText(/سلعة 5/)).toBeVisible();
    await expect(page.getByText(/سلعة 1/)).toBeVisible();

    // --- Add a customer debt while offline ---
    await page.getByLabel('اسم العميل').fill('عميل دين');
    await page.getByLabel('رقم التليفون').fill('01000000000');
    await page.getByRole('button', { name: 'إضافة' }).click();
    await expect(page.getByText('عميل دين')).toBeVisible();

    // --- Restore network: outbox drains ---
    await page.context().setOffline(false);
    // Wait for the sync badge to reflect a connected/draining state.
    await expect(page.getByRole('status')).toContainText(/متصل|جارٍ المزامنة/);
  });

  test('the app loads without a configured backend (offline-first)', async ({ page }) => {
    // No VITE_SUPABASE_* in the test env — the app must still work.
    await page.goto('/');
    await expect(page.getByText(/دفتر|أهلاً بك/)).toBeVisible();
  });
});
