// lib/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadToCloudinary = async (
  base64String: string,
  folder: string = 'sourcecode4u',
  resourceType: 'image' | 'video' | 'auto' = 'image'
): Promise<string> => {
  try {
    const result = await cloudinary.uploader.upload(base64String, {
      folder,
      resource_type: resourceType,
      transformation: resourceType === 'image' ? [
        { width: 800, height: 600, crop: 'fill', quality: 'auto' }
      ] : undefined,
    });
    
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Failed to upload image');
  }
};

export const deleteFromCloudinary = async (imageUrl: string): Promise<void> => {
  try {
    // Extract public_id from URL
    const parts = imageUrl.split('/');
    const publicIdWithExtension = parts.slice(-2).join('/');
    const publicId = publicIdWithExtension.split('.')[0];
    
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    // Don't throw error as this is not critical
  }
};

export default cloudinary;