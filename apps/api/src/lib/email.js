import nodemailer from "nodemailer";
import { getPool } from "./state.js";
import { getSettingsConfig } from "./internal.js";
import logger from "./logger.js";

const log = logger.child({ module: "email" });

let _transporter = null;
let _lastConfigHash = null;

/**
 * Build a config hash to detect when SMTP settings change (so we recreate the transporter).
 */
function configHash(cfg) {
  return `${cfg.smtp_host}:${cfg.smtp_port}:${cfg.smtp_user}:${cfg.smtp_from}`;
}

/**
 * Lazy-init nodemailer transporter. Reads SMTP config from:
 *   1. Environment variables (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
 *   2. billing_config keys (smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from)
 * Env vars take precedence. Returns null if SMTP is not configured.
 */
export async function getTransporter() {
  // Try env vars first
  const envHost = (process.env.SMTP_HOST || "").trim();
  const envUser = (process.env.SMTP_USER || "").trim();

  let host, port, user, pass, from;

  if (envHost && envUser) {
    host = envHost;
    port = Number(process.env.SMTP_PORT || 587);
    user = envUser;
    pass = (process.env.SMTP_PASS || "").trim();
    from = (process.env.SMTP_FROM || "").trim() || `noreply@${host}`;
  } else {
    // Fall back to billing_config
    const cfg = await getSettingsConfig(null);
    host = cfg.smtp_host || "";
    port = Number(cfg.smtp_port || 587);
    user = cfg.smtp_user || "";
    pass = cfg.smtp_pass || "";
    from = cfg.smtp_from || "";

    if (!host || !user) return null;
  }

  const hash = configHash({ smtp_host: host, smtp_port: port, smtp_user: user, smtp_from: from });

  // Reuse existing transporter if config hasn't changed
  if (_transporter && _lastConfigHash === hash) return _transporter;

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: pass ? { user, pass } : undefined,
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    rateDelta: 2000,
    rateLimit: 5,
  });
  _transporter._smtpFrom = from;
  _lastConfigHash = hash;
  return _transporter;
}

/**
 * Check if SMTP is configured (without creating a transporter).
 */
export async function isEmailConfigured() {
  const envHost = (process.env.SMTP_HOST || "").trim();
  const envUser = (process.env.SMTP_USER || "").trim();
  if (envHost && envUser) return true;

  const cfg = await getSettingsConfig(null);
  return Boolean(cfg.smtp_host && cfg.smtp_user);
}

/**
 * Send an email. Returns { success, messageId } or { success: false, error }.
 */
// Reply-to address (override via SMTP_REPLY_TO).
const REPLY_TO = process.env.SMTP_REPLY_TO || "support@example.com";
// Sender identity — override via SMTP_SENDER_NAME / SMTP_FROM.
const SENDER_NAME = process.env.SMTP_SENDER_NAME || "Truss";
const SENDER_EMAIL = process.env.SMTP_FROM || "noreply@example.com";

export async function sendEmail({ to, subject, text, html, replyTo }) {
  try {
    const transporter = await getTransporter();
    if (!transporter) {
      return { success: false, error: "SMTP not configured." };
    }

    const mailOpts = {
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      replyTo: replyTo || REPLY_TO,
      to,
      subject,
      text,
      html,
    };
    let info;
    try {
      info = await transporter.sendMail(mailOpts);
    } catch (firstErr) {
      // Retry once after 3s delay (handles "too many clients" transient errors)
      if (firstErr.message?.includes("421") || firstErr.message?.includes("Too many")) {
        log.warn({ err: firstErr.message }, "Email send retry in 3s");
        await new Promise(r => setTimeout(r, 3000));
        info = await transporter.sendMail(mailOpts);
      } else {
        throw firstErr;
      }
    }

    return { success: true, messageId: info.messageId };
  } catch (err) {
    log.error({ err: err.message }, "Email send error");
    return { success: false, error: err.message };
  }
}

/**
 * Reset cached transporter (call after SMTP settings change).
 */
export function resetTransporter() {
  _transporter = null;
  _lastConfigHash = null;
}

// ─── Email templates ───

const SIG_TEXT = "The Truss Team";
const DASHBOARD_URL = process.env.TRUSS_DASHBOARD_URL || "http://localhost:5173";
const SITE_URL = process.env.TRUSS_SITE_URL || "https://github.com/binarysquadd/truss";
const DOCS_URL = process.env.TRUSS_DOCS_URL || SITE_URL;

// Truss logo SVG (inline, ~200 bytes)
const LOGO_SVG = `<svg viewBox="0 0 32 26" width="24" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="2" y1="4" x2="30" y2="4" stroke="#9f1239" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="2" y1="22" x2="30" y2="22" stroke="#9f1239" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="2" y1="4" x2="2" y2="22" stroke="#9f1239" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="16" y1="4" x2="16" y2="22" stroke="#9f1239" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="30" y1="4" x2="30" y2="22" stroke="#9f1239" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="2" cy="4" r="2.5" fill="#9f1239"/><circle cx="16" cy="4" r="2.5" fill="#9f1239"/>
  <circle cx="30" cy="4" r="2.5" fill="#9f1239"/><circle cx="2" cy="22" r="2.5" fill="#9f1239"/>
  <circle cx="16" cy="22" r="2.5" fill="#9f1239"/><circle cx="30" cy="22" r="2.5" fill="#9f1239"/>
</svg>`;

function htmlBtn(text, href) {
  return `<a href="${href}" style="display: inline-block; padding: 12px 28px; background: #9f1239; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 8px 0;">${text}</a>`;
}

function htmlWrap(inner) {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin: 0; padding: 0; background: #f8fafc;">
<div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
  <!-- Logo (text-based — Gmail strips inline SVGs) -->
  <div style="text-align: center; margin-bottom: 32px;">
    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">truss<span style="color: #9f1239;">.</span></span>
  </div>
  <!-- Card -->
  <div style="background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; font-size: 15px; line-height: 1.65;">
    ${inner}
    <!-- Reply note -->
    <p style="color: #94a3b8; font-size: 13px; margin-top: 20px;">You can reply to this email \u2014 I read every one.</p>
  </div>
  <!-- Signature -->
  <div style="text-align: center; margin-top: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #64748b;">
    ${SIG_TEXT}
  </div>
  <div style="text-align: center; margin-top: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #94a3b8;">
    <a href="${SITE_URL}" style="color: #94a3b8; text-decoration: none;">Truss</a>
  </div>
</div>
</body></html>`;
}

export async function sendBillingAlert({ to, tenantEmail, planName, metric, currentValue, limitValue, pct }) {
  const name = tenantEmail || "there";
  const subject = `Heads up \u2014 your ${metric} is at ${pct}%`;
  const text = [
    `Hey ${name},`,
    "",
    `Just a heads up \u2014 your ${metric} usage hit ${pct}% of your ${planName} limit.`,
    "",
    `Current: ${currentValue}`,
    `Limit: ${limitValue}`,
    "",
    "Not urgent yet, but worth keeping an eye on. You can add a booster ($5/mo) or upgrade your plan if you need more room.",
    "",
    `You can reply to this email \u2014 I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>Just a heads up \u2014 your <strong>${metric}</strong> usage hit <strong>${pct}%</strong> of your <strong>${planName}</strong> limit.</p>
    <p>Current: <strong>${currentValue}</strong><br>Limit: <strong>${limitValue}</strong></p>
    <p>Not urgent yet, but worth keeping an eye on. You can add a booster ($5/mo) or upgrade your plan if you need more room.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendWelcomeEmail({ to, displayName }) {
  const name = displayName || "there";
  const subject = "Welcome to Truss";
  const text = [
    `Hey ${name},`,
    "",
    "Thanks for setting up Truss. You've got the full stack running \u2014 database, auth, storage, permissions, the works.",
    "",
    "If you hit any snags, just reply here.",
    "",
    `You can reply to this email \u2014 I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>Thanks for setting up Truss. You've got the full stack running \u2014 database, auth, storage, permissions, the works.</p>
    <p>If you hit any snags, just reply here.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendInviteEmail({ to, orgName, inviterName, inviteToken }) {
  const inviter = inviterName || "Someone";
  const subject = `${inviter} invited you to ${orgName}`;
  const text = [
    "Hey,",
    "",
    `${inviter} wants you on ${orgName} in Truss.`,
    "",
    `Your invite token: ${inviteToken}`,
    "",
    "Log in and accept to join the team.",
    "",
    `You can reply to this email \u2014 I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey,</p>
    <p>${inviter} wants you on <strong>${orgName}</strong> in Truss.</p>
    <p>Your invite token:</p>
    <p style="font-family: monospace; background: #f1f5f9; padding: 12px 16px; border-radius: 6px;">${inviteToken}</p>
    <p>Log in and accept to join the team.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

// ─── Trial lifecycle ───

export async function sendTrialWelcome({ to, displayName, daysLeft = 14, dashboardUrl = "" }) {
  const name = displayName || "there";
  const dUrl = dashboardUrl || DASHBOARD_URL;
  const docsUrl = DOCS_URL;
  const subject = "Your Truss trial is live";
  const text = [
    `Hey ${name},`,
    "",
    "Your 14-day trial is live. Full access, every feature, no credit card.",
    "",
    "Your dashboard is ready \u2014 database, auth, storage, permissions, realtime, feature flags, and everything else. All connected, all yours.",
    "",
    `Open your dashboard: ${dUrl}`,
    "",
    `New to the platform? The quickstart guide walks you through everything: ${docsUrl}/getting-started/quickstart`,
    "",
    `You've got ${daysLeft} days. If you need a hand or have feedback, just reply to this email.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>Your 14-day trial is live. Full access, every feature, no credit card.</p>
    <p>Your dashboard is ready \u2014 database, auth, storage, permissions, realtime, feature flags, and everything else. All connected, all yours.</p>
    <div style="text-align: center; margin: 28px 0 16px;">
      ${htmlBtn("Open Your Dashboard", dUrl)}
    </div>
    <p style="text-align: center; margin-bottom: 24px;">
      <a href="${docsUrl}/getting-started/quickstart" style="color: #64748b; font-size: 13px; text-decoration: underline; text-underline-offset: 2px;">Read the quickstart guide</a>
    </p>
    <p style="color: #64748b; font-size: 13px; text-align: center;">${daysLeft} days remaining on your trial</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendTrialMidpoint({ to, displayName, daysLeft = 7 }) {
  const name = displayName || "there";
  const subject = "One week in \u2014 how's it going?";
  const text = [
    `Hey ${name},`,
    "",
    "You're a week into your trial. Quick question: have you connected your app yet?",
    "",
    "If not, here's what most people do first:",
    "  - Grab your API key from Settings",
    "  - Use the REST API to read/write your database",
    "  - Set up auth so your users can log in",
    "",
    "If something's confusing or broken, tell me. I'd rather fix it now than lose you.",
    "",
    `You can reply to this email \u2014 I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>You're a week into your trial. Quick question: have you connected your app yet?</p>
    <p>If not, here's what most people do first:</p>
    <ul style="line-height: 1.8; padding-left: 20px;">
      <li>Grab your API key from Settings</li>
      <li>Use the REST API to read/write your database</li>
      <li>Set up auth so your users can log in</li>
    </ul>
    <p>If something's confusing or broken, tell me. I'd rather fix it now than lose you.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendTrialUrgent({ to, displayName, daysLeft = 2 }) {
  const name = displayName || "there";
  const subject = `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left on your trial`;
  const text = [
    `Hey ${name},`,
    "",
    `Quick note \u2014 your trial wraps up in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
    "",
    "After that, your data stays safe (I don't delete anything), but writes get paused until you pick a plan.",
    "",
    "Plans start at $9/month. If the price doesn't work for your situation, reply and tell me \u2014 I'm flexible for early users.",
    "",
    `You can reply to this email \u2014 I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>Quick note \u2014 your trial wraps up in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>.</p>
    <p>After that, your data stays safe (I don't delete anything), but writes get paused until you pick a plan.</p>
    <p>Plans start at $9/month. If the price doesn't work for your situation, reply and tell me \u2014 I'm flexible for early users.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendTrialExpired({ to, displayName, billingUrl = "" }) {
  const name = displayName || "there";
  const subject = "Your trial ended \u2014 your data is still here";
  const text = [
    `Hey ${name},`,
    "",
    "Your 14-day trial wrapped up. Nothing's been deleted \u2014 your database, files, and settings are all still there.",
    "",
    "You just can't write new data until you upgrade.",
    "",
    `Plans start at $9/month${billingUrl ? `: ${billingUrl}` : ""}.`,
    "",
    "If you decided Truss isn't for you, no worries. Your data stays for 90 days in case you change your mind.",
    "",
    "If there's something I could've done better, I'd genuinely love to hear it.",
    "",
    `You can reply to this email \u2014 I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>Your 14-day trial wrapped up. Nothing's been deleted \u2014 your database, files, and settings are all still there.</p>
    <p>You just can't write new data until you upgrade.</p>
    <p>Plans start at $9/month${billingUrl ? `: <a href="${billingUrl}" style="color: #9f1239;">pick a plan</a>` : ""}.</p>
    <p>If you decided Truss isn't for you, no worries. Your data stays for 90 days in case you change your mind.</p>
    <p>If there's something I could've done better, I'd genuinely love to hear it.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

// ─── Security notifications ───

export async function sendPasswordResetByAdmin({ to, displayName }) {
  const name = displayName || "there";
  const subject = "Your password was reset";
  const text = [
    `Hey ${name},`,
    "",
    "An admin reset your password. You'll need to set a new one on your next login.",
    "",
    "If you didn't expect this, reply to this email immediately.",
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>An admin reset your password. You'll need to set a new one on your next login.</p>
    <p>If you didn't expect this, reply to this email immediately.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendAccountBanned({ to, displayName }) {
  const name = displayName || "there";
  const subject = "Your account has been suspended";
  const text = [
    `Hey ${name},`,
    "",
    "Your Truss account has been suspended by an administrator.",
    "",
    "If you think this is a mistake, reply to this email and I'll look into it.",
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>Your Truss account has been suspended by an administrator.</p>
    <p>If you think this is a mistake, reply to this email and I'll look into it.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendSessionsRevoked({ to, displayName }) {
  const name = displayName || "there";
  const subject = "Your sessions were revoked";
  const text = [
    `Hey ${name},`,
    "",
    "All your active sessions were just revoked \u2014 you'll need to log in again on all devices.",
    "",
    "If this wasn't you, reply to this email right away.",
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>All your active sessions were just revoked \u2014 you'll need to log in again on all devices.</p>
    <p>If this wasn't you, reply to this email right away.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendPaymentFailed({ to, displayName, graceDays = 7 }) {
  const name = displayName || "there";
  const subject = "Payment failed \u2014 heads up";
  const text = [
    `Hey ${name},`,
    "",
    "Your latest payment didn't go through.",
    "",
    `You've got ${graceDays} days to update your card before writes get paused.`,
    "",
    "Go to Settings > Billing in the dashboard to fix it.",
    "",
    "If there's an issue with the charge, just reply here.",
    "",
    `You can reply to this email \u2014 I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>Your latest payment didn't go through.</p>
    <p>You've got <strong>${graceDays} days</strong> to update your card before writes get paused.</p>
    <p>Go to <a href="#" style="color: #9f1239;">Settings > Billing</a> in the dashboard to fix it.</p>
    <p>If there's an issue with the charge, just reply here.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendGraceExpiring({ to, displayName, daysLeft = 2 }) {
  const name = displayName || "there";
  const subject = `${daysLeft} day${daysLeft !== 1 ? "s" : ""} to update your payment`;
  const text = [
    `Hey ${name},`,
    "",
    `Just a reminder \u2014 your grace period runs out in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
    "",
    "After that, your plan downgrades and writes get paused.",
    "",
    "Update your card in Settings > Billing to keep things running.",
    "",
    `You can reply to this email \u2014 I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>Just a reminder \u2014 your grace period runs out in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>.</p>
    <p>After that, your plan downgrades and writes get paused.</p>
    <p>Update your card in <a href="#" style="color: #9f1239;">Settings > Billing</a> to keep things running.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendPlanChanged(to, name, newPlan) {
  const subject = `Your Truss plan has been updated to ${newPlan}`;
  const text = [
    `Hey ${name || "there"},`,
    "",
    `Your Truss plan has been changed to ${newPlan}. Your new limits are now active.`,
    "",
    `You can review your plan details in the billing dashboard: ${DASHBOARD_URL}`,
    "",
    `You can reply to this email — I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name || "there"},</p>
    <p>Your Truss plan has been changed to <strong>${newPlan}</strong>. Your new limits are now active.</p>
    <p>You can review your plan details in the <a href="${DASHBOARD_URL}" style="color: #9f1239;">billing dashboard</a>.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendPaymentConfirmation(to, name, amountCents) {
  const amount = (amountCents / 100).toFixed(2);
  const subject = `Payment received — $${amount}`;
  const text = [
    `Hey ${name || "there"},`,
    "",
    `We received your payment of $${amount}. Thank you for using Truss!`,
    "",
    `View your invoices in the billing dashboard: ${DASHBOARD_URL}`,
    "",
    `You can reply to this email — I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name || "there"},</p>
    <p>We received your payment of <strong>$${amount}</strong>. Thank you for using Truss!</p>
    <p>View your invoices in the <a href="${DASHBOARD_URL}" style="color: #9f1239;">billing dashboard</a>.</p>
  `);

  return sendEmail({ to, subject, text, html });
}

export async function sendApiKeyNotification({ to, displayName, action, keyLabel, keyPrefix }) {
  const name = displayName || "there";
  const verb = action === "created" ? "created" : "revoked";
  const label = keyLabel || keyPrefix || "unnamed";
  const subject = `API key ${verb}: ${label}`;
  const text = [
    `Hey ${name},`,
    "",
    `An API key was ${verb} on your account: ${label}${keyPrefix ? ` (${keyPrefix}...)` : ""}.`,
    "",
    "If this wasn't you, check your account security and reply to this email.",
    "",
    `You can reply to this email \u2014 I read every one.`,
    "",
    SIG_TEXT,
  ].join("\n");

  const html = htmlWrap(`
    <p>Hey ${name},</p>
    <p>An API key was <strong>${verb}</strong> on your account: <strong>${label}</strong>${keyPrefix ? ` (${keyPrefix}...)` : ""}.</p>
    <p>If this wasn't you, check your account security and reply to this email.</p>
  `);

  return sendEmail({ to, subject, text, html });
}
