# legacy-styles — referencia congelada

Pieles anteriores del sitio, archivadas durante el refactor a la marca personal
de Will Santoyo.

- **No es código vivo.** Ningún archivo de la aplicación importa nada de aquí;
  la carpeta vive fuera de `frontend/`, así que el build, el lint, el typecheck
  y el bundle de Next.js no la ven.
- **No se elimina.** Se conserva como referencia histórica y como la columna
  "antes" de las tablas comparativas de tokens en `DESIGN_SYSTEM.md`.

| Versión | Archivo | Identidad |
|---|---|---|
| v1 | `v1-bad-boys-globals.css` | **Bad Boys Barbershop** — negro neutro + dorado, Anton condensada en mayúsculas, texturas de navaja, esquinas cortadas de placa metálica |
| v2 | `v2-estudio-santoyo/` | **Estudio Santoyo** — papel cálido claro + añil, Fraunces serif, tema claro. Descartada por el dueño: la dirección clara no transmitía el carácter que quería |

El sistema vigente está definido en `DESIGN_SYSTEM.md` (raíz del repo) e
implementado en `frontend/app/globals.css`.
