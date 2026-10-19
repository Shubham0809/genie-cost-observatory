import { expect, test } from '@playwright/test';

test('loads the Genie Cost Observatory', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Genie Cost Observatory' })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText('Estimated list cost', { exact: true }).first()).toBeVisible();
});
