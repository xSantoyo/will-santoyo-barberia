# Sistema de diseño — «Después de las 6»

**v3 · agosto 2026.** La barbería de Will al caer la noche: carbón cálido, luz de
cobre, tipografía de estudio. Implementado en `frontend/app/globals.css`.
Versiones anteriores archivadas en `legacy-styles/` (v1 Bad Boys, v2 Estudio
Barber Shop) — no se eliminan, sirven de referencia y de columna "antes".

## Qué gobierna este documento

La skill `emilkowalski/skills` define el **movimiento** de forma exhaustiva
(curvas, duraciones, física, accesibilidad) y las **librerías**. No define
paleta, espaciado ni escala tipográfica: ahí el documento sigue sus *principios*
(sobre todo `apple-design` §15 sobre tipografía y §16 sobre jerarquía) y toma
decisiones propias, declaradas abajo con su razón.

## 0. La idea

No es "negro y dorado de barbería genérica" (eso fue la v1, y está archivada).
Es **el local a las siete de la tarde**: la calle ya oscura, la luz cálida
adentro, el cobre de los apliques sobre el espejo. El negro es **cálido**
(#141210, con rojo dentro), no el neutro azulado de los frameworks. El acento es
**cobre anaranjado**, no oro amarillo.

## 1. Paleta

Ratios WCAG 2.1 **calculados**, no estimados (`scratchpad/paleta.py`).
Ningún hex coincide con la v1 ni con la v2.

| Token | Hex | Rol | Sobre `night` |
|---|---|---|---|
| `night` | `#141210` | Superficie base (página) | — |
| `coal` | `#1E1A17` | Superficie elevada (tarjetas, modales) | 1.08:1 de separación |
| `ash` | `#2A2420` | Relleno: hover de filas, pistas de barra | 1.13:1 sobre `coal` |
| `edge` | `#3B322C` | Bordes y divisores | 1.38:1 sobre `coal` |
| `chalk` | `#F4EFE9` | Texto primario | **16.35:1 AAA** |
| `smoke` | `#A79C91` | Texto secundario | **6.95:1 AA** |
| `copper` | `#E08B4C` | Acento y acción | **7.09:1 AAA** |
| `ember` | `#C96C31` | Hover/activo del acento | 5.05:1 AA |
| `sage` | `#7FB08A` | Éxito | 7.55:1 AAA |
| `amber` | `#E0B84C` | Advertencia | 9.90:1 AAA |
| `brick` | `#E06A5C` | Error / destructivo | 5.68:1 AA |

### La regla que un implementador ingenuo rompería

**El texto sobre el botón cobre es `night`, nunca blanco.** Blanco sobre
`copper` da **2.64:1 — falla AA**; `night` sobre `copper` da **7.09:1 AAA**. El
acento es claro, así que se comporta como un color de fondo *claro*: pide texto
oscuro encima. Está codificado en el token `--color-on-copper`.

**Por qué (apple-design §16.6, «Simplicity»):** un solo acento hace que lo más
importante sea lo más obvio — todo lo que es cobre se puede pulsar. Los estados
(`sage`/`amber`/`brick`) nunca se usan como acento decorativo.

## 2. Elevación en oscuro: superficie, no sombra

Sobre fondo oscuro una sombra proyectada no se ve — el negro sobre negro no
separa nada. La jerarquía se construye con **luminosidad de superficie** y un
**canto superior de luz** (borde hairline claro arriba), que es como se
comporta un material real bajo una luz cenital.

```css
.surface-raised {
  background: var(--color-coal);
  border: 1px solid var(--color-edge);
  border-top-color: rgba(244, 239, 233, 0.09); /* el canto que atrapa la luz */
}
```

Se permite una sombra difusa **solo** en superficies flotantes reales (modal,
popover) y como profundidad ambiental, nunca como separador.

## 3. Tipografía

| Nivel | Familia | Peso | Tamaño / interlineado | Tracking |
|---|---|---|---|---|
| Display XL (hero) | Bricolage Grotesque | 700 | `clamp(3rem, 8vw, 5.5rem)` / 0.95 | `-0.03em` |
| Display (secciones) | Bricolage Grotesque | 600 | `clamp(2rem, 4vw, 3rem)` / 1.05 | `-0.02em` |
| Título de tarjeta | Bricolage Grotesque | 600 | 20px / 1.2 | `-0.01em` |
| Cuerpo | system-ui | 400 | 16px / 1.6 | `0` |
| Secundario | system-ui | 400 | 14px / 1.5 | `0` |
| Datos (precios, horas, códigos) | ui-monospace | 500 | 13–20px / 1.3 | `0.01em`, `tabular-nums` |
| Kicker / etiqueta | ui-monospace | 500 | 11px / 1.2 | `0.22em`, mayúsculas |

- **Bricolage Grotesque** es variable con eje óptico y de ancho: el trazo cambia
  con el tamaño, que es exactamente lo que pide apple-design §15. Es un grotesk
  con carácter — nada que ver con la Anton condensada de la v1 ni con la Fraunces
  serif de la v2.
- **system-ui** para todo el texto de interfaz: apple-design §15 lo pide
  explícitamente (*"default to the platform's system font… override only with a
  reason"*). La razón para la excepción del display es la voz de marca.
- **Tracking negativo agresivo en display** (`-0.03em`): a tamaño grande las
  letras se leen demasiado separadas. Cuerpo en `0`. Etiquetas pequeñas en
  `+0.22em`, que es donde el tracking positivo sí ayuda a la legibilidad.
- **Interlineado inverso al tamaño**: 0.95 en el hero, 1.6 en cuerpo.

## 4. Espaciado

Base **4px**; escala 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128. Pasos
1×–4× para ritmo dentro de componentes; saltos ×1.5 entre bloques (24→32→48) para
jerarquía de sección. Es la escala nativa de Tailwind, usada tal cual.

**Secciones oscuras respiran más:** el padding vertical de sección sube a
`96px` móvil / `128px` desktop. Sobre fondo oscuro el aire es lo que separa;
apretarlo hace que todo se lea como una masa.

## 4b. El logo y su umbral de tamaño

Tres piezas, todas del mismo vector original (el PDF del diseñador, sin
retocar). Fondo transparente y `fill="currentColor"`: el color lo pone el CSS.

| Pieza | Archivo | Componente |
|---|---|---|
| Lockup completo (escudo + WILL + BARBER SHOP.) | `public/logo-completo.svg` | — |
| Escudo con monograma WB y destello | `public/logo-marca.svg` | `LogoMarca` |
| Monograma WB solo | `public/logo-marca-simple.svg` | `LogoMarcaSimple` |

**El umbral son 32 píxeles FÍSICOS, no CSS.** Por encima, el escudo completo;
por debajo, el monograma solo.

La distinción importa: en un celular de densidad 3× un elemento de 32 px CSS se
dibuja con 96 px reales, donde el escudo se ve perfecto. Medido en el navbar a
densidad 1× —el peor caso, 32 px físicos— el escudo **todavía se lee**, así que
el navbar usa `LogoMarca` en cualquier teléfono. Hoy solo bajan del umbral el
favicon (el navegador lo rasteriza a 16–32 px reales, sin importar la densidad)
y la barra superior del panel en móvil, a 24 px.

**Por qué se cae el escudo y no el monograma.** El problema al reducir no era el
detalle del WB: era que el escudo lo dejaba ocupando ~60 % del lienzo. Quitando
el escudo, el monograma se queda con todo el espacio. Y no se pierde la
silueta — la W y la B rematan en punta hacia abajo, que es la forma que el
escudo envolvía. Se probó también el escudo vacío: legible a 16 px, pero un
escudo sin nada dentro es cualquier marca.

**Texto sobre `copper` va en `night`** (7.09:1 AAA). Blanco da 2.64:1 y no pasa.

## 5. Radios y sombras

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | `12px` | Controles: botones, inputs, chips |
| `--radius-card` | `20px` | Tarjetas y modales |
| `rounded-full` | píldora | Badges de estado, avatares |
| `--shadow-pop` | `0 16px 48px rgba(0,0,0,.55)` | Solo modales y popovers flotantes |

Radios distintos de v1 (2px afilado) y v2 (10/16px). Nada de *glows* de color:
la v1 los usaba en dorado y eran su firma; aquí la luz la da el canto superior.

## 6. Estados de interacción

| Estado | Tratamiento |
|---|---|
| Reposo | Token base del componente |
| Hover (solo `hover:hover` + `pointer:fine`) | `copper → ember` en acciones; fondo → `ash` en filas |
| Activo (press) | `transform: scale(0.97)` a 160 ms — feedback en el *down* |
| Foco | `.focus-ring`: outline `2px solid copper`, offset 2px |
| Seleccionado | Borde `copper`, fondo `copper/10` |
| Deshabilitado | `opacity: 0.4`, sin eventos de puntero |

## 7. Movimiento

Tokens **textuales de la skill** (`animate` §5, regla dura: no inventar curvas):

| Token | Valor | Uso |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Entradas y salidas |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Movimiento en pantalla |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets y drawers |

Duraciones, de la tabla de la skill: press 100–160 ms · tooltips 125–200 ·
dropdowns 150–250 · modales/drawers 200–500. **Techo de 300 ms para UI.**

Reglas que no se negocian: solo `transform` y `opacity`; nunca `transition:
all`; nunca `ease-in`; nunca `scale(0)` (mínimo `scale(0.95)` + opacidad);
`prefers-reduced-motion` conserva los fundidos y elimina el desplazamiento;
hover gateado por puntero fino.

**Dónde vive el presupuesto de delight** (tabla de frecuencia de la skill):

| Superficie | Frecuencia | Movimiento permitido |
|---|---|---|
| Home | Primera visita | Scroll reveal, stagger, entrada del hero |
| Wizard de reserva | Ocasional | Transición direccional entre pasos, press, carga |
| Tiquete / confirmación | Rara, alta emoción | Aquí sí: el código se imprime, delight |
| La Fila | Consulta repetida | Solo el número que rueda; nada más |
| Panel de Will | Decenas de veces al día | Press feedback y nada más. Sin reveals |

## 8. Decisiones mayores, con su principio

- **Negro cálido, no neutro** — el brief pedía explícitamente huir del gris/azul
  por defecto de los frameworks. `#141210` lleva rojo dentro; a la vista es
  "local con luz cálida", no "dashboard oscuro".
- **Cobre, no oro** — el oro amarillo (`#c9a24b`) era la firma de la v1. El
  cobre anaranjado (`#E08B4C`) ocupa el mismo rol funcional con otra
  temperatura, y además pasa AAA sobre la superficie base.
- **Elevación por superficie y canto de luz** — apple-design §12: el material
  debe leerse como material. En oscuro, la sombra no informa; la luminosidad sí.
- **Un solo display face** — apple-design §15 pide system font por defecto;
  la excepción se paga una sola vez, en los titulares.
- **La franja de barbero sobrevive, reinterpretada** — es el símbolo del oficio
  de Will, no de la marca vieja. Pasa a cobre/carbón/hueso.
