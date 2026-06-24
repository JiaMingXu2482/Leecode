"use client";

import { useState } from "react";
import { LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "登录失败");
      setLoading(false);
      return;
    }

    window.location.href = "/today";
  }

  return (
    <main className="min-h-screen bg-white px-6 py-12 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-sm flex-col justify-center">
        <div className="mb-8 flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-600">
          <LockKeyhole size={20} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Hot100 复习计划</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          输入服务器环境变量中的访问密码，进入你的个人刷题工作台。
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            访问密码
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              autoFocus
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            disabled={loading}
            className="h-11 w-full rounded-md bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading ? "登录中..." : "进入工作台"}
          </button>
        </form>
      </div>
    </main>
  );
}
