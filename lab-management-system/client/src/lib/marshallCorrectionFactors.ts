/** ASTM D 6927 stability correction factors by specimen volume (cm³). */
export const MARSHALL_CORRECTION_FACTORS: ReadonlyArray<{ volume: number; factor: number | null }> = [
  { volume: 0.001, factor: null },
  { volume: 200, factor: 5.56 },
  { volume: 213.5, factor: 5.0 },
  { volume: 225.5, factor: 4.55 },
  { volume: 237.5, factor: 4.17 },
  { volume: 250.5, factor: 3.85 },
  { volume: 264.5, factor: 3.57 },
  { volume: 278.5, factor: 3.33 },
  { volume: 289.5, factor: 3.03 },
  { volume: 301.5, factor: 2.78 },
  { volume: 316.5, factor: 2.5 },
  { volume: 328.5, factor: 2.27 },
  { volume: 340.5, factor: 2.08 },
  { volume: 353.5, factor: 1.92 },
  { volume: 367.5, factor: 1.79 },
  { volume: 379.5, factor: 1.67 },
  { volume: 392.5, factor: 1.56 },
  { volume: 405.5, factor: 1.47 },
  { volume: 420.5, factor: 1.39 },
  { volume: 431.5, factor: 1.32 },
  { volume: 443.5, factor: 1.25 },
  { volume: 456.5, factor: 1.19 },
  { volume: 470.5, factor: 1.14 },
  { volume: 482.5, factor: 1.09 },
  { volume: 495.5, factor: 1.04 },
  { volume: 508.5, factor: 1.0 },
  { volume: 522.5, factor: 0.96 },
  { volume: 535.5, factor: 0.93 },
  { volume: 546.5, factor: 0.89 },
  { volume: 559.5, factor: 0.86 },
  { volume: 573.5, factor: 0.83 },
  { volume: 585.5, factor: 0.81 },
  { volume: 598.5, factor: 0.78 },
  { volume: 610.5, factor: 0.76 },
  { volume: 625.001, factor: null },
];

/** LOOKUP-style: factor for the bracket containing `volume`. */
export function getMarshallCorrectionFactor(volume: number): number {
  if (volume <= 0.001 || volume >= 625.001) return 0;

  for (let i = 0; i < MARSHALL_CORRECTION_FACTORS.length - 1; i++) {
    const current = MARSHALL_CORRECTION_FACTORS[i];
    const next = MARSHALL_CORRECTION_FACTORS[i + 1];
    if (volume >= current.volume && volume < next.volume) {
      return current.factor ?? 0;
    }
  }

  return 0;
}
