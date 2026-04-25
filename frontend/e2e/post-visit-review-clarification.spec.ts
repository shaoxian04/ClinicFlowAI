import { test, expect, request } from "@playwright/test";

test("agent asks for clarification when transcript is thin", async ({ page }) => {
  // Login
  await page.goto("http://localhost/login");
  await page.getByLabel("Email").fill("doctor@demo.local");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/doctor/);

  // Create a fresh visit
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

  await page.getByLabel(/consultation transcript/i).fill("Patient came in. Meh.");
  await page.getByRole("button", { name: /generate report/i }).click();

  const chatInput = page.getByPlaceholder(/answer:/i);
  await expect(chatInput).toBeVisible({ timeout: 120_000 });

  await chatInput.fill("Dry cough x 3 days, diagnosis is acute bronchitis");
  await page.getByRole("button", { name: /send/i }).click();

  await expect(page.getByText(/bronchitis/i)).toBeVisible({ timeout: 120_000 });

  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page).toHaveURL(/#preview$/);
});
