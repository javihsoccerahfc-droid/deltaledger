"use client";

import Link from "next/link";
import { RoleSwitcher } from "./RoleSwitcher";

export function TopNav() {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-3">
        <Link href="/engineering-changes" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-accent-deep text-xs font-bold text-white">
            DL
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">DeltaLedger</span>
        </Link>
        <RoleSwitcher />
      </div>
    </header>
  );
}
