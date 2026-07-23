import { ENGINEERING_CHANGE_CREATION_DISABLED } from "@/config/demoMode";
import { NewEngineeringChangeForm } from "@/components/ec/NewEngineeringChangeForm";

export default function NewEngineeringChangePage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-xl font-semibold tracking-tight text-ink">New Engineering Change</h1>
      {ENGINEERING_CHANGE_CREATION_DISABLED ? (
        <div className="mt-5 rounded-md border border-line bg-white p-5">
          <p className="text-sm text-ink">Creating new engineering changes is disabled in this environment.</p>
          <p className="mt-2 text-sm text-ink-soft">
            This is a read-only demonstration environment. Explore the seeded ECO-1042 scenario instead.
          </p>
        </div>
      ) : (
        <NewEngineeringChangeForm />
      )}
    </div>
  );
}
