"""Política de contraseñas: una sola definición para validar y para generar.

Antes esto vivía en dos sitios que no se hablaban: `ChangePasswordRequest`
exigía letras Y números, y `seed._admin_password()` sacaba 16 caracteres al azar
de un alfabeto alfanumérico sin comprobar nada. El 5,9 % de las claves generadas
no pasaban la validación de la propia aplicación — es decir, la semilla le podía
entregar al dueño una contraseña que el panel habría rechazado.

La regla vive aquí y ambos lados la leen de aquí. `generar()` no reimplementa la
política: produce candidatos y los somete a `validar()`, el mismo validador que
usa la API. Si mañana alguien añade un requisito (un símbolo, más longitud), el
generador se entera solo — y si el alfabeto se queda corto para cumplirlo, falla
ruidosamente en vez de emitir claves inválidas en silencio.
"""
from __future__ import annotations

import secrets
import string

# --------------------------------------------------------------- la política

LARGO_MINIMO = 10
LARGO_MAXIMO = 128

#: Alfabeto del generador. Si se añade un requisito de símbolos, hay que
#: ampliarlo aquí o `generar()` se quedará sin candidatos válidos y lo dirá.
ALFABETO = string.ascii_letters + string.digits

#: Largo de las claves que genera la semilla. 16 caracteres alfanuméricos son
#: ~95 bits de entropía: de sobra para una clave inicial que se cambia al entrar.
LARGO_GENERADO = 16


def validar(clave: str) -> str:
    """Única definición de qué es una contraseña aceptable.

    Devuelve la clave si pasa; lanza ValueError con un mensaje para el usuario
    si no. Pydantic convierte ese ValueError en un 422.
    """
    if len(clave) < LARGO_MINIMO:
        raise ValueError(f"La contraseña debe tener al menos {LARGO_MINIMO} caracteres")
    if len(clave) > LARGO_MAXIMO:
        raise ValueError(f"La contraseña no puede pasar de {LARGO_MAXIMO} caracteres")
    if clave.strip() != clave:
        raise ValueError("La contraseña no puede empezar ni terminar en espacios")
    if not (any(c.isalpha() for c in clave) and any(c.isdigit() for c in clave)):
        raise ValueError("La contraseña debe combinar letras y números")
    return clave


def cumple(clave: str) -> bool:
    """`validar` en forma de booleano, para quien solo quiera preguntar."""
    try:
        validar(clave)
    except ValueError:
        return False
    return True


# --------------------------------------------------------------- el generador

_INTENTOS_MAXIMOS = 1000


def generar(largo: int = LARGO_GENERADO) -> str:
    """Contraseña aleatoria que cumple la política, siempre.

    Se usa muestreo por rechazo: se sortea la clave entera de forma uniforme y
    se descarta si no pasa `validar()`. Es preferible a "forzar" una letra y un
    dígito en posiciones fijas y barajar, porque:

      · No reduce el espacio de búsqueda ni sesga la distribución — el resultado
        es uniforme sobre el conjunto de claves *válidas*, que es exactamente lo
        que se quiere. Forzar caracteres deja fuera combinaciones legítimas.
      · No reimplementa la regla. Barajar solo arregla el sesgo posicional de
        las reglas que el generador conoce; el rechazo respeta también las que
        aún no existen.

    Con el alfabeto actual la tasa de aceptación es ~94 %: de media basta con
    poco más de un intento. El tope existe para que un requisito imposible de
    satisfacer con `ALFABETO` se note enseguida en vez de colgar el arranque.
    """
    for _ in range(_INTENTOS_MAXIMOS):
        candidata = "".join(secrets.choice(ALFABETO) for _ in range(largo))
        if cumple(candidata):
            return candidata
    raise RuntimeError(
        f"No se pudo generar una contraseña válida en {_INTENTOS_MAXIMOS} intentos: "
        "la política pide algo que ALFABETO no puede producir. Amplía el alfabeto "
        "en app/services/passwords.py."
    )
