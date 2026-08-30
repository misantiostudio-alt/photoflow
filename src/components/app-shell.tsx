import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Aperture,
  BadgeCheck,
  BarChart3,
  Boxes,
  Calendar,
  Camera,
  CreditCard,
  Frame,
  Images,
  LayoutDashboard,
  LogIn,
  Menu,
  Moon,
  Printer,
  QrCode,
  Receipt,
  Search,
  Settings,
  Sun,
  Truck,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useOps, useSession } from "@/lib/data";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/events", label: "Events", icon: Calendar },
  { to: "/participants", label: "Participants", icon: Users },
  { to: "/nameplates", label: "Nameplates", icon: QrCode },
  { to: "/intake", label: "Photo Intake", icon: Images },
  { to: "/shooting", label: "Shooting Mode", icon: Camera },
  { to: "/galleries", label: "Client Galleries", icon: Aperture },
  { to: "/orders", label: "Orders", icon: Receipt },
  { to: "/payments", label: "Payments", icon: CreditCard },
  { to: "/print-queue", label: "Print Queue", icon: Printer },
  { to: "/production", label: "Production / QC", icon: BadgeCheck },
  { to: "/framing", label: "Framing", icon: Frame },
  { to: "/delivery", label: "Delivery", icon: Truck },
  { to: "/packages", label: "Packages", icon: Boxes },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const MOBILE_NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/participants", label: "People", icon: Users },
  { to: "/shooting", label: "Shoot", icon: Camera },
  { to: "/print-queue", label: "Print", icon: Printer },
  { to: "/delivery", label: "Deliver", icon: Truck },
] as const;

function useDarkMode() {
  const [dark, setDark] = useState(false);
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

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                : "text-foreground/75 hover:bg-sidebar-accent hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Aperture className="size-5" />
      </span>
      <div className="leading-tight">
        <p className="font-display text-sm">PhotoFlow</p>
        <p className="text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
          by Misantio Studio
        </p>
      </div>
    </div>
  );
}

function GlobalSearch({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { data } = useOps();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search participants, IDs, orders, congregations…" />
      <CommandList>
        <CommandEmpty>No matches found.</CommandEmpty>
        <CommandGroup heading="Participants">
          {(data?.participants ?? []).slice(0, 60).map((p) => (
            <CommandItem
              key={p.id}
              value={`${p.participant_code} ${p.full_name} ${p.organization ?? ""}`}
              onSelect={() => {
                setOpen(false);
                void navigate({
                  to: "/participants/$code",
                  params: { code: p.participant_code },
                });
              }}
            >
              <span className="font-mono text-xs text-muted-foreground">
                {p.participant_code}
              </span>
              <span>{p.full_name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{p.organization}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Orders">
          {(data?.orders ?? []).map((o) => (
            <CommandItem
              key={o.id}
              value={`${o.order_number} ${o.payment_method ?? ""}`}
              onSelect={() => {
                setOpen(false);
                void navigate({ to: "/orders", search: { q: o.order_number } });
              }}
            >
              <Receipt className="size-3.5" />
              {o.order_number}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { dark, toggle } = useDarkMode();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const email = useSession();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex">
        <div className="px-2 pb-4">
          <Wordmark />
        </div>
        <div className="flex-1 overflow-y-auto pr-1">
          <NavList />
        </div>
        <p className="px-3 pt-3 text-[0.65rem] text-muted-foreground">
          {email ? `Signed in · ${email}` : "Viewing as guest"}
        </p>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 overflow-y-auto p-4">
              <div className="pb-4">
                <Wordmark />
              </div>
              <NavList onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-9 flex-1 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 sm:max-w-md"
          >
            <Search className="size-4" />
            <span className="truncate">Search participants, orders…</span>
            <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[0.65rem] sm:block">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {email ? null : (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/auth">
                  <LogIn className="size-4" /> Staff sign in
                </Link>
              </Button>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-28 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 backdrop-blur-md lg:hidden">
        {MOBILE_NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <GlobalSearch open={searchOpen} setOpen={setSearchOpen} />
    </div>
  );
}
