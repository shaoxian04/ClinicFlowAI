# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: post-visit-review-happy-path.spec.ts >> doctor generates, approves, and publishes a report
- Location: e2e\post-visit-review-happy-path.spec.ts:3:5

# Error details

```
Test timeout of 180000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 180000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - link "Back home" [ref=e5] [cursor=pointer]:
      - /url: /
      - generic [ref=e6]: ←
      - text: Back home
    - generic [ref=e8]:
      - generic [ref=e9]:
        - paragraph [ref=e10]: Welcome back
        - heading "Sign in to CliniFlow" [level=1] [ref=e11]
        - paragraph [ref=e12]: One sign-in for all three phases of the visit — pre-visit, consultation, and summary.
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]:
            - generic [ref=e16]: Email
            - textbox "Email" [ref=e17]: doctor@demo.local
          - generic [ref=e18]:
            - generic [ref=e19]: Password
            - textbox "Password" [ref=e20]: password
          - alert [ref=e21]: HTTP 502
          - button "Sign in" [ref=e22] [cursor=pointer]
        - separator [ref=e23]
        - group [ref=e24]:
          - generic "Demo credentials" [ref=e25] [cursor=pointer]:
            - generic [ref=e26]: ▶
            - text: Demo credentials
      - paragraph [ref=e27]:
        - link "Privacy policy" [ref=e28] [cursor=pointer]:
          - /url: /privacy
  - alert [ref=e29]
```

# Test source

```ts
  1  | import { test, expect, request } from "@playwright/test";
  2  | 
  3  | test("doctor generates, approves, and publishes a report", async ({ page }) => {
  4  |   // Login to get a token
  5  |   await page.goto("http://localhost/login");
  6  |   await page.getByLabel("Email").fill("doctor@demo.local");
  7  |   await page.getByLabel("Password").fill("password");
  8  |   await page.getByRole("button", { name: /sign in/i }).click();
> 9  |   await page.waitForURL(/\/doctor/);
     |              ^ Error: page.waitForURL: Test timeout of 180000ms exceeded.
  10 | 
  11 |   // Create a fresh visit so we always start with a clean consultation tab
  12 |   const token = await page.evaluate(() => localStorage.getItem("authToken") ?? sessionStorage.getItem("authToken") ?? "");
  13 |   const apiCtx = await request.newContext({ baseURL: "http://localhost" });
  14 |   const loginRes = await apiCtx.post("/api/auth/login", {
  15 |     data: { email: "doctor@demo.local", password: "password" },
  16 |   });
  17 |   const { data: { token: jwt } } = await loginRes.json();
  18 | 
  19 |   const sessionRes = await apiCtx.post("/api/previsit/sessions", {
  20 |     headers: { Authorization: `Bearer ${jwt}` },
  21 |   });
  22 |   const { data: { visitId } } = await sessionRes.json();
  23 | 
  24 |   // Navigate directly to the fresh visit
  25 |   await page.goto(`http://localhost/doctor/visits/${visitId}`);
  26 |   await page.getByRole("tab", { name: /consultation/i }).click();
  27 | 
  28 |   await page.getByLabel(/consultation transcript/i).fill(
  29 |     "Patient reports a dry cough for 3 days, no fever, no chest pain. " +
  30 |     "Prescribe paracetamol 500mg TDS for 5 days. Follow up in 1 week if no improvement."
  31 |   );
  32 |   await page.getByRole("button", { name: /generate report/i }).click();
  33 | 
  34 |   await expect(page.getByRole("heading", { name: /report/i })).toBeVisible({ timeout: 120_000 });
  35 |   await expect(page.getByText(/cough/i).first()).toBeVisible();
  36 | 
  37 |   await page.getByRole("button", { name: /approve & continue/i }).click();
  38 |   await expect(page).toHaveURL(/#preview$/);
  39 | 
  40 |   await page.getByRole("button", { name: /publish to patient/i }).click();
  41 |   await expect(page.getByText(/published on/i)).toBeVisible({ timeout: 60_000 });
  42 | });
  43 | 
```