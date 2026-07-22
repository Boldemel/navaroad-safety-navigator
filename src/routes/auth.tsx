import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { usernameToSyntheticEmail } from "@/lib/company.shared";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const authSearchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: authSearchSchema,
  head: () => ({
    meta: [
      { title: "Sign in to Navaroad FleetOS" },
      {
        name: "description",
        content: "Sign in to Navaroad FleetOS to manage routing, dispatch, safety, compliance, and fleet operations.",
      },
      { property: "og:title", content: "Sign in to Navaroad FleetOS" },
      {
        property: "og:description",
        content: "Access Navaroad FleetOS for trucking safety, dispatch, compliance, and fleet management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});


function AuthPage() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);


  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Allow login by email OR company-assigned username.
    const id = email.trim();
    const loginEmail = id.includes("@") ? id : usernameToSyntheticEmail(id);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    setLoading(false);
    if (error) {
      if (/confirm/i.test(error.message)) {
        setPendingConfirmEmail(loginEmail);
      }
      return toast.error(error.message);
    }
    navigate({ to: "/home", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { driver_name: name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (!data.session) {
      // Email confirmation required — show inline state.
      setPendingConfirmEmail(email);
      toast.success("Check your inbox to confirm your email.");
      return;
    }
    toast.success("Account created. You're signed in.");
    navigate({ to: "/home", replace: true });
  }

  async function resendConfirmation() {
    if (!pendingConfirmEmail) return;
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingConfirmEmail,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Confirmation email re-sent.");
  }

  async function signInWithGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error(result.error.message ?? "Google sign-in failed.");
      return;
    }
    if (result.redirected) return; // browser is leaving for Google
    navigate({ to: "/home", replace: true });
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent.");
    setResetMode(false);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar road-grid border-r border-border">
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
          <div className="size-9 rounded-md bg-primary flex items-center justify-center">
            <Truck className="size-5 text-primary-foreground" />
          </div>
          Navaroad
        </Link>
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Know what's ahead. Before it stops you.</h2>
          <p className="mt-3 text-muted-foreground max-w-md">
            Real-time wind, closure, and hazard intelligence built for professional drivers and small fleets.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">© Navaroad — Trucking Safety Intelligence</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8 font-semibold">
            <div className="size-8 rounded-md bg-primary flex items-center justify-center">
              <Truck className="size-4 text-primary-foreground" />
            </div>
            Navaroad
          </Link>

          {pendingConfirmEmail ? (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">Confirm your email</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  We sent a confirmation link to <span className="text-foreground font-medium">{pendingConfirmEmail}</span>.
                  Click the link, then come back to sign in.
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Didn't get it? Check your spam folder, or resend below. Links expire after a short time.
              </div>
              <Button type="button" className="w-full" disabled={loading} onClick={resendConfirmation}>
                {loading ? "Sending…" : "Resend confirmation email"}
              </Button>
              <button
                type="button"
                onClick={() => setPendingConfirmEmail(null)}
                className="text-sm text-muted-foreground hover:text-foreground w-full text-center"
              >
                Back to sign in
              </button>
            </div>
          ) : resetMode ? (
            <form onSubmit={resetPassword} className="space-y-4">
              <div>
                <h1 className="text-2xl font-semibold">Reset password</h1>
                <p className="text-sm text-muted-foreground mt-1">We'll email you a reset link.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>Send reset link</Button>
              <button type="button" onClick={() => setResetMode(false)} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
                Back to sign in
              </button>
            </form>
          ) : (
            <Tabs defaultValue={mode === "signup" ? "signup" : "signin"}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <div className="mt-6 space-y-3">
                <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={signInWithGoogle}>
                  <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.12A6.99 6.99 0 0 1 5.5 12c0-.73.13-1.45.34-2.12V7.04H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.96l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
                  </svg>
                  Continue with Google
                </Button>
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <div className="h-px flex-1 bg-border" /> or email <div className="h-px flex-1 bg-border" />
                </div>
              </div>


              <TabsContent value="signin" className="mt-6">
                <form onSubmit={signIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="s-email">Email or username</Label>
                    <Input
                      id="s-email"
                      type="text"
                      autoCapitalize="none"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com or driver username"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="s-pw">Password</Label>
                      <button type="button" onClick={() => setResetMode(true)} className="text-xs text-primary hover:underline">
                        Forgot?
                      </button>
                    </div>
                    <Input id="s-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>Sign in</Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={signUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="u-name">Driver name</Label>
                    <Input id="u-name" required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="u-email">Email</Label>
                    <Input id="u-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="u-pw">Password</Label>
                    <Input id="u-pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>Create account</Button>
                  <p className="text-xs text-muted-foreground text-center">
                    By creating an account you agree to our{" "}
                    <Link to="/terms" className="text-primary hover:underline">Terms</Link> and{" "}
                    <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
