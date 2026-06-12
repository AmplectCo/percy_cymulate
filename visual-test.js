import { config as loadEnv } from "dotenv";
import { execSync } from "child_process";
import fs from "fs";
import yaml from "js-yaml";

loadEnv();

const baseUrl = process.env.BASE_URL;
const token = process.env.PERCY_TOKEN;
// Keep 2 parallel workers for stability
const PARALLEL_WORKERS = Number(process.env.PERCY_PARALLEL_WORKERS || 2);
const NETWORK_IDLE_WAIT_TIMEOUT =
  process.env.PERCY_NETWORK_IDLE_WAIT_TIMEOUT || "60000";
const PAGE_LOAD_TIMEOUT = process.env.PERCY_PAGE_LOAD_TIMEOUT || "60000";
const PERCY_RUN_TIMEOUT_MS = Number(process.env.PERCY_RUN_TIMEOUT_MS || 50 * 60 * 1000);

if (!baseUrl || !token) {
  console.error("❌ BASE_URL or PERCY_TOKEN is missing.");
  process.exit(1);
}

const urls = [
  "/",
  "/platform/",
  "/solutions/validate-exposures/",
  "/solutions/exposure-prioritization/",
  "/attack-path-discovery/",
  "/automated-mitigation/",
  "/solutions/optimize-threat-resilience/",
  "/solutions/exposure-management/",
  "/solutions/validate-response/",
  "/roles-ciso-cio/",
  "/roles-soc-manager/",
  "/red-teaming/",
  "/vulnerability-management/",
  "/cybersecurity-glossary/",
  "/threat-exposure-validation-impact-report/",
  "/reviews/",
  "/ctem-portal/",
  "/mitre-attack/",
  "/cymulate-technology-alliances-partners/",
  "/about-us/",
  "/cymulate-vs-competitors/",
  "/careers/",
  "/contact-us/",
  "/schedule-a-demo/",
  "/customers/",
  "/customers/hertz-israel-reduced-cyber-risk-by-81-percent-within-four-months-with-cymulate/",
  "/guide/buyers-guide-to-exposure-management/",
  "/brochure/cymulate-mssp-program-overview/",
  "/data-sheet/custom-attacks/",
  "/ebook/successful-ctem-depends-on-validation/",
  "/report/gartner-strategic-roadmap-ctem/",
  "/events/cymulate-at-govware-2025-booth-g30/",
  "/press-releases/g2-fall-2025-exposure-management/",
  "/cybersecurity-glossary/adversary-emulation/",
  "/blog/zero-click-one-ntlm-microsoft-security-patch-bypass-cve-2025-50154/",
];

const fullUrls = urls.map((p) => {
  const u = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return u + p;
});

// Scroll script (unchanged)
const waitForAssetsScript = `
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const scrollStep = window.innerHeight || 800;
  while (document.documentElement.scrollTop + window.innerHeight < document.documentElement.scrollHeight) {
    window.scrollBy(0, scrollStep);
    await sleep(100);
  }
  window.scrollTo(0, 0);
  
  const images = Array.from(document.querySelectorAll('img'));
  await Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        setTimeout(resolve, 5000); 
      });
    })
  );
  await sleep(1000); 
`;

// --- FILE 1: Snapshot List ---
const snapshotsData = {
  snapshots: fullUrls.map((u) => ({
    name: u,
    url: u,
    waitForTimeout: 1000,
    execute: {
      beforeSnapshot: waitForAssetsScript,
    },
    // CSS to hide irrelevant elements
    percyCSS: "iframe, .cy-featured-posts, .cy-customers-archive, .cy-sticky-post, #onetrust-consent-sdk, #INDWrap, #chat-widget, .cy-animation-bar__progress-value, .cy-animation-number__value { display: none !important; }",
  })),
};

// Third-party hosts aborted during asset discovery. They are invisible in
// snapshots (widgets/iframes are hidden via percyCSS), but their ~900 requests
// per few pages starved the CI runner's network, so same-origin assets could
// not finish within the idle budget ("Timed out waiting for network requests
// to idle").
const disallowedHostnames = [
  // tag managers / analytics
  "www.googletagmanager.com",
  "*.google-analytics.com",
  "analytics.google.com",
  "*.doubleclick.net",
  "*.hotjar.com",
  "*.hotjar.io",
  "*.posthog.com",
  "analytics.ahrefs.com",
  // B2B intent / identity trackers
  "*.6sc.co",
  "*.6sense.com",
  "*.vector.co",
  "api.usergems.com",
  "ug-webapp-public-production.s3.amazonaws.com",
  "a.usbrowserspeed.com",
  "a.remarketstats.com",
  "s.ml-attr.com",
  "tracking-api.g2.com",
  "tracking.g2crowd.com",
  // ad / social pixels
  "px.ads.linkedin.com",
  "snap.licdn.com",
  "connect.facebook.net",
  "www.facebook.com",
  "t.co",
  "analytics.twitter.com",
  "static.ads-twitter.com",
  "*.quora.com",
  "static.oktopost.com",
  "okt.to",
  // HubSpot tracking only (forms/CTAs stay allowed)
  "track.hubspot.com",
  "js.hs-analytics.net",
  "js.hsadspixel.net",
  // A/B testing — blocking also keeps snapshots on the control variant
  "*.visualwebsiteoptimizer.com",
  // widgets already hidden via percyCSS (iframes, #INDWrap, #chat-widget)
  "*.supademo.com",
  "*.salespeak.ai",
  "salespeak-public-serving.s3.amazonaws.com",
  "js.storylane.io",
  "cdn.equalweb.com",
  // consent banner (hidden via percyCSS)
  "cookie-cdn.cookiepro.com",
  "geolocation.onetrust.com",
];

// --- FILE 2: Global Config ---
const configData = {
  version: 2,
  snapshot: {
    widths: [1920, 414],
    browsers: ["chrome"]
  },
  discovery: {
    // IMPORTANT: removed networkIdleTimeout from here!
    // Keeping only User-Agent for Cloudflare
    userAgent: "PercyBot/1.0",
    concurrency: PARALLEL_WORKERS,
    disallowedHostnames,
  }
};

const snapshotsFile = "./snapshots.yml";
const configFile = "./percy-config.yml";

fs.writeFileSync(snapshotsFile, yaml.dump(snapshotsData));
fs.writeFileSync(configFile, yaml.dump(configData));

console.log(`📝 Generated configs.`);
console.log(`🌍 Starting Percy... Workers: ${PARALLEL_WORKERS}`);
console.log(
  `⏱️ Network idle wait timeout: ${NETWORK_IDLE_WAIT_TIMEOUT}ms`
);
console.log(`⏱️ Page load timeout: ${PAGE_LOAD_TIMEOUT}ms`);

try {
  // Use ENV variable for network idle timeout
  console.log(`TOTAL_SNAPSHOTS=${urls.length}`);
  execSync(
    `npx percy snapshot ${snapshotsFile} --config ${configFile}`,
    {
      stdio: "inherit",
      timeout: PERCY_RUN_TIMEOUT_MS,
      env: {
        ...process.env,
        PERCY_TOKEN: token,
        PERCY_NETWORK_IDLE_WAIT_TIMEOUT: NETWORK_IDLE_WAIT_TIMEOUT,
        PERCY_PAGE_LOAD_TIMEOUT: PAGE_LOAD_TIMEOUT
      },
    }
  );
  console.log("✅ Percy completed successfully.");
} catch (err) {
  const reason =
    err.code === "ETIMEDOUT"
      ? `timed out after ${PERCY_RUN_TIMEOUT_MS}ms (PERCY_RUN_TIMEOUT_MS)`
      : err.status != null
        ? `percy exited with code ${err.status}`
        : err.signal
          ? `killed by signal ${err.signal}`
          : err.message;
  console.error(`❌ Percy failed: ${reason}`);
  process.exit(1);
} finally {
  if (fs.existsSync(snapshotsFile)) fs.unlinkSync(snapshotsFile);
  if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
}