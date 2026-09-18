const DEFAULT_PUBLIC_ORIGIN = "https://misantioflow.lovable.app";

export function publicAppOrigin() {
  const configured = (import.meta as any).env?.VITE_PUBLIC_APP_ORIGIN as string | undefined;
  return (configured?.trim() || DEFAULT_PUBLIC_ORIGIN).replace(/\/$/, "");
}

export function publicAppUrl(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${publicAppOrigin()}${normalized}`;
}