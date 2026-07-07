"use client";

/** Pagos (Wompi/simulador): configurar anticipos y tienda de regalos, y ver
 * el registro de pagos. El dinero de los cortes se sigue cobrando en el local. */
import { useCallback, useEffect, useState } from "react";
import { CreditCard, Loader2, ShieldAlert } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import {
  formatCOP,
  type PaymentAdminRow,
  type PaymentSettingsAdmin,
} from "@/lib/types";
import { PageTitle, buttonPrimary, inputClass } from "@/components/admin/shared";

const STATUS_COLORS: Record<string, string> = {
  aprobado: "text-emerald-400",
  pendiente: "text-gold",
  rechazado: "text-wine",
  expirado: "text-bone-2",
  anulado: "text-bone-2",
  error: "text-wine",
};

export default function PagosPage() {
  const [settings, setSettings] = useState<PaymentSettingsAdmin | null>(null);
  const [rows, setRows] = useState<PaymentAdminRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [depositCop, setDepositCop] = useState(10000);

  const load = useCallback(() => {
    adminApi.paymentSettings().then((loaded) => {
      setSettings(loaded);
      setDepositCop(loaded.deposit_cop);
    });
    adminApi.payments().then(setRows);
  }, []);

  useEffect(load, [load]);

  async function update(patch: Partial<PaymentSettingsAdmin>) {
    setSaving(true);
    try {
      await adminApi.updatePaymentSettings(patch);
      load();
    } finally {
      setSaving(false);
    }
  }

  if (!settings)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gold">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );

  return (
    <>
      <PageTitle
        title="Pagos"
        subtitle="Anticipos y regalos en línea vía Wompi — el corte se sigue cobrando en el local"
      />

      {settings.wompi_mode === "mock" && (
        <p className="data mb-6 flex items-center gap-2 rounded-sm border border-wine/50 bg-wine/10 px-4 py-3 text-xs uppercase tracking-wider text-wine">
          <ShieldAlert size={14} /> Modo simulador: sin llaves de Wompi. Los pagos
          son de prueba. Al conectar las llaves del comercio pasa a real sin
          cambios.
        </p>
      )}

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        {/* Anticipos */}
        <section className="plate clip-corner p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="display text-2xl text-bone">Anticipo anti no-show</h2>
              <p className="mt-1 text-sm text-bone-2">
                La reserva queda apartada y se confirma al pagar; si no paga en 30
                minutos, el hueco se libera solo.
              </p>
            </div>
            <button
              onClick={() => update({ deposits_enabled: !settings.deposits_enabled })}
              disabled={saving}
              className={`data shrink-0 rounded-full border px-4 py-1.5 text-xs uppercase tracking-wider transition-colors ${
                settings.deposits_enabled
                  ? "border-gold bg-gold text-ink"
                  : "border-ink-3 text-bone-2 hover:border-gold/50"
              }`}
            >
              {settings.deposits_enabled ? "Activado" : "Apagado"}
            </button>
          </div>
          <div className="mt-4 flex items-end gap-3">
            <label className="text-sm text-bone-2">
              Valor del anticipo (COP)
              <input
                type="number"
                min={1000}
                max={200000}
                step={1000}
                value={depositCop}
                onChange={(e) => setDepositCop(Number(e.target.value))}
                className={`${inputClass} mt-1 !w-40`}
              />
            </label>
            <button
              onClick={() => update({ deposit_cop: depositCop })}
              disabled={saving || depositCop === settings.deposit_cop}
              className={buttonPrimary}
            >
              Guardar
            </button>
          </div>
        </section>

        {/* Tienda de regalos */}
        <section className="plate clip-corner p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="display text-2xl text-bone">Regalos en línea</h2>
              <p className="mt-1 text-sm text-bone-2">
                Cualquiera paga un servicio en /regalos y recibe el código
                G-XXXXXX al instante para compartir.
              </p>
            </div>
            <button
              onClick={() => update({ gift_shop_enabled: !settings.gift_shop_enabled })}
              disabled={saving}
              className={`data shrink-0 rounded-full border px-4 py-1.5 text-xs uppercase tracking-wider transition-colors ${
                settings.gift_shop_enabled
                  ? "border-gold bg-gold text-ink"
                  : "border-ink-3 text-bone-2 hover:border-gold/50"
              }`}
            >
              {settings.gift_shop_enabled ? "Activado" : "Apagado"}
            </button>
          </div>
        </section>
      </div>

      {/* Registro */}
      <p className="data mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-bone-2">
        <CreditCard size={13} className="text-gold" /> Registro de pagos
      </p>
      <div className="overflow-x-auto rounded-sm border border-ink-3">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-ink-3 bg-ink-2 text-left text-xs uppercase tracking-wider text-bone-2">
              <th className="px-4 py-3">Referencia</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Monto</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Pagador</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-3">
            {rows.map((payment) => (
              <tr key={payment.id} className="bg-ink hover:bg-ink-2">
                <td className="data px-4 py-3 text-bone">{payment.reference}</td>
                <td className="data px-4 py-3 text-bone-2">
                  {payment.kind === "deposit" ? "Anticipo" : "Regalo"}
                </td>
                <td className="data px-4 py-3 font-semibold text-gold">
                  {formatCOP(payment.amount_cop)}
                </td>
                <td className="data px-4 py-3 text-bone-2">
                  {payment.payment_method ?? "—"}
                </td>
                <td className="max-w-40 truncate px-4 py-3 text-bone-2">
                  {payment.payer_name ?? "—"}
                </td>
                <td className="data px-4 py-3 text-bone-2">
                  {payment.created_at.slice(0, 16).replace("T", " ")}
                </td>
                <td
                  className={`data px-4 py-3 text-xs uppercase tracking-wider ${STATUS_COLORS[payment.status] ?? "text-bone-2"}`}
                >
                  {payment.status}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-bone-2">
                  Aún no hay pagos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
