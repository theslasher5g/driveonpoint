/** Ersatz für next/headers im Simulationslauf: die Adresse kommt aus globalThis. */
const state = globalThis as unknown as { __simIp?: string };

export async function headers() {
  return new Headers({ "x-forwarded-for": state.__simIp ?? "198.51.100.1" });
}

export async function cookies() {
  return { get: () => undefined, set: () => {}, delete: () => {} };
}
