/** redirect() wirft wie in Next.js — der Lauf fängt das als Ergebnis ab. */
export class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`REDIRECT ${url}`);
  }
}

export function redirect(url: string): never {
  throw new RedirectSignal(url);
}

export function notFound(): never {
  throw new RedirectSignal("404");
}
