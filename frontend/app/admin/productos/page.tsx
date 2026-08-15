"use client";

/** La vitrina (Tanda 4, D4): productos del local, solo consulta pública —
 * se compran físicamente, sin checkout en línea. */
import { useCallback, useEffect, useState } from "react";
import { Camera, Loader2, Package, Plus } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { mediaUrl } from "@/lib/api";
import { formatCOP, type ProductAdmin } from "@/lib/types";
import {
  Modal,
  PageTitle,
  buttonGhost,
  buttonPrimary,
  inputClass,
} from "@/components/admin/shared";

export default function ProductosPage() {
  const [products, setProducts] = useState<ProductAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProductAdmin | "new" | null>(null);

  const load = useCallback(() => {
    adminApi
      .products()
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function uploadPhoto(product: ProductAdmin, file: File) {
    try {
      const asset = await adminApi.uploadImage("product", file);
      await adminApi.updateProduct(product.id, { photo_key: asset.s3_key });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error subiendo la foto");
    }
  }

  if (loading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-copper">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );

  return (
    <>
      <PageTitle
        title="Vitrina"
        subtitle="Pomadas, aceites y más — solo consulta; se venden en el local"
        action={
          <button onClick={() => setEditing("new")} className={buttonPrimary}>
            <Plus size={16} className="mr-1 inline" />
            Nuevo producto
          </button>
        }
      />

      {products.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-sm border border-edge bg-coal py-16 text-smoke">
          <Package size={32} />
          <p className="text-sm">La vitrina está vacía — agrega el primer producto.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <div
              key={product.id}
              className={`surface border bg-coal ${
                product.is_active ? "border-edge" : "border-brick/40 opacity-60"
              }`}
            >
              <label className="group relative block aspect-square cursor-pointer overflow-hidden bg-ash">
                {product.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl(product.photo_url) ?? ""}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="display text-outline flex h-full items-center justify-center text-6xl">
                    BB
                  </span>
                )}
                <span className="absolute inset-0 hidden items-center justify-center bg-night/70 group-hover:flex">
                  <Camera size={20} className="text-copper" />
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadPhoto(product, file);
                  }}
                />
              </label>
              <div className="p-4">
                <h2 className="text-chalk">{product.name}</h2>
                <p className="data mt-1 text-lg font-semibold text-copper">
                  {formatCOP(product.price_cop)}
                </p>
                <button onClick={() => setEditing(product)} className={`${buttonGhost} mt-3`}>
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProductModal
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function ProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: ProductAdmin | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price_cop: product?.price_cop ?? 30000,
    is_active: product?.is_active ?? true,
    sort_order: product?.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, description: form.description || null };
      if (product) await adminApi.updateProduct(product.id, payload);
      else await adminApi.createProduct(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
      setSaving(false);
    }
  }

  return (
    <Modal title={product ? `Editar ${product.name}` : "Nuevo producto"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-sm border border-brick bg-brick/15 px-3 py-2 text-sm">{error}</div>
        )}
        <label className="block text-sm text-smoke">
          Nombre
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="block text-sm text-smoke">
          Descripción
          <input
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={`${inputClass} mt-1`}
            placeholder="Fijación fuerte, brillo cero…"
          />
        </label>
        <label className="block text-sm text-smoke">
          Precio (COP)
          <input
            type="number"
            required
            min={1000}
            step={500}
            value={form.price_cop}
            onChange={(e) => setForm((f) => ({ ...f, price_cop: Number(e.target.value) }))}
            className={`${inputClass} mt-1`}
          />
        </label>
        {product && (
          <label className="flex items-center gap-2 text-sm text-smoke">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="accent-[#2a4696]"
            />
            Visible en la vitrina del sitio
          </label>
        )}
        <button type="submit" disabled={saving} className={`${buttonPrimary} w-full`}>
          {saving ? <Loader2 className="mr-2 inline animate-spin" size={16} /> : null}
          Guardar
        </button>
      </form>
    </Modal>
  );
}
