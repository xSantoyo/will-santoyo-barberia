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
import { mediaUrl } from "@/lib/api";
import { CLIPS, fuentes, type Clip } from "@/lib/videos";

/**
 * Columnas según cuántos clips haya, para que la última fila no quede coja:
 * cuatro clips en una rejilla de tres dejan uno solo abajo, y con pocos las
 * tarjetas se estiran hasta comerse la pantalla. Las clases van completas
 * porque Tailwind las busca como texto literal.
 */
function columnas(cuantos: number): string {
  if (cuantos <= 2) return "sm:mx-auto sm:max-w-3xl sm:grid-cols-2";
  if (cuantos === 3) return "sm:grid-cols-2 lg:grid-cols-3";
  return "sm:grid-cols-2 lg:grid-cols-4";
}

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
            pantalla); rejilla cuando hay ancho de sobra. */}
        <ul
          className={`mt-10 -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:overflow-visible sm:px-0 ${columnas(CLIPS.length)}`}
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

  const src = fuentes(clip);

  return (
    <div className="surface relative aspect-[9/16] overflow-hidden rounded-[var(--radius-card)]">
      {/* Sin `controls`, sin menú contextual de descarga y sin imagen en imagen.
          Que quede claro qué NO es esto: cualquiera con la pestaña de red del
          navegador tiene la URL del archivo. No existe forma de publicar un
          video en la web y que no se pueda bajar. Esto solo evita el camino
          fácil; lo que de verdad protege es que el archivo no esté en un
          repositorio público (ver lib/videos.ts). */}
      <video
        ref={ref}
        poster={mediaUrl(src.poster) ?? undefined}
        preload="none"
        loop
        muted
        playsInline
        controls={!!reduce}
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        aria-label={clip.alt}
        onPlaying={() => setReproduciendo(true)}
        className="h-full w-full object-cover"
      >
        <source src={mediaUrl(src.movil) ?? ""} type="video/mp4" media="(max-width: 900px)" />
        <source src={mediaUrl(src.escritorio) ?? ""} type="video/mp4" />
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
