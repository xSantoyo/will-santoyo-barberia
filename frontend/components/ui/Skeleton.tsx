/**
 * Estados de carga del sistema.
 *
 * Por qué skeleton y no spinner: un spinner dice "espera"; un skeleton dice
 * "esto es lo que viene y dónde va a caer", así que el salto al contenido real
 * no es un cambio brusco — es exactamente la categoría "preventing a jarring
 * change" de la skill. El brillo es CSS puro (`.skeleton` en globals.css):
 * corre fuera del hilo principal, que es justo cuando el hilo está ocupado
 * cargando datos.
 */
import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("skeleton", className)} />;
}

/** Rejilla de horarios mientras se consulta la disponibilidad. */
export function SlotsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2.5" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

/** Lista de servicios mientras carga la agenda. */
export function ServicesSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-20 rounded-[var(--radius-card)]" />
      ))}
    </div>
  );
}
