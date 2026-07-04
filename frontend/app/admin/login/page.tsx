"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { adminApi } from "@/lib/admin-api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await adminApi.login(username.trim(), password);
      router.replace("/admin");
    } catch {
      setError("Usuario o contraseña incorrectos.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <p className="display text-center text-4xl text-bone">
          BAD<span className="text-gold"> BOYS</span>
        </p>
        <p className="mt-2 text-center text-sm text-bone-2">Panel de administración</p>

        <form
          onSubmit={submit}
          className="mt-10 space-y-5 rounded-sm border border-ink-3 bg-ink-2 p-6"
        >
          {error && (
            <div className="rounded-sm border border-wine bg-wine/15 px-4 py-3 text-sm">
              {error}
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm text-bone-2">Usuario</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="focus-gold w-full rounded-sm border border-ink-3 bg-ink px-4 py-3 text-bone"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-bone-2">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="focus-gold w-full rounded-sm border border-ink-3 bg-ink px-4 py-3 text-bone"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="display flex w-full items-center justify-center gap-2 rounded-sm bg-gold px-6 py-3.5 text-lg text-ink disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />}
            Entrar
          </button>
        </form>
      </div>
    </main>
  );
}
