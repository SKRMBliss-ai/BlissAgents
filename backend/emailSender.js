const nodemailer = require('nodemailer');

// Minimal markdown -> HTML: **bold**, [text](url), and paragraph breaks.
// Good enough for the simple emails this agent drafts; not a general markdown parser.
const markdownToHtml = (markdown) => {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const withLinks = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const withBold = withLinks.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  const paragraphs = withBold
    .split(/\n\s*\n/)
    .map(block => {
      const lines = block.split('\n').filter(Boolean);
      const isList = lines.every(l => l.trim().startsWith('- ') || l.trim().startsWith('• '));
      if (isList) {
        const items = lines.map(l => `<li>${l.trim().replace(/^[-•]\s*/, '')}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return `<div style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #222;">${paragraphs}</div>`;
};

// .trim() here is deliberate, not defensive filler — a secret picked up from a
// piped echo/printf can carry a trailing newline, which turns SMTP AUTH into a
// silent, misleading 535 failure that looks identical to a wrong password.
const getTransporter = () => nodemailer.createTransport({
  host: 'smtpout.secureserver.net',
  port: 465,
  secure: true,
  auth: {
    user: (process.env.EMAIL_USER || '').trim(),
    pass: (process.env.EMAIL_PASS || '').trim(),
  },
});

const sendEmail = async ({ to, subject, body, fromName, trackingUrl }) => {
  const transporter = getTransporter();
  await transporter.verify();

  const fromAddress = (process.env.EMAIL_USER || '').trim();
  const html = trackingUrl ? markdownToHtml(body) + trackingPixelTag(trackingUrl) : markdownToHtml(body);
  await transporter.sendMail({
    from: fromName ? `"${fromName}" <${fromAddress}>` : fromAddress,
    to,
    subject,
    html,
    text: body,
  });
};

// 1x1 transparent GIF, served by the open-tracking endpoint.
const TRACKING_PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

const trackingPixelTag = (trackingUrl) =>
  `<img src="${trackingUrl}" width="1" height="1" style="display:none" alt="" />`;

module.exports = { sendEmail, markdownToHtml, TRACKING_PIXEL_GIF, trackingPixelTag };
