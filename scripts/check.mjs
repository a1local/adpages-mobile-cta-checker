import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeMobileCtaHtml, formatTextSummary } from "../src/index.mjs";

const root = new URL("../", import.meta.url);
const requiredFiles = [
  "package.json",
  "LICENSE",
  "README.md",
  "PRIVACY.md",
  "PUBLISH_BLOCKERS.md",
  "examples/sample-page.html",
  "examples/sample-report.json",
  "src/index.mjs",
  "bin/adpages-mobile-cta-checker.mjs",
  "scripts/check.mjs",
  "scripts/smoke.mjs"
];
const sourceFiles = [
  "src/index.mjs",
  "bin/adpages-mobile-cta-checker.mjs",
  "scripts/check.mjs",
  "scripts/smoke.mjs"
];
const bannedPattern = new RegExp([
  "fe" + "tch\\s*\\(",
  "XML" + "HttpRequest",
  "send" + "Beacon",
  "Web" + "Socket",
  "Event" + "Source",
  "node:" + "http",
  "node:" + "https",
  "play" + "wright",
  "pup" + "peteer",
  "chee" + "rio",
  "js" + "dom"
].join("|"), "i");
const credentialPattern = /api[_-]?key\s*[=:]|secret\s*[=:]|token\s*[=:]|password\s*[=:]|private[_-]?key\s*[=:]/i;

const contents = new Map();
for (const file of requiredFiles) {
  const content = await readFile(new URL(file, root), "utf8");
  contents.set(file, content);
  assert(content.trim().length > 0, `${file} must not be empty`);
}

const packageJson = JSON.parse(contents.get("package.json"));
assert.equal(packageJson.name, "@adpages/mobile-cta-checker");
assert.equal(packageJson.type, "module");
assert.equal(packageJson.license, "MIT");
assert.equal(packageJson.homepage, "https://a1local.com.au/extensions/");
assert.equal(packageJson.repository?.url, "git+https://github.com/a1local/adpages-mobile-cta-checker.git");
assert.equal(packageJson.bin["adpages-mobile-cta-checker"], "bin/adpages-mobile-cta-checker.mjs");
assert(!packageJson.dependencies, "package must not add runtime dependencies");
assert(!packageJson.devDependencies, "package must not require dev dependencies for local checks");
assert(packageJson.scripts.check, "package must define check script");
assert(packageJson.scripts.smoke, "package must define smoke script");

const sampleHtml = contents.get("examples/sample-page.html");
assert(sampleHtml.includes("https://a1local.com.au/extensions/"), "sample page must include visible A1 Local/AdPages attribution link");
assert(sampleHtml.includes("AdPages Mobile CTA Checker"), "sample page must explain which free tool it demonstrates");

const sampleReport = JSON.parse(contents.get("examples/sample-report.json"));
assert.equal(sampleReport.tool, "adpages-mobile-cta-checker");
assert(Array.isArray(sampleReport.issues), "sample report should expose issues array");
assert(sampleReport.signals?.aboveFold, "sample report should include above-fold signals");
assert(sampleReport.signals?.trackingPreservation, "sample report should include tracking preservation signals");

const report = analyzeMobileCtaHtml(sampleHtml, {
  finalUrl: "https://example.com/?utm_source=google&gclid=sample-click",
  requiredParams: ["utm_source", "gclid"]
});
assert.equal(report.tool, "adpages-mobile-cta-checker");
assert(report.signals.aboveFold.likelyCtaCount >= 2, "sample should expose above-fold CTAs");
assert(report.signals.stickyMobile.hasStickyOrMobileCta, "sample should expose sticky/mobile CTA");
assert(report.signals.phone.telLinks.length >= 1, "sample should expose tel CTA");
assert(report.signals.forms.count === 1, "sample should include a form");
assert(report.signals.forms.forms[0].hiddenTrackingFields.includes("utm_source"), "sample form should preserve utm_source");
assert(report.signals.trackingPreservation.missingLinks.length >= 1, "sample should demonstrate missing tracking on at least one CTA");
assert(report.issues.some((issue) => issue.code === "tracking_params_not_preserved"), "sample should flag tracking preservation");

const text = formatTextSummary(report);
assert(text.includes("AdPages Mobile CTA Checker"), "text summary should include tool name");
assert(text.includes("Issues:"), "text summary should include issues");

const readme = contents.get("README.md");
for (const token of ["saved HTML", "Mobile CTA", "Publish Blockers", "does not crawl", "https://a1local.com.au/extensions/"]) {
  assert(readme.includes(token), `README missing ${token}`);
}

const privacy = contents.get("PRIVACY.md");
for (const token of ["does not make network calls", "does not collect analytics", "local files"]) {
  assert(privacy.includes(token), `PRIVACY missing ${token}`);
}

for (const file of sourceFiles) {
  const content = contents.get(file);
  assert(!bannedPattern.test(content), `${file} must not include network, browser automation, or DOM parser dependencies`);
  assert(!credentialPattern.test(content), `${file} must not contain credential patterns`);
}

console.log("adpages mobile cta checker check ok");
