import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

export type LatLng = { lat: number; lng: number };

/**
 * PostGIS geography point (WGS 84). PostGIS lives in the `extensions` schema on Supabase.
 * Distances on geography are in meters along the earth's surface.
 *
 * drizzle-kit quotes custom types as one identifier ("geography(Point,4326)"), which Postgres
 * rejects. After `pnpm db:generate`, replace it with extensions.geography(Point,4326) in the new
 * migration; src/db/migrations.test.ts fails until you do.
 */
export const geographyPoint = customType<{ data: LatLng; driverData: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
  toDriver(value) {
    return sql`extensions.st_setsrid(extensions.st_makepoint(${value.lng}, ${value.lat}), 4326)::extensions.geography`;
  },
  fromDriver(value) {
    return parsePointEwkb(value);
  },
});

/**
 * Postgres returns geography as hex EWKB. A 2D point with SRID is 25 bytes:
 * byte order (1) · type with SRID flag (4) · SRID (4) · x = lng (8) · y = lat (8).
 */
export function parsePointEwkb(hex: string): LatLng {
  const bytes = Buffer.from(hex, "hex");
  const littleEndian = bytes[0] === 1;
  const read32 = (o: number) => (littleEndian ? bytes.readUInt32LE(o) : bytes.readUInt32BE(o));
  const readDouble = (o: number) => (littleEndian ? bytes.readDoubleLE(o) : bytes.readDoubleBE(o));
  const type = read32(1);
  const hasSrid = (type & 0x20000000) !== 0;
  if ((type & 0xff) !== 1) throw new Error("Not a point");
  const offset = hasSrid ? 9 : 5;
  return { lng: readDouble(offset), lat: readDouble(offset + 8) };
}

/** Meters to miles. Distances shown to people are rounded to the mile (SPEC: privacy). */
export const METERS_PER_MILE = 1609.344;
