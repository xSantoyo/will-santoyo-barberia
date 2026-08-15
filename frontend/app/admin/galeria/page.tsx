"use client";

/** Galería: subir fotos del local/barberos/cortes con drag & drop (sección 9).
 * En prod la subida va directo a S3 con URL pre-firmada; en local, al backend. */
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { mediaUrl } from "@/lib/api";
import type { MediaAsset } from "@/lib/types";
import { PageTitle } from "@/components/admin/shared";

const KINDS = [
  { value: "gallery", label: "Local / ambiente" },
  { value: "cut", label: "Cortes realizados" },
  { value: "barber", label: "Fotos de barberos" },
] as const;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export default function GaleriaPage() {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("gallery");
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .media(kind)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [kind]);

  useEffect(load, [load]);

  async function uploadFiles(files: FileList | File[]) {
    setError(null);
    const list = Array.from(files).filter((file) => ACCEPTED.includes(file.type));
    if (list.length === 0) {
      setError("Formatos permitidos: JPG, PNG, WebP o AVIF (máx. 10 MB).");
      return;
    }
    setUploading(list.length);
    for (const file of list) {
      try {
        await adminApi.uploadImage(kind, file);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error subiendo una imagen");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    load();
  }

  return (
    <>
      <PageTitle
        title="Galería"
        subtitle="Las fotos se publican de inmediato en el sitio, sin tocar código"
      />

      {/* Selector de categoría */}
      <div className="mb-6 flex flex-wrap gap-2">
        {KINDS.map((option) => (
          <button
            key={option.value}
            onClick={() => setKind(option.value)}
            className={`rounded-sm border px-4 py-2 text-sm transition-colors ${
              kind === option.value
                ? "border-brand bg-brand/10 text-brand"
                : "border-line text-ink-soft hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Zona drag & drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          uploadFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mb-8 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragOver ? "border-brand bg-brand/5" : "border-line hover:border-brand/40"
        }`}
      >
        {uploading > 0 ? (
          <>
            <Loader2 className="animate-spin text-brand" size={32} />
            <p className="text-sm text-ink-soft">Subiendo {uploading} imagen(es)…</p>
          </>
        ) : (
          <>
            <UploadCloud size={32} className="text-brand" />
            <p className="text-ink">Arrastra tus fotos aquí o haz clic para elegirlas</p>
            <p className="text-xs text-ink-soft">JPG, PNG, WebP o AVIF · máx. 10 MB por imagen</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>

      {error && (
        <div className="mb-6 rounded-sm border border-err bg-err/15 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Grilla de imágenes */}
      {loading ? (
        <div className="flex min-h-[20vh] items-center justify-center text-brand">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-sm border border-line bg-card py-16 text-ink-soft">
          <ImagePlus size={32} />
          <p className="text-sm">Aún no hay fotos en esta categoría.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <figure
              key={item.id}
              className="group relative overflow-hidden rounded-sm border border-line bg-card"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl(item.url) ?? ""}
                alt={item.title ?? ""}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              <button
                onClick={() => {
                  if (confirm("¿Eliminar esta imagen del sitio?")) {
                    adminApi.deleteMedia(item.id).then(load);
                  }
                }}
                className="absolute right-2 top-2 hidden rounded-sm bg-paper/80 p-2 text-err backdrop-blur group-hover:block"
                aria-label="Eliminar imagen"
              >
                <Trash2 size={16} />
              </button>
            </figure>
          ))}
        </div>
      )}
    </>
  );
}
