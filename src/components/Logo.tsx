export function Logo({ size = 36, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" width={size} height={size} alt="" />
      <span className={`text-lg font-semibold tracking-tight ${dark ? "text-ink" : "text-white"}`}>DataPay</span>
    </span>
  );
}
