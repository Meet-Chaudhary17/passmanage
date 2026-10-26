import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

class EmailServiceClass {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
        connectionTimeout: 3000,
        greetingTimeout: 3000,
        socketTimeout: 5000,
      });
    } catch (err) {
      console.error('[EmailService] Failed to initialize nodemailer transporter:', err);
    }
  }

  /**
   * Send 6-digit Email Verification Code during Registration
   */
  async sendRegistrationOtp(toEmail, otp) {
    if (!this.transporter) this.initTransporter();

    const subject = `PassManage Security: Your Verification Code is ${otp}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PassManage Email Verification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #090d16; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 20px 32px; text-align: center; border-bottom: 1px solid #1e293b;">
              <div style="display: inline-block; width: 48px; height: 48px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 12px; line-height: 48px; font-size: 24px;">
                🛡️
              </div>
              <h1 style="margin: 16px 0 6px 0; font-size: 22px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">PassManage Vault</h1>
              <p style="margin: 0; font-size: 13px; color: #94a3b8;">Zero-Knowledge Cryptographic Credential Protection</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #f1f5f9;">Verify Your Email Address</h2>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
                You are setting up a master encrypted vault. To protect the integrity of your stored passwords and biometric credentials, please verify your email address using the one-time verification code below:
              </p>

              <!-- OTP Code Display -->
              <div style="background-color: #020617; border: 1px solid #38bdf8; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #38bdf8; margin-bottom: 8px;">Registration Verification Code</div>
                <div style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #ffffff; padding-left: 10px;">${otp}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 8px;">Valid for 10 minutes</div>
              </div>

              <div style="background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.15); border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #7dd3fc;">
                  🔒 <strong>Security Notice:</strong> PassManage will never ask for your master password or verification code. If you did not attempt to register, you can safely ignore this email.
                </p>
              </div>

              <p style="margin: 0; font-size: 13px; color: #64748b;">
                Need help? Your vault stays encrypted client-side using Argon2id and AES-256-GCM.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #090d16; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #475569;">
                &copy; ${new Date().getFullYear()} PassManage Architecture. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const text = `PassManage Vault Verification Code\n\nYour 6-digit registration code is: ${otp}\n\nThis code expires in 10 minutes.\nIf you did not initiate this registration, please ignore this email.`;

    const mailOptions = {
      from: config.smtpFrom,
      to: toEmail,
      subject,
      html,
      text,
    };

    return await this.transporter.sendMail(mailOptions);
  }

  /**
   * Send Intruder Detection Alert with Attached Cropped Face Photograph
   */
  async sendIntruderAlert({ to, websiteName, targetHostname, ipAddress, userAgent, timestamp, intruderImageBase64, alertType = 'INTRUDER_MISMATCH' }) {
    if (!this.transporter) this.initTransporter();

    const isSpoof = alertType === 'SPOOF_PHOTO_ATTACK';
    const timeStr = timestamp ? new Date(timestamp).toLocaleString('en-US', { timeZoneName: 'short' }) : new Date().toLocaleString();
    const subject = isSpoof
      ? `🚨 Security Alert: Biometric Photo Spoof Attack Detected on PassManage`
      : `🚨 Security Alert: Unauthorized Access Attempt Detected on PassManage`;

    // Process base64 image into clean buffer
    let imageBuffer = null;
    let hasImage = false;

    if (intruderImageBase64) {
      try {
        const cleanB64 = intruderImageBase64.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(cleanB64, 'base64');
        if (imageBuffer.length > 100) {
          hasImage = true;
        }
      } catch (err) {
        console.error('[EmailService] Failed to parse intruder image base64:', err);
      }
    }

    const attachments = [];
    if (hasImage && imageBuffer) {
      attachments.push({
        filename: 'intruder_snapshot.jpg',
        content: imageBuffer,
        cid: 'intruder_snapshot@passmanage',
        contentType: 'image/jpeg',
      });
    }

    const bannerBadge = isSpoof ? 'BIOMETRIC SPOOF ATTACK PREVENTED' : 'SECURITY BREACH ATTEMPT PREVENTED';
    const bannerTitle = isSpoof ? 'Photo / Digital Screen Spoof Rejected' : 'Unauthorized Biometric Access Rejected';
    const bodyParagraph = isSpoof
      ? `PassManage detected and blocked an automated biometric presentation attack (attempting to use a static photograph, printed picture, or digital screen display) to access your vault credentials for <strong>${websiteName || 'Unknown Site'}</strong> (<code style="color: #38bdf8; background: #020617; padding: 2px 6px; border-radius: 4px;">${targetHostname || 'unknown'}</code>).`
      : `PassManage detected and blocked an unauthorized biometric facial scan attempting to unlock your stored vault password for <strong>${websiteName || 'Unknown Site'}</strong> (<code style="color: #38bdf8; background: #020617; padding: 2px 6px; border-radius: 4px;">${targetHostname || 'unknown'}</code>).`;
    const photoSubtext = isSpoof
      ? 'Static picture or digital device display captured silently during multi-scale liveness evaluation.'
      : 'Face captured silently during failed biometric cosine similarity match.';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Security Alert: Biometric Incident</title>
</head>
<body style="margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #090d16; padding: 36px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #0f172a; border: 2px solid #ef4444; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(239, 68, 68, 0.25);">
          <!-- Alert Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); padding: 24px 32px; text-align: center; border-bottom: 1px solid #b91c1c;">
              <div style="font-size: 32px; margin-bottom: 8px;">🚨</div>
              <div style="display: inline-block; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #fecaca; margin-bottom: 8px;">
                ${bannerBadge}
              </div>
              <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff;">${bannerTitle}</h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #f1f5f9;">
                Hello,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                ${bodyParagraph}
              </p>

              <!-- Intruder Photograph Section -->
              ${hasImage ? `
              <div style="background-color: #020617; border: 1px solid #334155; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
                <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #ef4444; margin-bottom: 12px;">
                  📸 Captured Photograph of the Individual / Device
                </div>
                <div style="display: inline-block; border-radius: 12px; overflow: hidden; border: 2px solid #ef4444; box-shadow: 0 10px 25px rgba(239, 68, 68, 0.3); max-width: 340px;">
                  <img src="cid:intruder_snapshot@passmanage" alt="Captured Intruder" style="display: block; width: 100%; height: auto; max-width: 340px;" />
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 10px;">
                  ${photoSubtext}
                </div>
              </div>
              ` : `
              <div style="background-color: #020617; border: 1px dashed #ef4444; border-radius: 12px; padding: 16px; text-align: center; margin: 20px 0; color: #f87171; font-size: 13px;">
                Intruder face verification rejected by ArcFace deep neural network.
              </div>
              `}

              <!-- Incident Details Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #020617; border: 1px solid #1e293b; border-radius: 10px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; font-size: 12px; color: #64748b; width: 35%;">Target Website</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; font-size: 13px; font-weight: 600; color: #f1f5f9;">${websiteName || 'Unknown'} (${targetHostname || 'N/A'})</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; font-size: 12px; color: #64748b;">Timestamp</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; font-size: 13px; color: #f1f5f9;">${timeStr}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; font-size: 12px; color: #64748b;">Source IP</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #1e293b; font-size: 13px; font-family: monospace; color: #38bdf8;">${ipAddress || '127.0.0.1'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; font-size: 12px; color: #64748b;">Device / Client</td>
                  <td style="padding: 12px 16px; font-size: 12px; color: #94a3b8; word-break: break-word;">${userAgent || 'Standard Browser'}</td>
                </tr>
              </table>

              <!-- Action Recommendations -->
              <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                <div style="font-size: 13px; font-weight: 700; color: #fca5a5; margin-bottom: 6px;">Recommended Actions:</div>
                <ul style="margin: 0; padding-left: 20px; font-size: 12px; line-height: 1.6; color: #f87171;">
                  <li>If you do not recognize the person in the photograph, change your Master Password immediately.</li>
                  <li>Review your paired browser extensions in Security Settings.</li>
                  <li>Your encrypted vault data was <strong>not compromised</strong> and remains protected by zero-knowledge AES-256-GCM.</li>
                </ul>
              </div>

              <p style="margin: 0; font-size: 12px; color: #64748b;">
                This automated security dispatch was triggered by PassManage's progressive authorization policy engine.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px; background-color: #090d16; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #475569;">
                PassManage Zero-Knowledge Biometric Vault &bull; Security Incident Response
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const text = `PassManage Security Alert: Unauthorized Biometric Verification Attempt Detected\n\nTarget Website: ${websiteName} (${targetHostname})\nTime: ${timeStr}\nIP Address: ${ipAddress}\nDevice: ${userAgent}\n\nAn unrecognized individual attempted to unlock your credential using face verification. The biometric match failed and access was blocked.\n\nA photographic capture of this person was taken and is attached to this email.`;

    const mailOptions = {
      from: config.smtpFrom,
      to,
      subject,
      html,
      text,
      attachments,
    };

    return await this.transporter.sendMail(mailOptions);
  }
}

export const EmailService = new EmailServiceClass();
