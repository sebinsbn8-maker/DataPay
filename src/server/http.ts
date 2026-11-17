export const qs = (req: Request) => Object.fromEntries(new URL(req.url).searchParams.entries()) as Record<string, string | undefined>;
export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = () => today().slice(0, 8) + "01";
