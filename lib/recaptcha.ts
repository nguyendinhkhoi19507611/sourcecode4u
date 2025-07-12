// lib/recaptcha.ts
export const verifyRecaptcha = async (token: string): Promise<boolean> => {
  try {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${secretKey}&response=${token}`,
    });

    const data = await response.json();
    return data.success && data.score > 0.5; // Threshold for bot detection
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return false;
  }
};