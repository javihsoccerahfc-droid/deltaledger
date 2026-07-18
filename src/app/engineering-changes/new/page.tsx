"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEngineeringChangeAction } from "@/app/actions";
import { useDemoUser } from "@/lib/context/DemoUserContext";

export default function NewEngineeringChangePage() {
  const router = useRouter();
  const { currentUser } = useDemoUser();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      const ec = await createEngineeringChangeAction(name.trim(), description.trim(), currentUser);
      router.push(`/engineering-changes/${ec.id}/boms`);
    });
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold tracking-tight text-ink">New Engineering Change</h1>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4 rounded-md border border-line bg-white p-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ECO-1044: Replace obsolete power connector"
            className="w-full rounded-sm border border-line bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            autoFocus
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Why this change is proposed, and any context useful for reviewers."
            className="w-full rounded-sm border border-line bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!name.trim() || isPending}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Creating…" : "Create engineering change →"}
          </button>
        </div>
      </form>
    </div>
  );
}
