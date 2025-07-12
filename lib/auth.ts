// lib/auth.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, IUser } from './db/models';
import { connectToDatabase } from './db/connection';

const JWT_SECRET = process.env.JWT_SECRET!;

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, 12);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return await bcrypt.compare(password, hashedPassword);
};

export const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

export const verifyToken = (token: string): { userId: string } | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
};

export const generateUserId = (): string => {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
};

export const generateSourceId = (): string => {
  return 'SC' + crypto.randomBytes(6).toString('hex').toUpperCase();
};

export const generatePurchaseId = (): string => {
  return 'PUR' + crypto.randomBytes(6).toString('hex').toUpperCase();
};

export const generatePaymentId = (): string => {
  return 'PAY' + crypto.randomBytes(6).toString('hex').toUpperCase();
};

export const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const getUserFromRequest = async (request: Request): Promise<IUser | null> => {
  try {
    await connectToDatabase();
    
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return null;
    }

    const user = await User.findOne({ userId: decoded.userId });
    return user;
  } catch {
    return null;
  }
};

export const requireAuth = async (request: Request): Promise<IUser> => {
  const user = await getUserFromRequest(request);
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
};

export const requireAdmin = async (request: Request): Promise<IUser> => {
  const user = await requireAuth(request);
  if (user.role !== 'admin') {
    throw new Error('Admin access required');
  }
  return user;
};