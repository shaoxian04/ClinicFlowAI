import { test, expect, request } from "@playwright/test";

test("doctor generates, approves, and publishes a report", async ({ page }) => {
  // Login to get a token
  await page.goto("http://localhost/login");
  await page.getByLabel("Email").fill("doctor@demo.local");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/doctor/);

  // Create a fresh visit so we always start with a clean consultation tab
  const token = await page.evaluate(() => localStorage.getItem("authToken") ?? sessionStorage.getItem("authToken") ?? "");
  const apiCtx = await request.newContext({ baseURL: "http://localhost" });
  const loginRes = await apiCtx.post("/api/auth/login", {
    data: { email: "doctor@demo.local", password: "password" },
  });
  const { data: { token: jwt } } = await loginRes.json();

  const sessionRes = await apiCtx.post("/api/previsit/sessions", {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const { data: { visitId } } = await sessionRes.json();

  // Navigate directly to the fresh visit
  await page.goto(`http://localhost/doctor/visits/${visitId}`);
  await page.getByRole("tab", { name: /consultation/i }).click();

  await page.getByLabel(/consultation transcript/i).fill(
    "Patient reports a dry cough for 3 days, no fever, no chest pain. " +
    "Prescribe paracetamol 500mg TDS for 5 days. Follow up in 1 week if no improvement."
  );
  await page.getByRole("button", { name: /generate report/i }).click();

  await expect(page.getByRole("heading", { name: /report/i })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/cough/i).first()).toBeVisible();

  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page).toHaveURL(/#preview$/);

  await page.getByRole("button", { name: /publish to patient/i }).click();
  await expect(page.getByText(/published/i)).toBeVisible({ timeout: 60_000 });
});
