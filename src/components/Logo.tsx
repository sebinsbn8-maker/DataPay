/** DataPay mark (heart-D) + wordmark. `dark` = for light backgrounds; default = for dark (navy) backgrounds. */
export function LogoMark({ size = 36, dark = false }: { size?: number; dark?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dark ? "/logo-dark.png" : "/logo.png"} alt="" style={{ height: size, width: "auto" }} />;
}

export function Logo({ size = 36, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <LogoMark size={size} dark={dark} />
      <span className={`text-lg font-semibold tracking-tight ${dark ? "text-ink" : "text-white"}`}>DataPay</span>
    </span>
  );
}
