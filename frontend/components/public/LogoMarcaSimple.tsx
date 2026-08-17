/**
 * La marca reducida: solo el monograma WB, sin escudo ni destello.
 *
 * CUÁNDO USAR CUÁL — el umbral son 32 PÍXELES FÍSICOS, no CSS:
 *
 *   · ≥ 32 px físicos → `LogoMarca` (escudo completo).
 *   · <  32 px físicos → este.
 *
 * La distinción importa porque en un celular de densidad 3× un elemento de
 * 32 px CSS se dibuja con 96 px reales, y ahí el escudo completo se ve
 * perfecto. Medido en el navbar a densidad 1× (el peor caso, 32 px físicos)
 * el escudo todavía se lee, así que el navbar se queda con `LogoMarca` en
 * cualquier teléfono. Hoy los sitios que bajan del umbral son el favicon
 * (el navegador lo rasteriza a 16–32 px reales, sin importar la densidad de
 * pantalla) y la barra superior del panel en móvil.
 *
 * Por qué se cae el escudo y no el monograma: el problema al reducir no era el
 * detalle del WB, sino que el escudo lo dejaba ocupando ~60 % del lienzo. Al
 * quitarlo, el monograma se queda con todo el espacio y gana los píxeles que
 * necesita. Y no se pierde la silueta: la W y la B rematan en punta hacia
 * abajo — es la misma forma que el escudo estaba envolviendo.
 *
 * Un escudo vacío también se leía a 16 px, pero un escudo sin nada dentro es
 * cualquier marca; el monograma es lo único que identifica a esta.
 *
 * Fuente del vector: `public/logo-marca-simple.svg`.
 */
export default function LogoMarcaSimple({ className }: { className?: string }) {
  return (
    <svg
      viewBox="358 238 389 409"
      fill="currentColor"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path
        transform="matrix(1,0,0,-1,640.1437,498.76148)"
        d="M0 0C-12.799-19.405-81.335-76.38-81.335-76.38V87.941L-.413 132.117C-.413 132.117 39.635 132.943 39.635 87.941 39.635 42.938 12.799 19.405 0 0M73.628 142.026C73.628 142.026 66.059 157.578 33.855 157.578 33.855 157.578 64.82 176.432 73.628 197.901 82.436 219.37 95.648 257.904 50.232 257.904H-68.949V137.898L-23.809 163.771V226.802H18.028C18.028 226.802 30.552 226.802 30.552 214.278 30.552 201.754 23.809 191.02 23.809 191.02 23.809 191.02-11.698 139.824-81.06 117.805V257.904H-141.613C-141.613 257.904-101.978 176.294-101.978 .413L-158.128 198.176C-158.128 198.176-208.773 51.195-204.92 21.469-204.92 21.469-213.177 25.323-213.728 69.362-214.278 113.401-195.011 176.707-202.718 207.535-210.425 238.362-198.589 257.492-252.675 257.492L-279.511 257.904C-279.511 257.904-259.143 244.968-259.143 214.141-259.143 183.313-263.272 83.95-261.895 76.793-260.519 69.637-256.115-34.13-176.019-66.885-176.019-66.885-198.865-47.893-187.855 3.303-176.845 54.498-165.285 90.28-165.285 90.28-165.285 90.28-169.688 75.417-161.431 56.7-153.174 37.984-132.806-44.59-132.806-44.59L-94.271-145.88C-94.271-145.88-87.115-120.007-57.389-101.29-27.662-82.573 52.709-14.863 64.27 14.863 75.83 44.59 104.455 84.225 73.628 142.026"
      />
    </svg>
  );
}
