// Lightweight image analysis utilities

/**
 * Compute the average luminance of an image by drawing it to a small
 * offscreen canvas and averaging pixel values. Returns a number in [0, 255].
 */
export async function getImageAverageLuminance(imageUrl: string): Promise<number> {
  if (!imageUrl) return 255; // default to light

  // Wrap in a Promise to resolve after image load/draw
  return new Promise((resolve) => {
    try {
      const img = new Image();
      // Same-origin or blob URLs should work; keep anonymous to avoid tainting
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const targetSize = 32; // small sample for speed
          const w = Math.max(1, Math.min(targetSize, img.width));
          const h = Math.max(1, Math.min(targetSize, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(255);
          // Draw scaled image to canvas
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;

          let sum = 0;
          const totalPixels = w * h;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Perceived luminance (Rec. 709)
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            sum += lum;
          }
          resolve(sum / totalPixels);
        } catch {
          resolve(255);
        }
      };
      img.onerror = () => resolve(255);
      img.src = imageUrl;
    } catch {
      resolve(255);
    }
  });
}

/**
 * Given a luminance in [0, 255], return a readable text color.
 * Dark backgrounds (< 128) -> white text, else black text.
 */
export function getReadableTextColorForLuminance(luminance: number): '#ffffff' | '#000000' {
  return luminance < 128 ? '#ffffff' : '#000000';
}
