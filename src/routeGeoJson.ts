export type LatLngLike = { latitude: number; longitude: number };


export function lineStringToMapCoordinates(routePolyline: string | null | undefined): LatLngLike[] {
  if (!routePolyline?.trim()) return [];
  try {
    const parsed = JSON.parse(routePolyline) as { type?: string; coordinates?: unknown };
    if (parsed.type !== "LineString" || !Array.isArray(parsed.coordinates)) return [];
    return parsed.coordinates
      .filter(
        (c): c is [number, number] =>
          Array.isArray(c) && c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number",
      )
      .map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  } catch {
    return [];
  }
}
