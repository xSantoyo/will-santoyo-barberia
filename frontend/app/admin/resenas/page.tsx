"use client";

/** Moderación de reseñas: nada se publica en el sitio de Will sin su OK.
 *
 * Las pendientes van arriba porque son las que piden acción; las publicadas
 * quedan abajo para poder retirarlas si hace falta. */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, EyeOff, Loader2, Star, Trash2 } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { ReviewAdmin } from "@/lib/types";
import { PageTitle } from "@/components/admin/shared";
import Button from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewAdmin[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    adminApi
      .reviews()
      .then(setReviews)
      .catch((err) => toast.error("No pudimos cargar las reseñas", {
        description: err.message,
      }));
  }, []);

  useEffect(load, [load]);

  async function moderate(review: ReviewAdmin, isPublic: boolean) {
    setBusy(review.id);
    try {
      await adminApi.moderateReview(review.id, isPublic);
      toast.success(isPublic ? "Reseña publicada" : "Reseña retirada del sitio");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setBusy(null);
    }
  }

  async function remove(review: ReviewAdmin) {
    setBusy(review.id);
    try {
      await adminApi.deleteReview(review.id);
      toast.success("Reseña eliminada");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBusy(null);
    }
  }

  const pendientes = reviews?.filter((r) => !r.is_public) ?? [];
  const publicadas = reviews?.filter((r) => r.is_public) ?? [];

  return (
    <>
      <PageTitle
        title="Reseñas"
        subtitle="Solo se publican las que apruebes"
        action={
          pendientes.length > 0 ? (
            <span className="kicker rounded-full bg-copper px-3 py-1.5 text-on-copper">
              {pendientes.length} sin revisar
            </span>
          ) : undefined
        }
      />

      {reviews === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="surface p-8 text-center text-smoke">
          Todavía no hay reseñas. Aparecen aquí cuando un cliente reseña un turno
          completado desde su tiquete.
        </p>
      ) : (
        <div className="space-y-8">
          <Grupo
            titulo="Pendientes de aprobación"
            vacio="Nada por revisar."
            items={pendientes}
            busy={busy}
            onApprove={(r) => moderate(r, true)}
            onDelete={remove}
          />
          <Grupo
            titulo="Publicadas en el sitio"
            vacio="Ninguna publicada todavía."
            items={publicadas}
            busy={busy}
            onHide={(r) => moderate(r, false)}
            onDelete={remove}
          />
        </div>
      )}
    </>
  );
}

function Grupo({
  titulo,
  vacio,
  items,
  busy,
  onApprove,
  onHide,
  onDelete,
}: {
  titulo: string;
  vacio: string;
  items: ReviewAdmin[];
  busy: number | null;
  onApprove?: (r: ReviewAdmin) => void;
  onHide?: (r: ReviewAdmin) => void;
  onDelete: (r: ReviewAdmin) => void;
}) {
  return (
    <section>
      <h2 className="kicker mb-3 text-smoke">{titulo}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-smoke/70">{vacio}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((review) => (
            <li key={review.id} className="surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="flex" aria-label={`${review.rating} de 5`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          size={14}
                          aria-hidden
                          className={
                            i < review.rating
                              ? "fill-copper text-copper"
                              : "text-edge"
                          }
                        />
                      ))}
                    </span>
                    <span className="text-sm text-chalk">{review.customer_name}</span>
                  </p>
                  <p className="data mt-1 text-xs text-smoke">{review.created_at}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {onApprove && (
                    <Button
                      size="sm"
                      onClick={() => onApprove(review)}
                      loading={busy === review.id}
                    >
                      <Check size={15} aria-hidden /> Publicar
                    </Button>
                  )}
                  {onHide && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onHide(review)}
                      loading={busy === review.id}
                    >
                      <EyeOff size={15} aria-hidden /> Retirar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onDelete(review)}
                    disabled={busy === review.id}
                    aria-label="Eliminar reseña"
                  >
                    <Trash2 size={15} aria-hidden />
                  </Button>
                </div>
              </div>

              {review.comment && (
                <p className="mt-3 border-t border-edge pt-3 text-sm text-smoke">
                  {review.comment}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
