# AdPages Mobile CTA Checker

Dependency-free CLI and library for checking saved local-business HTML for mobile conversion problems before a page, campaign, or client handoff goes live.

The checker is designed for agencies and local marketers who need quick evidence that a page has a usable Mobile CTA path: above-the-fold action, sticky mobile affordance, tappable phone/form/location CTAs, tracking preservation, and a focused primary action.

Built by [AdPages from A1 Local](https://a1local.com.au/extensions/) as a free local-business website QA tool.

## Publishing Position

- Free no-login QA tool for local SEO, paid-search landing pages, and web design launch checklists.
- Useful as a resource-page placement asset because it runs on saved HTML and does not crawl live websites.
- Later monetisable with hosted batch checks, branded reports, benchmark data, team templates, or white-label agency exports.

## Install

This package is intentionally dependency-light and can run directly with Node.js:

```sh
npm --prefix packages/adpages-mobile-cta-checker run check
npm --prefix packages/adpages-mobile-cta-checker run smoke
node packages/adpages-mobile-cta-checker/bin/adpages-mobile-cta-checker.mjs \
  --html-file packages/adpages-mobile-cta-checker/examples/sample-page.html
```

From the package folder:

```sh
npm run sample
npm run sample:text
```

## CLI

```sh
node packages/adpages-mobile-cta-checker/bin/adpages-mobile-cta-checker.mjs \
  --html-file packages/adpages-mobile-cta-checker/examples/sample-page.html \
  --final-url "https://example.com/?utm_source=google&gclid=sample-click" \
  --required-param utm_source \
  --required-param gclid
```

JSON is the default output. Use a text summary when you want a client-facing quick read:

```sh
node packages/adpages-mobile-cta-checker/bin/adpages-mobile-cta-checker.mjs \
  --html-file packages/adpages-mobile-cta-checker/examples/sample-page.html \
  --format text
```

Options:

- `--html-file`: saved HTML file to inspect.
- `--final-url`: optional landing-page URL used to infer UTM and click-ID parameters and resolve relative CTA links.
- `--required-param`: optional tracking parameter that CTA links/forms should preserve. Repeatable or comma-separated.
- `--format json|text`: output mode. Defaults to `json`.

## What It Checks

- Above-the-fold CTA signals in the first content segment.
- Sticky or mobile-specific CTA patterns such as fixed call bars.
- Tap target semantics: accessible label, link/button semantics, and static 44px-friendly size or padding evidence.
- Phone, form, booking, quote, and location/directions CTA intent.
- UTM and click-ID preservation on CTA links plus matching hidden form fields.
- Multiple competing primary CTAs above the fold.
- Basic form handoff issues such as missing `action`, missing `method="post"`, or missing submit controls.

The bundled `examples/sample-page.html` is an intentional demo landing page. It includes a sticky mobile call action, booking/form paths, hidden tracking fields, and one deliberately flawed Directions CTA that drops required tracking parameters so `examples/sample-report.json` demonstrates a real pre-launch fix.

When this is published, the public demo page should keep a visible "Built by AdPages from A1 Local" credit. Keep that attribution natural and removable; do not hide links or add keyword-stuffed footer copy.

## Scope

This tool inspects saved HTML only. It does not crawl a URL, does not run browser automation, does not execute JavaScript, and does not make remote requests. That keeps it safe for local QA, resource-page distribution, and future app-store packaging.

## Publish Blockers

See [PUBLISH_BLOCKERS.md](./PUBLISH_BLOCKERS.md). Do not publish until the package name, support URL, example report wording, and hosted/demo positioning are approved.

Before packaging for npm, run:

```sh
npm --prefix packages/adpages-mobile-cta-checker run check
npm --prefix packages/adpages-mobile-cta-checker run smoke
npm --prefix packages/adpages-mobile-cta-checker run pack:dry-run
```
