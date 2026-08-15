# legacy-styles — referencia congelada

Aquí vive la piel anterior del sitio (**Bad Boys Barbershop**: negro + dorado,
tipografía condensada de bloque, texturas de navaja), archivada durante el
refactor a la identidad personal de Will Santoyo (Fase 6, agosto 2026).

- **No es código vivo.** Ningún archivo de la aplicación importa nada de esta
  carpeta; está fuera de `frontend/`, así que el build, el lint, el typecheck y
  el bundle de Next.js no la ven.
- **No se elimina.** Se conserva como referencia de diseño histórica y como la
  columna "antes" de la tabla comparativa de tokens en `DESIGN_SYSTEM.md`.

| Archivo | Qué era |
|---|---|
| `bad-boys-globals.css` | Tokens Tailwind v4 (`@theme`), fuentes, texturas y clases de componente de la identidad Bad Boys |

El sistema vigente está definido en `DESIGN_SYSTEM.md` (raíz del repo) e
implementado en `frontend/app/globals.css`.
