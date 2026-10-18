/**
 * Client-Side Image Compressor for Fast Slip Uploads
 * Compresses heavy phone camera photos (5-10MB) down to ~80-150KB
 * preserving clarity and text readability while enabling instant upload on slow networks.
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export const compressImageBase64 = async (
  base64Data: string,
  options: CompressionOptions = {}
): Promise<string> => {
  const { maxWidth = 1280, maxHeight = 1280, quality = 0.75 } = options;

  if (!base64Data || !base64Data.startsWith('data:')) {
    return base64Data;
  }

  // PDFs should not be canvas-compressed
  if (base64Data.startsWith('data:application/pdf')) {
    return base64Data;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;

          // Resize proportionally if larger than maximum bounds
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(base64Data);
            return;
          }

          // Fill white background in case of transparent PNGs
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          // Draw the image
          ctx.drawImage(img, 0, 0, width, height);

          // Try exporting as WebP (supported by all modern browsers/Android WebViews)
          // Fall back to JPEG if needed
          let compressed = canvas.toDataURL('image/webp', quality);
          if (!compressed.startsWith('data:image/webp')) {
            compressed = canvas.toDataURL('image/jpeg', quality);
          }

          console.log(
            `[Image Compression] Original length: ${base64Data.length} chars -> Compressed: ${compressed.length} chars (${Math.round((compressed.length / base64Data.length) * 100)}%)`
          );

          resolve(compressed);
        } catch (canvasErr) {
          console.warn('[Image Compression] Canvas error, fallback to original:', canvasErr);
          resolve(base64Data);
        }
      };

      img.onerror = (err) => {
        console.warn('[Image Compression] Image load failed, fallback to original:', err);
        resolve(base64Data);
      };

      img.src = base64Data;
    } catch (e) {
      console.warn('[Image Compression] Unexpected error, returning original:', e);
      resolve(base64Data);
    }
  });
};
