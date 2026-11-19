"use client";

import { Sparkles } from "lucide-react";
import { startTransition, useActionState, useRef, useState } from "react";
import { postListing, type PostState } from "@/app/sell/actions";
import { FormMessage } from "@/components/forms/FormMessage";
import { Turnstile } from "@/components/Turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { marketplaceConfig } from "@/config/marketplace";
import {
  CATEGORIES,
  CONDITIONS,
  PICKUP_BLOCKS,
  PICKUP_DAY_OFFSETS,
  pickupDayLabel,
  SIZE_HINTS,
  UNSOLD_ACTIONS,
  type PickupWindow,
} from "@/lib/listing-options";
import { needsAuthenticityProof, parseDollarsToCents } from "@/lib/listing-rules";
import { formatCents } from "@/lib/money";
import type { PhotoView } from "@/server/listings/views";
import { PhotoUploader } from "./PhotoUploader";

export type ReviewValues = {
  title: string;
  category: string;
  condition: string;
  description: string;
  whyItsHere: string;
  isLot: boolean;
  isFree: boolean;
  lotItemCount: number | null;
  lotContents: string;
  sizeHint: string | null;
  startChoice: "default" | "custom";
  customStart: string;
  isBrandName: boolean;
  authenticityConfirmed: boolean;
  pickupZip: string;
  pickupWindows: PickupWindow[];
  closingNightDate: string | null;
  unsoldAction: string;
};

const selectClass =
  "h-11 w-full rounded-[10px] border-[1.5px] border-brand-line-strong bg-white px-3 text-[15px] text-brand-navy focus-visible:border-brand-navy focus-visible:ring-3 focus-visible:ring-brand-navy/20 outline-none aria-invalid:border-brand-tomato-strong";
const textareaClass =
  "w-full rounded-[10px] border-[1.5px] border-brand-line-strong bg-white px-3 py-2.5 text-[15px] text-brand-navy outline-none focus-visible:border-brand-navy focus-visible:ring-3 focus-visible:ring-brand-navy/20 resize-none aria-invalid:border-brand-tomato-strong";
const inputClass = "rounded-[10px] border-[1.5px] border-brand-line-strong text-[15px]";
const fieldLabel = "text-[13px] font-bold";

/** One-tap starters for "Why it's here": a short honest reason is enough. */
const WHY_STARTERS = [
  "Upgraded to a newer one.",
  "Moving, and it's not coming with us.",
  "The kids outgrew it.",
  "We have two.",
  "Don't use it anymore.",
];

/** 9 → "9", 17 → "5": the hours on each pickup-window button. */
function shortHours(h: number) {
  return String(h % 12 === 0 ? 12 : h % 12);
}

/** 9 → "9am", 17 → "5pm". */
function hours(h: number) {
  return `${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? "pm" : "am"}`;
}

/** Step 2 of 2 (mockup Sell.dc.html): the AI-filled review screen. The seller can change anything. */
export function ReviewForm({
  listingId,
  mode,
  values,
  aiFilled,
  suggestedStartCents,
  photos,
  proofPhotos,
  closingNights,
  waitingMetroName,
  pickupAreaLabel,
  closingWeekday,
  turnstileSiteKey,
  canRemovePhotos,
  pickupWindowsHint,
}: {
  listingId: string;
  mode: "post" | "edit";
  canRemovePhotos: boolean;
  /** Says where preselected windows came from ("Same times as your last listing…"). */
  pickupWindowsHint: string | null;
  values: ReviewValues;
  aiFilled: boolean;
  suggestedStartCents: number | null;
  photos: PhotoView[];
  proofPhotos: PhotoView[];
  closingNights: Array<{ date: string; label: string }> | null;
  waitingMetroName: string | null;
  pickupAreaLabel: string | null;
  closingWeekday: number;
  turnstileSiteKey: string | null;
}) {
  const [state, post, pending] = useActionState<PostState, FormData>(postListing, {
    status: "idle",
    attempt: 0,
  });
  const whyRef = useRef<HTMLTextAreaElement>(null);
  const [isLot, setIsLot] = useState(values.isLot);
  const [isFree, setIsFree] = useState(values.isFree);
  const [isBrandName, setIsBrandName] = useState(values.isBrandName);
  const [startChoice, setStartChoice] = useState(values.startChoice);
  const [customStart, setCustomStart] = useState(values.customStart);
  const errors = state.status === "error" ? state.fieldErrors : {};
  const invalid = (k: string) => (errors[k] ? true : undefined);
  const err = (k: string) =>
    errors[k] ? (
      <FormMessage tone="error" className="mt-1">
        {errors[k]}
      </FormMessage>
    ) : null;

  const startPriceCents = isFree
    ? 0
    : startChoice === "custom"
      ? (parseDollarsToCents(customStart) ?? 100)
      : marketplaceConfig.pricing.defaultStartPriceCents;
  const needsProof = needsAuthenticityProof({
    isBrandName,
    isFree,
    startPriceCents,
    suggestedStartCents,
  });
  const proofByKind = (kind: "tag" | "interior" | "serial") =>
    proofPhotos.filter((p) => p.kind === kind);
  const selectedWindows = new Set(values.pickupWindows.map((w) => `${w.dayOffset}:${w.block}`));
  const blocks = marketplaceConfig.pickup.blocks;

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        // Dispatch inside a transition (not the form's action prop) so a validation error
        // doesn't reset what the seller typed.
        startTransition(() => post(data));
      }}
    >
      <input type="hidden" name="listingId" value={listingId} />

      <PhotoUploader
        listingId={listingId}
        photos={photos}
        max={
          isLot ? marketplaceConfig.listings.maxPhotosLot : marketplaceConfig.listings.maxPhotosItem
        }
        canRemove={canRemovePhotos}
        label="Photo"
      />
      {err("photos")}

      {aiFilled ? (
        <p className="flex items-center gap-2.5 rounded-[10px] bg-[#FBF1D9] px-3 py-2.5 text-[13px] text-brand-navy">
          <Sparkles aria-hidden="true" className="size-5 shrink-0" />
          Filled in from your photos. Change anything.
        </p>
      ) : null}

      {state.status === "error" && state.message ? (
        <FormMessage tone="error">{state.message}</FormMessage>
      ) : null}

      <div>
        <Label htmlFor="title" className={fieldLabel}>
          Title
        </Label>
        <Input
          id="title"
          name="title"
          defaultValue={values.title}
          maxLength={marketplaceConfig.listings.titleMaxLength}
          className={`mt-1 ${inputClass}`}
          aria-invalid={invalid("title")}
        />
        {err("title")}
      </div>

      <div>
        <Label htmlFor="category" className={fieldLabel}>
          Category
        </Label>
        <select
          id="category"
          name="category"
          defaultValue={values.category}
          className={`mt-1 ${selectClass}`}
          aria-invalid={invalid("category")}
        >
          <option value="">Pick one</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        {err("category")}
      </div>

      <div>
        <Label htmlFor="condition" className={fieldLabel}>
          Condition
        </Label>
        <select
          id="condition"
          name="condition"
          defaultValue={values.condition}
          className={`mt-1 ${selectClass}`}
          aria-invalid={invalid("condition")}
        >
          <option value="">Pick one</option>
          {CONDITIONS.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        {err("condition")}
      </div>

      <div>
        <Label htmlFor="description" className={fieldLabel}>
          What buyers should know
        </Label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={values.description}
          maxLength={marketplaceConfig.listings.descriptionMaxLength}
          placeholder="Runs well, new blade in spring, bag included."
          aria-describedby="description-hint"
          className={`mt-1 ${textareaClass}`}
          aria-invalid={invalid("description")}
        />
        <p id="description-hint" className="mt-1 text-xs text-brand-ink-muted">
          The facts: condition, size, what&apos;s included, any flaws.
        </p>
        {err("description")}
      </div>

      <div>
        <Label htmlFor="whyItsHere" className={fieldLabel}>
          Why it&apos;s here <span className="font-normal text-brand-ink-muted">(optional)</span>
        </Label>
        <p id="why-hint" className="text-xs text-brand-ink-muted">
          A line on why you&apos;re letting it go. Buyers love a backstory, but &ldquo;Upgraded to a
          riding mower&rdquo; is plenty.
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Quick starts">
          {WHY_STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => {
                if (whyRef.current) {
                  whyRef.current.value = starter;
                  whyRef.current.focus();
                }
              }}
              className="min-h-9 rounded-full border-[1.5px] border-brand-line-strong bg-white px-3 text-sm text-brand-navy"
            >
              {starter.replace(/\.$/, "")}
            </button>
          ))}
        </div>
        <textarea
          ref={whyRef}
          id="whyItsHere"
          name="whyItsHere"
          rows={2}
          defaultValue={values.whyItsHere}
          maxLength={marketplaceConfig.listings.whyItsHereMaxLength}
          placeholder="Grandpa's toolbox. He'd want it used, not sitting in my garage."
          aria-describedby="why-hint"
          className={`mt-1.5 ${textareaClass}`}
          aria-invalid={invalid("whyItsHere")}
        />
        {err("whyItsHere")}
      </div>

      <fieldset className="flex flex-col gap-2 rounded-[10px] bg-white p-3">
        <legend className="sr-only">Lot or free</legend>
        <label className="flex min-h-11 items-center gap-3 text-[15px] font-semibold text-brand-navy">
          <input
            type="checkbox"
            name="isLot"
            checked={isLot}
            onChange={(e) => setIsLot(e.target.checked)}
            className="size-5 accent-brand-navy"
          />
          It&apos;s a lot: several things, one price, one winner
        </label>
        {isLot ? (
          <div className="flex flex-col gap-3 pl-8">
            <div>
              <Label htmlFor="lotItemCount" className={fieldLabel}>
                About how many items?
              </Label>
              <Input
                id="lotItemCount"
                name="lotItemCount"
                inputMode="numeric"
                defaultValue={values.lotItemCount ?? ""}
                className={`mt-1 max-w-28 ${inputClass}`}
                aria-invalid={invalid("lotItemCount")}
              />
              {err("lotItemCount")}
            </div>
            <div>
              <Label htmlFor="lotContents" className={fieldLabel}>
                What&apos;s included
              </Label>
              <textarea
                id="lotContents"
                name="lotContents"
                rows={2}
                defaultValue={values.lotContents}
                placeholder="3 bags of cheer and lacrosse uniforms, sizes S–L"
                className={`mt-1 ${textareaClass}`}
                aria-invalid={invalid("lotContents")}
              />
              {err("lotContents")}
            </div>
          </div>
        ) : null}
        <label className="flex min-h-11 items-center gap-3 text-[15px] font-semibold text-brand-navy">
          <input
            type="checkbox"
            name="isFree"
            checked={isFree}
            onChange={(e) => setIsFree(e.target.checked)}
            className="size-5 accent-brand-navy"
          />
          Give it away free ($0)
        </label>
        {isLot || isFree ? (
          <fieldset className="pl-8">
            <legend className={fieldLabel}>Size</legend>
            <div className="mt-1 flex flex-wrap gap-x-5">
              {SIZE_HINTS.map((s) => (
                <label key={s.slug} className="flex min-h-11 items-center gap-2 text-[15px]">
                  <input
                    type="radio"
                    name="sizeHint"
                    value={s.slug}
                    defaultChecked={values.sizeHint === s.slug}
                    className="size-4.5 accent-brand-navy"
                  />
                  {s.label}
                </label>
              ))}
            </div>
            {err("sizeHint")}
          </fieldset>
        ) : null}
      </fieldset>

      {!isFree ? (
        <fieldset>
          <legend className={fieldLabel}>Starting price</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <label
              className={`flex min-h-13 flex-col justify-center rounded-[10px] bg-white px-3 py-1.5 ${startChoice === "default" ? "border-2 border-brand-navy" : "border-[1.5px] border-brand-line-strong"}`}
            >
              <span className="flex items-center gap-1.5 text-[15px] font-bold">
                <input
                  type="radio"
                  name="startChoice"
                  value="default"
                  checked={startChoice === "default"}
                  onChange={() => setStartChoice("default")}
                  className="accent-brand-navy"
                />
                $1 start
              </span>
              <span className="text-xs text-brand-ink-muted">Most bids</span>
            </label>
            <label
              className={`flex min-h-13 flex-col justify-center rounded-[10px] bg-white px-3 py-1.5 ${startChoice === "custom" ? "border-2 border-brand-navy" : "border-[1.5px] border-brand-line-strong"}`}
            >
              <span className="flex items-center gap-1.5 text-[15px] font-bold">
                <input
                  type="radio"
                  name="startChoice"
                  value="custom"
                  checked={startChoice === "custom"}
                  onChange={() => {
                    setStartChoice("custom");
                    if (!customStart && suggestedStartCents) {
                      setCustomStart(String(suggestedStartCents / 100));
                    }
                  }}
                  className="accent-brand-navy"
                />
                Set my own
              </span>
              <span className="text-xs text-brand-ink-muted">
                {suggestedStartCents && suggestedStartCents > 100
                  ? `Suggested: ${formatCents(suggestedStartCents)}`
                  : "Any price from $1"}
              </span>
            </label>
          </div>
          {startChoice === "custom" ? (
            <div className="mt-2">
              <Label htmlFor="customStart" className={fieldLabel}>
                Your starting price (visible to everyone; no hidden reserve)
              </Label>
              <div className="mt-1 flex items-center gap-1.5">
                <span aria-hidden="true" className="text-lg font-bold">
                  $
                </span>
                <Input
                  id="customStart"
                  name="customStart"
                  inputMode="decimal"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className={`max-w-32 ${inputClass}`}
                  aria-invalid={invalid("customStart")}
                />
              </div>
              {err("customStart")}
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-2 rounded-[10px] bg-white p-3">
        <legend className="sr-only">Brand-name items</legend>
        <label className="flex min-h-11 items-center gap-3 text-[15px] font-semibold text-brand-navy">
          <input
            type="checkbox"
            name="isBrandName"
            checked={isBrandName}
            onChange={(e) => setIsBrandName(e.target.checked)}
            className="size-5 accent-brand-navy"
          />
          Brand-name item (designer, luxury or collectible)
        </label>
        {needsProof ? (
          <div className="flex flex-col gap-3 pl-8">
            <p className="text-sm text-brand-navy">
              Brand-name items starting at $50 or more need three extra photos so buyers can trust
              them: the tag or label, the inside, and a serial or date code.
            </p>
            {(["tag", "interior", "serial"] as const).map((kind) => (
              <div key={kind}>
                <p className="text-[13px] font-bold">
                  {kind === "tag"
                    ? "Tag or label"
                    : kind === "interior"
                      ? "Inside"
                      : "Serial or date code"}
                </p>
                <PhotoUploader
                  listingId={listingId}
                  kind={kind}
                  photos={proofByKind(kind)}
                  max={1}
                  canRemove
                  label={
                    kind === "tag"
                      ? "Tag photo"
                      : kind === "interior"
                        ? "Inside photo"
                        : "Serial photo"
                  }
                />
              </div>
            ))}
            {err("proofPhotos")}
            <label className="flex min-h-11 items-center gap-3 text-[15px] text-brand-navy">
              <input
                type="checkbox"
                name="authenticityConfirmed"
                defaultChecked={values.authenticityConfirmed}
                className="size-5 accent-brand-navy"
              />
              I confirm this item is authentic
            </label>
            {err("authenticityConfirmed")}
          </div>
        ) : null}
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <div>
          {closingNights ? (
            <>
              <Label htmlFor="closingNightDate" className={fieldLabel}>
                Closing Night
              </Label>
              <select
                id="closingNightDate"
                name="closingNightDate"
                defaultValue={values.closingNightDate ?? closingNights[0]?.date}
                className={`mt-1 ${selectClass} px-2.5 text-sm`}
              >
                {closingNights.map((n) => (
                  <option key={n.date} value={n.date}>
                    {n.label}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="text-[13px] text-brand-navy">
              <span className="block font-bold">Closing Night</span>
              {waitingMetroName
                ? `Goes live on ${waitingMetroName}'s first Closing Night`
                : "Set once your area is open"}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="pickupZip" className={fieldLabel}>
            Pickup zip
          </Label>
          <Input
            id="pickupZip"
            name="pickupZip"
            inputMode="numeric"
            maxLength={5}
            defaultValue={values.pickupZip}
            className={`mt-1 ${inputClass} px-2.5 text-sm`}
            aria-invalid={invalid("pickupZip")}
            aria-describedby="pickup-area"
          />
          {pickupAreaLabel ? (
            <p id="pickup-area" className="mt-1 text-xs text-brand-ink-muted">
              Shows as {pickupAreaLabel}
            </p>
          ) : null}
        </div>
      </div>
      {err("pickupZip")}

      <fieldset>
        <legend className={fieldLabel}>Pickup windows</legend>
        <p className="text-xs text-brand-ink-muted">
          When the winner can come, the week after Closing Night. Morning{" "}
          {hours(blocks.morning.startHour)}–{hours(blocks.morning.endHour)}, afternoon{" "}
          {hours(blocks.afternoon.startHour)}–{hours(blocks.afternoon.endHour)}, evening{" "}
          {hours(blocks.evening.startHour)}–{hours(blocks.evening.endHour)}.
        </p>
        {pickupWindowsHint ? (
          <p className="mt-1 text-xs font-semibold text-brand-navy">{pickupWindowsHint}</p>
        ) : null}
        <div className="mt-2 grid grid-cols-[3rem_repeat(3,minmax(0,1fr))] items-center gap-1.5 text-sm">
          <span />
          {PICKUP_BLOCKS.map((b) => (
            <span key={b.slug} className="text-center text-xs font-semibold text-brand-ink-muted">
              {b.label}
            </span>
          ))}
          {PICKUP_DAY_OFFSETS.map((day) => (
            <div key={day} className="contents">
              <span className="font-semibold">{pickupDayLabel(closingWeekday, day)}</span>
              {PICKUP_BLOCKS.map((b) => {
                const value = `${day}:${b.slug}`;
                return (
                  <label
                    key={value}
                    className="flex h-11 cursor-pointer items-center justify-center rounded-lg border-[1.5px] border-brand-line-strong bg-white has-checked:border-brand-navy has-checked:bg-brand-navy has-checked:text-white"
                  >
                    <input
                      type="checkbox"
                      name="pickupWindows"
                      value={value}
                      defaultChecked={selectedWindows.has(value)}
                      aria-label={`${pickupDayLabel(closingWeekday, day)} ${b.label.toLowerCase()}`}
                      className="sr-only"
                    />
                    <span aria-hidden="true">
                      {shortHours(blocks[b.slug].startHour)}–{shortHours(blocks[b.slug].endHour)}
                    </span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        {err("pickupWindows")}
      </fieldset>

      <div>
        <Label htmlFor="unsoldAction" className={fieldLabel}>
          If nobody bids
        </Label>
        <select
          id="unsoldAction"
          name="unsoldAction"
          defaultValue={values.unsoldAction}
          className={`mt-1 ${selectClass}`}
        >
          {UNSOLD_ACTIONS.filter((a) => !(isFree && a.slug === "drop_to_free")).map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.label}: {a.hint}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-brand-ink-muted">
        Buyers see only your area and distance. Your address goes to the winner after they pay.
        Selling is free.
      </p>

      {mode === "post" && turnstileSiteKey ? (
        <Turnstile key={state.attempt} siteKey={turnstileSiteKey} />
      ) : null}

      <div className="sticky bottom-0 -mx-4 mt-2 border-t border-[#E3D8C6] bg-white px-4 pt-3 pb-6">
        <Button
          type="submit"
          size="lg"
          className="h-13.5 w-full text-lg"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? "Posting…" : mode === "post" ? "Post it" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
