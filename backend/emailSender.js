const nodemailer = require('nodemailer');

// Minimal markdown -> HTML: **bold**, [text](url), and paragraph breaks.
// Good enough for the simple emails this agent drafts; not a general markdown parser.
const markdownToHtml = (markdown) => {
  if (!markdown) return '';

  // Brand name auto-link: if AI wrote the name as plain text (not already wrapped
  // in [text](url)), insert the markdown link format so the name is always clickable.
  // Lookbehind (?<!\[) prevents double-wrapping if the AI did use [text](url) correctly.
  const withBrandMarkup = markdown
    .replace(/(?<!\[)Soulful Intelligence Studio(?!\])/gi,
      '[Soulful Intelligence Studio](https://www.youtube.com/@SoulfulIntelligenceStudio?sub_confirmation=1)')
    .replace(/(?<!\[)Soulful Intelligence(?!\])(?! Studio)/gi,
      '[Soulful Intelligence](https://www.youtube.com/@SoulfulIntelligenceStudio?sub_confirmation=1)')
    .replace(/(?<!\[)MindGym(?!\])/gi,
      '[MindGym](https://www.skrmblissai.in/mindgym)')
    .replace(/(?<!\[)Mind Gym(?!\])/gi,
      '[Mind Gym](https://www.skrmblissai.in/mindgym)');

  const escaped = withBrandMarkup
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const withLinks = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#c1793a;text-decoration:underline;">$1</a>');
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

// Matches the branded template used across our other apps (Mind Gym, etc.) —
// a cream card with a small uppercase header badge and the same rich footer
// used on Mind Gym's own outreach emails (photo banner + quote, three QR
// codes, WhatsApp, YouTube), so cold outreach reads as coming from the same
// studio. Image URLs are the same public Firebase Storage assets AwakenedPath
// already uses — shared across projects, not duplicated.
const EMAIL_HEADER_BADGE = 'DIGITAL OFFERINGS BY SOULFUL INTELLIGENCE STUDIO';

// A single flat, pre-composited image (crop, dimming, and the quote text all
// baked in at build time — see functions' scratch banner-build script) rather
// than a plain photo layered with CSS crop/overlay/filter tricks. Those tricks
// rendered fine in Gmail's preview but "new Outlook" strips position:absolute
// and overflow:hidden from email HTML as an anti-abuse measure, which broke
// both the crop and the text overlay there. A plain <img> has no such
// failure mode — it renders identically everywhere.
const signatureBanner = () => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:560px;margin:0 auto 20px;">
      <tr>
        <td style="border-radius:12px;border:1px solid rgba(193,121,58,0.3);overflow:hidden;">
          <a href="https://www.youtube.com/@SoulfulIntelligenceStudio?sub_confirmation=1" target="_blank" style="text-decoration:none;">
            <img src="https://firebasestorage.googleapis.com/v0/b/bliss-agents-outreach.firebasestorage.app/o/email-assets%2Fsignature-banner.png?alt=media&amp;token=74f9195a-d929-49c1-8610-a98664d98091" alt="Shruti &amp; Smriti — Take what you need. Give what you can. Everything here is offered pay-what-you-feel. — The Soulful Intelligence promise" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;" />
          </a>
        </td>
      </tr>
    </table>`;

const qrCodesBanner = () => `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 auto 20px;max-width:520px;">
      <tr>
        <td align="center" width="33%" style="padding:0 6px;vertical-align:top;">
          <a href="https://www.skrmblissai.in/kidsgym" target="_blank" style="text-decoration:none;">
            <img src="https://firebasestorage.googleapis.com/v0/b/awakened-path-2026.firebasestorage.app/o/Marketting%2FKidsDiaryCourseQR.png?alt=media" alt="Kids Challenge QR" width="80" height="80" style="display:block;margin:0 auto 8px;border-radius:12px;border:1px solid rgba(193,121,58,0.3);" />
            <span style="font-size:9px;font-weight:bold;color:#2B2620;text-transform:uppercase;letter-spacing:1px;display:block;">Kids<br/>Challenge</span>
          </a>
        </td>
        <td align="center" width="33%" style="padding:0 6px;vertical-align:top;">
          <a href="https://www.skrmblissai.in/mindgym" target="_blank" style="text-decoration:none;">
            <img src="https://firebasestorage.googleapis.com/v0/b/awakened-path-2026.firebasestorage.app/o/EmotionAndFeelingsCourse%2FMindGym.png?alt=media" alt="Mind Gym QR" width="80" height="80" style="display:block;margin:0 auto 8px;border-radius:12px;border:1px solid rgba(193,121,58,0.3);" />
            <span style="font-size:9px;font-weight:bold;color:#2B2620;text-transform:uppercase;letter-spacing:1px;display:block;">Mind Gym<br/>App</span>
          </a>
        </td>
        <td align="center" width="33%" style="padding:0 6px;vertical-align:top;">
          <a href="https://www.skrmblissai.in/feelingsandemotioncourse" target="_blank" style="text-decoration:none;">
            <img src="https://firebasestorage.googleapis.com/v0/b/awakened-path-2026.firebasestorage.app/o/EmotionAndFeelingsCourse%2Ffeelingsandemotioncourse.png?alt=media" alt="Feelings Course QR" width="80" height="80" style="display:block;margin:0 auto 8px;border-radius:12px;border:1px solid rgba(193,121,58,0.3);" />
            <span style="font-size:9px;font-weight:bold;color:#2B2620;text-transform:uppercase;letter-spacing:1px;display:block;">Feelings<br/>Course</span>
          </a>
        </td>
      </tr>
    </table>`;

// A one-off visual mockup of the idea being pitched (e.g. "[Business] Mind
// Gym" app screen), attached per-prospect from the outreach UI — optional,
// so most emails render with no gap here at all.
const prototypeImageBlock = (url) => url ? `
    <div style="margin:24px 0;text-align:center;">
      <img src="${url}" alt="A look at what we had in mind" width="496" style="display:block;width:100%;max-width:496px;height:auto;margin:0 auto;border-radius:12px;border:1px solid #e3d2b3;" />
    </div>` : '';

const wrapInBrandedTemplate = (bodyHtml, prototypeImageUrl) => `
<div style="background:#f5ead9;padding:24px 12px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;background:#faf1e2;border:1px solid #e3d2b3;border-radius:16px;padding:32px;">
    <div style="text-align:center;margin-bottom:20px;">
      <a href="https://www.youtube.com/@SoulfulIntelligenceStudio?sub_confirmation=1" target="_blank" style="text-decoration:none;">
        <img src="https://firebasestorage.googleapis.com/v0/b/awakened-path-2026.firebasestorage.app/o/Dashboard%2FImages%2FSILogoLight.png?alt=media" alt="Soulful Intelligence Studio" width="64" height="64" style="display:block;width:64px;height:64px;margin:0 auto 10px;border-radius:50%;" />
        <span style="display:inline-block;background:#f3ddb9;color:#c1793a;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;padding:4px 12px;border-radius:999px;">${EMAIL_HEADER_BADGE}</span>
      </a>
    </div>
    ${bodyHtml}
    ${prototypeImageBlock(prototypeImageUrl)}
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e3d2b3;text-align:center;">
      ${signatureBanner()}
      ${qrCodesBanner()}
      <p style="font-size:10px;color:rgba(43,38,32,0.65);margin:0;line-height:1.8;font-family:Arial,sans-serif;">
        <a href="https://www.skrmblissai.in" style="color:#c1793a;text-decoration:none;">www.skrmblissai.in</a> &nbsp;&middot;&nbsp;
        <a href="https://wa.me/918217581238" style="color:#c1793a;text-decoration:none;">WhatsApp: +91 82175 81238</a>
      </p>
      <p style="font-size:10px;color:rgba(43,38,32,0.65);margin:8px 0 0;line-height:1.8;font-family:Arial,sans-serif;">
        By <a href="https://www.skrmblissai.in/twinsouls" style="color:#c1793a;text-decoration:none;">Twin Souls</a> &nbsp;&middot;&nbsp;
        <a href="https://www.youtube.com/@SoulfulIntelligenceStudio?sub_confirmation=1" style="color:#c1793a;text-decoration:underline;font-weight:bold;">Soulful Intelligence Studio</a>
      </p>
    </div>
  </div>
</div>
`;

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

const sendEmail = async ({ to, subject, body, fromName, trackingUrl, prototypeImageUrl }) => {
  const transporter = getTransporter();
  await transporter.verify();

  const fromAddress = (process.env.EMAIL_USER || '').trim();
  const templated = wrapInBrandedTemplate(markdownToHtml(body), prototypeImageUrl);
  const html = trackingUrl ? templated + trackingPixelTag(trackingUrl) : templated;

  const mailOptions = {
    from: fromName ? `"${fromName}" <${fromAddress}>` : fromAddress,
    to,
    cc: 'connect@skrmblissai.in',
    bcc: 'smriti.duggal@gmail.com',
    subject,
    html,
    text: body,
  };

  if (prototypeImageUrl && typeof prototypeImageUrl === 'string' && prototypeImageUrl.trim()) {
    mailOptions.attachments = [
      {
        filename: 'prototype-preview.png',
        path: prototypeImageUrl.trim(),
      },
    ];
  }

  const info = await transporter.sendMail(mailOptions);
  if (info && info.messageId) {
    console.log('[sendEmail] messageId:', info.messageId, 'response:', info.response);
  }
};

// 1x1 transparent GIF, served by the open-tracking endpoint.
const TRACKING_PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

const trackingPixelTag = (trackingUrl) =>
  `<img src="${trackingUrl}" width="1" height="1" style="display:none" alt="" />`;

module.exports = { sendEmail, markdownToHtml, wrapInBrandedTemplate, TRACKING_PIXEL_GIF, trackingPixelTag };

