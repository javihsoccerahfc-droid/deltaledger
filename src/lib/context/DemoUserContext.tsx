"use client";

import React, { createContext, useContext, useState } from "react";
import { User, UserRole } from "@/domains/deltaledger/types";

export const DEMO_USERS: Record<UserRole, User> = {
  engineer: { id: "user-engineer", name: "Erin Engineer", role: "engineer" },
  ccb: { id: "user-ccb", name: "Casey CCB", role: "ccb" },
  buyer: { id: "user-buyer", name: "Bailey Buyer", role: "buyer" },
  supply_chain_manager: { id: "user-scm", name: "Sam Supply-Chain", role: "supply_chain_manager" },
  finance: { id: "user-finance", name: "Frankie Finance", role: "finance" },
  part_data_owner: { id: "user-pdo", name: "Parker Part-Owner", role: "part_data_owner" },
  admin: { id: "user-admin", name: "Alex Admin", role: "admin" },
};

interface DemoUserContextValue {
  currentUser: User;
  setCurrentUserRole: (role: UserRole) => void;
}

const DemoUserContext = createContext<DemoUserContextValue | null>(null);

/**
 * Deliberately thin: this context holds ONLY the "acting as" demo role, not
 * any domain data. Every read/write of BOMs, POs, mappings, exposure,
 * mitigation, or outcomes goes through Server Actions to the real database
 * (see src/app/actions.ts) -- there is no in-memory data store anymore.
 * This context is a stand-in for real authentication (Phase 5), explicitly
 * labeled "Demo" in the UI, never for persisted data.
 */
export function DemoUserProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>("part_data_owner");
  const value: DemoUserContextValue = {
    currentUser: DEMO_USERS[role],
    setCurrentUserRole: setRole,
  };
  return <DemoUserContext.Provider value={value}>{children}</DemoUserContext.Provider>;
}

export function useDemoUser() {
  const ctx = useContext(DemoUserContext);
  if (!ctx) throw new Error("useDemoUser must be used within DemoUserProvider");
  return ctx;
}
