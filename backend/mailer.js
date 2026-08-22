import { waitUntil } from "@vercel/functions";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const RESEND_API_URL = "https://api.resend.com/emails";

// Provider auto-detection: Brevo wins when its key is present, otherwise
// falls back to Resend. No code change needed to switch providers.
export function activeEmailProvider() {
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

function parseFromAddress(from) {
  const match = String(from || "").match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].replace(/^["']|["']$/g, ""), email: match[2] };
  return { name: "", email: String(from || "") };
}

export function isEmailEnabled() {
  return Boolean(activeEmailProvider());
}

function brandWrapper(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:24px 16px;">
      <div style="background:#0B1220;border-radius:16px 16px 0 0;padding:20px 28px;">
        <span style="color:#34C77B;font-weight:800;font-size:18px;">SwachhLens</span>
        <span style="color:#8791A3;font-size:12px;display:block;margin-top:2px;">AI-Powered Civic Waste Response</span>
      </div>
      <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px;color:#1e293b;">
        <h2 style="margin:0 0 12px;font-size:18px;">${title}</h2>
        ${bodyHtml}
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:16px;">SwachhLens &middot; Automated notification &middot; Do not reply</p>
    </div>
  </body>
</html>`;
}

async function sendViaBrevo(payload) {
  const from = parseFromAddress(payload.from);
  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: from.name || "SwachhLens", email: from.email },
      to: (payload.to || []).map((email) => ({ email })),
      subject: payload.subject,
      htmlContent: payload.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function sendViaResend(payload) {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function sendRaw(payload) {
  const provider = activeEmailProvider();
  if (provider === "brevo") return sendViaBrevo(payload);
  if (provider === "resend") return sendViaResend(payload);
  return Promise.resolve(null);
}

export function sendEmail({ to, subject, title = "", html = "" }) {
  if (!activeEmailProvider() || !to || !subject) return Promise.resolve(null);
  if (String(to).endsWith("@swachhlens.app")) return Promise.resolve(null);
  const payload = {
    from: process.env.EMAIL_FROM || "SwachhLens <onboarding@resend.dev>",
    to: Array.isArray(to) ? to : [to],
    subject,
    html: brandWrapper(title || subject, html),
  };
  // On serverless runtimes the function freezes once the response is sent;
  // waitUntil keeps this email fetch alive. Locally it is a harmless no-op.
  const send = sendRaw(payload).then(
    (data) => {
      console.log(`[email] Sent via ${activeEmailProvider()} "${subject}" to ${to} (id: ${data?.id || data?.messageId || "ok"})`);
      return data;
    },
    (err) => {
      console.error(`[email] Failed to send "${subject}" to ${to}: ${err.message}`);
      return null;
    }
  );
  try { waitUntil(send); } catch { /* long-lived process: nothing needed */ }
  return send;
}

function istNow() {
  return `${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date())} IST`;
}

export function welcomeEmail(user) {
  return sendEmail({
    to: user.email,
    subject: `Welcome to SwachhLens, ${user.name || "there"}!`,
    title: `Welcome aboard, ${user.name || "friend"}!`,
    html: `
      <p style="margin:0 0 14px;line-height:1.7;">Thank you for joining <strong>SwachhLens</strong> — an AI-powered platform that helps citizens report unmanaged waste and ensures municipal teams resolve it faster and more transparently.</p>
      <p style="margin:0 0 8px;line-height:1.7;font-weight:600;color:#0B1220;">Here is what you can do from today:</p>
      <ul style="margin:0 0 16px;padding-left:20px;line-height:1.9;color:#526072;">
        <li><strong>Report waste</strong> — capture a photo; our AI classifies it and assesses priority instantly.</li>
        <li><strong>Track progress live</strong> — follow every status change until the cleanup is verified.</li>
        <li><strong>Stay informed</strong> — receive updates when a team is assigned and the work is completed.</li>
      </ul>
      <p style="margin:0;line-height:1.7;">Every report you make contributes to a cleaner, healthier city. We are glad to have you with us.</p>
      <p style="margin:18px 0 0;line-height:1.7;">Warm regards,<br/><strong>Team SwachhLens</strong></p>`,
  });
}

export function signInAlertEmail({ email, name, method = "email & password" }) {
  return sendEmail({
    to: email,
    subject: "New sign-in to your SwachhLens account",
    title: "New sign-in detected",
    html: `
      <p style="margin:0 0 14px;line-height:1.7;">Hi ${name || "there"}, your SwachhLens account was recently accessed successfully. Here are the details for your records:</p>
      <table style="width:100%;font-size:13px;line-height:1.9;color:#526072;background:#f8fafc;border-radius:10px;padding:4px 14px;">
        <tr><td style="width:38%;"><strong>Date &amp; Time</strong></td><td>${istNow()}</td></tr>
        <tr><td><strong>Account</strong></td><td>${email}</td></tr>
        <tr><td><strong>Sign-in method</strong></td><td>${method}</td></tr>
      </table>
      <p style="margin:14px 0 0;line-height:1.7;">If this was you, no action is needed. If you do not recognise this activity, we recommend resetting your password immediately to secure your account.</p>
      <p style="margin:18px 0 0;line-height:1.7;">Stay safe,<br/><strong>Team SwachhLens</strong></p>`,
  });
}

export function passwordResetEmail({ email, name, resetUrl, expiryMinutes = 30 }) {
  return sendEmail({
    to: email,
    subject: "Reset your SwachhLens password",
    title: "Password reset request",
    html: `
      <p style="margin:0 0 14px;line-height:1.7;">Hi ${name || "there"}, we received a request to reset the password for your SwachhLens account. Click the button below to choose a new password:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">
        <tr><td align="center" bgcolor="#006B2C" style="border-radius:12px;">
          <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:13px 34px;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;">Reset Password</a>
        </td></tr>
      </table>
      <p style="margin:0 0 8px;line-height:1.7;font-size:13px;color:#526072;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 16px;word-break:break-all;"><a href="${resetUrl}" style="color:#006B2C;font-size:12px;">${resetUrl}</a></p>
      <table style="width:100%;font-size:13px;line-height:1.9;color:#526072;background:#f8fafc;border-radius:10px;padding:4px 14px;">
        <tr><td style="width:38%;"><strong>Valid for</strong></td><td>${expiryMinutes} minutes from now</td></tr>
        <tr><td><strong>Request time</strong></td><td>${istNow()}</td></tr>
      </table>
      <p style="margin:14px 0 0;line-height:1.7;"><strong>Didn't request this?</strong> You can safely ignore this email — your password will remain unchanged. Only a person with access to this email address can reset the password.</p>
      <p style="margin:16px 0 0;line-height:1.7;">Regards,<br/><strong>Team SwachhLens</strong></p>`,
  });
}

export function reportReceivedEmail({ email, name, reportId, address, priority }) {
  return sendEmail({
    to: email,
    subject: `Report ${reportId} received`,
    title: "Report received",
    html: `<p style="margin:0 0 10px;line-height:1.6;">Hi ${name || "there"}, we have received your waste report.</p>
      <table style="width:100%;font-size:13px;line-height:1.8;color:#526072;background:#f8fafc;border-radius:10px;padding:4px 14px;">
        <tr><td><strong>Report ID</strong></td><td>${reportId}</td></tr>
        <tr><td><strong>Location</strong></td><td>${address || "Pinned on map"}</td></tr>
        <tr><td><strong>Priority</strong></td><td>${priority}</td></tr>
      </table>
      <p style="margin:12px 0 0;line-height:1.6;">Our AI is reviewing it now. You will get an update once a cleanup team is assigned.</p>`,
  });
}

export function teamAssignedEmail({ email, name, reportId, teamName }) {
  return sendEmail({
    to: email,
    subject: `Team assigned to your report ${reportId}`,
    title: "Cleanup team assigned",
    html: `<p style="margin:0 0 10px;line-height:1.6;">Hi ${name || "there"}, good news! A cleanup team has been assigned to your report.</p>
      <table style="width:100%;font-size:13px;line-height:1.8;color:#526072;background:#f8fafc;border-radius:10px;padding:4px 14px;">
        <tr><td><strong>Report ID</strong></td><td>${reportId}</td></tr>
        <tr><td><strong>Team</strong></td><td>${teamName}</td></tr>
      </table>
      <p style="margin:12px 0 0;line-height:1.6;">You can track live progress in the SwachhLens app.</p>`,
  });
}

export function reportResolvedEmail({ email, name, reportId }) {
  return sendEmail({
    to: email,
    subject: `Your report ${reportId} has been resolved`,
    title: "Cleanup completed",
    html: `<p style="margin:0 0 10px;line-height:1.6;">Hi ${name || "there"}, your report <strong>${reportId}</strong> has been marked resolved after verification.</p>
      <p style="margin:0;line-height:1.6;">Thank you for helping keep your city clean!</p>`,
  });
}
