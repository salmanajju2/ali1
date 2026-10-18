/**
 * Unified Storage Service for Transaction Slips and Documents
 * Storage: Cloudinary (Fast Global CDN, 25GB Free, Client-Direct)
 */

import { compressImageBase64 } from './imageCompressor';

export const CLOUDINARY_CLOUD_NAME = 'jbxm7dax';
export const CLOUDINARY_UPLOAD_PRESET = 'ali_slip';

export interface UploadResult {
  url: string;
  provider: 'cloudinary';
}

/**
 * Uploads a slip (Image or PDF) to Cloudinary with compression.
 */
export const uploadSlip = async (rawBase64Data: string): Promise<string | null> => {
  if (!rawBase64Data || typeof rawBase64Data !== 'string') return null;

  // If already a hosted URL, don't re-upload
  if (rawBase64Data.startsWith('http://') || rawBase64Data.startsWith('https://') || rawBase64Data.startsWith('tg:')) {
    return rawBase64Data;
  }

  let dataToUpload = rawBase64Data;

  // Step 1: Compress image on client-side if it's not a PDF
  try {
    if (rawBase64Data.startsWith('data:image/')) {
      dataToUpload = await compressImageBase64(rawBase64Data, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.75,
      });
    }
  } catch (compErr) {
    console.warn('[StorageService] Compression error, using original:', compErr);
  }

  // Step 2: Cloudinary Direct Upload (Fast Global CDN)
  try {
    console.log('[StorageService] Uploading slip to Cloudinary...');
    const formData = new FormData();
    formData.append('file', dataToUpload);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout for slow networks

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.secure_url) {
        console.log('[StorageService] ✅ Cloudinary upload success:', data.secure_url);
        return data.secure_url;
      }
    } else {
      const errorText = await response.text();
      console.warn('[StorageService] ⚠️ Cloudinary upload returned non-200:', response.status, errorText);
    }
  } catch (cloudErr) {
    console.error('[StorageService] ❌ Cloudinary upload failed:', cloudErr);
  }

  return null;
};

/**
 * Optimizes Cloudinary image URL for faster mobile viewing (auto format, auto quality).
 */
export const getOptimizedImageUrl = (url: string, maxWidth = 1000): string => {
  if (!url || typeof url !== 'string') return '';
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    // Insert f_auto,q_auto,w_{maxWidth},c_limit after /upload/
    return url.replace('/upload/', `/upload/f_auto,q_auto,w_${maxWidth},c_limit/`);
  }
  return url;
};

/**
 * Extracts Cloudinary public_id from a Cloudinary image URL.
 */
export const extractCloudinaryPublicId = (url: string): string | null => {
  try {
    if (!url || !url.includes('res.cloudinary.com')) return null;
    const uploadIndex = url.indexOf('/upload/');
    if (uploadIndex === -1) return null;
    let pathAfterUpload = url.substring(uploadIndex + '/upload/'.length);
    pathAfterUpload = pathAfterUpload.split('?')[0];

    const parts = pathAfterUpload.split('/');
    const publicIdParts: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (/^v\d+$/.test(part)) continue;
      if (part.includes(',') || /^(c|w|h|f|q|t|e|l|u|b|g|fl|co)_/.test(part)) continue;
      publicIdParts.push(part);
    }

    if (publicIdParts.length === 0) return null;
    const fullPublicIdWithExt = publicIdParts.join('/');
    const lastDotIndex = fullPublicIdWithExt.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      return fullPublicIdWithExt.substring(0, lastDotIndex);
    }
    return fullPublicIdWithExt;
  } catch {
    return null;
  }
};

/**
 * Deletes a slip if possible (for Cloudinary images or Telegram bot messages).
 */
export const deleteSlip = async (slipValue: string): Promise<boolean> => {
  if (!slipValue) return true;

  // 1. Legacy slip marker (no external deletion needed)
  if (slipValue.startsWith('tg:')) {
    return true;
  }

  // 2. Cloudinary image deletion via backend proxy
  if (slipValue.includes('res.cloudinary.com')) {
    const publicId = extractCloudinaryPublicId(slipValue);
    if (!publicId) {
      console.warn('[StorageService] Could not extract public_id from Cloudinary URL:', slipValue);
      return false;
    }

    try {
      const { API_ORIGIN } = await import('./apiConfig');
      const { refreshSessionToken } = await import('../context/AuthContext');
      const token = await refreshSessionToken();
      if (!token) {
        console.warn('[StorageService] Cannot delete Cloudinary image: user not authenticated');
        return false;
      }

      console.log(`[StorageService] Requesting server delete for Cloudinary publicId: ${publicId}`);
      const res = await fetch(`${API_ORIGIN}/cloudinary/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ publicId })
      });

      if (!res.ok) {
        const err = await res.text();
        console.warn('[StorageService] Cloudinary delete failed on server:', res.status, err);
        return false;
      }

      const data = await res.json();
      console.log('✅ [StorageService] Cloudinary image deleted successfully:', publicId, data);
      return data.result === 'ok' || data.result === 'not found';
    } catch (err) {
      console.error('[StorageService] Network error deleting Cloudinary image:', err);
      return false;
    }
  }

  return true;
};
