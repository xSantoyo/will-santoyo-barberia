"use client";

/**
 * Botón del sistema. Variantes tipadas con cva (skill `pick-ui-library`:
 * "cva when a component has real variants that deserve a typed API").
 *
 * Movimiento (skill `animate`, receta "Button press"): el feedback vive en el
 * :active, no en el click — 160 ms con ease-out fuerte. `scale()` arrastra a
 * los hijos (icono y texto), que es lo que lo hace leer como presión física.
 * El hover queda gateado por puntero fino: en táctil dispara falsos positivos.
 */
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { forwardRef } from "react";
import clsx from "clsx";

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 rounded-sm font-medium",
    "focus-ring select-none whitespace-nowrap",
    // Solo transform y colores. Nunca transition-all.
    "transition-[transform,background-color,border-color,color,opacity]",
    "duration-150 ease-[var(--ease-out)]",
    "enabled:active:scale-[0.97]",
    "disabled:opacity-40 disabled:pointer-events-none",
  ],
  {
    variants: {
      variant: {
        // El acento es CLARO: texto oscuro encima (7.09:1 AAA).
        primary: "bg-copper text-on-copper enabled:hover:bg-ember",
        secondary: "border border-edge bg-coal text-chalk enabled:hover:border-copper/50",
        ghost: "text-smoke enabled:hover:bg-ash enabled:hover:text-chalk",
        danger: "border border-brick/50 text-brick enabled:hover:bg-brick enabled:hover:text-night",
      },
      size: {
        // 44px mínimo: objetivo táctil accesible
        sm: "min-h-11 px-4 text-sm",
        md: "min-h-12 px-6 text-base",
        lg: "min-h-14 px-8 text-lg",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", full: false },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & {
    /** Muestra spinner y bloquea el botón sin cambiar su ancho. */
    loading?: boolean;
    /** Texto mientras carga. Si falta, se conserva el original. */
    loadingLabel?: string;
  };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, full, loading, loadingLabel, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(button({ variant, size, full }), className)}
      {...rest}
    >
      {loading && <Loader2 size={18} className="animate-spin" aria-hidden />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
});

export default Button;
export { button as buttonVariants };
