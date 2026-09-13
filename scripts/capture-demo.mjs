import { chromium } from "playwright-core";
import path from "path";
import fs from "fs";

const OUT = "/cursor/stores/bc-6f886c29-608b-4e12-a2a3-b795ef27579c/media";
const URL = process.env.CAPTURE_URL || "http://127.0.0.1:4288/";

async function shot(page, name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, type: "png" });
  console.log("wrote", dest, fs.statSync(dest).size);
}

async function startGame(page) {
  const btn = page.locator("button", { hasText: "Clear for taxi" });
  await btn.waitFor({ timeout: 25000 });
  await btn.click({ force: true });
  await page.getByText("pts", { exact: true }).waitFor({ timeout: 15000 });
}

async function drawFromDriver(page) {
  const start = await page.evaluate(() => window.__volt?.driverScreen(0));
  if (!start) {
    console.warn("no driver screen point");
    return;
  }
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const pathPts = [
    [30, -18],
    [70, -40],
    [120, -36],
    [170, -8],
    [210, 28],
    [240, 48],
  ];
  for (const [dx, dy] of pathPts) {
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 5 });
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--ignore-gpu-blocklist",
      "--enable-webgl",
    ],
  });

  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await desktop.newPage();
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.locator("button", { hasText: "Clear for taxi" }).waitFor({ timeout: 25000 });
  await shot(page, "desktop-start.png");

  await startGame(page);
  await page.waitForTimeout(700);
  await shot(page, "desktop-map.png");

  await drawFromDriver(page);
  await page.waitForTimeout(2200);
  await shot(page, "desktop-route.png");

  await page.getByRole("button", { name: /shop|leaderboard/i }).nth(1).click();
  await page.waitForTimeout(500);
  // Shop is the bag icon; try aria-label
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Shop" }).click();
  await page.waitForTimeout(600);
  await shot(page, "desktop-shop.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);

  await page.getByRole("button", { name: "Leaderboard" }).click();
  await page.waitForTimeout(600);
  await shot(page, "desktop-board.png");
  await desktop.close();

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const p = await phone.newPage();
  await p.goto(URL, { waitUntil: "domcontentloaded" });
  await p.locator("button", { hasText: "Clear for taxi" }).waitFor({ timeout: 25000 });
  await shot(p, "phone-start.png");
  await startGame(p);
  await p.waitForTimeout(900);
  await drawFromDriver(p);
  await p.waitForTimeout(1600);
  await shot(p, "phone-play.png");
  await p.getByRole("button", { name: "Shop" }).click();
  await p.waitForTimeout(700);
  await shot(p, "phone-shop.png");
  await phone.close();
  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
