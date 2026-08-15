"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { AdminApiError, adminApi } from "@/lib/admin-api";
import { HoneypotField, Turnstile, turnstileEnabled } from "@/components/security/BotShield";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot: un humano nunca lo llena
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (turnstileEnabled() && !captchaToken) {
      setError("Completa la verificación anti-bot para continuar.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await adminApi.login(username.trim(), password, {
        website,
        captcha_token: captchaToken,
      });
      router.replace("/admin");
    } catch (err) {
      setError(
        err instanceof AdminApiError && err.status === 429
          ? err.message
          : "Usuario o contraseña incorrectos.",
      );
      setLoading(false);
    }
  }

  return (
    <main className="grain relative flex min-h-svh items-center justify-center overflow-hidden px-5">
      <span
        aria-hidden
        className="display text-outline pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 whitespace-nowrap text-[16vw] leading-none"
      >
        ADMIN
      </span>
      <div className="animate-fade-up relative w-full max-w-sm">
        <p className="display text-center text-4xl text-chalk">
          BAD<span className="text-copper"> BOYS</span>
        </p>
        <p className="mt-2 text-center text-sm text-smoke">Panel de administración</p>
        <div className="barber-stripe mx-auto mt-4 w-24" />

        <form
          onSubmit={submit}
          className="surface mt-8 space-y-5 border border-copper/25 bg-coal p-6"
        >
          {error && (
            <div className="rounded-sm border border-brick bg-brick/15 px-4 py-3 text-sm">
              {error}
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm text-smoke">Usuario</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="focus-ring w-full rounded-sm border border-edge bg-night px-4 py-3 text-chalk"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-smoke">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="focus-ring w-full rounded-sm border border-edge bg-night px-4 py-3 text-chalk"
            />
          </label>
          <HoneypotField value={website} onChange={setWebsite} />
          <Turnstile onToken={setCaptchaToken} />
          <button
            type="submit"
            disabled={loading}
            className="display flex w-full items-center justify-center gap-2 rounded-sm bg-copper px-6 py-3.5 text-lg text-on-copper disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />}
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
