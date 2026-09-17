import type { MetadataRoute } from "next";

// Wird beim Bauen ausgewertet, deshalb direkt aus der Umgebung statt über
// lib/env — dort werden Geheimnisse erzwungen, die zur Bauzeit fehlen.
const appUrl = (process.env.APP_URL ?? "https://driveonpoint.com").replace(/\/+$/, "");

const PAGES = [
  { path: "/", priority: 1 },
  { path: "/fahrstunden", priority: 0.9 },
  { path: "/vku", priority: 0.9 },
  { path: "/nothilfekurs", priority: 0.9 },
  { path: "/preise", priority: 0.8 },
  { path: "/ausbildungsweg", priority: 0.8 },
  { path: "/buchen", priority: 0.8 },
  { path: "/ueber-uns", priority: 0.6 },
  { path: "/kontakt", priority: 0.6 },
  { path: "/impressum", priority: 0.2 },
  { path: "/datenschutz", priority: 0.2 },
  { path: "/agb", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map((page) => ({
    url: `${appUrl}${page.path}`,
    lastModified,
    changeFrequency: "monthly",
    priority: page.priority,
  }));
}
