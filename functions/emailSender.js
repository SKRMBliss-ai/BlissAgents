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

// Matches the branded template used across our other apps (Mind Gym, etc.) —
// a cream card with a small uppercase header badge and the same rich footer
// used on Mind Gym's own outreach emails (photo banner + quote, three QR
// codes, WhatsApp, YouTube), so cold outreach reads as coming from the same
// studio. Image URLs are the same public Firebase Storage assets AwakenedPath
// already uses — shared across projects, not duplicated.
const EMAIL_HEADER_BADGE = 'DIGITAL OFFERINGS BY SOULFUL INTELLIGENCE STUDIO';

// CSS background-image on a <td> is stripped by Gmail and several mobile
// clients, so the photo silently disappeared there even though it rendered
// fine in previewers that support it. A plain <img> tag renders everywhere,
// so the photo is now a real image above the quote card instead of a CSS
// background behind it.
// The overlay panel is position:absolute + a dimming CSS filter on the photo —
// both ignored by Outlook's Word rendering engine, so there it simply falls
// back to the old stacked layout (full-brightness photo, then the caption
// block right below it) instead of breaking or hiding the text.
const signatureBanner = () => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:560px;margin:0 auto 20px;">
      <tr>
        <td style="border-radius:12px;border:1px solid rgba(193,121,58,0.3);overflow:hidden;">
          <div style="position:relative;height:220px;overflow:hidden;border-radius:12px;">
            <img src="https://firebasestorage.googleapis.com/v0/b/awakened-path-2026.firebasestorage.app/o/Marketting%2FShSm1.png?alt=media" alt="Shruti &amp; Smriti" width="560" style="display:block;width:100%;max-width:560px;height:auto;margin-top:-95px;filter:brightness(0.55);-webkit-filter:brightness(0.55);" />
            <div style="position:absolute;left:0;right:0;bottom:0;background-color:rgba(250,241,226,0.75);padding:16px 16px 18px;text-align:center;border-radius:0 0 12px 12px;">
              <div style="margin-bottom:8px;font-size:16px;opacity:0.7;">&#9995;</div>
              <p style="margin:0 auto 8px;font-size:13px;font-style:italic;color:#2B2620;line-height:1.4;font-family:Georgia,serif;max-width:95%;">
                "Take what you need. Give what you can. Everything here is offered pay-what-you-feel."
              </p>
              <p style="margin:0;font-size:9px;font-weight:600;color:#c1793a;text-transform:uppercase;letter-spacing:1px;font-family:sans-serif;">
                &mdash; The Soulful Intelligence promise
              </p>
            </div>
          </div>
        </td>
      </tr>
    </table>`;

const qrCodesBanner = () => `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 auto 20px;max-width:520px;">
      <tr>
        <td align="center" width="33%" style="padding:0 6px;vertical-align:top;">
          <img src="https://firebasestorage.googleapis.com/v0/b/awakened-path-2026.firebasestorage.app/o/Marketting%2FKidsDiaryCourseQR.png?alt=media" alt="Kids Challenge QR" width="80" height="80" style="display:block;margin:0 auto 8px;border-radius:12px;border:1px solid rgba(193,121,58,0.3);" />
          <span style="font-size:9px;font-weight:bold;color:#2B2620;text-transform:uppercase;letter-spacing:1px;display:block;">Kids<br/>Challenge</span>
        </td>
        <td align="center" width="33%" style="padding:0 6px;vertical-align:top;">
          <img src="https://firebasestorage.googleapis.com/v0/b/awakened-path-2026.firebasestorage.app/o/EmotionAndFeelingsCourse%2FMindGym.png?alt=media" alt="Mind Gym QR" width="80" height="80" style="display:block;margin:0 auto 8px;border-radius:12px;border:1px solid rgba(193,121,58,0.3);" />
          <span style="font-size:9px;font-weight:bold;color:#2B2620;text-transform:uppercase;letter-spacing:1px;display:block;">Mind Gym<br/>App</span>
        </td>
        <td align="center" width="33%" style="padding:0 6px;vertical-align:top;">
          <img src="https://firebasestorage.googleapis.com/v0/b/awakened-path-2026.firebasestorage.app/o/EmotionAndFeelingsCourse%2Ffeelingsandemotioncourse.png?alt=media" alt="Feelings Course QR" width="80" height="80" style="display:block;margin:0 auto 8px;border-radius:12px;border:1px solid rgba(193,121,58,0.3);" />
          <span style="font-size:9px;font-weight:bold;color:#2B2620;text-transform:uppercase;letter-spacing:1px;display:block;">Feelings<br/>Course</span>
        </td>
      </tr>
    </table>`;

const wrapInBrandedTemplate = (bodyHtml) => `
<div style="background:#f5ead9;padding:24px 12px;font-family:Georgia,'Times New Roman',serif;">
  <div style="max-width:560px;margin:0 auto;background:#faf1e2;border:1px solid #e3d2b3;border-radius:16px;padding:32px;">
    <div style="text-align:center;margin-bottom:20px;">
      <img src="https://firebasestorage.googleapis.com/v0/b/awakened-path-2026.firebasestorage.app/o/Dashboard%2FImages%2FSILogoLight.png?alt=media" alt="Soulful Intelligence Studio" width="64" height="64" style="display:block;width:64px;height:64px;margin:0 auto 10px;border-radius:50%;" />
      <span style="display:inline-block;background:#f3ddb9;color:#c1793a;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;padding:4px 12px;border-radius:999px;">${EMAIL_HEADER_BADGE}</span>
    </div>
    ${bodyHtml}
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e3d2b3;text-align:center;">
      ${signatureBanner()}
      ${qrCodesBanner()}
      <p style="font-size:10px;color:rgba(43,38,32,0.65);margin:0;line-height:1.8;font-family:Arial,sans-serif;">
        <a href="https://www.skrmblissai.in" style="color:#c1793a;text-decoration:none;">www.skrmblissai.in</a> &nbsp;&middot;&nbsp;
        <a href="https://wa.me/918217581238" style="color:#c1793a;text-decoration:none;">WhatsApp: +91 82175 81238</a>
      </p>
      <p style="font-size:10px;color:rgba(43,38,32,0.65);margin:8px 0 0;line-height:1.8;font-family:Arial,sans-serif;">
        By <a href="https://www.skrmblissai.in/twinsouls" style="color:#c1793a;text-decoration:none;">Twin Souls</a> &nbsp;&middot;&nbsp;
        <a href="https://www.youtube.com/@SoulfulIntelligenceStudio?sub_confirmation=1" style="color:#c1793a;text-decoration:none;">Soulful Intelligence Studio</a>
      </p>
    </div>
  </div>
</div>
`;

// .trim() here is deliberate, not defensive filler — a Firebase secret set via a
// piped echo/printf can pick up a trailing newline, which turns SMTP AUTH into a
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
  const templated = wrapInBrandedTemplate(markdownToHtml(body));
  const html = trackingUrl ? templated + trackingPixelTag(trackingUrl) : templated;
  const info = await transporter.sendMail({
    from: fromName ? `"${fromName}" <${fromAddress}>` : fromAddress,
    to,
    cc: 'connect@skrmblissai.in',
    bcc: 'smriti.duggal@gmail.com',
    subject,
    html,
    text: body,
  });
  console.log('[sendEmail] envelope:', JSON.stringify(info.envelope), 'accepted:', JSON.stringify(info.accepted), 'rejected:', JSON.stringify(info.rejected), 'response:', info.response);
};

// 1x1 transparent GIF, served by the open-tracking endpoint.
const TRACKING_PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

const trackingPixelTag = (trackingUrl) =>
  `<img src="${trackingUrl}" width="1" height="1" style="display:none" alt="" />`;

module.exports = { sendEmail, markdownToHtml, wrapInBrandedTemplate, TRACKING_PIXEL_GIF, trackingPixelTag };
