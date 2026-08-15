"use client";

/**
 * Campo de formulario del sistema: etiqueta, control, ayuda y error, cableados
 * entre sí para lectores de pantalla (`aria-describedby`, `aria-invalid`).
 *
 * Detalle que casi todo formulario olvida: `text-base` (16px) en el input evita
 * que iOS haga zoom automático al enfocar. Y la validación es inline, no al
 * enviar (apple-design §16: "validate inline, not on submit").
 */
import { useId } from "react";
import clsx from "clsx";

const controlBase = [
  "w-full rounded-sm border bg-coal px-4 text-base text-chalk",
  "placeholder:text-smoke/50",
  "transition-[border-color,background-color] duration-150 ease-[var(--ease-out)]",
  "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
  "focus-visible:outline-copper",
];

export function Field({
  label,
  hint,
  error,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
  }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="block">
      <label htmlFor={id} className="mb-2 block text-sm text-smoke">
        {label}
        {optional && <span className="ml-1.5 text-smoke/60">(opcional)</span>}
      </label>

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}

      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-brick">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-2 text-xs text-smoke/80">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Input({
  className,
  invalid,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={clsx(
        controlBase,
        "min-h-13 py-3.5",
        invalid ? "border-brick" : "border-edge hover:border-edge/80",
        className,
      )}
      {...rest}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={clsx(
        controlBase,
        "min-h-24 py-3",
        invalid ? "border-brick" : "border-edge hover:border-edge/80",
        className,
      )}
      {...rest}
    />
  );
}
