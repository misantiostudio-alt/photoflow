import { createFileRoute } from "@tanstack/react-router";
import { Fingerprint, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><Label>{label}</Label>{children}</label>;
}

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [bootstrapAvailable, setBootstrapAvailable] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const checkBootstrap = async () => {
      const db = supabase as any;
      const result = await withTimeout(db.rpc("bootstrap_available"), 8_000, "Account setup check timed out.");
      if (result.error) {
        setBootstrapAvailable(null);
        return;
      }
      const available = Boolean(result.data);
      setBootstrapAvailable(available);
      if (available) setMode("signup");
      else setMode("signin");
    };
    void checkBootstrap();
  }, []);

  function destinationAfterAuth() {
    if (typeof window === "undefined") return "/";
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo") || "/";
    const action = params.get("action");
    if (!action) return returnTo;
    const separator = returnTo.includes("?") ? "&" : "?";
    return `${returnTo}${separator}action=${encodeURIComponent(action)}`;
  }

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const redirectTo = new URL(destinationAfterAuth(), window.location.origin).toString();
      const { error } = await withTimeout(supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      }), 10_000, "Google sign-in took too long to start.");
      if (error) throw error;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Google sign-in is not enabled yet. Enable the Google provider in Supabase Auth.",
      );
      setBusy(false);
    }
  }

  async function signInWithPasskey() {
    setBusy(true);
    try {
      const auth = supabase.auth as any;
      if (typeof auth.signInWithPasskey !== "function") {
        throw new Error("Passkey sign-in is not available in this browser/app build.");
      }
      const { error } = await auth.signInWithPasskey();
      if (error) throw error;
      const db = supabase as any;
      await db.rpc("ensure_first_owner");
      toast.success("Signed in securely");
      window.location.href = destinationAfterAuth();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Passkey sign-in failed.";
      toast.error(
        message.includes("passkey_disabled")
          ? "Biometric/passkey login is not enabled in the Auth backend yet."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!email.trim() || password.length < 6) {
      toast.error("Enter a valid email and a password with at least 6 characters.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email: email.trim(), password }),
          12_000,
          "Sign-in took too long. Please try again.",
        );
        if (error) throw error;

        // Safe no-op on healthy installs; repairs the sole first account on older installs.
        const db = supabase as any;
        await withTimeout(db.rpc("ensure_first_owner"), 5_000, "Staff access check timed out.").catch(() => null);

        toast.success("Signed in to PhotoFlow");
        window.location.href = destinationAfterAuth();
        return;
      }

      if (bootstrapAvailable === false) {
        toast.error("PhotoFlow already has an Owner account. Please sign in instead.");
        setMode("signin");
        return;
      }

      const { data, error } = await withTimeout(supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() || undefined } },
      }), 12_000, "Account creation took too long. Please try again.");
      if (error) throw error;

      if (data.session) {
        const db = supabase as any;
        await db.rpc("ensure_first_owner");
        toast.success("Owner account created");
        window.location.href = destinationAfterAuth();
      } else {
        toast.success("Account created. Check your email to confirm the account, then sign in.");
        setMode("signin");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl overflow-hidden rounded-xl border border-border bg-card/70 shadow-2xl shadow-black/20 lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden border-r border-border p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-primary/25 bg-primary/8 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[.16em] text-primary">
              <ShieldCheck className="size-3.5" /> Staff workspace
            </div>
            <h1 className="mt-6 max-w-md font-display text-5xl font-extrabold tracking-[-.055em]">Real operations, not a demo dashboard.</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">Sign in once, then PhotoFlow will return you to the staff action you were trying to do.</p>
          </div>
          <p className="text-xs text-muted-foreground">The first PhotoFlow installation account is the Owner. Additional staff accounts can be managed later.</p>
        </section>

        <section className="flex items-center p-6 sm:p-10">
          <div className="w-full">
            <p className="eyebrow">PhotoFlow · Misantio Studio</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-[-.04em]">{mode === "signin" ? "Staff sign in" : "Create Owner account"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{mode === "signin" ? "Sign in to create events and manage the studio workspace." : "Set up the first Owner account for this PhotoFlow installation."}</p>

            <div className="mt-6 grid grid-cols-2 rounded-lg border border-border bg-muted/30 p-1">
              <button type="button" onClick={() => setMode("signin")} className={cn("h-9 rounded-md text-xs font-bold transition-colors", mode === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>Sign in</button>
              <button
                type="button"
                disabled={bootstrapAvailable === false}
                onClick={() => bootstrapAvailable !== false && setMode("signup")}
                className={cn(
                  "h-9 rounded-md text-xs font-bold transition-colors",
                  mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  bootstrapAvailable === false && "cursor-not-allowed opacity-40",
                )}
              >
                First-time setup
              </button>
            </div>

            {bootstrapAvailable === false && mode === "signin" ? <p className="mt-3 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">An Owner account already exists. Use that account to sign in.</p> : null}

            <div className="mt-6 grid gap-3">
              <Button type="button" size="lg" variant="outline" onClick={() => void signInWithGoogle()} disabled={busy}>
                <span className="grid size-5 place-items-center rounded-full bg-white text-[0.72rem] font-black text-black">G</span>
                Continue with Google
              </Button>
              <Button type="button" size="lg" variant="outline" onClick={() => void signInWithPasskey()} disabled={busy}>
                <Fingerprint className="size-4" />
                Use Face ID / Touch ID / Windows Hello
              </Button>
              <div className="relative py-1 text-center text-[0.65rem] uppercase tracking-[.16em] text-muted-foreground">
                <span className="relative z-10 bg-card px-3">or use email</span>
                <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              {mode === "signup" ? <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Owner / administrator" /></Field> : null}
              <Field label="Email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></Field>
              <Field label="Password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} onKeyDown={(event) => event.key === "Enter" && void submit()} /></Field>
              <Button size="lg" onClick={() => void submit()} disabled={busy}>
                {mode === "signin" ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
                {busy ? "Please wait…" : mode === "signin" ? "Sign in securely" : "Create Owner account"}
              </Button>
              <Button variant="ghost" onClick={() => (window.location.href = "/")}>Back to dashboard</Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
