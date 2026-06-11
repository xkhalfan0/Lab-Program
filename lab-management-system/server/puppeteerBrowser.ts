import { existsSync } from "fs";
import puppeteer, { type Browser } from "puppeteer";

const PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

const LINUX_CHROMIUM_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
];

function chromiumCandidates(): string[] {
  const paths: string[] = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    paths.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  }
  try {
    paths.push(puppeteer.executablePath());
  } catch {
    /* bundled browser not installed */
  }
  if (process.platform === "linux") {
    paths.push(...LINUX_CHROMIUM_PATHS);
  }
  return paths;
}

export function resolveChromiumExecutable(): string | undefined {
  return chromiumCandidates().find((p) => existsSync(p));
}

export async function launchPuppeteerBrowser(): Promise<Browser> {
  const executablePath = resolveChromiumExecutable();
  if (!executablePath && process.platform !== "win32") {
    throw new Error(
      "Chrome/Chromium not found on the server. Rebuild the app so system Chromium is installed."
    );
  }

  return puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: PUPPETEER_ARGS,
  });
}
