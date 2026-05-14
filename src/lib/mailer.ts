import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendOtp(email: string, otp: string): Promise<void> {
  await transporter.sendMail({
    from: `"LastCard" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your LastCard verification code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#1a0a00;color:#f5e6d0;border-radius:12px">
        <h1 style="color:#f59e0b;margin:0 0 8px">LastCard</h1>
        <p style="color:#d97706;margin:0 0 24px;font-size:14px">The Whot Staking Game</p>
        <p style="font-size:18px;margin:0 0 12px">Your verification code:</p>
        <div style="font-size:48px;font-weight:bold;letter-spacing:12px;color:#f59e0b;padding:24px;background:#2d1200;border-radius:8px;text-align:center">${otp}</div>
        <p style="font-size:14px;color:#92400e;margin:24px 0 0">Expires in 10 minutes. Don't share this with anyone.</p>
      </div>
    `,
  })
}
