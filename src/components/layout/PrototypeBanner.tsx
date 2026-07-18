export function PrototypeBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-ink px-4 py-1.5 text-center text-xs font-medium tracking-wide text-white">
      <span className="rounded-sm bg-status-warning px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
        Prototype
      </span>
      <span>Not for production purchasing or financial decisions.</span>
    </div>
  );
}
