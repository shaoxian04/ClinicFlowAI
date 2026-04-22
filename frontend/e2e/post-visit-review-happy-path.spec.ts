import { test, expect } from "@playwright/test";

test("doctor generates, approves, and publishes a report", async ({ page }) => {
  await page.goto("http://localhost/login");
  await page.getByLabel("Email").fill("doctor@demo.local");
  await page.getByLabel("Password").fill("demo");
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.getByRole("link", { name: /visit with pat demo/i }).click();
  await page.getByRole("tab", { name: /consultation/i }).click();

  await page.getByLabel(/consultation transcript/i).fill(
    "Patient reports a dry cough for 3 days, no fever, no chest pain. " +
    "Prescribe paracetamol 500mg TDS for 5 days. Follow up in 1 week if no improvement."
  );
  await page.getByRole("button", { name: /generate report/i }).click();

  await expect(page.getByRole("heading", { name: /report/i })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/cough/i).first()).toBeVisible();

  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page).toHaveURL(/#preview$/);

  await page.getByRole("button", { name: /publish to patient/i }).click();
  await expect(page.getByText(/published/i)).toBeVisible({ timeout: 30_000 });
});
