import { test, expect } from './fixtures';

test('Comptabilité : saisir une écriture équilibrée depuis le navigateur', async ({ page, login }) => {
  await login(process.env.TEST_USERNAME!, process.env.TEST_PASSWORD!);
  await page.goto('/accounting/journal');
  // Scope by the hidden payload instead of depending on button punctuation.
  const journal = page.locator('form').filter({ has: page.locator('input[name="lines_json"]') });
  const reference = `E2E-JOURNAL-${Date.now()}`;
  await journal.locator('[name="reference"]').fill(reference);
  await journal.locator('[name="description"]').fill('Vérification écriture atomique');
  const rows = journal.locator('tbody tr');
  const bank = await rows.nth(0).locator('select option').filter({ hasText: '512 —' }).getAttribute('value');
  const sales = await rows.nth(1).locator('select option').filter({ hasText: '706 —' }).getAttribute('value');
  expect(bank).toBeTruthy(); expect(sales).toBeTruthy();
  await rows.nth(0).locator('select').selectOption(bank!);
  await rows.nth(1).locator('select').selectOption(sales!);
  await rows.nth(0).locator('input[type="number"]').nth(0).fill('125.50');
  await rows.nth(1).locator('input[type="number"]').nth(1).fill('125.50');
  await journal.locator('button[type="submit"]').click();
  await expect(journal.getByRole('status')).toHaveText('Écriture enregistrée.');
  await page.reload();
  await expect(page.getByText(reference, { exact: false })).toBeVisible();
});
