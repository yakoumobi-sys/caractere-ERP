"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addOrderPhotos, removeOrderPhoto } from "@/app/actions/orders";
import { btn } from "./ui";

// Réduit l'image (côté navigateur) avant l'envoi : rapide sur téléphone, léger en base.
async function shrink(file: File, max = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export function PhotoUploader({ orderId, label = "Ajouter des photos" }: { orderId: string; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const list = Array.from(e.target.files || []);
          if (!list.length) return;
          setBusy(true);
          setMsg(null);
          try {
            const fd = new FormData();
            fd.set("order_id", orderId);
            for (const f of list.slice(0, 6)) fd.append("photos", await shrink(f));
            const r = await addOrderPhotos(null, fd);
            setMsg(r);
            router.refresh();
          } catch {
            setMsg({ error: "Envoi impossible. Réessayez avec moins de photos." });
          } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
          }
        }}
      />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={btn("secondary")}>
        📷 {busy ? "Envoi…" : label}
      </button>
      {msg?.error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="mt-2 text-sm text-emerald-700">{msg.ok}</p>}
    </div>
  );
}

export function PhotoGallery({ orderId, photos, canEdit }: { orderId: string; photos: { id: string; filename: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className={photos.length === 1 ? "grid gap-3" : "grid grid-cols-2 gap-3 lg:grid-cols-3"}>
        {photos.map((p) => (
          <div key={p.id} className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
            <button type="button" onClick={() => setOpen(p.id)} className="block w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${p.id}`} alt={p.filename} className="max-h-[520px] w-full object-contain" />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("Retirer cette photo ?")) return;
                  const fd = new FormData();
                  fd.set("file_id", p.id);
                  fd.set("order_id", orderId);
                  await removeOrderPhoto(null, fd);
                  router.refresh();
                }}
                className="absolute right-2 top-2 rounded-lg bg-white/90 px-2 py-1 text-xs text-red-700 shadow"
              >
                Retirer
              </button>
            )}
          </div>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-night-950/90 p-4" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/files/${open}`} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </>
  );
}
