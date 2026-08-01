#!/usr/bin/env node
/**
 * Send today's daily-brief report as an HTML email via QQ SMTP.
 *
 * Prerequisites:
 *   - QQ_EMAIL + QQ_SMTP_AUTH_CODE in GitHub Secrets (or .env.local for local testing)
 *   - npm run daily must have completed successfully today
 *
 * Usage:
 *   node scripts/notify-email.mjs
 *   node scripts/notify-email.mjs 2026-08-01    # send a specific date
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);

// Load .env.local for local testing
const envPath = path.join(projectRoot, ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const QQ_EMAIL = process.env.QQ_EMAIL;
const QQ_SMTP_AUTH_CODE = process.env.QQ_SMTP_AUTH_CODE;

if (!QQ_EMAIL || !QQ_SMTP_AUTH_CODE) {
  console.error("[email] QQ_EMAIL or QQ_SMTP_AUTH_CODE not set");
  process.exit(1);
}

function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const date = process.argv[2] || todayKey();
const htmlPath = path.join(projectRoot, "daily_reports", date, `${date}.html`);

if (!fs.existsSync(htmlPath)) {
  console.error(`[email] report not found: ${htmlPath}`);
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, "utf8");

// Inline a simple mobile-friendly wrapper
const emailHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.6; color: #333; max-width: 680px; margin: 0 auto; padding: 16px; }
  h1, h2, h3 { color: #1a1a1a; }
  a { color: #0969da; }
  .ticker { display: inline-block; margin: 2px 0; }
  .up { color: #cf1322; }
  .down { color: #389e0d; }
  @media (max-width: 480px) { body { padding: 10px; font-size: 14px; } }
</style>
</head>
<body>
${html}
</body>
</html>`;

async function send() {
  // Dynamic import — nodemailer may not be installed locally (only needed in CI)
  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch {
    console.error("[email] nodemailer not installed. Run: npm install nodemailer");
    process.exit(1);
  }

  const transporter = nodemailer.default.createTransport({
    host: "smtp.qq.com",
    port: 465,
    secure: true,
    auth: {
      user: QQ_EMAIL,
      pass: QQ_SMTP_AUTH_CODE,
    },
  });

  console.log(`[email] sending ${date} report to ${QQ_EMAIL}...`);

  const info = await transporter.sendMail({
    from: `"每日简报" <${QQ_EMAIL}>`,
    to: QQ_EMAIL,
    subject: `每日简报 · ${date}`,
    html: emailHtml,
    headers: { "X-Priority": "3" },
  });

  console.log(`[email] OK — messageId: ${info.messageId}`);
}

send().catch((e) => {
  console.error(`[email] FAILED: ${e.message}`);
  process.exit(1);
});
