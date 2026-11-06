'use strict';

const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { getConfig } = require('../config');

const SENDER_DOMAIN = 'homnayangi.site';

// Tiêu đề ngắn, không viết hoa toàn bộ, không dấu chấm than: tránh dấu hiệu spam.
const PURPOSE_TEXT = {
  verify_email: {
    subject: 'Mã xác minh tài khoản Hôm nay ăn gì',
    heading: 'Xác minh email của bạn',
    intro: 'Bạn vừa đăng ký tài khoản trên ứng dụng Hôm nay ăn gì. Nhập mã dưới đây vào ứng dụng để hoàn tất đăng ký:',
  },
  reset_password: {
    subject: 'Mã đặt lại mật khẩu Hôm nay ăn gì',
    heading: 'Đặt lại mật khẩu',
    intro:
      'Bạn vừa yêu cầu đặt lại mật khẩu trên ứng dụng Hôm nay ăn gì. Nhập mã dưới đây vào ứng dụng để đặt mật khẩu mới:',
  },
};

let mailer;

function buildMailer(mail) {
  if (mail.transport === 'console') {
    // Dev: in email ra terminal thay vì gửi thật (requirements FR-U02).
    return {
      async send(message) {
        console.log(`\n[MAIL console] Tới: ${message.to}\nTiêu đề: ${message.subject}\n${message.text}\n`);
      },
    };
  }
  const transporter = nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: { user: mail.user, pass: mail.password },
    // Tên gửi trong lệnh EHLO. Mặc định là hostname của VPS (ví dụ srv1976511),
    // không phải tên miền thật nên bộ lọc spam chấm điểm thấp.
    name: SENDER_DOMAIN,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    send: (message) =>
      transporter.sendMail({
        from: mail.from,
        replyTo: mail.user,
        // Message-ID cùng tên miền với địa chỉ gửi.
        messageId: `<${crypto.randomUUID()}@${SENDER_DOMAIN}>`,
        headers: {
          // Email tự động: không gửi trả lời tự động (out-of-office) ngược lại.
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
        },
        ...message,
      }),
  };
}

function getMailer() {
  mailer ??= buildMailer(getConfig().mail);
  return mailer;
}

/** Thay mailer (dùng cho test). */
function setMailer(custom) {
  mailer = custom;
}

function otpEmail({ code, purpose, minutes }) {
  const { subject, heading, intro } = PURPOSE_TEXT[purpose];
  const note = `Mã có hiệu lực trong ${minutes} phút. Vì lý do bảo mật, đừng chia sẻ mã này với bất kỳ ai.`;
  const ignore = 'Nếu bạn không thực hiện yêu cầu này, bạn có thể bỏ qua email. Tài khoản của bạn vẫn an toàn.';
  const footer = `Email tự động từ Hôm nay ăn gì (https://${SENDER_DOMAIN}). Vui lòng không trả lời email này.`;

  // Bản text đầy đủ nội dung như bản HTML.
  const text = [heading, '', intro, '', `Mã xác minh: ${code}`, '', note, '', ignore, '', '--', footer].join('\n');

  // HTML đơn giản: không ảnh, không script, CSS inline, bảng 600px.
  // Một đường link duy nhất trỏ về đúng tên miền gửi thư.
  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;">
<tr><td style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#111827;">${heading}</p>
<p style="margin:0 0 20px;">${intro}</p>
<p style="margin:0 0 20px;padding:14px 0;text-align:center;font-size:30px;font-weight:bold;letter-spacing:8px;color:#111827;background-color:#f3f4f6;border-radius:6px;">${code}</p>
<p style="margin:0 0 12px;">${note}</p>
<p style="margin:0;color:#4b5563;">${ignore}</p>
</td></tr>
<tr><td style="padding:16px 32px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;border-top:1px solid #e5e7eb;">
Email tự động từ <a href="https://${SENDER_DOMAIN}" style="color:#6b7280;">Hôm nay ăn gì</a>. Vui lòng không trả lời email này.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, text, html };
}

async function sendOtpEmail(to, code, purpose, minutes) {
  await getMailer().send({ to, ...otpEmail({ code, purpose, minutes }) });
}

module.exports = { getMailer, setMailer, sendOtpEmail, otpEmail };
