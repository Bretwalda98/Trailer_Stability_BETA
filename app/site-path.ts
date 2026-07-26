const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const siteBasePath = configuredBasePath.replace(/\/$/, "");

/** Resolves a public asset under localhost, a custom domain, or GitHub Pages. */
export function assetPath(path: string): string {
  const leadingPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteBasePath}${leadingPath}`;
}
