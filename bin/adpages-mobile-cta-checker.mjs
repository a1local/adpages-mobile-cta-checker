#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { analyzeMobileCtaHtml, formatTextSummary } from "../src/index.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.htmlFile) {
  console.error("Missing required --html-file path");
  printHelp();
  process.exit(1);
}

try {
  const html = await readFile(args.htmlFile, "utf8");
  const report = analyzeMobileCtaHtml(html, {
    finalUrl: args.finalUrl,
    requiredParams: args.requiredParams
  });

  if (args.format === "text") {
    process.stdout.write(formatTextSummary(report));
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    htmlFile: "",
    finalUrl: "",
    requiredParams: [],
    format: "json",
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--html-file") {
      parsed.htmlFile = argv[++index] || "";
    } else if (arg === "--final-url") {
      parsed.finalUrl = argv[++index] || "";
    } else if (arg === "--required-param") {
      parsed.requiredParams.push(argv[++index] || "");
    } else if (arg === "--format") {
      parsed.format = argv[++index] || "json";
    } else if (arg === "--text") {
      parsed.format = "text";
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["json", "text"].includes(parsed.format)) {
    throw new Error("--format must be json or text");
  }

  return parsed;
}

function printHelp() {
  process.stdout.write(`AdPages Mobile CTA Checker

Usage:
  adpages-mobile-cta-checker --html-file page.html [--final-url URL] [--required-param utm_source] [--format json|text]

Options:
  --html-file       Saved HTML file to inspect. Required.
  --final-url       Final landing-page URL, used to infer UTM/click-ID parameters and resolve relative CTA links.
  --required-param  Tracking parameter that CTA links/forms should preserve. Repeatable or comma-separated.
  --format          json by default; use text for a human summary.
  --text            Shortcut for --format text.
  --help            Show this help.

The checker reads local HTML only. It does not crawl URLs, drive a browser, or call remote services.
`);
}
