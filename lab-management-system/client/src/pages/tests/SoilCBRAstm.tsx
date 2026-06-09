import { useCallback, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, ScatterChart, Scatter,
} from "recharts";
import {
  ASTM_PENETRATION_IN,
  ASTM_SPECIMEN_BLOWS,
  buildCbrDensityChartData,
  buildStressPenetrationChartData,
  computeAllAstmSpecimens,
  computeCbrAtMddPercentages,
  isLegacyAstmPenetrationLoads,
  normalizeAstmPenetrationLoads,
  mgToPcf,
  type AstmCBRSpecimenComputed,
  type AstmCBRSpecimenInput,
} from "@/lib/soilCBRAstm";
import { formatPenetrationDepth as fmtDepth } from "@/lib/soilCBR";

const CELL_IN = "bg-yellow-50";
const CELL_CALC = "bg-emerald-50";

interface SoilCBRAstmProps {
  ar: boolean;
  submitted: boolean;
  soilDescription: string;
  setSoilDescription: (v: string) => void;
  soakingPeriod: string;
  setSoakingPeriod: (v: string) => void;
  passing19_5: string;
  setPassing19_5: (v: string) => void;
  retained20mm?: number;
  mddStr: string;
  setMddStr: (v: string) => void;
  mddTouched: React.MutableRefObject<boolean>;
  mddOverride: boolean;
  setMddOverride: (v: boolean) => void;
  omcStr: string;
  setOmcStr: (v: string) => void;
  omcTouched: React.MutableRefObject<boolean>;
  proctorMdd?: number;
  proctorOmc?: number;
  specimens: AstmCBRSpecimenInput[];
  setSpecimens: React.Dispatch<React.SetStateAction<AstmCBRSpecimenInput[]>>;
  compactionMethod: string;
  setCompactionMethod: (v: string) => void;
  sampleCondition: string;
  setSampleCondition: (v: string) => void;
  surchargeLbf: string;
  setSurchargeLbf: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}

const L = (ar: boolean, en: string, ars: string) => (ar ? ars : en);
const fmtN = (v?: number | null, d = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

export function SoilCBRAstm({
  ar,
  submitted,
  soilDescription,
  setSoilDescription,
  soakingPeriod,
  setSoakingPeriod,
  passing19_5,
  setPassing19_5,
  retained20mm,
  mddStr,
  setMddStr,
  mddTouched,
  mddOverride,
  setMddOverride,
  omcStr,
  setOmcStr,
  omcTouched,
  proctorMdd,
  proctorOmc,
  specimens,
  setSpecimens,
  compactionMethod,
  setCompactionMethod,
  sampleCondition,
  setSampleCondition,
  surchargeLbf,
  setSurchargeLbf,
  notes,
  setNotes,
}: SoilCBRAstmProps) {
  const surchargeNum = parseFloat(surchargeLbf) || 10;
  const loadsSynced = useRef(false);
  useEffect(() => {
    if (loadsSynced.current) return;
    loadsSynced.current = true;
    setSpecimens(prev => {
      const needsFix = prev.some(s =>
        s.penetrationLoads.length !== ASTM_PENETRATION_IN.length
        || isLegacyAstmPenetrationLoads(s.penetrationLoads),
      );
      if (!needsFix) return prev;
      return prev.map(s => ({
        ...s,
        penetrationLoads: normalizeAstmPenetrationLoads(s.penetrationLoads),
      }));
    });
  }, [setSpecimens]);

  const computed = useMemo(
    () => computeAllAstmSpecimens(specimens, surchargeNum),
    [specimens, surchargeNum],
  );
  const mddNum = parseFloat(mddStr);
  const mddPcf = mddNum > 0 ? mgToPcf(mddNum) : null;
  const designCbr = useMemo(
    () => (mddNum > 0 ? computeCbrAtMddPercentages(computed, mddNum) : null),
    [computed, mddNum],
  );
  const stressChartData = useMemo(() => buildStressPenetrationChartData(computed), [computed]);
  const cbrDensityData = useMemo(() => buildCbrDensityChartData(computed), [computed]);
  const designCbrMarkers = useMemo(() => {
    if (!designCbr) return [];
    return [
      { pct: "95%", dryDensityPcf: designCbr.targetPcf95, cbr02: designCbr.cbr95, color: "#3b82f6" },
      { pct: "98%", dryDensityPcf: designCbr.targetPcf98, cbr02: designCbr.cbr98, color: "#10b981" },
      { pct: "100%", dryDensityPcf: designCbr.targetPcf100, cbr02: designCbr.cbr100, color: "#8b5cf6" },
    ].filter(m => m.dryDensityPcf > 0 && m.cbr02 != null);
  }, [designCbr]);
  const hasStressChart = stressChartData.length >= 2;
  const hasCbrChart = cbrDensityData.length >= 2;

  const updateSpecimen = useCallback((id: string, field: keyof AstmCBRSpecimenInput, value: string) => {
    setSpecimens(prev => prev.map(s => (s.id === id ? { ...s, [field]: value } : s)));
  }, [setSpecimens]);

  const updateLoad = useCallback((id: string, depthIdx: number, value: string) => {
    setSpecimens(prev => prev.map(s => {
      if (s.id !== id) return s;
      const loads = s.penetrationLoads.length === ASTM_PENETRATION_IN.length
        && !isLegacyAstmPenetrationLoads(s.penetrationLoads)
        ? [...s.penetrationLoads]
        : normalizeAstmPenetrationLoads(s.penetrationLoads);
      loads[depthIdx] = value;
      return { ...s, penetrationLoads: loads };
    }));
  }, [setSpecimens]);

  const labelCls = "border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 whitespace-nowrap";
  const inCls = "border border-slate-200 px-1 py-1";
  const calcCls = "border border-slate-200 px-2 py-1.5 text-center font-mono text-xs font-semibold";
  const inputCls = "h-7 text-xs text-center font-mono w-full min-w-[4rem]";

  const spByBlows = (b: number) => computed.find(s => s.blowsPerLayer === b);
  const mddLockedFromProctor = proctorMdd != null && !mddOverride && !submitted;

  return (
    <div className="space-y-6">
      {/* Reference parameters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{L(ar, "Test Parameters (ASTM D1883)", "معاملات الاختبار (ASTM D1883)")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-slate-500">{L(ar, "Soil Description", "وصف التربة")}</Label>
              <Input value={soilDescription} onChange={e => setSoilDescription(e.target.value)} className="h-9 mt-1" disabled={submitted} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">{L(ar, "Soaking Period (hrs)", "فترة النقع (ساعة)")}</Label>
              <Input value={soakingPeriod} onChange={e => setSoakingPeriod(e.target.value)} className="h-9 mt-1 font-mono" disabled={submitted} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">{L(ar, "Method of Compaction", "طريقة الدمك")}</Label>
              <Input value={compactionMethod} onChange={e => setCompactionMethod(e.target.value)} className="h-9 mt-1" disabled={submitted} placeholder="ASTM D1557" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">{L(ar, "Condition of Sample", "حالة العينة")}</Label>
              <Input value={sampleCondition} onChange={e => setSampleCondition(e.target.value)} className="h-9 mt-1" disabled={submitted} placeholder="Soaked" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">
                {L(ar, "MDD (Mg/m³)", "أقصى كثافة جافة (Mg/m³)")}
                {proctorMdd != null && !mddOverride && (
                  <span className="block text-[10px] font-normal text-emerald-600 mt-0.5">
                    {L(ar, "From Proctor test (auto-linked)", "من اختبار بروكتور (مرتبط تلقائياً)")}
                  </span>
                )}
              </Label>
              <div className="flex items-center gap-1 mt-1">
                <Input
                  value={mddStr}
                  readOnly={mddLockedFromProctor}
                  onChange={e => { mddTouched.current = true; setMddStr(e.target.value); }}
                  className={`h-9 font-mono flex-1 ${mddLockedFromProctor ? "bg-emerald-50 text-emerald-900 cursor-default" : ""}`}
                  disabled={submitted}
                />
                {!submitted && proctorMdd != null && (
                  mddOverride ? (
                    <button
                      type="button"
                      className="text-[10px] text-emerald-700 hover:underline whitespace-nowrap px-1"
                      onClick={() => {
                        setMddOverride(false);
                        mddTouched.current = false;
                        setMddStr(String(proctorMdd));
                      }}
                    >
                      {L(ar, "Use Proctor", "استخدم بروكتور")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-[10px] text-slate-500 hover:underline whitespace-nowrap px-1"
                      onClick={() => {
                        setMddOverride(true);
                        mddTouched.current = true;
                      }}
                    >
                      {L(ar, "Change", "تعديل")}
                    </button>
                  )
                )}
              </div>
              {mddPcf != null && (
                <p className="text-[10px] text-slate-500 mt-0.5">{mddPcf} lbf/ft³</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-slate-500">{L(ar, "OMC (%)", "الرطوبة المثلى (%)")}</Label>
              <Input
                value={omcStr}
                onChange={e => { omcTouched.current = true; setOmcStr(e.target.value); }}
                className="h-9 mt-1 font-mono"
                disabled={submitted}
              />
              {proctorOmc != null && (
                <p className="text-[10px] text-emerald-600">{L(ar, "from Proctor", "من بروكتور")}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-slate-500">{L(ar, "Passing % 19.5 mm", "المار من 19.5 مم %")}</Label>
              <Input value={passing19_5} onChange={e => setPassing19_5(e.target.value)} className="h-9 mt-1 font-mono" disabled={submitted} />
            </div>
            <div>
              <Label className="text-xs text-slate-500">{L(ar, "Surcharge (lbf)", "الحمل الإضافي (lbf)")}</Label>
              <Input value={surchargeLbf} onChange={e => setSurchargeLbf(e.target.value)} className="h-9 mt-1 font-mono" disabled={submitted} placeholder="10" />
            </div>
          </div>
          {retained20mm != null && (
            <p className="text-xs text-amber-700 mt-3">
              {L(ar, "Retained on 20 mm:", "المحتجز على 20 مم:")} {retained20mm}%
            </p>
          )}
        </CardContent>
      </Card>

      {/* Specimen compaction & moisture — 3 columns */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {L(ar, "Specimen Details (10 / 30 / 65 blows per layer)", "تفاصيل العينات (10 / 30 / 65 ضربة/طبقة)")}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-slate-100">
                <th className={`${labelCls} font-semibold`}>{L(ar, "Parameter", "البيان")}</th>
                {ASTM_SPECIMEN_BLOWS.map(b => (
                  <th key={b} className="border border-slate-200 px-2 py-2 text-xs font-bold text-center min-w-[7rem]">
                    {b} {L(ar, "blows/layer", "ضربة/طبقة")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: "volumeMould" as const, label: L(ar, "Volume of Mould (cm³)", "حجم القالب (cm³)"), calc: false },
                { key: "massMouldSample" as const, label: L(ar, "Mass Mould + Sample (g)", "كتلة القالب + العينة (g)"), calc: false },
                { key: "massMould" as const, label: L(ar, "Mass of Mould (g)", "كتلة القالب (g)"), calc: false },
              ].map(row => (
                <tr key={row.key}>
                  <td className={labelCls}>{row.label}</td>
                  {specimens.map(sp => (
                    <td key={sp.id} className={inCls}>
                      <Input
                        type="number"
                        value={sp[row.key]}
                        onChange={e => updateSpecimen(sp.id, row.key, e.target.value)}
                        disabled={submitted}
                        className={`${inputCls} ${CELL_IN}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className={CELL_CALC}>
                <td className={labelCls}>{L(ar, "Wet Density (Mg/m³)", "الكثافة الرطبة (Mg/m³)")}</td>
                {ASTM_SPECIMEN_BLOWS.map(b => (
                  <td key={b} className={calcCls}>{fmtN(spByBlows(b)?.wetDensityMg, 3)}</td>
                ))}
              </tr>
              {[
                { key: "massWetCont" as const, label: L(ar, "Cont + Sample Wet (g)", "الوعاء + عينة رطبة (g)") },
                { key: "massDryCont" as const, label: L(ar, "Cont + Sample Dry (g)", "الوعاء + عينة جافة (g)") },
                { key: "massContainer" as const, label: L(ar, "Container (g)", "الوعاء (g)") },
              ].map(row => (
                <tr key={row.key}>
                  <td className={labelCls}>{row.label}</td>
                  {specimens.map(sp => (
                    <td key={sp.id} className={inCls}>
                      <Input
                        type="number"
                        value={sp[row.key]}
                        onChange={e => updateSpecimen(sp.id, row.key, e.target.value)}
                        disabled={submitted}
                        className={`${inputCls} ${CELL_IN}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className={CELL_CALC}>
                <td className={labelCls}>{L(ar, "Moisture Content (%)", "المحتوى الرطوبي (%)")}</td>
                {ASTM_SPECIMEN_BLOWS.map(b => (
                  <td key={b} className={calcCls}>{fmtN(spByBlows(b)?.moistureContent, 1)}</td>
                ))}
              </tr>
              <tr className={CELL_CALC}>
                <td className={labelCls}>{L(ar, "Dry Density (Mg/m³)", "الكثافة الجافة (Mg/m³)")}</td>
                {ASTM_SPECIMEN_BLOWS.map(b => (
                  <td key={b} className={calcCls}>{fmtN(spByBlows(b)?.dryDensityMg, 3)}</td>
                ))}
              </tr>
              <tr className={CELL_CALC}>
                <td className={labelCls}>{L(ar, "Dry Density (lbf/ft³)", "الكثافة الجافة (lbf/ft³)")}</td>
                {ASTM_SPECIMEN_BLOWS.map(b => (
                  <td key={b} className={calcCls}>{fmtN(spByBlows(b)?.dryDensityPcf, 0)}</td>
                ))}
              </tr>
              <tr>
                <td className={labelCls}>{L(ar, "Moisture top 1\" after soak (%)", "رطوبة أعلى 1\" بعد النقع (%)")}</td>
                {specimens.map(sp => (
                  <td key={sp.id} className={inCls}>
                    <Input
                      value={sp.moistureAfterSoak}
                      onChange={e => updateSpecimen(sp.id, "moistureAfterSoak", e.target.value)}
                      disabled={submitted}
                      className={`${inputCls} ${CELL_IN}`}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Penetration vs load */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{L(ar, "Penetration vs. Load (lbf) & Stress (psi)", "الاختراق مقابل الحمل والإجهاد")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th rowSpan={2} className="border border-slate-200 px-2 py-1.5 font-semibold text-slate-700">{L(ar, "Pen. (in)", "اختراق (in)")}</th>
                    <th colSpan={3} className="border border-slate-200 px-2 py-1 text-blue-700 font-semibold">{L(ar, "Force (lbf)", "الحمل (lbf)")}</th>
                    <th colSpan={3} className="border border-slate-200 px-2 py-1 text-emerald-700 font-semibold">{L(ar, "Stress (psi)", "الإجهاد (psi)")}</th>
                  </tr>
                  <tr className="bg-slate-50">
                    {ASTM_SPECIMEN_BLOWS.map(b => (
                      <th key={`f${b}`} className="border border-slate-200 px-2 py-1 font-mono">{b}</th>
                    ))}
                    {ASTM_SPECIMEN_BLOWS.map(b => (
                      <th key={`s${b}`} className="border border-slate-200 px-2 py-1 font-mono">{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ASTM_PENETRATION_IN.map((depth, di) => {
                    const is01 = Math.abs(depth - 0.1) < 0.001;
                    const is02 = Math.abs(depth - 0.2) < 0.001;
                    return (
                      <tr key={di} className={is01 ? "bg-amber-50/60" : is02 ? "bg-blue-50/60" : ""}>
                        <td className={`border border-slate-200 px-2 py-1 text-center font-mono font-semibold ${is01 || is02 ? "text-slate-800" : "text-slate-600"}`}>
                          {fmtDepth(depth, "in")}
                        </td>
                        {specimens.map(sp => (
                          <td key={`l-${sp.id}-${di}`} className="border border-slate-200 p-0">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={sp.penetrationLoads[di] ?? ""}
                              onChange={e => updateLoad(sp.id, di, e.target.value)}
                              disabled={submitted}
                              className={`w-full h-7 text-[11px] text-center font-mono border-0 rounded-none outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 ${is01 || is02 ? CELL_IN : "bg-white"}`}
                            />
                          </td>
                        ))}
                        {ASTM_SPECIMEN_BLOWS.map(b => (
                          <td key={`st-${b}-${di}`} className={`border border-slate-200 px-2 py-1 text-center font-mono ${CELL_CALC}`}>
                            {fmtN(spByBlows(b)?.stresses[di], 0)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-500 px-3 py-2 bg-slate-50 border-t border-slate-200">
                {L(ar,
                  "Stress = Load ÷ 3 in² | CBR @ 0.1\" = Stress/1000×100 | CBR @ 0.2\" = Stress/1500×100",
                  "الإجهاد = الحمل ÷ 3 in² | CBR @ 0.1\" = إجهاد/1000×100 | CBR @ 0.2\" = إجهاد/1500×100")}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">{L(ar, "Stress vs. Penetration", "الإجهاد مقابل الاختراق")}</p>
              {hasStressChart ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={stressChartData} margin={{ top: 8, right: 12, left: 4, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="depth" type="number" tick={{ fontSize: 9 }} domain={[0, 0.35]} label={{ value: L(ar, "Penetration (in)", "الاختراق (in)"), position: "insideBottom", offset: -12, fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} label={{ value: L(ar, "Stress (psi)", "الإجهاد (psi)"), angle: -90, position: "insideLeft", fontSize: 9 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <ReferenceLine x={0.1} stroke="#3b82f6" strokeDasharray="4 4" />
                    <ReferenceLine x={0.2} stroke="#8b5cf6" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="s10" name="10" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    <Line type="monotone" dataKey="s30" name="30" stroke="#059669" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    <Line type="monotone" dataKey="s65" name="65" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-72 border border-dashed border-slate-200 rounded-md flex items-center justify-center text-slate-400 text-sm">
                  {L(ar, "Enter load readings", "أدخل قراءات الحمل")}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CBR summary + design values */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{L(ar, "CBR Summary & Design Values", "ملخص CBR والقيم التصميمية")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse rounded-md border border-slate-200 overflow-hidden">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-200 px-2 py-1.5">{L(ar, "Blows/Layer", "ضربات/طبقة")}</th>
                    <th className="border border-slate-200 px-2 py-1.5">{L(ar, "Dry Dens. (lbf/ft³)", "كثافة جافة")}</th>
                    <th className="border border-slate-200 px-2 py-1.5">{L(ar, "MC %", "رطوبة %")}</th>
                    <th className="border border-slate-200 px-2 py-1.5 bg-blue-50">CBR 0.1"</th>
                    <th className="border border-slate-200 px-2 py-1.5 bg-purple-50">CBR 0.2"</th>
                    <th className="border border-slate-200 px-2 py-1.5">{L(ar, "Corr. 0.1\"", "مصحح 0.1\"")}</th>
                    <th className="border border-slate-200 px-2 py-1.5">{L(ar, "Corr. 0.2\"", "مصحح 0.2\"")}</th>
                    <th className="border border-slate-200 px-2 py-1.5">{L(ar, "Adopted", "المعتمد")}</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.map(sp => (
                    <tr key={sp.id}>
                      <td className="border border-slate-200 px-2 py-1.5 text-center font-bold">{sp.blowsPerLayer}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center font-mono">{fmtN(sp.dryDensityPcf, 0)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center font-mono">{fmtN(sp.moistureContent, 1)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center font-mono font-bold text-blue-800">{fmtN(sp.cbr01, 0)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center font-mono font-bold text-purple-800">{fmtN(sp.cbr02, 0)}</td>
                      <td className={`border border-slate-200 px-1 py-0.5 ${!sp.correctedCbr01 ? CELL_CALC : ""}`}>
                        <Input
                          value={sp.correctedCbr01 !== "" ? sp.correctedCbr01 : (sp.correctedCbr01Val != null ? String(sp.correctedCbr01Val) : "")}
                          onChange={e => updateSpecimen(sp.id, "correctedCbr01", e.target.value)}
                          disabled={submitted}
                          className="h-7 text-[11px] text-center font-mono"
                        />
                      </td>
                      <td className={`border border-slate-200 px-1 py-0.5 ${!sp.correctedCbr02 ? CELL_CALC : ""}`}>
                        <Input
                          value={sp.correctedCbr02 !== "" ? sp.correctedCbr02 : (sp.correctedCbr02Val != null ? String(sp.correctedCbr02Val) : "")}
                          onChange={e => updateSpecimen(sp.id, "correctedCbr02", e.target.value)}
                          disabled={submitted}
                          className="h-7 text-[11px] text-center font-mono"
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-center font-mono font-bold text-emerald-800">{fmtN(sp.adoptedCbr, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {designCbr && mddPcf != null && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-blue-600 font-medium">{L(ar, "CBR @ 95% MDD", "CBR @ 95% MDD")}</p>
                    <p className="text-2xl font-bold text-blue-900">{fmtN(designCbr.cbr95, 0)}</p>
                    <p className="text-[9px] text-slate-500">{designCbr.targetPcf95.toFixed(1)} pcf</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-emerald-600 font-medium">{L(ar, "CBR @ 98% MDD", "CBR @ 98% MDD")}</p>
                    <p className="text-2xl font-bold text-emerald-900">{fmtN(designCbr.cbr98, 0)}</p>
                    <p className="text-[9px] text-slate-500">{designCbr.targetPcf98.toFixed(1)} pcf</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-purple-600 font-medium">{L(ar, "CBR @ 100% MDD", "CBR @ 100% MDD")}</p>
                    <p className="text-2xl font-bold text-purple-900">{fmtN(designCbr.cbr100, 0)}</p>
                    <p className="text-[9px] text-slate-500">{designCbr.targetPcf100.toFixed(1)} pcf</p>
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">{L(ar, "Corrected CBR @ 0.2\" vs. Dry Density", "CBR المصحح @ 0.2\" مقابل الكثافة الجافة")}</p>
              {hasCbrChart ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ScatterChart margin={{ top: 8, right: 12, left: 4, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="dryDensityPcf"
                      type="number"
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 9 }}
                      label={{ value: L(ar, "Dry Density (lbf/ft³)", "الكثافة الجافة (lbf/ft³)"), position: "insideBottom", offset: -12, fontSize: 9 }}
                    />
                    <YAxis
                      dataKey="cbr02"
                      tick={{ fontSize: 9 }}
                      label={{ value: L(ar, "Corrected CBR @ 0.2\"", "CBR @ 0.2\""), angle: -90, position: "insideLeft", fontSize: 9 }}
                    />
                    <Tooltip />
                    <Scatter
                      name={L(ar, "Specimens", "العينات")}
                      data={cbrDensityData}
                      fill="#059669"
                      line={{ stroke: "#059669", strokeWidth: 2 }}
                    />
                    {designCbr && designCbr.cbr95 != null && (
                      <>
                        <ReferenceLine
                          x={designCbr.targetPcf95}
                          stroke="#3b82f6"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          label={{ value: "95%", position: "top", fontSize: 9, fill: "#3b82f6", fontWeight: 700 }}
                        />
                        <ReferenceLine y={designCbr.cbr95} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 4" />
                      </>
                    )}
                    {designCbr && designCbr.cbr98 != null && (
                      <>
                        <ReferenceLine
                          x={designCbr.targetPcf98}
                          stroke="#10b981"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          label={{ value: "98%", position: "top", fontSize: 9, fill: "#10b981", fontWeight: 700 }}
                        />
                        <ReferenceLine y={designCbr.cbr98} stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" />
                      </>
                    )}
                    {designCbr && designCbr.cbr100 != null && (
                      <>
                        <ReferenceLine
                          x={designCbr.targetPcf100}
                          stroke="#8b5cf6"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          label={{ value: "100%", position: "top", fontSize: 9, fill: "#8b5cf6", fontWeight: 700 }}
                        />
                        <ReferenceLine y={designCbr.cbr100} stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 4" />
                      </>
                    )}
                    {designCbrMarkers.map(m => (
                      <Scatter
                        key={m.pct}
                        name={`${m.pct} MDD`}
                        data={[m]}
                        fill={m.color}
                        shape={(props: { cx?: number; cy?: number }) => {
                          const { cx = 0, cy = 0 } = props;
                          return (
                            <g>
                              <circle cx={cx} cy={cy} r={7} fill={m.color} stroke="#fff" strokeWidth={2} />
                              <circle cx={cx} cy={cy} r={2.5} fill="#fff" />
                            </g>
                          );
                        }}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-72 border border-dashed border-slate-200 rounded-md flex items-center justify-center text-slate-400 text-sm">
                  {L(ar, "Enter at least 2 specimens", "أدخل 2 عينات على الأقل")}
                </div>
              )}
              {designCbrMarkers.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                  {L(ar,
                    "Dashed crosshairs show where each % MDD density (vertical) meets the curve CBR (horizontal). Dots mark the design CBR value.",
                    "الخطوط المتقطعة تعرض تقاطع كثافة % MDD (عمودي) مع قيمة CBR من المنحنى (أفقي). النقاط = قيمة CBR التصميمية.")}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <Label className="text-xs text-slate-500">{L(ar, "Notes", "ملاحظات")}</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1" />
        </CardContent>
      </Card>
    </div>
  );
}

export type { AstmCBRSpecimenComputed, AstmCBRSpecimenInput };
