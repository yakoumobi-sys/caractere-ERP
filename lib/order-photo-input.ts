export const ORDER_PHOTO_FIELD = "photos";
export const ORDER_PHOTO_COUNT = 6;
export const ORDER_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const ORDER_PHOTO_BATCH_BYTES = 3.5 * 1024 * 1024;
export const ORDER_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function resizeOrderPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || !globalThis.createImageBitmap) return file;
  const image = await createImageBitmap(file).catch(() => null);
  if (!image) return file;
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    if (scale === 1 && file.size <= ORDER_PHOTO_MAX_BYTES && ORDER_PHOTO_TYPES.includes(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } finally {
    image.close();
  }
}

export function orderPhotoFiles(fd: FormData): File[] {
  return fd.getAll(ORDER_PHOTO_FIELD).filter((file): file is File => typeof file !== "string" && file.size > 0);
}

export function validateOrderPhotos(files: File[]) {
  if (files.length > ORDER_PHOTO_COUNT) throw new Error("Sélectionnez au maximum 6 photos à la fois.");
  if (files.some((file) => !ORDER_PHOTO_TYPES.includes(file.type))) throw new Error("Utilisez des images JPEG, PNG ou WebP.");
  if (files.some((file) => file.size > ORDER_PHOTO_MAX_BYTES) || files.reduce((total, file) => total + file.size, 0) > ORDER_PHOTO_BATCH_BYTES) {
    throw new Error("Les photos sont trop lourdes. Réduisez leur taille ou sélectionnez moins de fichiers.");
  }
}

export async function prepareOrderPhotos(fd: FormData): Promise<void> {
  const files = orderPhotoFiles(fd);
  if (files.length > ORDER_PHOTO_COUNT) throw new Error("Sélectionnez au maximum 6 photos à la fois.");
  const resized = await Promise.all(files.map(resizeOrderPhoto));
  validateOrderPhotos(resized);
  fd.delete(ORDER_PHOTO_FIELD);
  for (const file of resized) fd.append(ORDER_PHOTO_FIELD, file);
}
