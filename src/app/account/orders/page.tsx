import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CardSkeleton, PageCard } from "@/components/PageCard";
import { formatCents } from "@/lib/money";
import { orderStatusLine } from "@/lib/order-copy";
import { requireViewer } from "@/server/auth/session";
import { listingPhotoUrl } from "@/server/images/photo-urls";
import { ordersForUser, type OrderListItem } from "@/server/orders/repo";

export const metadata: Metadata = { title: "Wins and sales" };

export default function OrdersPage() {
  return (
    <PageCard title="Wins and sales">
      <Suspense fallback={<CardSkeleton lines={4} />}>
        <Orders />
      </Suspense>
    </PageCard>
  );
}

async function Orders() {
  const viewer = await requireViewer("/account/orders");
  const orders = await ordersForUser(viewer.id);
  return (
    <div className="flex flex-col gap-8">
      <OrderList
        title="You won"
        items={orders.filter((o) => o.role === "buyer")}
        empty="No wins yet."
        browse
      />
      <OrderList
        title="You sold"
        items={orders.filter((o) => o.role === "seller")}
        empty="No sales yet."
      />
    </div>
  );
}

function OrderList({
  title,
  items,
  empty,
  browse = false,
}: {
  title: string;
  items: OrderListItem[];
  empty: string;
  browse?: boolean;
}) {
  const id = `orders-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="font-display text-lg font-bold">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-brand-ink-muted">
          {empty}{" "}
          {browse ? (
            <Link href="/" className="font-semibold text-brand-navy underline underline-offset-4">
              See what&apos;s up for grabs
            </Link>
          ) : null}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-line">
          {items.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex items-center gap-3 py-3">
                {o.coverKey ? (
                  // eslint-disable-next-line @next/next/no-img-element -- CDN-sized storage URLs
                  <img
                    src={listingPhotoUrl(o.coverKey, "thumb", { square: true })}
                    alt=""
                    className="size-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span className="size-14 shrink-0 rounded-lg bg-brand-sand" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-brand-navy">{o.title}</span>
                  <span className="block text-sm text-brand-ink-muted">
                    {o.kind === "free_claim"
                      ? "Free"
                      : formatCents(o.role === "buyer" ? o.totalCents : o.priceCents)}{" "}
                    · {orderStatusLine(o.role, o.status)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
