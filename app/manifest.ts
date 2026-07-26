import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trailer Stability Native Engineering Suite",
    short_name: "Trailer Stability",
    description: "Standalone trailer stability, beam and optimiser application.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f6f8",
    theme_color: "#12212f",
    orientation: "any",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
