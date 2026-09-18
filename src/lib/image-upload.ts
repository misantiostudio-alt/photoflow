export type OptimizedImage = {
  blob: Blob;
  width: number;
  height: number;
};

export async function fileSha256(file: File) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function blobFromCanvas(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not optimize this image.")),
      type,
      quality,
    );
  });
}

export async function optimizeImage(
  file: File,
  maxEdge: number,
  quality = 0.82,
): Promise<OptimizedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > maxEdge ? maxEdge / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image optimizer is not available in this browser.");

    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await blobFromCanvas(canvas, "image/webp", quality);
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

type FaceBox = { x: number; y: number; width: number; height: number };

async function detectLargestFace(bitmap: ImageBitmap): Promise<FaceBox | null> {
  if (typeof window === "undefined") return null;
  const Detector = (window as any).FaceDetector;
  if (!Detector) return null;

  try {
    const detector = new Detector({ fastMode: true, maxDetectedFaces: 3 });
    const faces = await detector.detect(bitmap);
    if (!Array.isArray(faces) || !faces.length) return null;

    const largest = [...faces].sort((a: any, b: any) => {
      const aBox = a?.boundingBox;
      const bBox = b?.boundingBox;
      return ((bBox?.width ?? 0) * (bBox?.height ?? 0)) - ((aBox?.width ?? 0) * (aBox?.height ?? 0));
    })[0]?.boundingBox;

    if (!largest) return null;
    return {
      x: Number(largest.x ?? 0),
      y: Number(largest.y ?? 0),
      width: Number(largest.width ?? 0),
      height: Number(largest.height ?? 0),
    };
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function createIdentityThumbnail(
  file: File,
  outputSize = 420,
  quality = 0.84,
): Promise<OptimizedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const face = await detectLargestFace(bitmap);
    const minDim = Math.min(bitmap.width, bitmap.height);

    let cropSize: number;
    let centerX: number;
    let centerY: number;

    if (face && face.width > 0 && face.height > 0) {
      cropSize = clamp(
        Math.max(face.width * 3.6, face.height * 3.8),
        minDim * 0.38,
        minDim * 0.74,
      );
      centerX = face.x + face.width / 2;
      // Shift down slightly so shoulders/chest stay in the identity crop.
      centerY = face.y + face.height / 2 + face.height * 0.8;
    } else {
      // Reliable portrait fallback: tighter upper-center crop.
      cropSize = minDim * 0.78;
      centerX = bitmap.width / 2;
      centerY = Math.min(
        bitmap.height - cropSize / 2,
        bitmap.height * 0.30,
      );
    }

    const sx = clamp(centerX - cropSize / 2, 0, bitmap.width - cropSize);
    const sy = clamp(centerY - cropSize / 2, 0, bitmap.height - cropSize);

    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Identity thumbnail generator is not available in this browser.");

    context.drawImage(
      bitmap,
      sx,
      sy,
      cropSize,
      cropSize,
      0,
      0,
      outputSize,
      outputSize,
    );

    const blob = await blobFromCanvas(canvas, "image/webp", quality);
    return { blob, width: outputSize, height: outputSize };
  } finally {
    bitmap.close();
  }
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}