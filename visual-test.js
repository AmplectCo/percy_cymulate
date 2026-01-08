import { config as loadEnv } from "dotenv";
import { execSync } from "child_process";
import fs from "fs";
import yaml from "js-yaml";

loadEnv();

const baseUrl = process.env.BASE_URL;
const token = process.env.PERCY_TOKEN;

if (!baseUrl) {
  console.error("❌ BASE_URL is missing (not in .env or GitHub Secrets)");
  process.exit(1);
}
if (!token) {
  console.error("❌ PERCY_TOKEN is missing (not in .env or GitHub Secrets)");
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

// It scrolls the page to trigger lazy-loading and waits for images/SVG/fonts to load.
const waitForAssetsScript = `
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Scroll down to trigger IntersectionObserver / lazy-loading
  const scrollStep = window.innerHeight || 800;
  while (document.documentElement.scrollTop + window.innerHeight < document.documentElement.scrollHeight) {
    window.scrollBy(0, scrollStep);
    await sleep(100);
  }

  // Scroll back to top so screenshots look normal
  window.scrollTo(0, 0);

  // Wait for all <img> elements to finish loading
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

  // Wait for SVG <img> + inline <svg> to settle a bit
  await sleep(500);

  // Wait for fonts (if supported)
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
`;



// Generate YAML for Percy
const yamlData = {
  version: 1,
  snapshots: fullUrls.map((u) => ({
    name: u,
    url: u,
    widths: [1920, 414],
    percyCSS: ".cy-featured-posts, .cy-customers-archive, .cy-sticky-post, #onetrust-consent-sdk, #INDWrap, #chat-widget, .cy-animation-bar__progress-value,.cy-animation-number__value { display: none !important; }",
    browsers: ["chrome", "safari"],
    waitForTimeout: 5000, // Base wait time in milliseconds
    execute: {
      beforeSnapshot: waitForAssetsScript,
    },
  })),
};

// Write to temporary file
const tmpFile = "./urls.yml";
fs.writeFileSync(tmpFile, yaml.dump(yamlData));

console.log("🌍 Testing site:", baseUrl);
console.log(`📝 ${fullUrls.length} URLs written to ${tmpFile}`);

try {
  execSync(`npx percy snapshot ${tmpFile} ` +
      `--network-idle-timeout=10000 `,{
    stdio: "inherit",
    env: {
      ...process.env,
      PERCY_TOKEN: token,
    },
  });
  console.log("✅ Percy completed successfully.");
} catch (err) {
  console.error("❌ Percy failed:");
  console.error(err.message);
}

fs.unlinkSync(tmpFile);
