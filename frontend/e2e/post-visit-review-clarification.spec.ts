import { test, expect } from "@playwright/test";

test("agent asks for clarification when transcript is thin", async ({ page }) => {
  await page.goto("http://localhost/login");
  await page.getByLabel("Email").fill("doctor@demo.local");
  await page.getByLabel("Password").fill("demo");
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.getByRole("link", { name: /visit with pat demo/i }).click();
  await page.getByRole("tab", { name: /consultation/i }).click();

  await page.getByLabel(/consultation transcript/i).fill("Patient came in. Meh.");
  await page.getByRole("button", { name: /generate report/i }).click();

  const chatInput = page.getByPlaceholder(/answer:/i);
  await expect(chatInput).toBeVisible({ timeout: 45_000 });

  await chatInput.fill("Dry cough x 3 days, diagnosis is acute bronchitis");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText(/bronchitis/i)).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page).toHaveURL(/#preview$/);
});
