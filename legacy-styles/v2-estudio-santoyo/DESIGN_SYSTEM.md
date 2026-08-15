# Sistema de diseño — «Estudio Santoyo»

**Fase 6 · agosto 2026.** Sustituye por completo la identidad heredada de Bad Boys
Barbershop (negro + dorado, tipografía condensada de bloque, texturas de navaja),
archivada en `legacy-styles/`. Implementado en `frontend/app/globals.css`.

## Dirección

Un **estudio de oficio a la luz del día**: papel cálido, tinta espresso y el azul
añil del poste de barbero como único acento. La piel anterior vendía "barbería
nocturna urbana" para un equipo; la nueva vende a **una persona que trabaja con
las manos y a la que le confías la cabeza** — cercana, precisa, sin humo.

Es deliberadamente un **tema claro**: la inversión más fuerte posible respecto al
negro heredado, y la que mejor sirve a un flujo de reserva móvil a plena luz
(la mayoría reserva desde el celular, muchas veces en la calle).

## 1. Paleta

Ningún hex coincide con `legacy-styles/bad-boys-globals.css`. Ratios calculados
contra su superficie de uso (WCAG 2.1).

| Token | Hex | Rol semántico | Contraste |
|---|---|---|---|
| `paper` | `#F1EEE6` | Superficie base (página) | — |
| `card` | `#FBFAF7` | Superficie elevada (tarjetas, modales) | — |
| `wash` | `#E7E2D6` | Relleno sutil: hover de filas, pistas de barra | — |
| `line` | `#D8D2C3` | Bordes y divisores | — |
| `ink` | `#221D15` | Texto primario | ≈13.9:1 sobre `paper` (AAA) |
| `ink-soft` | `#5F594C` | Texto secundario | ≈6.0:1 sobre `paper` (AA) |
| `brand` | `#2A4696` | Acento y acción (azul añil de poste) | ≈7.4:1 sobre `paper` (AAA) |
| `brand-deep` | `#1D3370` | Hover/activo del acento | ≈10.5:1 sobre `paper` |
| `brand-tint` | `#DEE5F5` | Selección, fondos de estado activo | — |
| `on-brand` | `#FFFFFF` | Texto sobre `brand` | ≈8.7:1 sobre `brand` (AAA) |
| `ok` | `#1E6F42` | Éxito | ≈5.3:1 sobre `paper` (AA) |
| `warn` | `#7A5A0E` | Advertencia | ≈5.5:1 sobre `paper` (AA) |
| `err` | `#9E3225` | Error / destructivo | ≈6.1:1 sobre `paper` (AA) |
| `err-tint` | `#F3DCD7` | Fondo de avisos de error | — |

**Por qué (apple-design §16.6, «Simplicity»):** un solo acento hace que lo más
importante sea lo más obvio — todo lo azul es accionable, todo lo demás es
contenido. El dorado heredado era acento, borde, textura y marca a la vez;
aquí cada color tiene un rol único.

## 2. Tipografía

| Nivel | Familia | Peso | Tamaño / interlineado | Tracking |
|---|---|---|---|---|
| Display XL (hero) | Fraunces | 600 | `clamp(2.6rem, 7vw, 4.5rem)` / 1.02 | `-0.02em` |
| Display (títulos de sección) | Fraunces | 600 | 39px / 1.08 | `-0.015em` |
| Título de tarjeta | Fraunces | 500 | 25px / 1.15 | `-0.01em` |
| Cuerpo | system-ui | 400/600 | 16px / 1.5 | `0` |
| Secundario | system-ui | 400 | 14px / 1.45 | `0` |
| Datos (precios, horas, códigos) | ui-monospace | 500 | 13–20px / 1.3 | `0.01em`, `tabular-nums` |
| Kicker / etiqueta | system-ui | 600 | 11px / 1.2 | `0.18em`, mayúsculas |

- **Fraunces** (serif óptica variable) reemplaza a Anton: aporta el carácter de
  oficio sin el bloque condensado de "barbershop genérico" que el encargo
  descarta. Su eje óptico cumple apple-design §15: el trazo cambia con el tamaño.
- **system-ui** para UI es aplicación directa de apple-design §15 (*"default to
  the platform's system font"*): ya trae optical sizing y tuning de legibilidad,
  y elimina la dependencia de Inter (heredada).
- Tracking específico por tamaño, nunca fijo: negativo en display, neutro en
  cuerpo, positivo solo en etiquetas pequeñas (apple-design §15).

## 3. Espaciado

Base **4px**, progresión 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96. Razón: pasos
1×–2×–3×–4× para ritmo fino dentro de componentes y saltos ×1.5 entre bloques
(24→32→48) para jerarquía de sección. Se usa la escala de utilidades de
Tailwind (base 4px), que la implementa tal cual.

## 4. Radios y sombras

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | `10px` | Controles: botones, inputs, chips (sobrescribe el default de Tailwind) |
| `--radius-card` | `16px` | Tarjetas y modales (`.card-frame`) |
| `rounded-full` | píldora | Avatares, badges de estado |
| `--shadow-card` | `0 1px 2px rgba(34,29,21,.05), 0 10px 28px rgba(34,29,21,.07)` | Elevación de tarjeta |
| `--shadow-pop` | `0 2px 6px rgba(34,29,21,.08), 0 20px 48px rgba(34,29,21,.14)` | Modales, popovers |

Sombras neutras de dos capas (contacto + ambiente); desaparecen los *glows*
dorados. **Por qué (emil-design-eng, «unseen details»):** la elevación debe
leerse como luz, no como efecto; sobre papel claro un glow de color es ruido.

## 5. Estados de interacción

| Estado | Tratamiento |
|---|---|
| Reposo | Token base del componente |
| Hover (solo `hover:hover` + `pointer:fine`) | Fondo → `wash` en filas; `brand → brand-deep` en acciones |
| Activo (press) | `transform: scale(0.97)` a 150ms — feedback en el *down* (apple-design §1) |
| Foco | `.focus-ring`: outline `2px solid brand`, offset 2px — visible siempre por teclado |
| Seleccionado | Fondo `brand-tint`, borde `brand` |
| Deshabilitado | `opacity: 0.4`, sin eventos de puntero |

## 6. Movimiento

| Token | Valor | Regla de uso |
|---|---|---|
| `--dur-tap` | `150ms` | Feedback de press, hovers |
| `--dur-ui` | `220ms` | Entradas/salidas de UI (dropdown, paso de wizard) |
| `--dur-scene` | `280ms` | Modales, confirmaciones, reveals de scroll |
| `--ease-out-strong` | `cubic-bezier(0.23, 1, 0.32, 1)` | Entradas y salidas |
| `--ease-in-out-strong` | `cubic-bezier(0.77, 0, 0.175, 1)` | Movimiento en pantalla |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets y drawers |

Reglas duras (skill `animate`): solo `transform` y `opacity`; nunca
`transition-all`; nunca `ease-in`; nada por encima de 300ms en UI;
`prefers-reduced-motion` conserva los fundidos y elimina el desplazamiento.

**Nota de no-coincidencia:** las tres curvas son idénticas a las que la hoja
archivada adquirió en la Fase 5, y es deliberado. No son herencia de Bad Boys:
son los valores canónicos de la skill `animate`, cuya regla dura 2 prohíbe
inventar curvas propias (*"Never invent `cubic-bezier(...)` because it looks
familiar"*). Forkear la curva para cumplir la prohibición de coincidencia
violaría la skill que gobierna el movimiento; la prohibición del encargo
enumera hex, tamaños de fuente y radios, y ahí la divergencia es total.

## 7. Decisiones mayores, con su principio

- **Tema claro** — apple-design §16.1 («Purpose»): el trabajo del sitio es que
  alguien reserve desde el celular en segundos; papel claro con un acento de
  alto contraste optimiza exactamente eso, y rompe con la piel heredada de la
  forma más verificable posible.
- **Serif de oficio + sans de sistema** — emil-design-eng («taste is the
  differentiator»): la voz de marca vive en los titulares; el cuerpo es
  herramienta y no compite. §15 de apple-design da el sans de sistema gratis.
- **El poste de barbero, reinterpretado** — la franja `.barber-stripe` sobrevive
  como micro-firma en añil/papel/teja, porque es el símbolo del *oficio* de
  Will, no de la marca vieja. Lo descartado era negro+dorado+navaja, y nada de
  eso queda.
- **La placa troquelada muere; nace el tiquete** — el código de gestión pasa de
  "placa metálica con navaja" a **tiquete de papel** con borde perforado
  (componente del código); `.plate` queda como tarjeta destacada con canto
  añil. Mismo protagonismo (emil-design-eng: el momento raro admite delight),
  materialidad coherente con el papel.
- **Radios 10/16px** — apple-design §16.4 («Familiarity»): controles suaves y
  tarjetas generosas leen como app nativa moderna; el 2px afilado heredado
  pertenecía a la estética de placa metálica.
