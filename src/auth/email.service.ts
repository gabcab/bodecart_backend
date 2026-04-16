import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private readonly isDevelopment: boolean;
  private readonly enableEmail: boolean;
  private smtpVerified = false;

  constructor(private configService: ConfigService) {
    this.isDevelopment = this.configService.get<string>('NODE_ENV') !== 'production';
    this.enableEmail = this.configService.get<string>('ENABLE_EMAIL_VERIFICATION') === 'true';
  }

  async onModuleInit() {
    await this.initializeTransporter();
  }

  private async initializeTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const portStr = this.configService.get<string>('SMTP_PORT');
    const port = portStr ? parseInt(portStr, 10) : 587;
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    // If email is disabled via config, don't initialize transporter
    if (!this.enableEmail) {
      this.logger.warn('⚠️  EMAIL VERIFICATION IS DISABLED (ENABLE_EMAIL_VERIFICATION=false)');
      this.logger.warn('⚠️  OTP codes will be logged to console in development mode');
      return;
    }

    // Check if SMTP config is complete
    if (!host || !user || !pass) {
      this.logger.error('❌ SMTP configuration is incomplete!');
      this.logger.error('   Required: SMTP_HOST, SMTP_USER, SMTP_PASSWORD');
      this.logger.error('   Current values:');
      this.logger.error(`   - SMTP_HOST: ${host || 'NOT SET'}`);
      this.logger.error(`   - SMTP_PORT: ${port}`);
      this.logger.error(`   - SMTP_USER: ${user || 'NOT SET'}`);
      this.logger.error(`   - SMTP_PASSWORD: ${pass ? '***SET***' : 'NOT SET'}`);
      this.logger.error('');
      this.logger.error('📖 For Gmail setup instructions, see: backend/EMAIL_SETUP.md');
      this.logger.error(
        '💡 To disable email verification in development: set ENABLE_EMAIL_VERIFICATION=false in .env',
      );
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
        connectionTimeout: 10000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
      });

      this.logger.log(`📧 Email transporter initialized (${host}:${port}, user: ${user})`);

      // Verify SMTP connection on startup
      await this.transporter.verify();
      this.smtpVerified = true;
      this.logger.log('✅ SMTP connection verified - emails will be sent correctly');
    } catch (error) {
      this.logger.error(`❌ SMTP connection FAILED: ${error.message}`);
      if (error.message?.includes('Username and Password not accepted') ||
          error.message?.includes('Invalid login')) {
        this.logger.error('');
        this.logger.error('🔐 Gmail Authentication Error!');
        this.logger.error('   1. Ensure 2-Factor Authentication is enabled on your Gmail');
        this.logger.error('   2. Use an App Password, not your regular password');
        this.logger.error('   3. Generate at: https://myaccount.google.com/apppasswords');
        this.logger.error('   4. In .env, wrap password in quotes: SMTP_PASSWORD="xxxx xxxx xxxx xxxx"');
      }
      this.logger.error('   Emails will NOT be delivered. OTP codes will be logged to console.');
    }
  }

  async sendOtpEmail(email: string, code: string): Promise<boolean> {
    // Development mode without email enabled - just log the OTP
    if (!this.enableEmail) {
      this.logger.warn('─────────────────────────────────────────────────');
      this.logger.warn(`📧 OTP Email would be sent to: ${email}`);
      this.logger.warn(`🔑 OTP CODE: ${code}`);
      this.logger.warn(`⏰ Valid for: 10 minutes`);
      this.logger.warn('─────────────────────────────────────────────────');
      return true;
    }

    if (!this.transporter || !this.smtpVerified) {
      this.logger.error(`❌ Cannot send OTP email - SMTP not configured or verification failed`);
      this.logger.warn('─────────────────────────────────────────────────');
      this.logger.warn(`📧 FALLBACK - OTP for ${email}: ${code}`);
      this.logger.warn('─────────────────────────────────────────────────');
      return this.isDevelopment; // Allow dev to continue, fail in production
    }

    try {
      const mailOptions = {
        from: `"BodeCart" <${this.configService.get<string>('SMTP_USER')}>`,
        to: email,
        subject: 'Codigo de Verificacion - BodeCart',
        html: this.getOtpEmailTemplate(code),
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ OTP email sent successfully to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send OTP email to ${email}: ${error.message}`);

      // In development, log the OTP as fallback
      this.logger.warn('─────────────────────────────────────────────────');
      this.logger.warn(`📧 FALLBACK - OTP for ${email}: ${code}`);
      this.logger.warn('─────────────────────────────────────────────────');
      return this.isDevelopment;
    }
  }

  private getOtpEmailTemplate(code: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Código de Verificación</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #2c3e50; font-size: 28px;">BodeCart</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 40px; text-align: center;">
                    <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 24px;">Código de Verificación</h2>
                    <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                      Usa el siguiente código para verificar tu cuenta. Este código expirará en 10 minutos.
                    </p>
                    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 0 0 30px 0;">
                      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #3498db;">\${code}</span>
                    </div>
                    <p style="margin: 0; color: #999999; font-size: 14px;">
                      Si no solicitaste este código, puedes ignorar este correo.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 40px 40px 40px; text-align: center; border-top: 1px solid #eeeeee;">
                    <p style="margin: 0; color: #999999; font-size: 12px;">
                      © 2024 BodeCart. Todos los derechos reservados.
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
  }

  async sendPasswordResetOtp(email: string, code: string): Promise<boolean> {
    if (!this.enableEmail) {
      this.logger.warn('─────────────────────────────────────────────────');
      this.logger.warn(`📧 PASSWORD RESET OTP would be sent to: ${email}`);
      this.logger.warn(`🔑 OTP CODE: ${code}`);
      this.logger.warn(`⏰ Valid for: 15 minutes`);
      this.logger.warn('─────────────────────────────────────────────────');
      return true;
    }

    if (!this.transporter || !this.smtpVerified) {
      this.logger.error(`❌ Cannot send OTP email - SMTP not configured or verification failed`);
      this.logger.warn('─────────────────────────────────────────────────');
      this.logger.warn(`📧 FALLBACK - PASSWORD RESET OTP for ${email}: ${code}`);
      this.logger.warn('─────────────────────────────────────────────────');
      return this.isDevelopment;
    }

    try {
      const mailOptions = {
        from: `"BodeCart" <${this.configService.get<string>('SMTP_USER')}>`,
        to: email,
        subject: 'Recuperación de Contraseña - BodeCart',
        html: this.getPasswordResetEmailTemplate(code),
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Password reset OTP sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send password reset OTP to ${email}: ${error.message}`);
      return this.isDevelopment;
    }
  }

  async sendGoogleAccountNotice(email: string): Promise<boolean> {
    if (!this.enableEmail) {
      this.logger.warn('─────────────────────────────────────────────────');
      this.logger.warn(`📧 GOOGLE NOTICE would be sent to: ${email}`);
      this.logger.warn('─────────────────────────────────────────────────');
      return true;
    }

    if (!this.transporter || !this.smtpVerified) {
      return this.isDevelopment;
    }

    try {
      const mailOptions = {
        from: `"BodeCart" <${this.configService.get<string>('SMTP_USER')}>`,
        to: email,
        subject: 'Recuperación de Contraseña - BodeCart',
        html: this.getGoogleAccountNoticeTemplate(),
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`✅ Google account notice sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send Google account notice to ${email}: ${error.message}`);
      return this.isDevelopment;
    }
  }

  private getPasswordResetEmailTemplate(code: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recuperación de Contraseña</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #2c3e50; font-size: 28px;">BodeCart</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 40px; text-align: center;">
                    <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 24px;">Recuperación de Contraseña</h2>
                    <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                      Usa el siguiente código para poder crear una nueva contraseña. Este código expirará en 15 minutos.
                    </p>
                    <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 0 0 30px 0;">
                      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #3498db;">${code}</span>
                    </div>
                    <p style="margin: 0; color: #999999; font-size: 14px;">
                      Si no solicitaste este código, puedes ignorar este correo.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 40px 40px 40px; text-align: center; border-top: 1px solid #eeeeee;">
                    <p style="margin: 0; color: #999999; font-size: 12px;">
                      © 2024 BodeCart. Todos los derechos reservados.
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
  }

  private getGoogleAccountNoticeTemplate(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recuperación de Contraseña</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #2c3e50; font-size: 28px;">BodeCart</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 40px; text-align: center;">
                    <h2 style="margin: 0 0 20px 0; color: #2c3e50; font-size: 24px;">Intento de Recuperación</h2>
                    <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                      Tu cuenta fue creada con Google, inicia sesión usando Google.
                    </p>
                    <p style="margin: 0; color: #999999; font-size: 14px;">
                      Al usar Google, no requieres una contraseña dentro de la plataforma BodeCart. 
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 40px 40px 40px; text-align: center; border-top: 1px solid #eeeeee;">
                    <p style="margin: 0; color: #999999; font-size: 12px;">
                      © 2024 BodeCart. Todos los derechos reservados.
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
  }

}
