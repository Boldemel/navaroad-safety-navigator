import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
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
  ssr: false,
  validateSearch: authSearchSchema,
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);


  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    navigate({ to: "/dashboard", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { driver_name: name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. You're signed in.");
    navigate({ to: "/dashboard", replace: true });
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

          {resetMode ? (
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

              <TabsContent value="signin" className="mt-6">
                <form onSubmit={signIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="s-email">Email</Label>
                    <Input id="s-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
                </form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
