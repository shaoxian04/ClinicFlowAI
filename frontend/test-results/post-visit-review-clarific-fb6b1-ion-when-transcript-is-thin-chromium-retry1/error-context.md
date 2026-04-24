# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: post-visit-review-clarification.spec.ts >> agent asks for clarification when transcript is thin
- Location: e2e\post-visit-review-clarification.spec.ts:3:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/bronchitis/i)
Expected: visible
Error: strict mode violation: getByText(/bronchitis/i) resolved to 2 elements:
    1) <div class="rounded-md px-3 py-2 text-sm font-sans leading-relaxed max-w-[88%] bg-bone text-ink">Dry cough x 3 days, diagnosis is acute bronchitis</div> aka getByText('Dry cough x 3 days, diagnosis')
    2) <div class="rounded-md px-3 py-2 text-sm font-sans leading-relaxed max-w-[88%] bg-ochre/5 border border-ochre/20 text-ink">Can you please provide more details on the histor…</div> aka getByText('Can you please provide more')

Call log:
  - Expect "toBeVisible" with timeout 120000ms
  - waiting for getByText(/bronchitis/i)

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - link "CliniFlow" [ref=e4] [cursor=pointer]:
        - /url: /doctor
      - navigation [ref=e5]:
        - generic [ref=e6]: Doctor
        - generic [ref=e7]: "|"
        - generic [ref=e8]: doctor@demo.local
        - button "Sign out" [ref=e9] [cursor=pointer]
  - navigation [ref=e11]:
    - generic [ref=e12]:
      - generic [ref=e13]:
        - img [ref=e14]
        - generic [ref=e18]: Clinician workspace
      - tablist [ref=e19]:
        - tab "Today" [selected] [ref=e20] [cursor=pointer]
        - tab "Queue" [ref=e21] [cursor=pointer]
        - tab "Finalized" [ref=e22] [cursor=pointer]
        - tab "Patients" [disabled] [ref=e23]
  - main [ref=e24]:
    - generic [ref=e25]:
      - generic [ref=e26]:
        - paragraph [ref=e27]: Clinician review
        - heading "Visit with Pat Demo" [level=1] [ref=e28]:
          - text: Visit with
          - emphasis [ref=e29]: Pat Demo
        - paragraph [ref=e30]: Review the pre-visit intake, capture your consultation, and publish a bilingual summary to the patient.
      - generic [ref=e31]:
        - generic [ref=e32]: In progress
        - generic [ref=e33]: 950abce7…
      - generic [ref=e35]:
        - tablist "Visit phases" [ref=e36]:
          - tab "Pre-Visit Report" [ref=e37] [cursor=pointer]:
            - generic [ref=e38]: Pre-Visit Report
          - tab "Consultation" [selected] [ref=e39] [cursor=pointer]:
            - generic [ref=e40]: Consultation
          - tab "Report Preview" [ref=e41] [cursor=pointer]:
            - generic [ref=e42]: Report Preview
        - tabpanel "Consultation" [ref=e43]:
          - generic [ref=e45]:
            - generic [ref=e46]:
              - generic [ref=e47]:
                - generic [ref=e48]: Consultation transcript
                - tablist [ref=e49]:
                  - tab "Text" [selected] [ref=e50] [cursor=pointer]
                  - tab "Voice" [ref=e51] [cursor=pointer]
                  - tab "Live" [ref=e52] [cursor=pointer]
              - generic [ref=e53]:
                - textbox "Consultation transcript" [ref=e54]:
                  - /placeholder: Paste or type the consultation transcript…
                  - text: Patient came in. Meh.
                - button "Generate report" [ref=e56] [cursor=pointer]
            - generic [ref=e57]:
              - generic [ref=e58]:
                - generic [ref=e60]: Report
                - paragraph [ref=e61]: Report will appear here once generated.
              - generic [ref=e62]:
                - generic [ref=e65]: Assistant
                - list [ref=e66]:
                  - listitem [ref=e67]:
                    - generic [ref=e68]: You
                    - generic [ref=e69]: Patient came in. Meh.
                  - listitem [ref=e70]:
                    - generic [ref=e71]: You
                    - generic [ref=e72]: Dry cough x 3 days, diagnosis is acute bronchitis
                  - listitem [ref=e73]:
                    - generic [ref=e74]: Assistant
                    - generic [ref=e75]: Can you please provide more details on the history of the present illness for the patient's dry cough and acute bronchitis diagnosis?
                - generic [ref=e76]:
                  - 'textbox "Answer: Can you please provide more details on the history of the present illness for the patient''s dry cough and acute bronchitis diagnosis?" [ref=e77]'
                  - button "Send" [disabled]
  - alert [ref=e78]
```

# Test source

```ts
  1  | import { test, expect, request } from "@playwright/test";
  2  | 
  3  | test("agent asks for clarification when transcript is thin", async ({ page }) => {
  4  |   // Login
  5  |   await page.goto("http://localhost/login");
  6  |   await page.getByLabel("Email").fill("doctor@demo.local");
  7  |   await page.getByLabel("Password").fill("password");
  8  |   await page.getByRole("button", { name: /sign in/i }).click();
  9  |   await page.waitForURL(/\/doctor/);
  10 | 
  11 |   // Create a fresh visit
  12 |   const apiCtx = await request.newContext({ baseURL: "http://localhost" });
  13 |   const loginRes = await apiCtx.post("/api/auth/login", {
  14 |     data: { email: "doctor@demo.local", password: "password" },
  15 |   });
  16 |   const { data: { token: jwt } } = await loginRes.json();
  17 | 
  18 |   const sessionRes = await apiCtx.post("/api/previsit/sessions", {
  19 |     headers: { Authorization: `Bearer ${jwt}` },
  20 |   });
  21 |   const { data: { visitId } } = await sessionRes.json();
  22 | 
  23 |   // Navigate directly to the fresh visit
  24 |   await page.goto(`http://localhost/doctor/visits/${visitId}`);
  25 |   await page.getByRole("tab", { name: /consultation/i }).click();
  26 | 
  27 |   await page.getByLabel(/consultation transcript/i).fill("Patient came in. Meh.");
  28 |   await page.getByRole("button", { name: /generate report/i }).click();
  29 | 
  30 |   const chatInput = page.getByPlaceholder(/answer:/i);
  31 |   await expect(chatInput).toBeVisible({ timeout: 120_000 });
  32 | 
  33 |   await chatInput.fill("Dry cough x 3 days, diagnosis is acute bronchitis");
  34 |   await page.getByRole("button", { name: /send/i }).click();
  35 | 
> 36 |   await expect(page.getByText(/bronchitis/i)).toBeVisible({ timeout: 120_000 });
     |                                               ^ Error: expect(locator).toBeVisible() failed
  37 | 
  38 |   await page.getByRole("button", { name: /approve & continue/i }).click();
  39 |   await expect(page).toHaveURL(/#preview$/);
  40 | });
  41 | 
```