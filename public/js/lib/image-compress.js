// Compresses a photo down to a max dimension + JPEG quality before it's synced to Supabase
// Storage — keeps Timeline photos small enough to upload quickly on mobile data and stay
// well under the "memories" bucket's server-side size cap (see
// supabase/migrations/0003_memories_sync.sql). Runs entirely client-side via <canvas>, no
// library needed (constitution: zero build step).

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function compressImage(fileOrBlob) {
  const bitmap = await createImageBitmap(fileOrBlob);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Photo could not be compressed");
  return blob;
}
