/**
 * @format
 */

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(),
  },
}));

jest.mock("@react-native-community/geolocation", () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn((success: (p: unknown) => void) =>
      success({ coords: { latitude: -1.94, longitude: 29.87 } }),
    ),
  },
}));

jest.mock("@maplibre/maplibre-react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const MockMap = (props: object) => <View testID="maplibre-map-mock" {...props} />;
  return {
    __esModule: true,
    Map: MockMap,
    Camera: () => null,
    GeoJSONSource: ({ children }: { children?: unknown }) => <View>{children}</View>,
    Layer: () => null,
    Marker: ({ children }: { children?: unknown }) => <View>{children}</View>,
    UserLocation: () => null,
  };
});

import React from "react";
import ReactTestRenderer from "react-test-renderer";
import App from "../App";

test("renders correctly", async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
