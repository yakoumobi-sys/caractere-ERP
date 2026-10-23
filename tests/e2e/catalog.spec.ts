import { test, expect } from './fixtures';

test('Catalogue: paliers 19/20/49/50 et suppression de Yalidine', async ({page,login,adminUser}) => {
  await login(adminUser.email,adminUser.password);
  await page.goto('/production/new');
  await expect(page.getByRole('button',{name:'Envoyer par Yalidine'})).toHaveCount(0);
  await page.getByPlaceholder('Rechercher dans le stock…').fill('T-shirt Premium');
  await page.getByRole('button',{name:'T-shirt Premium',exact:true}).click();
  const quantity = page.locator('input[type="number"]').first();
  for (const [qty,total] of [[19,39900],[20,39000],[49,95550],[50,87500]]) {
    await quantity.fill(String(qty));
    await expect(page.locator('[name="order_total"]')).toHaveValue(String(total));
  }
});
