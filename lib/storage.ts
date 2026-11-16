import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Fichiers clients privés : Supabase Storage (bucket privé) si configuré, sinon disque local (.data/files).
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "erp-prive";
const LOCAL_DIR = path.join(process.cwd(), ".data", "files");
const supabaseEnabled = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif|svg\+xml)|application\/pdf|application\/postscript|application\/illustrator)$/;

export async function saveFile(file: File, folder: string): Promise<{ storage: "local" | "supabase"; path: string }> {
  if (file.size > MAX_FILE_BYTES) throw new Error("Fichier trop volumineux (8 Mo maximum).");
  if (file.type && !ALLOWED_MIME.test(file.type)) throw new Error("Type de fichier non accepté (images, PDF, AI).");
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const key = `${folder}/${randomUUID()}-${safe}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (supabaseEnabled()) {
    const { error } = await admin().storage.from(BUCKET).upload(key, bytes, { contentType: file.type || "application/octet-stream" });
    if (error) throw new Error("Stockage : " + error.message);
    return { storage: "supabase", path: key };
  }
  const full = path.join(LOCAL_DIR, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
  return { storage: "local", path: key };
}

export async function readStoredFile(storage: string, key: string): Promise<Buffer> {
  if (key.includes("..")) throw new Error("Chemin invalide");
  if (storage === "supabase") {
    const { data, error } = await admin().storage.from(BUCKET).download(key);
    if (error || !data) throw new Error("Fichier introuvable");
    return Buffer.from(await data.arrayBuffer());
  }
  return readFile(path.join(LOCAL_DIR, key));
}
