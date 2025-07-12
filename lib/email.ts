// lib/email.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransporter({
  host: process.env.EMAIL_SERVER_HOST,
  port: parseInt(process.env.EMAIL_SERVER_PORT),
  secure: process.env.EMAIL_SERVER_PORT === '465',
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });
  } catch (error) {
    console.error('Email sending failed:', error);
    throw new Error('Failed to send email');
  }
};

export const sendVerificationEmail = async (
  email: string,
  token: string,
  baseUrl: string
): Promise<void> => {
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
  
  const html = `
    <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
      <div style="background: linear-gradient(135deg, #0C969C 0%, #274D60 100%); padding: 40px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">SourceCode4U</h1>
      </div>
      
      <div style="padding: 40px; background: #f8f9fa;">
        <h2 style="color: #333; margin-bottom: 20px;">Xác thực tài khoản của bạn</h2>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
          Chào mừng bạn đến với SourceCode4U! Vui lòng click vào nút bên dưới để xác thực tài khoản của bạn.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background: #0C969C; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Xác thực tài khoản
          </a>
        </div>
        
        <p style="color: #999; font-size: 14px; margin-top: 30px;">
          Nếu bạn không thể click vào nút, hãy copy và paste link sau vào trình duyệt:
          <br>
          <a href="${verificationUrl}">${verificationUrl}</a>
        </p>
      </div>
      
      <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 14px;">
        © 2025 SourceCode4U. All rights reserved.
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Xác thực tài khoản SourceCode4U',
    html,
  });
};

export const sendPasswordResetEmail = async (
  email: string,
  token: string,
  baseUrl: string
): Promise<void> => {
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  
  const html = `
    <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
      <div style="background: linear-gradient(135deg, #0C969C 0%, #274D60 100%); padding: 40px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">SourceCode4U</h1>
      </div>
      
      <div style="padding: 40px; background: #f8f9fa;">
        <h2 style="color: #333; margin-bottom: 20px;">Đặt lại mật khẩu</h2>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
          Bạn đã yêu cầu đặt lại mật khẩu. Click vào nút bên dưới để tạo mật khẩu mới.
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #0C969C; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Đặt lại mật khẩu
          </a>
        </div>
        
        <p style="color: #999; font-size: 14px; margin-top: 30px;">
          Link này sẽ hết hạn sau 1 giờ. Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.
        </p>
      </div>
      
      <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 14px;">
        © 2025 SourceCode4U. All rights reserved.
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: 'Đặt lại mật khẩu SourceCode4U',
    html,
  });
};

export const sendPurchaseNotificationEmail = async (
  sellerEmail: string,
  buyerName: string,
  sourceTitle: string,
  amount: number
): Promise<void> => {
  const html = `
    <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
      <div style="background: linear-gradient(135deg, #0C969C 0%, #274D60 100%); padding: 40px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">SourceCode4U</h1>
      </div>
      
      <div style="padding: 40px; background: #f8f9fa;">
        <h2 style="color: #333; margin-bottom: 20px;">🎉 Chúc mừng! Bạn có một giao dịch mới</h2>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #666; line-height: 1.6; margin: 10px 0;">
            <strong>Người mua:</strong> ${buyerName}
          </p>
          <p style="color: #666; line-height: 1.6; margin: 10px 0;">
            <strong>Sản phẩm:</strong> ${sourceTitle}
          </p>
          <p style="color: #666; line-height: 1.6; margin: 10px 0;">
            <strong>Số tiền:</strong> ${amount.toLocaleString('vi-VN')} xu
          </p>
          <p style="color: #666; line-height: 1.6; margin: 10px 0;">
            <strong>Bạn nhận được:</strong> ${(amount * 0.8).toLocaleString('vi-VN')} xu (80%)
          </p>
        </div>
        
        <p style="color: #666; line-height: 1.6;">
          Số xu đã được cộng vào tài khoản của bạn. Bạn có thể đăng nhập để kiểm tra và rút xu.
        </p>
      </div>
      
      <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 14px;">
        © 2025 SourceCode4U. All rights reserved.
      </div>
    </div>
  `;

  await sendEmail({
    to: sellerEmail,
    subject: `🎉 Bạn có giao dịch mới trên SourceCode4U`,
    html,
  });
};