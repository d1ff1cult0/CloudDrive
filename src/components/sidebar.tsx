"use client";

import {
  Cloud,
  FolderClosed,
  HardDrive,
  ListChecks,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatBytes } from "@/lib/format";

function initials(email: string): string {
  const base = email.split("@")[0] ?? email;
  const parts = base.split(/[.\-_]/).filter(Boolean);
  const s = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "");
  return s.toUpperCase() || email.slice(0, 2).toUpperCase();
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <Icon className="size-[18px]" />
      {label}
    </Link>
  );
}

export function Sidebar({
  email,
  isAdmin,
  usedBytes,
  quotaBytes,
}: {
  email: string;
  isAdmin: boolean;
  usedBytes: number;
  quotaBytes: number;
}) {
  const pathname = usePathname();
  const pct =
    quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

  return (
    <aside className="bg-sidebar border-sidebar-border hidden w-60 flex-none flex-col border-r p-3.5 sm:flex">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-2 pb-5 pt-1">
        <div className="bg-primary flex size-8 items-center justify-center rounded-[9px]">
          <Cloud className="size-[18px] text-white" />
        </div>
        <span className="text-[17px] font-bold tracking-tight">Vault</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        <NavItem
          href="/dashboard"
          label="My Files"
          icon={FolderClosed}
          active={pathname === "/dashboard" || pathname.startsWith("/dashboard/")}
        />
        {isAdmin && (
          <>
            <p className="text-muted-foreground/70 px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider">
              Admin
            </p>
            <NavItem
              href="/admin/users"
              label="Users"
              icon={Users}
              active={pathname === "/admin/users"}
            />
            <NavItem
              href="/admin/whitelist"
              label="Whitelist"
              icon={ListChecks}
              active={pathname === "/admin/whitelist"}
            />
            <NavItem
              href="/admin/backends"
              label="Backends"
              icon={HardDrive}
              active={pathname === "/admin/backends"}
            />
          </>
        )}
      </nav>

      <div className="flex-1" />

      {/* Storage card */}
      <div className="border-border bg-background/60 rounded-xl border p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-foreground/80">
            Storage
          </span>
          <span className="text-muted-foreground text-[11.5px]">{pct}%</span>
        </div>
        <div className="bg-input h-[7px] overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-muted-foreground mt-2.5 text-[12px]">
          {formatBytes(usedBytes)} of {formatBytes(quotaBytes)} used
        </div>
      </div>

      {/* User row */}
      <div className="mt-3 flex items-center gap-2.5 px-1">
        <div className="bg-primary flex size-8 flex-none items-center justify-center rounded-full text-[12px] font-semibold text-white">
          {initials(email)}
        </div>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[12.5px]">
          {email}
        </span>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </aside>
  );
}
