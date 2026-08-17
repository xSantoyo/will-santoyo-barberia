/**
 * Los clips que se publican, en un solo sitio.
 *
 * PARA RETIRAR UN CLIP: borra su entrada de `CLIPS`. Nada más. Ningún
 * componente lo nombra, así que no hay un segundo lugar que actualizar.
 * Para que además desaparezca del servidor, borra sus tres archivos de
 * `content/will-barbershop/videos/`.
 *
 * POR QUÉ VIVEN FUERA DEL REPOSITORIO. Algunos clips muestran a clientes
 * menores de edad, publicados con permiso de sus padres — un permiso que se
 * puede revocar. Este repositorio es público: lo que entra queda para siempre
 * en el historial y en cualquier bifurcación que alguien haya hecho, así que
 * retirar un clip del sitio no lo retiraría del mundo. Viviendo en `content/`
 * (ignorado por git, servido por el backend en `/media/`), borrar el archivo
 * es suficiente.
 *
 * Y viven ahí TODOS, no solo esos: si solo se excluyeran los de los menores,
 * el propio repositorio estaría señalando cuáles son.
 *
 * SOBRE LAS DESCRIPCIONES: identifican el corte, nunca a la persona. Ni
 * nombres, ni edades, ni relación con nadie, ni cuándo suele venir. Son
 * clientes.
 */

export type Clip = {
  /** Base del archivo en content/will-barbershop/videos/ */
  base: string;
  /** Texto para lectores de pantalla. Describe el trabajo, no a quién sale. */
  alt: string;
};

/** Carpeta servida por el backend (mount estático de `content/`). */
const CARPETA = "/media/will-barbershop/videos";

export const CLIPS: Clip[] = [
  { base: "corte-3", alt: "Cliente durante el ritual de toalla y afeitado" },
  { base: "corte-1", alt: "Cliente estrenando corte" },
  { base: "corte-2", alt: "Afeitado al detalle con espuma caliente" },
  { base: "corte-4", alt: "Fade terminado, vista de perfil" },
];

export const fuentes = (clip: Clip) => ({
  movil: `${CARPETA}/${clip.base}-720.mp4`,
  escritorio: `${CARPETA}/${clip.base}-1080.mp4`,
  poster: `${CARPETA}/${clip.base}-poster.jpg`,
});
