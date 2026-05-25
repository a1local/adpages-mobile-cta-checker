import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const bin = new URL("bin/adpages-mobile-cta-checker.mjs", root);
const sample = new URL("examples/sample-page.html", root);

const { stdout } = await execFileAsync(process.execPath, [
  fileURLToPath(bin),
  "--html-file",
  fileURLToPath(sample),
  "--final-url",
  "https://example.com/?utm_source=google&gclid=sample-click",
  "--required-param",
  "utm_source,gclid"
]);
const report = JSON.parse(stdout);
assert.equal(report.tool, "adpages-mobile-cta-checker");
assert(report.score > 0 && report.score <= 100, "score should be bounded");
assert(report.signals.aboveFold.likelyCtaCount >= 2, "above-fold CTA detection failed");
assert(report.signals.stickyMobile.hasStickyOrMobileCta, "sticky mobile CTA detection failed");
assert(report.issues.some((issue) => issue.code === "tracking_params_not_preserved"), "tracking issue should be detected");

const textResult = await execFileAsync(process.execPath, [
  fileURLToPath(bin),
  "--html-file",
  fileURLToPath(sample),
  "--format",
  "text"
]);
assert(textResult.stdout.includes("AdPages Mobile CTA Checker"), "text output should include heading");
assert(textResult.stdout.includes("Above-fold CTAs:"), "text output should include CTA count");

console.log("adpages mobile cta checker smoke ok");
