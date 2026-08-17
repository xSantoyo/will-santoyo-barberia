"""La política de contraseñas: que generador y validador no se desincronicen.

El fallo que motiva este archivo: la semilla sorteaba 16 caracteres
alfanuméricos sin comprobar nada, y el 5,9 % de las veces salían sin ningún
dígito — justo lo que la API rechaza. Como cada proceso genera una sola clave,
el problema aparecía ~1 de cada 17 arranques y era invisible en una corrida
suelta de los tests.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import ChangePasswordRequest
from app.services import passwords

# Con 2.000 muestras, un defecto que afecte al 5,9 % pasa desapercibido con
# probabilidad (1 - 0.059)^2000 ≈ 10^-53. Si el generador vuelve a romperse,
# este test lo ve.
MUESTRAS = 2000


def test_lo_generado_siempre_pasa_la_politica():
    for _ in range(MUESTRAS):
        clave = passwords.generar()
        # `validar` lanza ValueError si no cumple: que no lance es la aserción.
        passwords.validar(clave)


def test_lo_generado_lo_acepta_la_api():
    """No basta con que pase `validar`: el contrato real es el de la API, que
    además impone largo mínimo y máximo por Field."""
    for _ in range(MUESTRAS):
        clave = passwords.generar()
        peticion = ChangePasswordRequest(current_password="lo-que-sea", new_password=clave)
        assert peticion.new_password == clave


def test_lo_generado_no_es_predecible():
    """Garantizar la política no debe costar aleatoriedad: ni claves repetidas
    ni caracteres clavados en una posición (el sesgo típico de 'fuerzo una
    letra al principio y un dígito al final')."""
    muestras = [passwords.generar() for _ in range(MUESTRAS)]
    assert len(set(muestras)) == MUESTRAS, "salieron claves repetidas"

    for posicion in (0, passwords.LARGO_GENERADO - 1):
        distintos = {clave[posicion] for clave in muestras}
        assert len(distintos) > 20, f"la posición {posicion} tiene poca variedad"
        # Ninguna posición debería ser siempre letra ni siempre dígito.
        assert any(c.isdigit() for c in distintos)
        assert any(c.isalpha() for c in distintos)


@pytest.mark.parametrize(
    "clave, motivo",
    [
        ("corta1", "más corta que el mínimo"),
        ("solo-letras-aqui", "sin dígitos"),
        ("1234567890123", "sin letras"),
        (" ClaveValida2026", "espacio al principio"),
        ("ClaveValida2026 ", "espacio al final"),
        ("a1" * 100, "más larga que el máximo"),
    ],
)
def test_la_politica_rechaza_lo_que_debe(clave, motivo):
    assert not passwords.cumple(clave), f"debería rechazarla por {motivo}"


def test_validador_y_api_coinciden():
    """Las dos puertas de entrada tienen que decidir igual: si divergen, vuelve
    el fallo original por otro camino."""
    casos = [
        "ClaveValida2026", "corta1", "solo-letras-aqui", "1234567890123",
        " ClaveValida2026", "ClaveValida2026 ", "a1" * 100, "Ab3" * 4,
    ]
    for clave in casos:
        try:
            ChangePasswordRequest(current_password="x", new_password=clave)
        except ValidationError:
            acepta_api = False
        else:
            acepta_api = True
        assert acepta_api == passwords.cumple(clave), (
            f"la API y la política discrepan sobre {clave!r}"
        )
