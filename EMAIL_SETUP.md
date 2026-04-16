# Email Configuration Guide for BodeCart

This guide explains how to configure email sending for OTP (One-Time Password) verification in the BodeCart backend.

## Table of Contents
- [Quick Start (Development Mode)](#quick-start-development-mode)
- [Gmail Setup (Recommended for Development)](#gmail-setup-recommended-for-development)
- [Alternative Email Providers](#alternative-email-providers)
- [Production Recommendations](#production-recommendations)
- [Troubleshooting](#troubleshooting)

---

## Quick Start (Development Mode)

If you just want to test the application without setting up email, follow these steps:

### 1. Disable Email Verification

In your `backend/.env` file, set:

```env
ENABLE_EMAIL_VERIFICATION=false
NODE_ENV=development
```

### 2. How It Works

When email verification is disabled:
- OTP codes are **logged to the console** instead of being sent via email
- Users can still register and login normally
- Look for messages like this in your backend logs:

```
─────────────────────────────────────────────────
📧 OTP Email would be sent to: user@example.com
🔑 OTP CODE: 123456
⏰ Valid for: 10 minutes
─────────────────────────────────────────────────
```

### 3. Testing Flow

1. Register a new user via API or mobile app
2. Check the backend console logs for the OTP code
3. Use that code to verify the account
4. Login successfully!

---

## Gmail Setup (Recommended for Development)

If you want to test actual email sending during development, Gmail is the easiest option.

### Prerequisites

- A Gmail account
- 2-Factor Authentication enabled

### Step-by-Step Instructions

#### Step 1: Enable 2-Factor Authentication

1. Go to your Google Account: https://myaccount.google.com/security
2. Look for "2-Step Verification" section
3. Click "Get started" and follow the setup process
4. Complete the 2FA setup (you'll need your phone)

#### Step 2: Generate App Password

1. After enabling 2FA, go to: https://myaccount.google.com/apppasswords

   > **Note**: If you don't see this option, make sure 2FA is fully enabled

2. In "Select app" dropdown → Choose "Mail"
3. In "Select device" dropdown → Choose "Other (Custom name)"
4. Enter: `BodeCart` (or any name you prefer)
5. Click "Generate"

#### Step 3: Copy the App Password

You'll see a 16-character password like: `abcd efgh ijkl mnop`

**IMPORTANT**: Remove the spaces! Your password should be: `abcdefghijklmnop`

#### Step 4: Configure Your .env File

Update your `backend/.env` file:

```env
# Enable email verification
ENABLE_EMAIL_VERIFICATION=true

# Gmail SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=abcdefghijklmnop  # Your 16-character App Password (no spaces!)
```

#### Step 5: Restart Your Backend

```bash
cd backend
npm run start:dev
```

You should see:

```
✅ Email transporter initialized successfully
   Host: smtp.gmail.com:587
   User: your-email@gmail.com
```

### Testing

1. Register a new user
2. Check your email inbox for the OTP code
3. Verify the account with the OTP
4. Success!

---

## Alternative Email Providers

### Outlook / Hotmail

```env
ENABLE_EMAIL_VERIFICATION=true
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASSWORD=your-outlook-password
```

**Note**: Outlook may require app-specific passwords if you have 2FA enabled.

### Yahoo Mail

```env
ENABLE_EMAIL_VERIFICATION=true
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
SMTP_USER=your-email@yahoo.com
SMTP_PASSWORD=your-yahoo-app-password
```

**Note**: Yahoo requires app-specific passwords. Generate one at: https://login.yahoo.com/account/security

### Custom SMTP Server

If you have your own SMTP server:

```env
ENABLE_EMAIL_VERIFICATION=true
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587  # or 465 for SSL
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=your-smtp-password
```

---

## Production Recommendations

For production environments, we recommend using a dedicated email service provider:

### 1. SendGrid (Recommended)

**Why SendGrid?**
- 100 emails/day free tier
- Excellent deliverability
- Easy to set up
- Great analytics

**Setup:**

1. Sign up at: https://sendgrid.com/
2. Create an API key
3. Configure your `.env`:

```env
ENABLE_EMAIL_VERIFICATION=true
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey  # Literally the word "apikey"
SMTP_PASSWORD=SG.xxxxxxxxxxxx  # Your SendGrid API key
```

### 2. AWS SES (Amazon Simple Email Service)

**Why AWS SES?**
- Very cheap (0.10 per 1000 emails)
- High reliability
- Good for high volume

**Setup:**

1. Sign up for AWS SES
2. Verify your domain or email address
3. Get SMTP credentials
4. Configure your `.env`:

```env
ENABLE_EMAIL_VERIFICATION=true
SMTP_HOST=email-smtp.us-east-1.amazonaws.com  # Your region
SMTP_PORT=587
SMTP_USER=your-ses-smtp-username
SMTP_PASSWORD=your-ses-smtp-password
```

### 3. Mailgun

**Why Mailgun?**
- 5,000 emails/month free
- Good API
- Reliable

**Setup:**

1. Sign up at: https://www.mailgun.com/
2. Add your domain
3. Get SMTP credentials
4. Configure your `.env`:

```env
ENABLE_EMAIL_VERIFICATION=true
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@your-domain.com
SMTP_PASSWORD=your-mailgun-password
```

---

## Troubleshooting

### Error: "Username and Password not accepted"

**Cause**: You're using your regular Gmail password instead of an App Password.

**Solution**:
1. Make sure 2FA is enabled on your Gmail account
2. Generate an App Password (see [Gmail Setup](#gmail-setup-recommended-for-development))
3. Use the App Password in `SMTP_PASSWORD` (remove spaces!)

### Error: "Connection timeout"

**Cause**: Network issues or firewall blocking port 587.

**Solutions**:
- Check your internet connection
- Try port 465 with `SMTP_PORT=465` (SSL)
- Check if your firewall/antivirus is blocking SMTP ports
- Try a different network (some corporate networks block SMTP)

### Error: "Self signed certificate"

**Cause**: SSL certificate validation issue.

**Solution**: Not recommended for production, but for development you can disable SSL verification by adding this to `email.service.ts`:

```typescript
this.transporter = nodemailer.createTransport({
  // ... existing config
  tls: {
    rejectUnauthorized: false  // Only for development!
  }
});
```

### Emails Not Arriving

**Possible causes**:
1. **Spam folder**: Check your spam/junk folder
2. **Email provider limits**: Gmail has sending limits for new accounts
3. **Wrong email address**: Verify the recipient email is correct
4. **SPF/DKIM issues**: For production, configure proper email authentication

### OTP Code Not Being Logged to Console

**Cause**: `ENABLE_EMAIL_VERIFICATION` is set to `true` but email sending is failing.

**Solution**:
1. Set `ENABLE_EMAIL_VERIFICATION=false` in `.env`
2. Restart the backend
3. OTP codes will now be logged to console

### "Email transporter not initialized"

**Cause**: Missing or incomplete SMTP configuration.

**Solution**:
1. Check that all SMTP variables are set in `.env`:
   - `SMTP_HOST`
   - `SMTP_USER`
   - `SMTP_PASSWORD`
2. Restart the backend
3. Check the logs for initialization messages

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENABLE_EMAIL_VERIFICATION` | No | `false` | Enable/disable email sending. Set to `false` for dev mode |
| `NODE_ENV` | No | `development` | Environment mode. Affects logging and fallbacks |
| `SMTP_HOST` | Yes* | - | SMTP server hostname (e.g., `smtp.gmail.com`) |
| `SMTP_PORT` | No | `587` | SMTP server port (`587` for TLS, `465` for SSL) |
| `SMTP_USER` | Yes* | - | SMTP username (usually your email address) |
| `SMTP_PASSWORD` | Yes* | - | SMTP password (App Password for Gmail) |

\* Required only if `ENABLE_EMAIL_VERIFICATION=true`

---

## Testing Checklist

Before deploying to production, test the following:

- [ ] User can register and receive OTP email
- [ ] OTP code in email matches what's in database
- [ ] OTP expires after 10 minutes
- [ ] Invalid OTP is rejected
- [ ] Expired OTP is rejected
- [ ] User can resend OTP
- [ ] Email template looks good on desktop
- [ ] Email template looks good on mobile
- [ ] Emails don't go to spam
- [ ] Error messages are helpful

---

## Security Best Practices

### 1. Never Commit Credentials

**DO NOT** commit your `.env` file to git! It's already in `.gitignore`, but double-check:

```bash
git status  # Make sure .env is not listed
```

### 2. Use Different Credentials for Production

- Development: Personal Gmail with App Password
- Production: Dedicated email service (SendGrid, SES, etc.)

### 3. Rotate Credentials Regularly

Change your SMTP passwords/API keys every 3-6 months.

### 4. Monitor Email Sending

Set up alerts for:
- Failed email sends
- High volume of sends (potential spam abuse)
- Unusual sending patterns

---

## Need Help?

If you're still having issues:

1. Check the backend logs for detailed error messages
2. Review this guide carefully
3. Search for the error message online
4. Ask in the project's issue tracker

---

## Appendix: Email Service Comparison

| Service | Free Tier | Price | Pros | Cons |
|---------|-----------|-------|------|------|
| **Gmail** | N/A | Free | Easy setup, reliable | Limited to ~500/day, not for production |
| **SendGrid** | 100/day | $0.10/1000 | Great deliverability | Requires domain verification |
| **AWS SES** | 62,000/month (first year) | $0.10/1000 | Very cheap, scalable | Complex setup |
| **Mailgun** | 5,000/month | $0.80/1000 | Good API, reliable | More expensive |
| **Postmark** | 100/month | $1.25/1000 | Best deliverability | Most expensive |

---

**Last Updated**: December 2024
**BodeCart Version**: 1.0.0
