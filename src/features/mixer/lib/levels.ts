import { clamp } from "@/shared/math";
export const level = (value: number) =>
  clamp(Number.isFinite(value) ? value : 0, 0, 1);
export const decibels = (value: number) => {
  if (value <= 0) return "−∞";
  const db = Math.round(20 * Math.log10(value));
  return `${db < 0 ? "−" : ""}${Math.abs(db)} dB`;
};
/** Amount removed by a sidechain, e.g. "−6 dB" (0 dB when not ducking). */
export function ducked(gain: number) {
  if (gain >= 0.995) return "0 dB";
  return `−${Math.round(-20 * Math.log10(Math.max(gain, 1e-6)))} dB`;
}
