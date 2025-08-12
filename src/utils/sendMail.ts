import { config } from '../config/config';
import { createTransport } from 'nodemailer';

export const sendMail = async (to: string, subject: string, text: string) => {
  try {
    const transporter = createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: config.nodeMailerUser,
        pass: config.nodeMailerPassword,
      },
    });
    let mailOptions = {
      from: config.nodeMailerUser,
      to: to,
      subject,
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your OTP Code</title>
  <style>
    body {
      font-family: 'Helvetica Neue', sans-serif;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      padding: 40px;
      border-radius: 10px;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
    }
    .otp {
      font-size: 32px;
      font-weight: bold;
      color: #4a90e2;
      letter-spacing: 10px;
      text-align: center;
      margin: 30px 0;
    }
    .footer {
      font-size: 12px;
      color: #999999;
      text-align: center;
      margin-top: 30px;
    }
    .title {
      font-size: 22px;
      font-weight: 600;
      color: #333333;
      text-align: center;
      margin-bottom: 10px;
    }
    .subtitle {
      font-size: 16px;
      color: #666666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="title">Your One-Time Password</div>
    <div class="subtitle">Use the code below to verify your identity:</div>
    <div class="otp">${text}</div>
    <div class="subtitle">This code will expire in 10 minutes.</div>
    <div class="footer">
      If you did not request this code, you can safely ignore this email.
      <br />
      &copy; 2025 Your Company. All rights reserved.
    </div>
  </div>
</body>
</html>
`,
    };
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw error;
  }
};
