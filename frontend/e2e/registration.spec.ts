import { test, expect } from "@playwright/test";

test("patient self-registration creates account and redirects to portal", async ({ page }) => {
  // Use a unique email per run so the test is idempotent
  const uniq = Date.now();
  const email = `e2e-register-${uniq}@example.com`;
  const password = "Strong-Pwd-12345";
  const fullName = `E2E User ${uniq}`;

  await page.goto("http://localhost/auth/register");
  await expect(page.getByRole("heading", { name: /create your cliniflow account/i }))
    .toBeVisible();

  await page.getByLabel(/full name/i).fill(fullName);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByLabel(/preferred language/i).selectOption("en");

  // Optional clinical baseline
  await page.getByLabel(/drug allergies/i).fill("penicillin");
  await page.getByLabel(/chronic conditions/i).fill("hypertension");

  // Consent
  await page.getByRole("checkbox").check();

  await page.getByRole("button", { name: /create account/i }).click();

  // Successful registration redirects to /portal
  await page.waitForURL(/\/portal/, { timeout: 30_000 });
});

test("login link from /login navigates to /auth/register", async ({ page }) => {
  await page.goto("http://localhost/login");
  await page.getByRole("link", { name: /create an account/i }).click();
  await expect(page).toHaveURL(/\/auth\/register$/);
  await expect(page.getByRole("heading", { name: /create your cliniflow account/i }))
    .toBeVisible();
});
