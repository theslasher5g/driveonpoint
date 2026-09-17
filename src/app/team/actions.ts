"use server";

import { redirect } from "next/navigation";
import { record } from "@/lib/audit";
import { currentUser, destroySession } from "@/lib/auth/session";

export async function logoutAction(): Promise<void> {
  const user = await currentUser();
  if (user) await record("abmeldung", { id: user.id, label: user.name });
  await destroySession();
  redirect("/team/anmelden");
}
