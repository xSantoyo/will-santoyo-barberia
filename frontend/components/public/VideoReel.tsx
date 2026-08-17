"use client";

/**
 * VideoReel — el oficio en movimiento.
 *
 * PRIORIDAD MÓVIL (≈60 % del tráfico entra por celular). Un video que se
 * descarga solo, en 4K y con audio, es la forma más rápida de quemarle los
 * datos a un cliente. Aquí:
 *   · `preload="none"` — no baja un solo byte hasta que el clip está a punto
 *     de verse. Lo único que carga de entrada es el póster (~120 KB).
 *   · IntersectionObserver al 50 % — reproduce solo lo que está en pantalla y
 *     pausa lo que sale. Sin esto, cuatro clips corren a la vez en segundo
 *     plano gastando batería y datos.
 *   · `<source media>` — el celular recibe 720p (~1,8 MB); el escritorio, 1080p.
 *   · Mudos por diseño: iOS solo deja autoreproducir si no hay audio, y un
 *     video que suena solo al abrir una página es una hostilidad.
 *
 * iOS/Safari: `playsInline` es obligatorio o el video se abre en pantalla
 * completa al reproducir. Además React no siempre refleja `muted` en el nodo
 * del DOM, así que se fija a mano en el ref — sin eso, el autoplay lo bloquea
 * Safari en silencio.
 *
 * Movimiento (skill `animate`): la única transición es la opacidad del póster
 * al arrancar el video, 200 ms con --ease-out. El contenido ya se mueve solo;
 * animar además el contenedor sería ruido sobre ruido. Con
 * `prefers-reduced-motion` no se autorreproduce nada: queda el póster con
 * controles, y quien quiera lo pulsa.
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

type Clip = {
  /** Base del archivo en /public/videos: <base>-720.mp4, -1080.mp4, -poster.jpg */
  base: string;
  /** Descripción para lectores de pantalla. */
  alt: string;
};

/**
 * Clips publicados.
 *
 * OJO — consentimiento: `corte-1` (niño pequeño) y `corte-4` (adolescente)
 * muestran menores de edad identificables. Publicar su imagen en un sitio
 * abierto requiere permiso de los padres (Ley 1581/2012 y Código de Infancia).
 * Los archivos ya están comprimidos y listos en /public/videos; en cuanto Will
 * confirme el permiso, basta con descomentarlos aquí.
 */
const CLIPS: Clip[] = [
  { base: "corte-3", alt: "Cliente recostado durante el ritual de toalla y afeitado" },
  { base: "corte-2", alt: "Afeitado al detalle con espuma caliente" },
  // { base: "corte-1", alt: "Niño estrenando corte" },      // ← requiere permiso de los padres
  // { base: "corte-4", alt: "Fade terminado, vista de perfil" }, // ← requiere permiso de los padres
];

export default function VideoReel() {
  if (CLIPS.length === 0) return null;

  return (
    <section
      id="en-movimiento"
      className="grain relative overflow-hidden border-y border-edge bg-night"
    >
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
        <p className="kicker text-copper">En movimiento</p>
        <h2 className="display mt-3 text-3xl text-chalk sm:text-4xl">
          Así se siente la silla
        </h2>

        {/* Carrusel con encaje en móvil (los clips son verticales, uno por
            pantalla); rejilla cuando hay ancho de sobra. Las columnas siguen a
            la cantidad de clips: con dos, una rejilla de tres deja un hueco. */}
        <ul
          className={`mt-10 -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:overflow-visible sm:px-0 ${
            CLIPS.length >= 3
              ? "sm:grid-cols-2 lg:grid-cols-3"
              : "sm:mx-auto sm:max-w-3xl sm:grid-cols-2"
          }`}
          aria-label="Videos del trabajo"
        >
          {CLIPS.map((clip) => (
            <li
              key={clip.base}
              className="w-[78vw] shrink-0 snap-center sm:w-auto"
            >
              <ClipCard clip={clip} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const [reproduciendo, setReproduciendo] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || reduce) return;

    // Safari exige el atributo en el nodo, no solo en las props de React.
    video.muted = true;

    const observer = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          // Si el navegador rechaza el autoplay, el póster se queda: no rompe.
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [reduce]);

  return (
    <div className="surface relative aspect-[9/16] overflow-hidden rounded-[var(--radius-card)]">
      <video
        ref={ref}
        poster={`/videos/${clip.base}-poster.jpg`}
        preload="none"
        loop
        muted
        playsInline
        controls={!!reduce}
        aria-label={clip.alt}
        onPlaying={() => setReproduciendo(true)}
        className="h-full w-full object-cover"
      >
        <source
          src={`/videos/${clip.base}-720.mp4`}
          type="video/mp4"
          media="(max-width: 900px)"
        />
        <source src={`/videos/${clip.base}-1080.mp4`} type="video/mp4" />
      </video>

      {/* Velo inferior: da contraste si algún día se rotula el clip, y asienta
          la tarjeta sobre el fondo en vez de dejarla flotando. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-night/70 to-transparent transition-opacity duration-200 ease-[var(--ease-out)] ${
          reproduciendo ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
