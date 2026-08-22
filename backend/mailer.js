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

export function welcomeEmail(user) {
  return sendEmail({
    to: user.email,
    subject: "Welcome to SwachhLens!",
    title: `Welcome, ${user.name || "there"}!`,
    html: `<p style="margin:0 0 10px;line-height:1.6;">Your SwachhLens account is ready. Snap a photo of waste around you and our AI will analyze it, route it to the right municipal team, and track cleanup till resolution.</p>
      <ul style="margin:0 0 10px;padding-left:18px;line-height:1.7;color:#526072;">
        <li>Report waste with a photo or video</li>
        <li>Track your report status live</li>
        <li>Get notified when a team is assigned</li>
      </ul>`,
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
