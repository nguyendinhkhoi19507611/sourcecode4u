import mongoose, { Schema, Document } from 'mongoose';

// User Model
export interface IUser extends Document {
  userId: string;
  email: string;
  password: string;
  fullName: string;
  avatar?: string;
  phone?: string;
  balance: number;
  role: 'user' | 'admin';
  isVerified: boolean;
  verificationToken?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  avatar: { type: String, default: '' },
  phone: { type: String, default: '' },
  balance: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
}, { timestamps: true });

// SourceCode Model
export interface ISourceCode extends Document {
  sourceId: string;
  title: string;
  description: string;
  price: number;
  seller: mongoose.Types.ObjectId;
  category: string;
  tags: string[];
  thumbnail: string;
  demoVideo?: string;
  sourceLink: string;
  views: number;
  purchases: number;
  rating: number;
  totalRatings: number;
  isActive: boolean;
  isAdminPost: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SourceCodeSchema = new Schema<ISourceCode>({
  sourceId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, required: true },
  tags: [{ type: String }],
  thumbnail: { type: String, required: true },
  demoVideo: { type: String },
  sourceLink: { type: String, required: true },
  views: { type: Number, default: 0 },
  purchases: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  totalRatings: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isAdminPost: { type: Boolean, default: false },
}, { timestamps: true });

// Purchase Model
export interface IPurchase extends Document {
  purchaseId: string;
  buyer: mongoose.Types.ObjectId;
  sourceCode: mongoose.Types.ObjectId;
  amount: number;
  sellerEarnings: number;
  adminCommission: number;
  accessExpiresAt: Date;
  createdAt: Date;
}

const PurchaseSchema = new Schema<IPurchase>({
  purchaseId: { type: String, required: true, unique: true },
  buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sourceCode: { type: Schema.Types.ObjectId, ref: 'SourceCode', required: true },
  amount: { type: Number, required: true },
  sellerEarnings: { type: Number, required: true },
  adminCommission: { type: Number, required: true },
  accessExpiresAt: { type: Date, required: true },
}, { timestamps: true });

// Payment Model
export interface IPayment extends Document {
  paymentId: string;
  user: mongoose.Types.ObjectId;
  type: 'deposit' | 'withdrawal';
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  bankInfo?: {
    accountName: string;
    accountNumber: string;
    bankName: string;
  };
  note?: string;
  adminNote?: string;
  processedBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
  createdAt: Date;
}

const PaymentSchema = new Schema<IPayment>({
  paymentId: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdrawal'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  bankInfo: {
    accountName: { type: String },
    accountNumber: { type: String },
    bankName: { type: String },
  },
  note: { type: String },
  adminNote: { type: String },
  processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  processedAt: { type: Date },
}, { timestamps: true });

// Review Model
export interface IReview extends Document {
  buyer: mongoose.Types.ObjectId;
  sourceCode: mongoose.Types.ObjectId;
  rating: number;
  comment: string;
  createdAt: Date;
}

const ReviewSchema = new Schema<IReview>({
  buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sourceCode: { type: Schema.Types.ObjectId, ref: 'SourceCode', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
}, { timestamps: true });

// Comment Model
export interface IComment extends Document {
  user: mongoose.Types.ObjectId;
  sourceCode: mongoose.Types.ObjectId;
  content: string;
  replies: mongoose.Types.ObjectId[];
  parentComment?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const CommentSchema = new Schema<IComment>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sourceCode: { type: Schema.Types.ObjectId, ref: 'SourceCode', required: true },
  content: { type: String, required: true },
  replies: [{ type: Schema.Types.ObjectId, ref: 'Comment' }],
  parentComment: { type: Schema.Types.ObjectId, ref: 'Comment' },
}, { timestamps: true });

// Notification Model
export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: 'purchase' | 'sale' | 'payment' | 'system';
  isRead: boolean;
  relatedId?: string;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['purchase', 'sale', 'payment', 'system'], required: true },
  isRead: { type: Boolean, default: false },
  relatedId: { type: String },
}, { timestamps: true });

// Category Model
export interface ICategory extends Document {
  name: string;
  slug: string;
  description: string;
  icon: string;
  isActive: boolean;
  createdAt: Date;
}

const CategorySchema = new Schema<ICategory>({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  icon: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Create and export models
export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export const SourceCode = mongoose.models.SourceCode || mongoose.model<ISourceCode>('SourceCode', SourceCodeSchema);
export const Purchase = mongoose.models.Purchase || mongoose.model<IPurchase>('Purchase', PurchaseSchema);
export const Payment = mongoose.models.Payment || mongoose.model<IPayment>('Payment', PaymentSchema);
export const Review = mongoose.models.Review || mongoose.model<IReview>('Review', ReviewSchema);
export const Comment = mongoose.models.Comment || mongoose.model<IComment>('Comment', CommentSchema);
export const Notification = mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
export const Category = mongoose.models.Category || mongoose.model<ICategory>('Category', CategorySchema);