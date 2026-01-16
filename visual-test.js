import { config as loadEnv } from "dotenv";
import { execSync } from "child_process";
import fs from "fs";
import yaml from "js-yaml";

loadEnv();

const baseUrl = process.env.BASE_URL;
const token = process.env.PERCY_TOKEN;
const PARALLEL_WORKERS = process.env.PERCY_PARALLEL_WORKERS || "2";

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

// Скрипт прокрутки (Lazy loading)
const waitForAssetsScript = `
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const scrollStep = window.innerHeight || 800;
  while (document.documentElement.scrollTop + window.innerHeight < document.documentElement.scrollHeight) {
    window.scrollBy(0, scrollStep);
    await sleep(100);
  }
  window.scrollTo(0, 0);
  // Ждем картинки
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
  await sleep(1000); // Чуть увеличил ожидание
`;

// --- ФАЙЛ 1: Список снимков (Snapshot List) ---
// Убираем отсюда requestHeaders и version, оставляем только то, что касается конкретного URL
const snapshotsData = {
  snapshots: fullUrls.map((u) => ({
    name: u,
    url: u,
    // Эти настройки разрешены внутри снимка
    waitForTimeout: 5000, 
    execute: {
      beforeSnapshot: waitForAssetsScript,
    },
    // CSS можно оставить здесь или вынести в глобальный конфиг, оставим здесь для точности
    percyCSS: "iframe, .cy-featured-posts, .cy-customers-archive, .cy-sticky-post, #onetrust-consent-sdk, #INDWrap, #chat-widget, .cy-animation-bar__progress-value, .cy-animation-number__value { display: none !important; }",
  })),
};

// --- ФАЙЛ 2: Глобальная конфигурация (Global Config) ---
// Сюда переносим User-Agent, таймауты и ширину
const configData = {
  version: 2,
  snapshot: {
    widths: [1920, 414],
    browsers: ["chrome", "safari"]
  },
  discovery: {
    // Вот где должны жить заголовки
    userAgent: "PercyBot/1.0",
    networkIdleTimeout: 60000,
    // Если нужно больше заголовков:
    // requestHeaders: { "Authorization": "..." } 
  }
};

const snapshotsFile = "./snapshots.yml";
const configFile = "./percy-config.yml";

fs.writeFileSync(snapshotsFile, yaml.dump(snapshotsData));
fs.writeFileSync(configFile, yaml.dump(configData));

console.log(`📝 Generated ${snapshotsFile} and ${configFile}`);
console.log(`🌍 Starting Percy with ${PARALLEL_WORKERS} workers...`);

try {
  // Запускаем Percy, указывая ДВА файла: список URL и файл настроек
  execSync(
    `npx percy snapshot ${snapshotsFile} --config ${configFile}`, 
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PERCY_TOKEN: token,
        PERCY_PARALLEL_WORKERS: PARALLEL_WORKERS,
      },
    }
  );
  console.log("✅ Percy completed successfully.");
} catch (err) {
  console.error("❌ Percy failed.");
  // process.exit(1) нужен, чтобы GitHub Action покраснел
  process.exit(1);
} finally {
  // Чистим за собой
  if (fs.existsSync(snapshotsFile)) fs.unlinkSync(snapshotsFile);
  if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
}