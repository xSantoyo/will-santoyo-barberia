# Plan de costos y propuesta comercial — Plataforma Will Barber Shop

> Documento comercial, **no técnico**: cómo vender este software a la barbería.
> El aplicativo queda congelado tal como está (decisión del dueño del proyecto,
> jul-2026); nada de lo aquí propuesto implica cambios de código hoy.
>
> Cifras en pesos colombianos (COP). Donde hay dólares se asume TRM ≈ $4.100
> (verificar al momento de facturar). Las tarifas de pasarelas cambian:
> confirmar con cada proveedor antes de firmar.

---

## 1. Qué se está vendiendo (inventario de valor)

No es "una página web": es una **plataforma de operación** de la barbería.

| Pieza | Valor para el negocio |
|---|---|
| Sitio público con identidad propia (PWA instalable) | Presencia profesional; se instala como app en el celular del cliente |
| Agendamiento en línea 24/7 (individual y grupal) | Reservas fuera del horario; padre e hijo en turnos seguidos |
| **La Fila en vivo** (tablero + tiquete vivo) | Nadie pregunta "¿en qué turno van?"; sirve de pantalla para el TV del local |
| Walk-ins con tiquete | El cliente de mostrador entra al mismo sistema |
| Confirmación de asistencia con liberación automática | Menos huecos muertos por no-shows |
| Fidelidad digital + referidos + códigos de regalo | Retención y crecimiento, sin pagos en línea |
| Reseñas verificadas + portafolio por barbero | Reputación real, compartible en redes |
| Panel admin completo (caja del día, agenda, notas de estilo, vitrina) | El negocio se administra sin tocar código |

Costo de referencia si se cotizara como **desarrollo a medida**: 250–350 horas
de ingeniería × $60.000–$90.000/h = **$15M–$30M COP**. Ese número NO es el
precio de venta (una barbería no lo paga); es el ancla de valor para negociar.

Referencia de suscripciones del mercado (por qué la mensualidad propuesta es
competitiva): Booksy ≈ USD 30/mes + USD 20 por barbero extra (≈ $290.000/mes
para 3 barberos, para siempre, sin propiedad ni fila en vivo); SQUIRE desde
≈ USD 30–100 por barbero/mes; AgendaPro ≈ $100.000–$200.000/mes.

---

## 2. Estructura de precios recomendada

### Pago único de implementación — **$2.500.000 COP**

Incluye:
- Puesta en producción (dominio, hosting, HTTPS, datos reales del negocio:
  barberos, horarios, precios, fotos).
- Capacitación presencial/virtual de 2 horas al equipo.
- **2 meses de soporte y administración GRATIS** (el gancho comercial).
- Manual corto de uso (una página por rol).

Racional: entre 3 y 6 veces menos que un desarrollo a medida, y en el rango de
lo que una pyme sí aprueba. Piso de negociación sugerido: $1.800.000
(no bajar de ahí: la puesta en marcha + capacitación + 2 meses de operación
cuestan trabajo real).

### Mensualidad desde el mes 3 — dos planes

| | **Plan Silla** — $150.000/mes | **Plan Navaja** — $250.000/mes |
|---|---|---|
| Hosting, dominio, backups y monitoreo | ✅ | ✅ |
| Soporte por fallas (WhatsApp, horario hábil) | ✅ 48h | ✅ prioridad 24h |
| Cambios de contenido que ellos no puedan hacer solos | — | ✅ hasta 2h/mes |
| Ajustes menores/evolutivos | cotizados aparte | ✅ hasta 2h/mes (acumulables no) |
| Informe mensual (citas, no-shows, reseñas) | — | ✅ |

- **Pago anual anticipado: 10 meses** (2 gratis): $1.500.000 / $2.500.000.
- Trabajo fuera de plan: **$100.000/hora**, mínimo 1 hora.
- Sede adicional de la misma marca (el sistema ya es multi-tenant): +$100.000/mes.

### La economía interna (para ti, no para el cliente)

| Concepto | Costo/mes estimado |
|---|---|
| Infraestructura AWS actual (Terraform, serverless) | USD 25–40 ≈ $105.000–$165.000 |
| Alternativa de bajo costo para UN solo cliente (VPS único tipo Lightsail/Hetzner con docker-compose) | USD 12–18 ≈ $50.000–$75.000 |
| Dominio + correo | ≈ $10.000/mes prorrateado |

Con la alternativa VPS, el Plan Silla deja ≈ $65.000–$90.000/mes de margen
antes de tu tiempo de soporte; el Plan Navaja ≈ $165.000–$190.000. Con AWS
completo, el Plan Silla apenas empata: **si vendes Plan Silla, conviene la
infraestructura de VPS único** (mismo docker-compose ya existente; es decisión
de despliegue, no de código).

### ROI para venderle al dueño (el argumento que cierra)

Barbería de 3 sillas ≈ 15–25 cortes/día × $30.000 ⇒ ingresos de
$13M–$22M/mes.
- **Un (1) no-show evitado al día** = $30.000 × 26 días = **$780.000/mes**
  recuperados — solo con la confirmación de asistencia ya se paga el sistema
  cinco veces.
- Fidelidad + referidos: un cliente que vuelve una vez más al mes = $30.000×N.
- La mensualidad ($150.000) equivale a **5 cortes al mes**.

---

## 3. Pasarela de pagos — análisis (SIN implementar todavía)

Hoy el sistema **no cobra en línea por decisión de diseño** (todo se paga en el
local). Si más adelante se quiere cobrar anticipos o vender regalos en línea,
este es el panorama en Colombia (tarifas típicas 2026, + IVA sobre la comisión;
**verificar con cada proveedor**):

| Pasarela | Comisión típica | Cuota fija/mes | Métodos | Notas |
|---|---|---|---|---|
| **Wompi (Bancolombia)** ⭐ recomendada | ≈ 2,65% + $700/transacción | $0 | Tarjetas, **PSE**, **Nequi**, Botón Bancolombia | API y webhooks bien documentados; liquidación rápida si la cuenta es Bancolombia; links de pago sin código |
| **Bold** | ≈ 2,99% | $0 | Tarjetas, PSE, links de pago + **datáfono físico** | Ideal si quieren unificar datáfono y cobros en línea en un solo proveedor |
| **ePayco** | ≈ 2,68%–2,99% + ~$900 | $0 (plan básico) | Tarjetas, PSE, Nequi, Daviplata | Muy local, buen soporte |
| **Mercado Pago** | ≈ 2,99%–3,29% | $0 | Tarjetas, PSE | Onboarding facilísimo; buena para links |
| **PayU** | ≈ 2,99% + ~$900 | $0–según plan | Amplio | Más papeleo, perfil corporativo |
| Stripe | — | — | — | ❌ Descartada: sin adquirencia local plena en Colombia |

**Recomendación: Wompi.** Costo por transacción más bajo, PSE + Nequi (los dos
métodos que la clientela de barrio usa de verdad), sin cuota mensual, y la
barbería casi seguro ya banca con Bancolombia. Segunda opción: **Bold** si el
dueño quiere el datáfono del mostrador y los cobros en línea con el mismo
proveedor y una sola liquidación.

**Ejemplo real con Wompi** (corte de $30.000): comisión ≈ $795 + $700 fijo +
IVA ≈ **$1.780 (≈ 5,9%)**. Conclusión: cobrar el corte completo en línea es
caro en montos pequeños; el caso de negocio correcto es otro:

1. **Anticipo anti no-show** de $10.000–$15.000 al reservar (se descuenta del
   corte). Es el uso con mejor retorno: el que paga anticipo, llega.
2. **Códigos de regalo comprados en línea** (hoy se generan manualmente cuando
   pagan en el local — pasaría a ser autoservicio).
3. **Membresías/paquetes** ("4 cortes al mes") con cobro recurrente.

**Requisitos del negocio para abrir cualquier pasarela:** RUT, cámara de
comercio (o régimen simple), cuenta bancaria a nombre del negocio, y datos del
representante legal.

**Esfuerzo de implementación cuando se decida** (estimado, no cotización):
30–50 horas de ingeniería — checkout de anticipo en el wizard, webhooks de
confirmación de pago, conciliación en el panel y reglas de reembolso al
cancelar. A la tarifa fuera de plan: **$3M–$5M COP**, una sola vez.
Requiere decisión previa del dueño: proveedor, % de anticipo y política de
devoluciones.

---

## 4. Resumen de la oferta (para presentar en una hoja)

> **Plataforma Will Barber Shop**
> - Implementación llave en mano: **$2.500.000** (pago único)
> - Incluye 2 meses de soporte y administración **gratis**
> - Desde el mes 3: administración **$150.000/mes** (o $250.000 con horas de
>   cambios incluidas) — pagando el año: 2 meses gratis
> - Cambios grandes: $100.000/hora · Otra sede: +$100.000/mes
> - Cobros en línea (anticipos/regalos): módulo opcional futuro desde
>   $3.000.000 + comisiones de la pasarela (recomendada: Wompi)
