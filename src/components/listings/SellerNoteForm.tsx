"use client";

import { useActionState } from "react";
import { addSellerNote, type NoteState } from "@/app/sell/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Label } from "@/components/ui/label";

/** After the first bid, a seller can add notes (and photos) but not change anything else. */
export function SellerNoteForm({ listingId }: { listingId: string }) {
  const [state, add] = useActionState<NoteState, FormData>(addSellerNote, { status: "idle" });
  return (
    <form action={add} className="flex flex-col gap-2">
      <input type="hidden" name="listingId" value={listingId} />
      <Label htmlFor="note">Add a note for bidders</Label>
      <textarea
        id="note"
        name="note"
        rows={2}
        className="w-full rounded-[10px] border-[1.5px] border-brand-line-strong bg-white px-3 py-2 text-[15px]"
      />
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      {state.status === "saved" ? <FormMessage tone="success">Note added.</FormMessage> : null}
      <SubmitButton pendingLabel="Adding…" variant="outline" className="self-start bg-white">
        Add note
      </SubmitButton>
    </form>
  );
}
