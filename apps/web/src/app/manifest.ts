import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Month End",
    short_name: "Month End",
    description: "Secure inventory operations for hospitality teams.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#17221b",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
