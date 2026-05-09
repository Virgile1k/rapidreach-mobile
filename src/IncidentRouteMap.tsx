import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  type LayoutChangeEvent,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  UserLocation,
  type LngLatBounds,
} from "@maplibre/maplibre-react-native";

import { fetchMyIncidentRoute, UnauthorizedError, type IncidentRoutePayload } from "./api";
import { lineStringToMapCoordinates } from "./routeGeoJson";

const MAP_HEIGHT = 216;

const MAP_STYLE_URL = "https://demotiles.maplibre.org/style.json";

type Props = {
  token: string;
  incidentId: string;
  incidentLatitude: number;
  incidentLongitude: number;
  titleHint?: string;
};

function boundsFromLatLngs(
  points: { latitude: number; longitude: number }[],
): LngLatBounds | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.longitude);
    east = Math.max(east, p.longitude);
    south = Math.min(south, p.latitude);
    north = Math.max(north, p.latitude);
  }
  if (!Number.isFinite(west)) return null;
  const lonPad = Math.max(0.0006, (east - west) * 0.15);
  const latPad = Math.max(0.0006, (north - south) * 0.15);
  return [west - lonPad, south - latPad, east + lonPad, north + latPad];
}

export function IncidentRouteMap({ token, incidentId, incidentLatitude, incidentLongitude, titleHint }: Props) {
  const cameraRef = useRef<CameraRef>(null);
  const { width: windowWidth } = useWindowDimensions();
  const [mapBoxWidth, setMapBoxWidth] = useState(() => Math.max(1, Math.floor(windowWidth - 48)));
  const [route, setRoute] = useState<IncidentRoutePayload | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);

  const sourceSuffix = useMemo(() => incidentId.replace(/[^a-zA-Z0-9_-]/g, "_"), [incidentId]);

  const polylineCoords = useMemo(
    () => lineStringToMapCoordinates(route?.routePolyline ?? null),
    [route?.routePolyline],
  );

  const routeLineFeature = useMemo(() => {
    if (!route?.routePolyline?.trim()) return null;
    try {
      const geom = JSON.parse(route.routePolyline) as {
        type?: string;
        coordinates?: unknown;
      };
      if (geom.type !== "LineString" || !Array.isArray(geom.coordinates)) return null;
      return {
        type: "Feature" as const,
        properties: {} as Record<string, unknown>,
        geometry: {
          type: "LineString" as const,
          coordinates: geom.coordinates as [number, number][],
        },
      };
    } catch {
      return null;
    }
  }, [route?.routePolyline]);

  const fitCamera = useCallback(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    const pts = [
      { latitude: incidentLatitude, longitude: incidentLongitude },
      ...polylineCoords,
    ];
    const b = boundsFromLatLngs(pts);
    if (!b) return;
    cam.fitBounds(b, {
      duration: 420,
      easing: "ease",
      padding: { top: 32, right: 16, bottom: 36, left: 16 },
    });
  }, [incidentLatitude, incidentLongitude, polylineCoords]);

  useEffect(() => {
    let cancelled = false;
    setRoute(null);
    setRouteError(null);
    setRouteLoading(true);
    void (async () => {
      try {
        const r = await fetchMyIncidentRoute(token, incidentId);
        if (!cancelled) setRoute(r);
      } catch (e) {
        if (!cancelled) {
          setRoute(null);
          if (e instanceof UnauthorizedError) {
            setRouteError(e.message);
          }
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, incidentId]);

  useEffect(() => {
    const id = setTimeout(() => fitCamera(), 500);
    return () => clearTimeout(id);
  }, [fitCamera, route?.id, polylineCoords.length]);

  const etaLine =
    route?.etaMinutes != null && route.distanceKm != null
      ? `~${route.distanceKm.toFixed(1)} km · ~${Math.round(route.etaMinutes)} min (OSRM)`
      : route?.distanceKm != null
        ? `~${route.distanceKm.toFixed(1)} km (OSRM)`
        : null;

  const onMapBoxLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.floor(e.nativeEvent.layout.width);
    if (next > 0) {
      setMapBoxWidth((prev) => (prev === next ? prev : next));
    }
  }, []);

  const onMapLoaded = useCallback(() => {
    setTimeout(() => fitCamera(), 60);
  }, [fitCamera]);

  return (
    <View className="mt-3 rounded-2xl border border-white/10 bg-black/30" style={styles.mapShell}>
      <View
        collapsable={false}
        style={[styles.mapBox, { width: "100%", height: MAP_HEIGHT }]}
        onLayout={onMapBoxLayout}>
        {mapBoxWidth > 0 ? (
          <Map
            mapStyle={MAP_STYLE_URL}
            style={{ width: mapBoxWidth, height: MAP_HEIGHT }}
            touchRotate={false}
            touchPitch={false}
            compass={false}
            onDidFinishLoadingMap={onMapLoaded}>
            <Camera
              ref={cameraRef}
              initialViewState={{
                center: [incidentLongitude, incidentLatitude],
                zoom: 14,
              }}
            />
            {routeLineFeature ? (
              <GeoJSONSource id={`rr-route-src-${sourceSuffix}`} data={routeLineFeature}>
                <Layer
                  type="line"
                  id={`rr-route-line-${sourceSuffix}`}
                  paint={{
                    "line-color": "#6366f1",
                    "line-width": 4,
                  }}
                />
              </GeoJSONSource>
            ) : null}
            <Marker id={`rr-scene-${sourceSuffix}`} lngLat={[incidentLongitude, incidentLatitude]}>
              <View style={styles.scenePin} accessibilityLabel={titleHint ?? "Scene"} />
            </Marker>
            <UserLocation />
          </Map>
        ) : null}
      </View>

      <View className="flex-row flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/40 px-3 py-2">
        <Text className="text-[11px] leading-4 text-white/70">
          Red pin: caller / scene. Blue line: stored ambulance→scene route when dispatch computed it.
        </Text>
        {routeLoading ? (
          <ActivityIndicator color="#94a3b8" size="small" />
        ) : etaLine ? (
          <Text className="text-[11px] font-semibold text-indigo-200">{etaLine}</Text>
        ) : routeError ? (
          <Text className="max-w-[55%] text-end text-[10px] text-amber-200/90">{routeError}</Text>
        ) : (
          <Text className="text-[10px] text-white/45">No route yet</Text>
        )}
      </View>
      <Text className="border-t border-white/5 px-3 py-1.5 text-[10px] leading-4 text-white/40">
        Open map (MapLibre demo tiles) — no Google API key. Use your own style URL for production.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mapShell: {
    overflow: "hidden",
  },
  mapBox: {
    backgroundColor: "rgba(15, 23, 42, 0.6)",
  },
  scenePin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#dc2626",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
