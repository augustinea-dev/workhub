"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Invite-only: people are added by an admin in Supabase, never self-signup.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setState("error");
      setMessage(
        error.message.toLowerCase().includes("signups not allowed")
          ? "That email hasn't been invited yet. Ask an admin to add you."
          : error.message,
      );
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <p className="mt-6 rounded-md bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
        Check <strong>{email}</strong> for a sign-in link. You can close this tab.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label className="block text-sm font-medium text-stone-700" htmlFor="email">
        Work email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input w-full"
        placeholder="you@augustineagency.com"
      />
      {state === "error" && <p className="text-sm text-red-700">{message}</p>}
      <button type="submit" disabled={state === "sending"} className="btn-primary w-full">
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
