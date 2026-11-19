export type ZipCentroid = { zip: string; lat: number; lng: number };

/** Parse the Census Gazetteer ZCTA file (pipe-delimited, header row, INTPTLAT/INTPTLONG). */
export function parseGazetteer(text: string): ZipCentroid[] {
  const [header, ...lines] = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const cols = (header ?? "").split("|").map((c) => c.trim());
  const zipCol = cols.indexOf("GEOID");
  const latCol = cols.indexOf("INTPTLAT");
  const lngCol = cols.indexOf("INTPTLONG");
  if (zipCol < 0 || latCol < 0 || lngCol < 0) throw new Error("Not a ZCTA Gazetteer file");
  return lines
    .map((line) => {
      const f = line.split("|");
      return { zip: f[zipCol]!.trim(), lat: Number(f[latCol]), lng: Number(f[lngCol]) };
    })
    .filter((r) => isValidCentroid(r))
    .sort((a, b) => a.zip.localeCompare(b.zip));
}

/** Parse the committed "zip,lat,lng" CSV. */
export function parseCentroidCsv(text: string): ZipCentroid[] {
  return text
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.trim() !== "")
    .map((line) => {
      const [zip, lat, lng] = line.split(",");
      return { zip: zip ?? "", lat: Number(lat), lng: Number(lng) };
    })
    .filter((r) => isValidCentroid(r));
}

function isValidCentroid(r: ZipCentroid): boolean {
  return (
    /^\d{5}$/.test(r.zip) &&
    Number.isFinite(r.lat) &&
    Number.isFinite(r.lng) &&
    Math.abs(r.lat) <= 90 &&
    Math.abs(r.lng) <= 180
  );
}
