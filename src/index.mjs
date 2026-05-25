const DEFAULT_REPORT_VERSION = "0.1.0";
const HIGH_INTENT_TERMS = [
  "book",
  "booking",
  "call",
  "contact",
  "directions",
  "estimate",
  "enquire",
  "get started",
  "location",
  "quote",
  "request",
  "schedule",
  "visit"
];
const PRIMARY_CLASS_TERMS = [
  "button",
  "btn",
  "call",
  "cta",
  "fixed",
  "mobile",
  "primary",
  "sticky"
];
const TRACKING_PARAM_HINTS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid"
];

export function analyzeMobileCtaHtml(html, options = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new TypeError("analyzeMobileCtaHtml requires non-empty HTML text");
  }

  const cleanedHtml = removeInvisibleBlocks(html);
  const plainText = normalizeText(stripTags(cleanedHtml));
  const aboveFoldLimit = getAboveFoldLimit(cleanedHtml);
  const finalUrl = typeof options.finalUrl === "string" && options.finalUrl.trim()
    ? options.finalUrl.trim()
    : "";
  const requiredParams = collectRequiredParams(options.requiredParams || [], finalUrl);
  const mobileCssHints = extractMobileCssHints(cleanedHtml);
  const forms = extractForms(cleanedHtml, requiredParams);
  const ctas = extractClickableElements(cleanedHtml).map((cta) => enrichCta(cta, {
    aboveFoldLimit,
    finalUrl,
    mobileCssHints,
    requiredParams
  }));

  const phoneTextMatches = detectPhoneText(plainText);
  const phoneCtas = ctas.filter((cta) => cta.intent === "phone");
  const formCtas = ctas.filter((cta) => cta.intent === "form" || cta.intent === "quote" || cta.intent === "booking");
  const locationCtas = ctas.filter((cta) => cta.intent === "location");
  const telLinks = ctas.filter((cta) => /^tel:/i.test(cta.href));
  const likelyCtas = ctas.filter((cta) => cta.isLikelyCta);
  const aboveFoldCtas = likelyCtas.filter((cta) => cta.isAboveFold);
  const stickyMobileCtas = likelyCtas.filter((cta) => cta.isSticky || cta.hasMobileHint);
  const tapTargetWarnings = analyzeTapTargets(likelyCtas);
  const utmPreservation = analyzeTrackingPreservation(ctas, forms, requiredParams, finalUrl);
  const competingPrimaryCtas = analyzeCompetingPrimaryCtas(aboveFoldCtas);
  const formFindings = analyzeForms(forms);
  const locationSignals = detectLocationSignals(plainText, locationCtas);

  const issues = buildIssues({
    aboveFoldCtas,
    stickyMobileCtas,
    tapTargetWarnings,
    phoneTextMatches,
    phoneCtas,
    telLinks,
    formCtas,
    locationSignals,
    utmPreservation,
    competingPrimaryCtas,
    formFindings
  });
  const score = scoreIssues(issues);

  return {
    tool: "adpages-mobile-cta-checker",
    version: DEFAULT_REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    input: {
      finalUrl: finalUrl || null,
      requiredParams,
      htmlCharacters: html.length
    },
    score,
    grade: gradeScore(score),
    summary: summarizeScore(score, issues),
    signals: {
      aboveFold: {
        characterLimitUsed: aboveFoldLimit,
        likelyCtaCount: aboveFoldCtas.length,
        ctas: aboveFoldCtas.map(compactCta)
      },
      stickyMobile: {
        hasStickyOrMobileCta: stickyMobileCtas.length > 0,
        candidates: stickyMobileCtas.map(compactCta),
        cssHints: mobileCssHints
      },
      tapTargets: {
        checked: likelyCtas.length,
        warnings: tapTargetWarnings
      },
      phone: {
        telLinks: telLinks.map(compactCta),
        phoneIntentCtas: phoneCtas.map(compactCta),
        phoneTextMatches,
        hasPhoneTextWithoutTelLink: phoneTextMatches.length > 0 && telLinks.length === 0
      },
      forms: {
        count: forms.length,
        findings: formFindings,
        forms: forms.map((form) => ({
          action: form.action || null,
          method: form.method || "get",
          hasSubmit: form.hasSubmit,
          hiddenTrackingFields: form.hiddenTrackingFields
        }))
      },
      location: locationSignals,
      trackingPreservation: utmPreservation,
      competingPrimaryCtas
    },
    issues,
    recommendations: buildRecommendations(issues)
  };
}

export function formatTextSummary(report) {
  const lines = [
    `AdPages Mobile CTA Checker: ${report.grade} (${report.score}/100)`,
    report.summary,
    "",
    `Above-fold CTAs: ${report.signals.aboveFold.likelyCtaCount}`,
    `Sticky/mobile CTA candidates: ${report.signals.stickyMobile.candidates.length}`,
    `Phone CTAs: ${report.signals.phone.telLinks.length}`,
    `Forms: ${report.signals.forms.count}`,
    `Location CTAs/signals: ${report.signals.location.ctaCount}/${report.signals.location.addressSignals.length}`,
    `Tracking params checked: ${report.signals.trackingPreservation.requiredParams.join(", ") || "none"}`
  ];

  if (report.issues.length) {
    lines.push("", "Issues:");
    for (const issue of report.issues) {
      lines.push(`- [${issue.severity}] ${issue.message}`);
      if (issue.evidence) lines.push(`  Evidence: ${issue.evidence}`);
    }
  } else {
    lines.push("", "No local CTA issues found in the saved HTML.");
  }

  if (report.recommendations.length) {
    lines.push("", "Next fixes:");
    for (const recommendation of report.recommendations) {
      lines.push(`- ${recommendation}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function extractClickableElements(html) {
  const elements = [];
  const pattern = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>|<input\b([^>]*)>/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const tag = (match[1] || "input").toLowerCase();
    const rawAttrs = match[2] || match[4] || "";
    const attrs = parseAttributes(rawAttrs);
    const type = (attrs.type || "").toLowerCase();
    const innerHtml = match[3] || "";

    if (tag === "input" && !["button", "image", "submit"].includes(type)) {
      continue;
    }

    const label = normalizeText(
      attrs["aria-label"] ||
      attrs.title ||
      attrs.value ||
      stripTags(innerHtml)
    );

    elements.push({
      tag,
      index: match.index,
      attrs,
      label,
      href: attrs.href || "",
      rawAttrs
    });
  }

  return elements;
}

function extractForms(html, requiredParams) {
  const forms = [];
  const pattern = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const attrs = parseAttributes(match[1] || "");
    const body = match[2] || "";
    const inputs = extractInputs(body);
    const hiddenNames = inputs
      .filter((input) => input.type === "hidden")
      .map((input) => input.name)
      .filter(Boolean);

    forms.push({
      index: match.index,
      action: attrs.action || "",
      method: (attrs.method || "get").toLowerCase(),
      hasSubmit: /<button\b[^>]*type=["']?submit|<button\b|<input\b[^>]*type=["']?submit/i.test(body),
      hiddenTrackingFields: hiddenNames.filter((name) => requiredParams.includes(name)),
      allHiddenFields: hiddenNames
    });
  }

  return forms;
}

function extractInputs(html) {
  const inputs = [];
  const pattern = /<input\b([^>]*)>/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const attrs = parseAttributes(match[1] || "");
    inputs.push({
      type: (attrs.type || "text").toLowerCase(),
      name: attrs.name || "",
      value: attrs.value || ""
    });
  }

  return inputs;
}

function enrichCta(cta, context) {
  const classText = `${cta.attrs.class || ""} ${cta.attrs.id || ""}`.toLowerCase();
  const styleText = `${cta.attrs.style || ""}`.toLowerCase();
  const labelText = cta.label.toLowerCase();
  const hrefText = cta.href.toLowerCase();
  const combined = `${labelText} ${hrefText} ${classText}`;
  const intent = classifyIntent(combined, cta);
  const hasPrimaryClass = PRIMARY_CLASS_TERMS.some((term) => classText.includes(term));
  const isLikelyCta = intent !== "other" || hasPrimaryClass || HIGH_INTENT_TERMS.some((term) => labelText.includes(term));
  const isSticky = /\b(position\s*:\s*(fixed|sticky)|fixed|sticky|bottom-0|call-bar|cta-bar|floating|dock)\b/.test(`${styleText} ${classText}`);
  const hasMobileHint = /\b(mobile|sm:|md:hidden|lg:hidden|phone|tap|bottom|fixed|sticky)\b/.test(classText) ||
    context.mobileCssHints.length > 0 && /\b(mobile|call-bar|phone|sticky|fixed|bottom)\b/.test(classText);
  const resolvedHref = resolveHref(cta.href, context.finalUrl);

  return {
    ...cta,
    href: cta.href ? decodeHtml(cta.href) : "",
    resolvedHref,
    intent,
    isLikelyCta,
    isAboveFold: cta.index <= context.aboveFoldLimit,
    isSticky,
    hasMobileHint,
    hasAccessibleName: Boolean(cta.label),
    hasTapTargetSizeHint: hasTapTargetSizeHint(cta),
    trackingParamsPresent: getPresentParams(cta.href, context.requiredParams, context.finalUrl)
  };
}

function analyzeTapTargets(ctas) {
  return ctas
    .filter((cta) => !cta.hasAccessibleName || !cta.hasTapTargetSizeHint || !hasClickableSemantics(cta))
    .map((cta) => ({
      label: cta.label || "(unlabelled)",
      href: cta.href || null,
      issues: [
        !cta.hasAccessibleName ? "missing_accessible_name" : "",
        !cta.hasTapTargetSizeHint ? "no_static_44px_size_or_padding_hint" : "",
        !hasClickableSemantics(cta) ? "weak_clickable_semantics" : ""
      ].filter(Boolean)
    }));
}

function analyzeTrackingPreservation(ctas, forms, requiredParams, finalUrl) {
  const navigationalCtas = ctas.filter((cta) => cta.isLikelyCta && shouldCheckTracking(cta.href));
  const formCoverage = requiredParams.filter((param) => forms.some((form) => form.hiddenTrackingFields.includes(param)));

  if (!requiredParams.length) {
    return {
      status: "skipped",
      requiredParams: [],
      checkedLinks: navigationalCtas.length,
      preservingLinks: [],
      missingLinks: [],
      formCoverage,
      note: "Pass --required-param or a --final-url with tracking parameters to check CTA preservation."
    };
  }

  const preservingLinks = [];
  const missingLinks = [];

  for (const cta of navigationalCtas) {
    const present = getPresentParams(cta.href, requiredParams, finalUrl);
    const missing = requiredParams.filter((param) => !present.includes(param));

    if (missing.length) {
      missingLinks.push({
        label: cta.label || "(unlabelled)",
        href: cta.href,
        missingParams: missing
      });
    } else {
      preservingLinks.push({
        label: cta.label || "(unlabelled)",
        href: cta.href,
        params: present
      });
    }
  }

  return {
    status: missingLinks.length ? "attention" : "passed",
    requiredParams,
    checkedLinks: navigationalCtas.length,
    preservingLinks,
    missingLinks,
    formCoverage,
    note: formCoverage.length
      ? "Hidden form fields preserve at least one required tracking parameter."
      : "No matching hidden form tracking fields were found."
  };
}

function analyzeCompetingPrimaryCtas(aboveFoldCtas) {
  const primary = aboveFoldCtas.filter((cta) => cta.intent !== "other");
  const intents = unique(primary.map((cta) => cta.intent));
  const labels = unique(primary.map((cta) => cta.label).filter(Boolean));
  return {
    primaryCount: primary.length,
    uniqueIntents: intents,
    labels,
    hasCompetingPrimaries: intents.length > 2 || labels.length > 4,
    note: intents.length > 2
      ? "Above-the-fold CTAs ask mobile visitors to choose between several different actions."
      : "Primary CTA set is reasonably focused."
  };
}

function analyzeForms(forms) {
  return forms.flatMap((form, index) => {
    const findings = [];
    if (!form.action) {
      findings.push({
        form: index + 1,
        severity: "warning",
        code: "form_missing_action",
        message: "Lead form has no action attribute in the saved HTML."
      });
    }
    if (form.method !== "post") {
      findings.push({
        form: index + 1,
        severity: "warning",
        code: "form_not_post",
        message: "Lead form is not explicitly configured with method=\"post\"."
      });
    }
    if (!form.hasSubmit) {
      findings.push({
        form: index + 1,
        severity: "warning",
        code: "form_missing_submit",
        message: "Lead form has no obvious submit button in the saved HTML."
      });
    }
    return findings;
  });
}

function detectLocationSignals(plainText, locationCtas) {
  const addressSignals = [];
  const addressPattern = /\b\d{1,5}\s+[a-z0-9'. -]+\s+(street|st|road|rd|avenue|ave|drive|dr|boulevard|blvd|lane|ln|way|highway|hwy|terrace|tce)\b/gi;
  let match;

  while ((match = addressPattern.exec(plainText)) !== null) {
    addressSignals.push(match[0]);
    if (addressSignals.length >= 5) break;
  }

  return {
    ctaCount: locationCtas.length,
    ctas: locationCtas.map(compactCta),
    addressSignals: unique(addressSignals)
  };
}

function buildIssues(context) {
  const issues = [];

  if (context.aboveFoldCtas.length === 0) {
    issues.push({
      severity: "major",
      code: "missing_above_fold_cta",
      message: "No likely CTA appears early enough in the saved HTML to count as above the fold.",
      evidence: "No call, quote, booking, contact, or directions CTA found in the first content segment.",
      remediation: "Place one clear primary CTA in the mobile header or hero."
    });
  }

  if (context.stickyMobileCtas.length === 0) {
    issues.push({
      severity: "warning",
      code: "missing_sticky_mobile_cta",
      message: "No sticky or mobile-specific CTA pattern was detected.",
      evidence: "No fixed/sticky/mobile call or CTA classes were found.",
      remediation: "Add a compact mobile call, quote, or booking action that stays available after scrolling."
    });
  }

  if (context.phoneTextMatches.length > 0 && context.telLinks.length === 0) {
    issues.push({
      severity: "warning",
      code: "phone_text_without_tel_link",
      message: "Phone-like text appears on the page, but no tel: CTA was found.",
      evidence: context.phoneTextMatches.slice(0, 2).join(", "),
      remediation: "Wrap visible phone numbers in tel: links for mobile visitors."
    });
  }

  if (context.phoneCtas.length === 0 && context.formCtas.length === 0) {
    issues.push({
      severity: "major",
      code: "missing_direct_lead_cta",
      message: "No phone, quote, booking, or form CTA was detected.",
      evidence: "The page may have navigation links but no direct lead-capture action.",
      remediation: "Add a direct phone or enquiry path near the top of the mobile page."
    });
  }

  if (context.locationSignals.ctaCount === 0 && context.locationSignals.addressSignals.length === 0) {
    issues.push({
      severity: "info",
      code: "missing_location_signal",
      message: "No map, directions, or address signal was detected.",
      evidence: "Local-service pages often need a service-area or directions path.",
      remediation: "Add a location, directions, or service-area CTA where it helps buyer confidence."
    });
  }

  for (const warning of context.tapTargetWarnings.slice(0, 6)) {
    issues.push({
      severity: "warning",
      code: "weak_tap_target",
      message: `CTA "${warning.label}" lacks strong mobile tap-target evidence.`,
      evidence: warning.issues.join(", "),
      remediation: "Use a semantic link/button with an accessible label and at least 44px height or clear padding."
    });
  }

  if (context.utmPreservation.missingLinks.length) {
    issues.push({
      severity: "major",
      code: "tracking_params_not_preserved",
      message: "One or more CTA links do not preserve required tracking parameters.",
      evidence: context.utmPreservation.missingLinks
        .slice(0, 3)
        .map((link) => `${link.label}: ${link.missingParams.join(", ")}`)
        .join("; "),
      remediation: "Carry click IDs and required UTM parameters into booking/contact links or matching hidden form fields."
    });
  }

  if (context.competingPrimaryCtas.hasCompetingPrimaries) {
    issues.push({
      severity: "warning",
      code: "competing_primary_ctas",
      message: "Multiple competing primary CTA intents appear above the fold.",
      evidence: context.competingPrimaryCtas.uniqueIntents.join(", "),
      remediation: "Pick one dominant mobile action, then demote secondary choices."
    });
  }

  for (const finding of context.formFindings) {
    issues.push({
      severity: finding.severity,
      code: finding.code,
      message: finding.message,
      evidence: `Form ${finding.form}`,
      remediation: "Confirm the saved production HTML posts to the intended lead endpoint."
    });
  }

  return issues;
}

function buildRecommendations(issues) {
  const byCode = new Map([
    ["missing_above_fold_cta", "Put the strongest conversion action in the mobile header or hero before secondary navigation."],
    ["missing_sticky_mobile_cta", "Add a bottom sticky mobile CTA for call, quote, booking, or contact."],
    ["phone_text_without_tel_link", "Make phone numbers tappable with tel: links and readable labels."],
    ["missing_direct_lead_cta", "Add at least one direct lead path: call, quote, booking, or form."],
    ["missing_location_signal", "Add directions or service-area evidence when local proximity matters."],
    ["weak_tap_target", "Give CTA links/buttons accessible names and 44px-friendly mobile sizing."],
    ["tracking_params_not_preserved", "Preserve required UTM and click-ID parameters across CTA links and forms."],
    ["competing_primary_ctas", "Reduce the above-fold CTA set to one primary buyer action plus one secondary option."],
    ["form_missing_action", "Set the form action explicitly in production HTML."],
    ["form_not_post", "Use method=\"post\" for lead forms unless there is a deliberate reason not to."],
    ["form_missing_submit", "Include a visible, semantic submit control for lead forms."]
  ]);
  return unique(issues.map((issue) => byCode.get(issue.code)).filter(Boolean));
}

function scoreIssues(issues) {
  const penalty = issues.reduce((total, issue) => {
    if (issue.severity === "major") return total + 15;
    if (issue.severity === "warning") return total + 7;
    return total + 3;
  }, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function gradeScore(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function summarizeScore(score, issues) {
  const majorCount = issues.filter((issue) => issue.severity === "major").length;
  if (score >= 90) return "Mobile CTA setup looks strong in the saved HTML.";
  if (majorCount) return `${majorCount} major mobile CTA issue${majorCount === 1 ? "" : "s"} should be fixed before launch.`;
  return "No major blocker was found, but the page has mobile CTA cleanup opportunities.";
}

function classifyIntent(combined, cta) {
  if (/tel:|call|phone|ring|speak/.test(combined)) return "phone";
  if (/maps\.google|google\.com\/maps|maps\.app|apple\.com\/maps|direction|location|find us|visit us|map\b/.test(combined)) return "location";
  if (/book|booking|schedule|appointment|calendar|calendly/.test(combined)) return "booking";
  if (/quote|estimate|pricing|proposal/.test(combined)) return "quote";
  if (/contact|enquire|inquire|message|form|lead|submit/.test(combined)) return "form";
  if (cta.tag === "button" || cta.tag === "input") return "form";
  return "other";
}

function hasTapTargetSizeHint(cta) {
  const text = `${cta.rawAttrs || ""} ${cta.attrs.class || ""}`.toLowerCase();
  if (/\b(h-11|h-12|h-14|h-16|min-h|py-3|py-4|p-3|p-4|btn|button|cta|tap-target)\b/.test(text)) {
    return true;
  }

  const style = (cta.attrs.style || "").toLowerCase();
  const height = style.match(/(?:min-height|height)\s*:\s*(\d+)px/);
  const padding = style.match(/padding(?:-[a-z]+)?\s*:\s*(\d+)px/);
  return Boolean(
    height && Number(height[1]) >= 44 ||
    padding && Number(padding[1]) >= 12
  );
}

function hasClickableSemantics(cta) {
  if (cta.tag === "a") return Boolean(cta.href);
  if (cta.tag === "button" || cta.tag === "input") return true;
  return ["button", "link"].includes((cta.attrs.role || "").toLowerCase());
}

function shouldCheckTracking(href) {
  if (!href) return false;
  const trimmed = href.trim().toLowerCase();
  return !trimmed.startsWith("#") &&
    !trimmed.startsWith("tel:") &&
    !trimmed.startsWith("mailto:") &&
    !trimmed.startsWith("sms:") &&
    !trimmed.startsWith("javascript:");
}

function getPresentParams(href, requiredParams, finalUrl) {
  if (!href || !requiredParams.length || !shouldCheckTracking(href)) return [];
  const decodedHref = decodeHtml(href);
  const placeholderMatches = requiredParams.filter((param) => {
    const marker = new RegExp(`({{\\s*${escapeRegExp(param)}\\s*}}|\\[${escapeRegExp(param)}\\]|${escapeRegExp(param)}=)`, "i");
    return marker.test(decodedHref);
  });
  const url = resolveUrl(decodedHref, finalUrl);
  const queryMatches = url
    ? requiredParams.filter((param) => url.searchParams.has(param))
    : [];
  return unique([...placeholderMatches, ...queryMatches]);
}

function collectRequiredParams(explicitParams, finalUrl) {
  const explicit = normalizeParams(Array.isArray(explicitParams) ? explicitParams : [explicitParams]);
  const inferred = [];
  const parsed = resolveUrl(finalUrl, finalUrl);
  if (parsed) {
    for (const param of parsed.searchParams.keys()) {
      if (TRACKING_PARAM_HINTS.includes(param) || param.startsWith("utm_")) {
        inferred.push(param);
      }
    }
  }
  return unique([...explicit, ...inferred]);
}

function normalizeParams(params) {
  return params
    .flatMap((param) => String(param || "").split(","))
    .map((param) => param.trim())
    .filter(Boolean);
}

function resolveHref(href, finalUrl) {
  const url = resolveUrl(decodeHtml(href || ""), finalUrl);
  return url ? url.href : href || "";
}

function resolveUrl(value, finalUrl) {
  if (!value) return null;
  try {
    return new URL(value, finalUrl || "https://example.invalid/");
  } catch {
    return null;
  }
}

function getAboveFoldLimit(html) {
  return Math.min(18000, Math.max(5000, Math.round(html.length * 0.35)));
}

function extractMobileCssHints(html) {
  const hints = [];
  const styleBlocks = html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || [];
  for (const block of styleBlocks) {
    if (/@media[^{]*(max-width|max-device-width|pointer\s*:\s*coarse)[\s\S]{0,1500}(fixed|sticky|bottom|cta|call|phone)/i.test(block)) {
      hints.push("mobile_media_cta_rule");
    }
    if (/position\s*:\s*(fixed|sticky)[\s\S]{0,500}(bottom|call|cta|phone)/i.test(block)) {
      hints.push("sticky_cta_css_rule");
    }
  }
  return unique(hints);
}

function detectPhoneText(text) {
  const matches = text.match(/(?:\+?\d[\d ().-]{7,}\d)/g) || [];
  return unique(matches.map((match) => normalizeText(match)).filter((match) => /\d{8,}/.test(match.replace(/\D/g, "")))).slice(0, 6);
}

function parseAttributes(source) {
  const attrs = {};
  const pattern = /([:@\w.-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const name = match[1].toLowerCase();
    attrs[name] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attrs;
}

function removeInvisibleBlocks(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
}

function stripTags(html) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function normalizeText(text) {
  return decodeHtml(String(text || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function compactCta(cta) {
  return {
    label: cta.label || null,
    tag: cta.tag,
    href: cta.href || null,
    intent: cta.intent,
    aboveFold: cta.isAboveFold,
    sticky: cta.isSticky,
    mobileHint: cta.hasMobileHint,
    tapTargetSizeHint: cta.hasTapTargetSizeHint,
    trackingParamsPresent: cta.trackingParamsPresent
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
