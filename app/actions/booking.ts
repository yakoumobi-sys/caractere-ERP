"use server";
import { revalidatePath } from "next/cache";
import { guard, s, n } from "@/lib/action";
import { rpc } from "@/lib/erp";
import type { ActionResult } from "@/components/forms";

export async function addBooking(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "booking_add", {
      booking_date: s(fd, "booking_date"),
      client_name: s(fd, "client_name"),
      phone: s(fd, "phone"),
      description: s(fd, "description"),
      quantity: n(fd, "quantity"),
      amount: n(fd, "amount"),
      notes: s(fd, "notes"),
    });
    revalidatePath("/booking");
    return "Commande ajoutée.";
  });
}

export async function setBookingStatus(id: string, status: string): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "booking_set_status", id, status);
    revalidatePath("/booking");
  });
}

export async function removeBooking(id: string): Promise<ActionResult> {
  return guard(async (me) => {
    await rpc(me, "booking_delete", id);
    revalidatePath("/booking");
  });
}
