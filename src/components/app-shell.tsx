import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Aperture,
  BarChart3,
  Boxes,
  CalendarDays,
  Home,
  Images,
  KeyRound,
  LockKeyhole,
  LogIn,
  LogOut,
  Menu,
  Moon,
  PackageCheck,
  ReceiptText,
  Search,
  Settings,
  Sun,
  Truck,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useOps, useSession } from "@/lib/data";
import { withTimeout } from "@/lib/async";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/events", label: "Events", icon: CalendarDays },
  { to: "/gallery", label: "Gallery", icon: Images },
  { to: "/orders", label: "Orders", icon: ReceiptText },
  { to: "/production", label: "Production", icon: PackageCheck },
  { to: "/release", label: "Release", icon: Truck },
] as const;

const SECONDARY_NAV = [
  { to: "/packages", label: "Packages & Pricing", icon: Boxes },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const MOBILE_NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/gallery", label: "Gallery", icon: Images },
  { to: "/orders", label: "Orders", icon: ReceiptText },
  { to: "/production", label: "Production", icon: PackageCheck },
  { to: "/release", label: "Release", icon: Truck },
] as const;

function useDarkMode() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  };

  return { dark, toggle };
}

function NavGroup({
  items,
  onNavigate,
}: {
  items: typeof PRIMARY_NAV | typeof SECONDARY_NAV;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group relative flex min-h-9 items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-[0.78rem] font-medium transition-colors",
              active
                ? "border-primary/20 bg-primary/[0.09] text-foreground"
                : "text-muted-foreground hover:border-border hover:bg-white/[0.025] hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-transparent",
                active && "bg-primary",
              )}
            />
            <item.icon
              className={cn(
                "size-3.5 shrink-0",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground/80",
              )}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "relative grid shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/[0.08] text-primary",
          compact ? "size-8" : "size-9",
        )}
      >
        <Aperture className={compact ? "size-4" : "size-[1.05rem]"} />
        <span className="absolute -right-px -top-px size-1.5 rounded-bl-sm bg-primary" />
      </span>
      <div className="min-w-0 leading-tight">
        <p
          className={cn(
            "font-display font-extrabold tracking-[-0.04em] text-foreground",
            compact ? "text-sm" : "text-[0.92rem]",
          )}
        >
          PhotoFlow
        </p>
        <p className="mt-0.5 truncate text-[0.52rem] font-bold tracking-[0.18em] text-muted-foreground uppercase">
          Misantio Studio · Photo Orders
        </p>
      </div>
    </div>
  );
}

function GlobalSearch({ open, setOpen }: { open: boolean; setOpen: (value: boolean) => void }) {
  const { data } = useOps();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search name, congregation, contact or order number…" />
      <CommandList>
        <CommandEmpty>No matches found.</CommandEmpty>
        <CommandGroup heading="People">
          {(data?.participants ?? []).slice(0, 80).map((participant) => (
            <CommandItem
              key={participant.id}
              value={`${participant.full_name} ${participant.organization ?? ""} ${participant.contact_number ?? ""} ${participant.participant_code}`}
              onSelect={() => {
                setOpen(false);
                void navigate({ to: "/orders" });
              }}
            >
              <Users className="size-3.5" />
              <span>{participant.full_name}</span>
              <span className="ml-auto max-w-44 truncate text-xs text-muted-foreground">
                {participant.organization ?? participant.contact_number ?? participant.participant_code}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Orders">
          {(data?.orders ?? []).map((order) => (
            <CommandItem
              key={order.id}
              value={`${order.order_number} ${order.payment_method ?? ""}`}
              onSelect={() => {
                setOpen(false);
                void navigate({ to: "/orders" });
              }}
            >
              <ReceiptText className="size-3.5" />
              {order.order_number}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function SidebarNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div>
        <p className="mb-2 px-2.5 text-[0.54rem] font-bold tracking-[0.17em] text-muted-foreground uppercase">
          Workflow
        </p>
        <NavGroup items={PRIMARY_NAV} onNavigate={onNavigate} />
      </div>
      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-2 px-2.5 text-[0.54rem] font-bold tracking-[0.17em] text-muted-foreground uppercase">
          Studio
        </p>
        <NavGroup items={SECONDARY_NAV} onNavigate={onNavigate} />
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinUserId, setPinUserId] = useState<string | null>(null);
  const { dark, toggle } = useDarkMode();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const email = useSession();
  const { data } = useOps();

  useEffect(() => {
    if (!email) {
      setPinRequired(false);
      setPinUserId(null);
      return;
    }

    const checkPin = async () => {
      const { data: authData } = await withTimeout(supabase.auth.getUser(), 8_000, "Account check timed out.");
      const user = authData.user;
      if (!user) return;
      setPinUserId(user.id);

      const db = supabase as any;
      const result = await withTimeout(db.rpc("get_my_security_settings"), 8_000, "Security settings check timed out.");
      if (result.error) return;
      const row = result.data?.[0];
      if (!row?.pin_enabled) {
        setPinRequired(false);
        return;
      }

      const unlocked = sessionStorage.getItem(`photoflow.pin-unlocked:${user.id}`) === "1";
      setPinRequired(!unlocked);
    };

    void checkPin();
  }, [email]);

  useEffect(() => {
    const lock = () => {
      if (pinUserId) sessionStorage.removeItem(`photoflow.pin-unlocked:${pinUserId}`);
      setPinValue("");
      setPinRequired(true);
    };
    window.addEventListener("photoflow:lock-now", lock);
    return () => window.removeEventListener("photoflow:lock-now", lock);
  }, [pinUserId]);

  async function unlockWithPin() {
    if (!/^[0-9]{6}$/.test(pinValue)) {
      toast.error("Enter your 6-digit PIN.");
      return;
    }
    setPinBusy(true);
    try {
      const db = supabase as any;
      const result: any = await withTimeout(db.rpc("verify_my_pin", { _pin: pinValue }), 10_000, "PIN check timed out.");
      if (result.error) throw result.error;
      if (result.data !== true) {
        setPinValue("");
        toast.error("That PIN is incorrect. After 5 wrong tries the PIN locks for 5 minutes.");
        return;
      }
      if (pinUserId) sessionStorage.setItem(`photoflow.pin-unlocked:${pinUserId}`, "1");
      setPinRequired(false);
      setPinValue("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The PIN could not be checked. Please try again.");
    } finally {
      setPinBusy(false);
    }
  }

  async function signOutFromLock() {
    await withTimeout(supabase.auth.signOut(), 10_000, "Sign out took too long.").catch(() => null);
    window.location.href = "/auth";
  }

  return (
    <div className="min-h-screen bg-background">
      {pinRequired ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-background/95 px-4 backdrop-blur-xl">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl shadow-black/30">
            <span className="grid size-11 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <LockKeyhole className="size-5" />
            </span>
            <p className="mt-5 eyebrow">PhotoFlow locked</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold">Enter your 6-digit PIN</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Quick unlock protects this signed-in browser session.</p>
            <Input
              autoFocus
              className="mt-5 h-12 text-center font-mono text-xl tracking-[.45em]"
              inputMode="numeric"
              maxLength={6}
              type="password"
              value={pinValue}
              onChange={(event) => setPinValue(event.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(event) => event.key === "Enter" && void unlockWithPin()}
              placeholder="••••••"
            />
            <Button className="mt-3 w-full" size="lg" onClick={() => void unlockWithPin()} disabled={pinBusy || pinValue.length !== 6}>
              <KeyRound className="size-4" /> {pinBusy ? "Checking…" : "Unlock"}
            </Button>
            <Button className="mt-2 w-full" variant="ghost" onClick={() => void signOutFromLock()}>
              <LogOut className="size-4" /> Sign out instead
            </Button>
          </div>
        </div>
      ) : null}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-sidebar/95 px-3 py-4 backdrop-blur-xl lg:flex">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_18%_0%,rgba(183,255,0,.09),transparent_68%)]" />
        <div className="relative border-b border-border px-1.5 pb-4">
          <Wordmark />
        </div>

        <div className="relative mt-4 flex-1 overflow-y-auto pr-0.5">
          <SidebarNavigation />
        </div>

        <div className="relative mt-3 border-t border-border pt-3">
          <div className="rounded-lg border border-border bg-white/[0.02] px-2.5 py-2">
            <div className="flex items-center gap-2 text-[0.68rem] font-semibold text-foreground/90">
              <span className="size-1.5 rounded-full bg-primary shadow-[0_0_12px_rgba(183,255,0,.45)]" />
              PhotoFlow 2.0
            </div>
            <p className="mt-1 truncate text-[0.57rem] text-muted-foreground">
              {email ? email : "Guest preview · Read only"}
            </p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/88 px-3 backdrop-blur-xl sm:px-5">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto border-r border-border bg-sidebar p-3">
              <div className="border-b border-border px-1 pb-4">
                <Wordmark />
              </div>
              <div className="mt-4">
                <SidebarNavigation onNavigate={() => setMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-border bg-card/70 px-3 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card sm:max-w-[29rem]"
            aria-label="Open global search"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="truncate">Search name, congregation, contact or order…</span>
            <kbd className="ml-auto hidden rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-[0.55rem] text-muted-foreground sm:block">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex min-w-0 items-center gap-1">
            {data?.event ? (
              <Link
                to="/events"
                className="mr-1 hidden h-9 min-w-0 items-center gap-2 rounded-lg border border-border bg-card/55 px-2.5 transition-colors hover:border-primary/25 xl:flex"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_10px_rgba(183,255,0,.35)]" />
                <div className="min-w-0 leading-tight">
                  <p className="max-w-44 truncate text-[0.65rem] font-semibold text-foreground">
                    {data.event.name}
                  </p>
                  <p className="text-[0.52rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                    Active event
                  </p>
                </div>
              </Link>
            ) : null}

            <Button variant="ghost" size="icon" className="size-8" onClick={toggle} aria-label="Toggle dark mode">
              {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </Button>

            {email ? null : (
              <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-[0.65rem]">
                <Link to="/auth">
                  <LogIn className="size-3.5" />
                  <span className="hidden sm:inline">Staff sign in</span>
                </Link>
              </Button>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1480px] px-3 pt-5 pb-24 sm:px-5 sm:pt-6 lg:pb-10 xl:px-7">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {MOBILE_NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[0.58rem] font-semibold transition-colors",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-transparent",
                  active && "bg-primary",
                )}
              />
              <item.icon className={cn("size-[1.05rem]", active && "text-primary")} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <GlobalSearch open={searchOpen} setOpen={setSearchOpen} />
    </div>
  );
}
