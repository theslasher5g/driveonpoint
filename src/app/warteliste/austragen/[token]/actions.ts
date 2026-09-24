"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { record } from "@/lib/audit";
import { db } from "@/lib/db";
import { waitlistEntries } from "@/lib/db/schema";
import { consume } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

/** Von der Warteliste streichen, über den Link aus der Mail. Der Eintrag ist danach ganz weg. */
export async function leaveWaitlistAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (token.length < 20 || token.length > 100) redirect("/");

  const ip = await clientIp();
  const verdict = await consume(`absage:${ip}`, 20, 3600);
  if (!verdict.ok) redirect("/?fehler=zu-viele-anfragen");

  const removed = await db
    .delete(waitlistEntries)
    .where(eq(waitlistEntries.token, token))
    .returning({ id: waitlistEntries.id });

  if (removed.length > 0)
    await record("warteliste.ausgetragen", { label: "Kundschaft" });

  redirect("/warteliste/austragen/erledigt");
}
