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

import React from "react";
import ReactTestRenderer from "react-test-renderer";
import App from "../App";

test("renders correctly", async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
