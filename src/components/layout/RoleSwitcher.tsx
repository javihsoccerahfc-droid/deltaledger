"use client";

import { useDemoUser } from "@/lib/context/DemoUserContext";
import { UserRole } from "@/domains/deltaledger/types";

const ROLE_LABELS: Record<UserRole, string> = {
  engineer: "Engineer",
  ccb: "CCB / Change Analyst",
  buyer: "Buyer",
  supply_chain_manager: "Supply Chain Manager",
  finance: "Finance",
  part_data_owner: "Part Data Owner",
  admin: "Admin",
};

export function RoleSwitcher() {
  const { currentUser, setCurrentUserRole } = useDemoUser();
  return (
    <div className="flex items-center gap-2 rounded-sm border border-dashed border-line bg-paper px-2.5 py-1.5">
      <span className="rounded-sm bg-status-warning px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
        Demo
      </span>
      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-ink-soft">Viewing as</span>
        <select
          value={currentUser.role}
          onChange={(e) => setCurrentUserRole(e.target.value as UserRole)}
          className="rounded-sm border border-line bg-white px-1.5 py-1 text-xs font-medium text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
