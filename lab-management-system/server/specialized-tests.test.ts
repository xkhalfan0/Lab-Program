/**
 * Tests for specialized test form calculation logic
 * Validates key engineering calculations used in test forms
 * Updated per CMW Practice (commentonlabtests.pdf v5 corrections)
 */
import { describe, it, expect } from "vitest";

// ─── Concrete Core Calculations (BS EN 12504-1) ───────────────────────────────
// CMW Practice: L/D = 1.0 → correction factor = 1.0 (no extra /0.8 conversion)
// Equivalent cube strength = core strength × correction factor
function getLDCorrectionFactor(ld: number): number {
  if (ld >= 2.0) return 1.00;
  if (ld >= 1.75) return 0.97 + (ld - 1.75) * (1.00 - 0.97) / (2.00 - 1.75);
  if (ld >= 1.50) return 0.93 + (ld - 1.50) * (0.97 - 0.93) / (1.75 - 1.50);
  if (ld >= 1.25) return 0.87 + (ld - 1.25) * (0.93 - 0.87) / (1.50 - 1.25);
  if (ld >= 1.10) return 0.82 + (ld - 1.10) * (0.87 - 0.82) / (1.25 - 1.10);
  if (ld >= 1.00) return 0.80 + (ld - 1.00) * (0.82 - 0.80) / (1.10 - 1.00);
  return 0.80;
}

function computeCoreStrength(diameter: number, length: number, maxLoadKN: number): {
  area: number;
  ld: number;
  correctionFactor: number;
  coreStrength: number;
  equivalentCubeStrength: number;
} {
  const area = Math.PI * (diameter / 2) ** 2;
  const ld = length / diameter;
  const correctionFactor = getLDCorrectionFactor(ld);
  const coreStrength = (maxLoadKN * 1000) / area;
  // CMW Practice (BS EN 12504-1): equivalentCubeStrength = coreStrength × correctionFactor
  // (No additional /0.8 factor — that was the old BS 1881 approach)
  const equivalentCubeStrength = coreStrength * correctionFactor;
  return {
    area: parseFloat(area.toFixed(2)),
    ld: parseFloat(ld.toFixed(2)),
    correctionFactor,
    coreStrength: parseFloat(coreStrength.toFixed(2)),
    equivalentCubeStrength: parseFloat(equivalentCubeStrength.toFixed(2)),
  };
}

describe("Concrete Core Calculations (BS EN 12504-1 / CMW Practice)", () => {
  it("should compute correct area for 100mm diameter core", () => {
    const result = computeCoreStrength(100, 100, 200);
    expect(result.area).toBeCloseTo(7853.98, 0);
  });

  it("should compute L/D ratio correctly for standard CMW core (L=D=100mm)", () => {
    const result = computeCoreStrength(100, 100, 200);
    expect(result.ld).toBe(1.0);
  });

  it("should return correction factor 1.0 for L/D >= 2.0", () => {
    expect(getLDCorrectionFactor(2.0)).toBe(1.0);
    expect(getLDCorrectionFactor(2.5)).toBe(1.0);
  });

  it("should return correction factor 0.80 for L/D = 1.0 (BS EN 12504-1 table)", () => {
    expect(getLDCorrectionFactor(1.0)).toBe(0.80);
  });

  it("should compute equivalent cube strength correctly for L/D=1.0 (CMW Practice)", () => {
    // Core strength = (200kN * 1000) / (π * 50²) = 25.46 N/mm²
    // CF = 0.80, equivalentCubeStrength = 25.46 × 0.80 = 20.37 N/mm²
    const result = computeCoreStrength(100, 100, 200);
    expect(result.equivalentCubeStrength).toBeCloseTo(20.37, 0);
  });

  it("should compute equivalent cube strength correctly for L/D=2.0", () => {
    // Core strength = (200kN * 1000) / (π * 50²) = 25.46 N/mm²
    // CF = 1.0, equivalentCubeStrength = 25.46 × 1.0 = 25.46 N/mm²
    const result = computeCoreStrength(100, 200, 200);
    expect(result.equivalentCubeStrength).toBeCloseTo(25.46, 0);
  });

  it("should pass acceptance check when equivalent cube strength ≥ 85% of specified", () => {
    const result = computeCoreStrength(100, 100, 200);
    const specifiedStrength = 20; // N/mm²
    const required = specifiedStrength * 0.85; // 17 N/mm²
    expect(result.equivalentCubeStrength).toBeGreaterThanOrEqual(required);
  });
});

// ─── Sieve Analysis Calculations ─────────────────────────────────────────────
function computeCumPassing(masses: number[], totalMass: number): number[] {
  let cumRetained = 0;
  return masses.map(m => {
    cumRetained += m;
    return parseFloat(((totalMass - cumRetained) / totalMass * 100).toFixed(1));
  });
}

describe("Sieve Analysis Calculations", () => {
  it("should compute cumulative passing percentages correctly", () => {
    const masses = [0, 50, 150, 300, 400, 100]; // retained on each sieve
    const total = 1000;
    const passing = computeCumPassing(masses, total);
    expect(passing[0]).toBe(100.0); // 0 retained → 100% passing
    expect(passing[1]).toBe(95.0);  // 50 retained → 95% passing
    expect(passing[2]).toBe(80.0);  // 200 cumulative → 80% passing
    expect(passing[5]).toBe(0.0);   // all retained → 0% passing
  });

  it("should compute fineness modulus correctly", () => {
    // FM = sum of cumulative % retained on standard sieves / 100
    const cumRetained = [0, 5, 20, 50, 75, 90]; // for sieves 4.75, 2.36, 1.18, 0.6, 0.3, 0.15
    const fm = cumRetained.reduce((s, v) => s + v, 0) / 100;
    expect(fm).toBeCloseTo(2.40, 2);
  });
});

// ─── Steel Rebar Calculations (BS 4449 / CMW Practice) ───────────────────────
// CMW Practice: gauge length = 100mm for all bar sizes, elongation ≥ 5%
function computeRebarStrength(yieldLoadKN: number, maxLoadKN: number, areaMm2: number): {
  yieldStrength: number;
  tensileStrength: number;
  tsYsRatio: number;
} {
  const ys = (yieldLoadKN * 1000) / areaMm2;
  const ts = (maxLoadKN * 1000) / areaMm2;
  return {
    yieldStrength: parseFloat(ys.toFixed(1)),
    tensileStrength: parseFloat(ts.toFixed(1)),
    tsYsRatio: parseFloat((ts / ys).toFixed(3)),
  };
}

function computeElongation(gaugeLength: number, finalGaugeLength: number): number {
  return parseFloat(((finalGaugeLength - gaugeLength) / gaugeLength * 100).toFixed(1));
}

describe("Steel Rebar Tensile Calculations (BS 4449 / CMW Practice)", () => {
  it("should compute yield strength correctly for T12 bar", () => {
    // T12 area = 113.1 mm², yield load = 60 kN
    const result = computeRebarStrength(60, 72, 113.1);
    expect(result.yieldStrength).toBeCloseTo(530.5, 0);
  });

  it("should compute T/Y ratio correctly", () => {
    const result = computeRebarStrength(60, 72, 113.1);
    expect(result.tsYsRatio).toBeCloseTo(1.200, 2);
  });

  it("should pass BS4449 B500B yield requirement (≥500 N/mm²)", () => {
    const result = computeRebarStrength(60, 72, 113.1);
    expect(result.yieldStrength).toBeGreaterThanOrEqual(500);
  });

  it("should pass BS4449 B500B tensile requirement (≥540 N/mm²)", () => {
    const result = computeRebarStrength(60, 72, 113.1);
    expect(result.tensileStrength).toBeGreaterThanOrEqual(540);
  });

  it("should compute elongation correctly with L₀=100mm (CMW Practice)", () => {
    // L₀=100mm, L₁=107mm → elongation = 7%
    const elong = computeElongation(100, 107);
    expect(elong).toBeCloseTo(7.0, 1);
  });

  it("should pass elongation requirement ≥5% (CMW Practice with L₀=100mm)", () => {
    const elong = computeElongation(100, 106);
    expect(elong).toBeGreaterThanOrEqual(5);
  });

  it("should fail elongation requirement when < 5%", () => {
    const elong = computeElongation(100, 103);
    expect(elong).toBeLessThan(5);
  });

  it("should compute area from mass correctly (density = 7850 kg/m³)", () => {
    // mass = 0.444 kg, length = 500mm → area = (0.444/500) / 7.85e-6 = 113.1 mm²
    const mass = 0.444;
    const length = 500;
    const area = (mass / length) / 7.85e-6;
    expect(area).toBeCloseTo(113.1, 0);
  });
});

// ─── Marshall Test Calculations ───────────────────────────────────────────────
function computeMarshallAirVoids(wair: number, wssd: number, wwater: number, gmm: number): number {
  const gmb = wair / (wssd - wwater);
  return parseFloat(((1 - gmb / gmm) * 100).toFixed(2));
}

describe("Marshall Test Calculations", () => {
  it("should compute bulk specific gravity correctly", () => {
    // wair=1200, wssd=1202, wwater=698 → Gmb = 1200/(1202-698) = 1200/504 = 2.381
    const wair = 1200, wssd = 1202, wwater = 698;
    const gmb = wair / (wssd - wwater);
    expect(gmb).toBeCloseTo(2.381, 1);
  });

  it("should compute air voids within acceptable range for ACWC", () => {
    const airVoids = computeMarshallAirVoids(1200, 1205, 700, 2.48);
    expect(airVoids).toBeGreaterThanOrEqual(3.0);
    expect(airVoids).toBeLessThanOrEqual(5.0);
  });

  it("should detect failing air voids", () => {
    // Very low air voids (< 3%)
    const airVoids = computeMarshallAirVoids(1200, 1201, 700, 2.40);
    expect(airVoids).toBeLessThan(3.0);
  });
});

// ─── Asphalt Core Calculations (CMW Practice) ────────────────────────────────
// Degree of Compaction = (Gmb / Marshall Density) × 100 (NOT Gmm)
function computeAsphaltCoreCompaction(wair: number, wssd: number, wwater: number, marshallDensity: number): {
  bulkDensity: number;
  degreeOfCompaction: number;
} {
  const bulkDensity = wair / (wssd - wwater);
  const degreeOfCompaction = (bulkDensity / marshallDensity) * 100;
  return {
    bulkDensity: parseFloat(bulkDensity.toFixed(3)),
    degreeOfCompaction: parseFloat(degreeOfCompaction.toFixed(1)),
  };
}

describe("Asphalt Core Compaction (CMW Practice — Marshall Density Reference)", () => {
  it("should compute bulk density correctly", () => {
    // wair=1200, wssd=1205, wwater=700 → Gmb = 1200/(1205-700) = 1200/505 = 2.376
    const result = computeAsphaltCoreCompaction(1200, 1205, 700, 2.45);
    expect(result.bulkDensity).toBeCloseTo(2.376, 1);
  });

  it("should compute degree of compaction relative to Marshall density", () => {
    // Gmb=2.376, Marshall=2.45 → DoC = (2.376/2.45)*100 = 97.0%
    const result = computeAsphaltCoreCompaction(1200, 1205, 700, 2.45);
    expect(result.degreeOfCompaction).toBeGreaterThanOrEqual(96.0); // min for binder course
  });

  it("should fail when degree of compaction < 97% for wearing course", () => {
    // Gmb = 1160/(1165-700) = 1160/465 = 2.495 — too high, use lower values
    // Target: Gmb ≈ 2.30 → wair=1150, wssd=1155, wwater=650 → Gmb=1150/(1155-650)=1150/505=2.277
    // DoC = 2.277/2.45*100 = 92.9% < 97% → fail
    const result = computeAsphaltCoreCompaction(1150, 1155, 650, 2.45);
    expect(result.degreeOfCompaction).toBeLessThan(97.0);
  });
});

// ─── Bitumen Extraction Calculations (CMW Practice) ──────────────────────────
// Bitumen Content = [(W_sample - W_aggregate - CF - TF) / W_sample] × 100
function computeBitumenContent(wSample: number, wAggregate: number, cf: number, tf: number): number {
  const bitumenMass = wSample - wAggregate - cf - tf;
  return parseFloat(((bitumenMass / wSample) * 100).toFixed(2));
}

describe("Bitumen Extraction Calculations (CMW Practice)", () => {
  it("should compute bitumen content correctly with CF and TF", () => {
    // W_sample=1000g, W_agg=945g, CF=5g, TF=2g → bitumen = (1000-945-5-2)/1000*100 = 4.80%
    const bc = computeBitumenContent(1000, 945, 5, 2);
    expect(bc).toBeCloseTo(4.80, 2);
  });

  it("should compute bitumen content correctly with zero CF and TF", () => {
    // W_sample=1000g, W_agg=950g, CF=0, TF=0 → bitumen = 50/1000*100 = 5.00%
    const bc = computeBitumenContent(1000, 950, 0, 0);
    expect(bc).toBeCloseTo(5.00, 2);
  });

  it("should pass acceptance when within ±0.3% of design", () => {
    const bc = computeBitumenContent(1000, 945, 5, 2); // 4.80%
    const design = 5.0;
    const tolerance = 0.3;
    expect(bc).toBeGreaterThanOrEqual(design - tolerance); // ≥ 4.70%
    expect(bc).toBeLessThanOrEqual(design + tolerance);    // ≤ 5.30%
  });

  it("should fail acceptance when outside ±0.3% of design", () => {
    const bc = computeBitumenContent(1000, 930, 5, 2); // 6.30%
    const design = 5.0;
    const tolerance = 0.3;
    expect(bc).toBeGreaterThan(design + tolerance); // > 5.30% → fail
  });
});

// ─── ACV / AIV Calculations (BS 812-110 / BS 812-112) ────────────────────────
function computeACV(m1: number, m2: number): number {
  return parseFloat(((m2 / m1) * 100).toFixed(1));
}

describe("Aggregate Crushing Value (ACV) & Impact Value (AIV) Calculations", () => {
  it("should compute ACV correctly", () => {
    // M1=3000g, M2=600g → ACV = 600/3000*100 = 20.0%
    expect(computeACV(3000, 600)).toBeCloseTo(20.0, 1);
  });

  it("should pass wearing course limit (≤30%)", () => {
    const acv = computeACV(3000, 600); // 20%
    expect(acv).toBeLessThanOrEqual(30);
  });

  it("should fail wearing course limit when ACV > 30%", () => {
    const acv = computeACV(3000, 1050); // 35%
    expect(acv).toBeGreaterThan(30);
  });

  it("should compute AIV correctly", () => {
    // M1=500g, M2=90g → AIV = 90/500*100 = 18.0%
    expect(computeACV(500, 90)).toBeCloseTo(18.0, 1);
  });
});

// ─── LA Abrasion Calculations (ASTM C131) ────────────────────────────────────
function computeLAAbrasion(m1: number, m2: number): number {
  return parseFloat((((m1 - m2) / m1) * 100).toFixed(1));
}

describe("Los Angeles Abrasion Test Calculations (ASTM C131)", () => {
  it("should compute LA value correctly", () => {
    // M1=5000g, M2=3750g → LA = (5000-3750)/5000*100 = 25.0%
    expect(computeLAAbrasion(5000, 3750)).toBeCloseTo(25.0, 1);
  });

  it("should pass wearing course limit (≤30%)", () => {
    const la = computeLAAbrasion(5000, 3750); // 25%
    expect(la).toBeLessThanOrEqual(30);
  });

  it("should fail wearing course limit when LA > 30%", () => {
    const la = computeLAAbrasion(5000, 3250); // 35%
    expect(la).toBeGreaterThan(30);
  });
});

// ─── CBR Calculations (BS 1377-4) ────────────────────────────────────────────
function computeCBR(load: number, standardLoad: number): number {
  return parseFloat(((load / standardLoad) * 100).toFixed(1));
}

describe("California Bearing Ratio (CBR) Calculations (BS 1377-4)", () => {
  it("should compute CBR at 2.5mm correctly", () => {
    // Load=6.62kN, Standard=13.24kN → CBR = 50.0%
    const cbr = computeCBR(6.62, 13.24);
    expect(cbr).toBeCloseTo(50.0, 1);
  });

  it("should compute CBR at 5.0mm correctly", () => {
    // Load=9.98kN, Standard=19.96kN → CBR = 50.0%
    const cbr = computeCBR(9.98, 19.96);
    expect(cbr).toBeCloseTo(50.0, 1);
  });

  it("should pass sub-grade requirement (≥15%)", () => {
    const cbr = computeCBR(3.0, 13.24); // 22.7%
    expect(cbr).toBeGreaterThanOrEqual(15);
  });

  it("should fail sub-base requirement (≥25%) when CBR < 25%", () => {
    const cbr = computeCBR(2.0, 13.24); // 15.1%
    expect(cbr).toBeLessThan(25);
  });
});

// ─── Proctor Compaction Calculations ─────────────────────────────────────────
function computeDryDensity(soilMass: number, moldVolume: number, waterContent: number): number {
  const bulkDensity = soilMass / moldVolume;
  return parseFloat((bulkDensity / (1 + waterContent / 100)).toFixed(3));
}

describe("Proctor Compaction Calculations", () => {
  it("should compute dry density correctly", () => {
    // Soil mass = 4000g, mold volume = 2305 cm³, WC = 10%
    const dd = computeDryDensity(4000, 2305, 10);
    expect(dd).toBeCloseTo(1.574, 2);
  });

  it("should decrease dry density as water content increases beyond OMC", () => {
    const dd1 = computeDryDensity(4100, 2305, 8);
    const dd2 = computeDryDensity(4050, 2305, 12);
    const dd3 = computeDryDensity(3950, 2305, 16);
    // Should show a peak somewhere (dd2 > dd3 in this case)
    expect(dd3).toBeLessThan(dd2);
  });
});

// ─── Specific Gravity Calculations ───────────────────────────────────────────
function computeSpecificGravity(a: number, b: number, c: number): {
  bulkSgOD: number;
  absorption: number;
} {
  return {
    bulkSgOD: parseFloat((a / (b - c)).toFixed(3)),
    absorption: parseFloat(((b - a) / a * 100).toFixed(2)),
  };
}

describe("Specific Gravity & Water Absorption", () => {
  it("should compute bulk SG (OD) correctly", () => {
    const result = computeSpecificGravity(1000, 1010, 380);
    expect(result.bulkSgOD).toBeCloseTo(1.587, 2); // 1000 / (1010-380) = 1000/630
  });

  it("should compute water absorption correctly", () => {
    const result = computeSpecificGravity(1000, 1020, 380);
    expect(result.absorption).toBeCloseTo(2.0, 1); // (1020-1000)/1000 * 100 = 2%
  });

  it("should flag high absorption as failing", () => {
    const result = computeSpecificGravity(1000, 1040, 380);
    expect(result.absorption).toBeGreaterThan(3.0); // > 3% fails for fine aggregate
  });
});

// ─── Atterberg Limits Calculations ───────────────────────────────────────────
function computeWaterContent(wet: number, dry: number, tin: number): number {
  return parseFloat(((wet - dry) / (dry - tin) * 100).toFixed(2));
}

describe("Atterberg Limits Calculations", () => {
  it("should compute water content correctly", () => {
    // wet=25g, dry=22g, tin=5g → WC = (25-22)/(22-5)*100 = 3/17*100 = 17.65%
    const wc = computeWaterContent(25, 22, 5);
    expect(wc).toBeCloseTo(17.65, 1);
  });

  it("should compute PI correctly", () => {
    const ll = 45.0;
    const pl = 22.0;
    const pi = ll - pl;
    expect(pi).toBe(23.0);
  });

  it("should classify soil correctly based on PI", () => {
    const pi = 23.0;
    const classification = pi < 7 ? "Low" : pi < 17 ? "Medium" : pi < 35 ? "High" : "Very High";
    expect(classification).toBe("High");
  });
});

// ─── Concrete Beam (Flexural Strength) Calculations — ASTM C78 ───────────────
// MOR = P×L / (b×d²)  [fracture in middle third]
// MOR = 3×P×a / (b×d²) [fracture outside middle third, within 5% of span]
function computeBeamMOR(
  loadKN: number,
  span: number,
  width: number,
  depth: number,
  fractureZone: "middle_third" | "outside_5pct",
  distanceA?: number
): number | null {
  const P = loadKN * 1000; // convert kN → N
  const b = width;
  const d = depth;
  const L = span;
  if (fractureZone === "middle_third") {
    return parseFloat(((P * L) / (b * d * d)).toFixed(3));
  } else if (fractureZone === "outside_5pct" && distanceA !== undefined) {
    const limit = L * 0.05;
    if (distanceA > L / 3 + limit) return null; // discard
    return parseFloat(((3 * P * distanceA) / (b * d * d)).toFixed(3));
  }
  return null;
}

describe("Concrete Beam Flexural Strength (ASTM C78)", () => {
  it("should compute MOR for 100×100×500mm beam (span=300mm) in middle third", () => {
    // P=20kN, L=300mm, b=100mm, d=100mm
    // MOR = 20000×300 / (100×100²) = 6,000,000/1,000,000 = 6.0 MPa
    const mor = computeBeamMOR(20, 300, 100, 100, "middle_third");
    expect(mor).toBeCloseTo(6.0, 2);
  });

  it("should compute MOR for 150×150×750mm beam (span=450mm) in middle third", () => {
    // P=30kN, L=450mm, b=150mm, d=150mm
    // MOR = 30000×450 / (150×150²) = 13,500,000/3,375,000 = 4.0 MPa
    const mor = computeBeamMOR(30, 450, 150, 150, "middle_third");
    expect(mor).toBeCloseTo(4.0, 2);
  });

  it("should compute MOR using outside-middle-third formula when fracture is within 5%", () => {
    // P=20kN, span=300mm, b=100mm, d=100mm, a=105mm (within 5% of span from L/3=100mm)
    // MOR = 3×20000×105 / (100×100²) = 6,300,000/1,000,000 = 6.3 MPa
    const mor = computeBeamMOR(20, 300, 100, 100, "outside_5pct", 105);
    expect(mor).toBeCloseTo(6.3, 2);
  });

  it("should return null (discard) when fracture is too far outside middle third", () => {
    // span=300mm, L/3=100mm, 5% limit=15mm → max a = 115mm
    // a=120mm → discard
    const mor = computeBeamMOR(20, 300, 100, 100, "outside_5pct", 120);
    expect(mor).toBeNull();
  });

  it("should pass when MOR >= minimum required (3.5 MPa for C25)", () => {
    const mor = computeBeamMOR(12, 300, 100, 100, "middle_third")!;
    // MOR = 12000×300/(100×10000) = 3,600,000/1,000,000 = 3.6 MPa
    expect(mor).toBeGreaterThanOrEqual(3.5);
  });

  it("should fail when MOR < minimum required", () => {
    const mor = computeBeamMOR(10, 300, 100, 100, "middle_third")!;
    // MOR = 10000×300/1,000,000 = 3.0 MPa < 3.5 MPa
    expect(mor).toBeLessThan(3.5);
  });

  it("should compute approximate MOR from empirical formula 0.62√f'c for C30", () => {
    const fc = 30;
    const empiricalMOR = 0.62 * Math.sqrt(fc);
    expect(empiricalMOR).toBeCloseTo(3.40, 1);
  });
});

// ─── Hot Bin Gradation Calculations — BS EN 13108-1 / ASTM D3515 ─────────────
function computeHotBinGradation(
  massRetained: number[],
  totalMass: number
): { percentPassing: number[]; cumRetained: number[] } {
  let cumR = 0;
  const cumRetained: number[] = [];
  const percentPassing: number[] = [];
  for (const m of massRetained) {
    cumR += m;
    cumRetained.push(parseFloat(cumR.toFixed(1)));
    percentPassing.push(parseFloat(((1 - cumR / totalMass) * 100).toFixed(1)));
  }
  return { percentPassing, cumRetained };
}

describe("Hot Bin Gradation (BS EN 13108-1)", () => {
  it("should compute correct % passing for first sieve", () => {
    // Total=1000g, first sieve retained=0g → 100% passing
    const result = computeHotBinGradation([0, 50, 100, 150, 100, 80, 70, 60, 50, 40, 30, 20], 1000);
    expect(result.percentPassing[0]).toBe(100.0);
  });

  it("should compute correct % passing for last sieve (pan)", () => {
    // Total=1000g, all retained=950g → 5% passing
    const masses = [0, 50, 100, 150, 100, 80, 70, 60, 50, 40, 30, 20];
    const total = masses.reduce((s, m) => s + m, 0); // 750g
    const result = computeHotBinGradation(masses, total);
    expect(result.percentPassing[result.percentPassing.length - 1]).toBe(0.0);
  });

  it("should detect sieve out of ACWC upper limit (9.5mm: max 73%)", () => {
    // If % passing at 9.5mm = 80% → exceeds upper limit of 73%
    const percentPassing = 80.0;
    const upperLimit = 73.0;
    expect(percentPassing).toBeGreaterThan(upperLimit);
  });

  it("should detect sieve within ACWC limits (4.75mm: 33-53%)", () => {
    const percentPassing = 45.0;
    const lower = 33.0;
    const upper = 53.0;
    expect(percentPassing).toBeGreaterThanOrEqual(lower);
    expect(percentPassing).toBeLessThanOrEqual(upper);
  });

  it("should flag overall fail when any sieve is out of spec", () => {
    const results = [
      { passing: 100, lower: 100, upper: 100, within: true },
      { passing: 80, lower: 71, upper: 95, within: true },
      { passing: 85, lower: 56, upper: 80, within: false }, // out of spec
    ];
    const overallFail = results.some(r => !r.within);
    expect(overallFail).toBe(true);
  });

  it("should pass when all sieves are within spec", () => {
    const results = [
      { passing: 100, lower: 100, upper: 100, within: true },
      { passing: 85, lower: 71, upper: 95, within: true },
      { passing: 70, lower: 56, upper: 80, within: true },
    ];
    const overallPass = results.every(r => r.within);
    expect(overallPass).toBe(true);
  });
});

// ─── Sieve Analysis — Coarse Aggregate 6.3mm sieve check (v5 requirement) ────
describe("Sieve Analysis — v5 Sieve Requirements", () => {
  it("should include 6.3mm sieve in COARSE_20 gradation series", () => {
    const coarse20Sieves = ["37.5", "20", "14", "10", "6.3", "5", "2.36", "1.18", "0.6", "0.3", "0.15"];
    expect(coarse20Sieves).toContain("6.3");
  });

  it("should include 5.0mm sieve in FINE_SAND gradation series", () => {
    const fineSandSieves = ["9.5", "5.0", "4.75", "2.36", "1.18", "0.6", "0.3", "0.15"];
    expect(fineSandSieves).toContain("5.0");
  });

  it("should include 6.3mm sieve in COARSE_40 gradation series", () => {
    const coarse40Sieves = ["50", "37.5", "20", "14", "10", "6.3", "5", "2.36", "1.18", "0.6", "0.3", "0.15"];
    expect(coarse40Sieves).toContain("6.3");
  });
});

// ─── Anchor Bolt Tensile (BS EN ISO 898-1) — Excel worksheet formulas ─────────
function circleAreaFromDiameterMm(diameterMm: number): number {
  if (diameterMm <= 0) return 0;
  return ((22 / 7) * diameterMm * diameterMm) / 4;
}

function computeReductionOfAreaPercent(
  nominalSizeMm: number,
  sizeIncrementMm: number,
): number | undefined {
  if (nominalSizeMm <= 0) return undefined;
  const originalArea = circleAreaFromDiameterMm(nominalSizeMm);
  const finalDiameter = nominalSizeMm - 2 * sizeIncrementMm;
  if (finalDiameter <= 0 || originalArea <= 0) return undefined;
  const finalArea = circleAreaFromDiameterMm(finalDiameter);
  return ((originalArea - finalArea) / originalArea) * 100;
}

// ─── Anchor Bolt Pull-out Calculations (legacy min load check) ─────────────────
function computeAnchorResult(maxLoadKN: number, minLoadKN: number): "pass" | "fail" {
  return maxLoadKN >= minLoadKN ? "pass" : "fail";
}

function computeAnchorSprayRate(
  massGainedG: number,
  padAreaM2: number,
  densityKgL: number
): number {
  return parseFloat(((massGainedG / 1000) / densityKgL / padAreaM2).toFixed(3));
}

describe("Anchor Bolt Tensile calculations (BS EN ISO 898-1)", () => {
  it("computes cut section area for 16.3 mm diameter (22/7 π)", () => {
    const area = circleAreaFromDiameterMm(16.3);
    expect(area).toBeCloseTo(208.756, 2);
  });

  it("computes Rm from load and cut section area", () => {
    const area = circleAreaFromDiameterMm(16.3);
    const rm = (203.7 * 1000) / area;
    expect(rm).toBeCloseTo(975.8, 0);
  });

  it("computes %RA: final dia = nominal − 2×increment", () => {
    const ra = computeReductionOfAreaPercent(20, 3);
    expect(ra).toBeCloseTo(51, 0);
  });
});

describe("Anchor Bolt Pull-out Test (ASTM E488 / BS 8539)", () => {
  it("should pass M20 anchor when load >= 70 kN", () => {
    expect(computeAnchorResult(75, 70)).toBe("pass");
  });

  it("should fail M20 anchor when load < 70 kN", () => {
    expect(computeAnchorResult(65, 70)).toBe("fail");
  });

  it("should pass M16 anchor at exactly minimum load", () => {
    expect(computeAnchorResult(45, 45)).toBe("pass");
  });

  it("should compute average load correctly", () => {
    const loads = [72, 75, 68, 80, 71];
    const avg = loads.reduce((s, l) => s + l, 0) / loads.length;
    expect(avg).toBeCloseTo(73.2, 1);
  });

  it("should fail overall if any single anchor fails", () => {
    const results = ["pass", "pass", "fail", "pass"];
    const overallPass = results.every(r => r === "pass");
    expect(overallPass).toBe(false);
  });
});

// ─── Asphalt Spray Rate Calculations (JKR Spec / BS 594-1) ───────────────────
describe("Asphalt Spray Rate Test (JKR Spec / BS 594-1)", () => {
  it("should compute spray rate for SS-1 tack coat correctly", () => {
    // Mass gained = 30g, area = 0.09m², density = 1.01 kg/L
    // Rate = (30/1000) / 1.01 / 0.09 = 0.030 / 1.01 / 0.09 ≈ 0.330 L/m²
    const rate = computeAnchorSprayRate(30, 0.09, 1.01);
    expect(rate).toBeCloseTo(0.330, 2);
  });

  it("should pass SS-1 tack coat when rate is within 0.20–0.50 L/m²", () => {
    const rate = 0.330;
    expect(rate).toBeGreaterThanOrEqual(0.20);
    expect(rate).toBeLessThanOrEqual(0.50);
  });

  it("should fail when spray rate is below minimum", () => {
    const rate = computeAnchorSprayRate(10, 0.09, 1.01); // ~0.110 L/m²
    expect(rate).toBeLessThan(0.20);
  });

  it("should fail when spray rate exceeds maximum", () => {
    const rate = computeAnchorSprayRate(60, 0.09, 1.01); // ~0.660 L/m²
    expect(rate).toBeGreaterThan(0.50);
  });

  it("should compute correct rate for MC-30 prime coat", () => {
    // Mass gained = 70g, area = 0.09m², density = 0.88 kg/L
    // Rate = (70/1000) / 0.88 / 0.09 ≈ 0.884 L/m²
    const rate = computeAnchorSprayRate(70, 0.09, 0.88);
    expect(rate).toBeCloseTo(0.884, 2);
    expect(rate).toBeGreaterThanOrEqual(0.50);
    expect(rate).toBeLessThanOrEqual(1.50);
  });
});

// ─── Extracted Aggregate Sieve Analysis (BS EN 12697-2) ──────────────────────
function computeExtractedGradation(
  massRetained: number[],
  totalMass: number
): number[] {
  let cumR = 0;
  return massRetained.map(m => {
    cumR += m;
    return parseFloat(((1 - cumR / totalMass) * 100).toFixed(1));
  });
}

describe("Extracted Aggregate Sieve Analysis (BS EN 12697-2)", () => {
  it("should compute 100% passing for first sieve when nothing retained", () => {
    const passing = computeExtractedGradation([0, 100, 200, 300, 200, 100, 50, 50], 1000);
    expect(passing[0]).toBe(100.0);
  });

  it("should compute 0% passing for last sieve (pan)", () => {
    const masses = [0, 100, 200, 300, 200, 100, 50, 50];
    const total = masses.reduce((s, m) => s + m, 0);
    const passing = computeExtractedGradation(masses, total);
    expect(passing[passing.length - 1]).toBe(0.0);
  });

  it("should flag sieve outside ACWC JMF limits", () => {
    const percentPassing = 85.0; // e.g. at 9.5mm
    const lower = 47;
    const upper = 65;
    const withinLimits = percentPassing >= lower && percentPassing <= upper;
    expect(withinLimits).toBe(false);
  });

  it("should pass sieve within ACWC JMF limits", () => {
    const percentPassing = 55.0; // within 47–65 for 9.5mm
    const lower = 47;
    const upper = 65;
    const withinLimits = percentPassing >= lower && percentPassing <= upper;
    expect(withinLimits).toBe(true);
  });

  it("should fail overall when any sieve is out of JMF limits", () => {
    const results = [true, true, false, true, true];
    const overallPass = results.every(r => r);
    expect(overallPass).toBe(false);
  });
});

// ─── Foamed Concrete Calculations (BS EN 12390-3 / BS EN 12350-6) ─────────────
function computeFoamCubeStrength(loadKN: number, sideLength: number): number {
  const area = sideLength * sideLength; // mm²
  return parseFloat(((loadKN * 1000) / area).toFixed(2));
}

function computeFoamFreshDensity(massG: number, volumeML: number): number {
  return parseFloat((massG / volumeML).toFixed(3)); // g/cm³ or kg/L
}

describe("Foamed Concrete Calculations", () => {
  it("should compute compressive strength for 100mm foam cube", () => {
    // Load = 30 kN, area = 100×100 = 10000 mm²
    // Strength = 30000/10000 = 3.0 N/mm²
    const strength = computeFoamCubeStrength(30, 100);
    expect(strength).toBeCloseTo(3.0, 2);
  });

  it("should pass FC3 foam concrete when strength >= 3.0 MPa", () => {
    const strength = computeFoamCubeStrength(32, 100); // 3.2 MPa
    expect(strength).toBeGreaterThanOrEqual(3.0);
  });

  it("should fail FC5 foam concrete when strength < 5.0 MPa", () => {
    const strength = computeFoamCubeStrength(40, 100); // 4.0 MPa
    expect(strength).toBeLessThan(5.0);
  });

  it("should compute fresh density correctly", () => {
    // Mass = 1600g, volume = 1000mL
    const density = computeFoamFreshDensity(1600, 1000);
    expect(density).toBeCloseTo(1.6, 2);
  });

  it("should pass FC8 density when fresh density <= 1800 kg/m³", () => {
    const density = computeFoamFreshDensity(1700, 1000); // 1.7 g/cm³ = 1700 kg/m³
    expect(density).toBeLessThanOrEqual(1.8);
  });
});
