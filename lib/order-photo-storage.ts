import type { PoolClient } from "pg";
import { orderPhotoFiles, validateOrderPhotos } from "./order-photo-input";

export async function readOrderPhotos(fd: FormData) {
  const files = orderPhotoFiles(fd);
  validateOrderPhotos(files);
  return Promise.all(files.map(async (file) => ({
    filename: file.name,
    mime: file.type,
    data: Buffer.from(await file.arrayBuffer()).toString("base64"),
  })));
}

export async function attachOrderPhotos(db: PoolClient, orderId: string, photos: Awaited<ReturnType<typeof readOrderPhotos>>) {
  for (const photo of photos) {
    await db.query("select erp.add_order_photo($1, $2, $3, $4)", [orderId, photo.filename, photo.mime, photo.data]);
  }
}
