const nodemailer = require("nodemailer");

// Sends account emails (P4 password reset links).
// Set SMTP_USER and SMTP_PASS in .env to send real mail. For Gmail, SMTP_PASS is a
// Google "App Password" (needs 2-Step Verification on the account), not the normal
// password. Without them, emails are printed to the server console instead, so the
// reset flow still works for local testing.

let transport = null;

function getTransport() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465, // 465 is TLS from the start; 587 upgrades with STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

// The web app's address, used to build links in emails
exports.appUrl = () => (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");

exports.send = async function ({ to, subject, text, html }) {
  const smtp = getTransport();
  if (!smtp) {
    console.log(`[Mailer] SMTP_USER/SMTP_PASS not set, so not sending. Email to ${to}:\n${subject}\n\n${text}\n`);
    return;
  }
  await smtp.sendMail({
    from: process.env.MAIL_FROM || `Caribbean Stud Poker <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
};

exports.sendPasswordReset = function (user, link, minutes) {
  return exports.send({
    to: user.email,
    subject: "Reset your Caribbean Stud Poker password",
    text:
      `Hi ${user.username},\n\n` +
      `Someone asked to reset the password for your account. To choose a new password, open this link:\n\n` +
      `${link}\n\n` +
      `The link works once and expires in ${minutes} minutes. If you didn't ask for this, you can ignore this email.`,
    html:
      `<p>Hi ${escapeHtml(user.username)},</p>` +
      `<p>Someone asked to reset the password for your account. To choose a new password, click the link below.</p>` +
      `<p><a href="${escapeHtml(link)}">Reset my password</a></p>` +
      `<p>The link works once and expires in ${minutes} minutes. If you didn't ask for this, you can ignore this email.</p>`,
  });
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
