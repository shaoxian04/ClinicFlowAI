import { test, expect, request } from "@playwright/test";

/**
 * Evaluator + drug validation: full doctor flow.
 *
 * Prerequisites for first run:
 *  - Docker stack rebuilt with --no-cache (new agent + backend code)
 *  - Aura Neo4j has drug knowledge graph applied (runs at agent lifespan)
 *  - A warfarin patient exists OR the test seeds one inline
 *
 * To capture initial snapshots: `npx playwright test safety-soft-block --update-snapshots`
 * To run: `npx playwright test safety-soft-block`
 */
test.describe("AI Safety Review — soft-block flow", () => {
  test("warfarin + ibuprofen → CRITICAL DDI blocks finalize until acked", async ({ page }) => {
    // ── Login
    await page.goto("http://localhost/login");
    await page.getByLabel("Email").fill("doctor@demo.local");
    await page.getByLabel("Password").fill("password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/doctor/);

    // ── Create a fresh visit (uses the same seeded warfarin patient from the demo data)
    const apiCtx = await request.newContext({ baseURL: "http://localhost" });
    const loginRes = await apiCtx.post("/api/auth/login", {
      data: { email: "doctor@demo.local", password: "password" },
    });
    const {
      data: { token: jwt },
    } = await loginRes.json();
    const sessionRes = await apiCtx.post("/api/previsit/sessions", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const {
      data: { visitId },
    } = await sessionRes.json();

    // ── Navigate to visit page → consultation phase
    await page.goto(`http://localhost/doctor/visits/${visitId}`);
    await page.getByRole("tab", { name: /consultation/i }).click();

    // ── Trigger SOAP generation with a transcript that proposes ibuprofen
    //    for a patient already on warfarin (assumes warfarin is in their patient context).
    //    The DDI check should produce a CRITICAL finding.
    await page.getByLabel(/consultation transcript/i).fill(
      "Patient reports headache for 2 days. Currently taking warfarin 5mg OD for AF. " +
        "No bleeding history. Prescribe ibuprofen 400mg TDS for 5 days for the headache.",
    );
    await page.getByRole("button", { name: /generate report/i }).click();

    // ── Wait for the SOAP draft to appear, which means the evaluator has also run
    //    (evaluator.done SSE arrives after the drafter completes).
    await expect(page.getByRole("heading", { name: /report/i })).toBeVisible({ timeout: 120_000 });

    // ── AI Safety Review panel must be visible with at least one CRITICAL DDI finding
    const safetyPanel = page.getByRole("region", { name: /AI safety review/i });
    await expect(safetyPanel).toBeVisible();
    await expect(safetyPanel.getByText(/critical/i).first()).toBeVisible();

    // Visual snapshot — first run captures, subsequent runs diff
    await expect(safetyPanel).toHaveScreenshot("safety-panel-critical.snap.png", {
      maxDiffPixelRatio: 0.02,
    });

    // ── Approve the consultation and try to finalize → expect block
    await page.getByRole("button", { name: /approve & continue/i }).click();
    await expect(page).toHaveURL(/#preview$/);

    // The publish button should be disabled when CRITICAL findings are unacked
    const publishBtn = page.getByRole("button", { name: /publish to patient/i });
    await expect(publishBtn).toBeDisabled();

    // ── Acknowledge the CRITICAL finding
    await page.getByRole("tab", { name: /consultation/i }).click();
    const ackBtn = safetyPanel.getByRole("button", { name: /acknowledge/i }).first();
    await ackBtn.click();
    await page
      .getByPlaceholder(/why is this safe to proceed/i)
      .fill("Patient counselled on bleeding signs; switching to paracetamol next visit.");
    await page.getByRole("button", { name: /^acknowledge$/i }).click();

    // After ack, the CRITICAL count drops to 0
    await expect(safetyPanel.getByText(/acknowledged/i).first()).toBeVisible();
    await expect(safetyPanel).toHaveScreenshot("safety-panel-acked.snap.png", {
      maxDiffPixelRatio: 0.02,
    });

    // ── Finalize → 200; published-on banner appears
    await page.getByRole("tab", { name: /report preview/i }).click();
    await expect(publishBtn).toBeEnabled();
    await publishBtn.click();
    await expect(page.getByText(/published on/i)).toBeVisible({ timeout: 60_000 });

    // ── Final report must NOT mention "evaluator", "AI Safety", or "approved by"
    //    (per design: no AI attribution on the patient-facing or doctor-final report)
    const reportPreview = page.locator("[data-testid='report-document']").or(
      page.getByRole("article", { name: /report/i }).first(),
    );
    await expect(reportPreview).not.toContainText(/evaluator/i);
    await expect(reportPreview).not.toContainText(/AI Safety/i);
    await expect(reportPreview).not.toContainText(/approved by evaluator/i);

    await expect(reportPreview).toHaveScreenshot("report-preview-clean.snap.png", {
      maxDiffPixelRatio: 0.02,
    });
  });
});
