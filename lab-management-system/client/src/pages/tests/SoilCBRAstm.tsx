import { useCallback, useMemo } from "react";
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
  const displaySpecimens = useMemo(
    () => specimens.map(s => ({
      ...s,
      penetrationLoads: normalizeAstmPenetrationLoads(s.penetrationLoads),
    })),
    [specimens],
  );
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
  const hasStressChart = stressChartData.length >= 2;
  const hasCbrChart = cbrDensityData.length >= 2;

  const updateSpecimen = useCallback((id: string, field: keyof AstmCBRSpecimenInput, value: string) => {
    setSpecimens(prev => prev.map(s => (s.id === id ? { ...s, [field]: value } : s)));
  }, [setSpecimens]);

  const updateLoad = useCallback((id: string, depthIdx: number, value: string) => {
    setSpecimens(prev => prev.map(s => {
      if (s.id !== id) return s;
      const loads = normalizeAstmPenetrationLoads(s.penetrationLoads);
      loads[depthIdx] = value;
      return { ...s, penetrationLoads: loads };
    }));
  }, [setSpecimens]);

  const labelCls = "border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 whitespace-nowrap";
  const inCls = "border border-slate-200 px-1 py-1";
  const calcCls = "border border-slate-200 px-2 py-1.5 text-center font-mono text-xs font-semibold";
  const inputCls = "h-7 text-xs text-center font-mono w-full min-w-[4rem]";

  const spByBlows = (b: number) => computed.find(s => s.blowsPerLayer === b);

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
              <Label className="text-xs text-slate-500">{L(ar, "MDD (Mg/m³)", "أقصى كثافة جافة (Mg/m³)")}</Label>
              <Input
                value={mddStr}
                onChange={e => { mddTouched.current = true; setMddStr(e.target.value); }}
                className="h-9 mt-1 font-mono"
                disabled={submitted}
              />
              {mddPcf != null && (
                <p className="text-[10px] text-slate-500 mt-0.5">{mddPcf} lbf/ft³</p>
              )}
              {proctorMdd != null && (
                <p className="text-[10px] text-emerald-600">{L(ar, "from Proctor", "من بروكتور")}</p>
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
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="pb-2 bg-gradient-to-r from-slate-50 to-white border-b">
          <CardTitle className="text-base">{L(ar, "Penetration vs. Load (lbf) & Stress (psi)", "الاختراق مقابل الحمل والإجهاد")}</CardTitle>
          <p className="text-[11px] text-slate-500 mt-1">
            {L(ar, "Enter dial loads below — CBR @ 0.1\" and 0.2\" are calculated automatically in the summary.", "أدخل قراءات الحمل — يُحسب CBR @ 0.1\" و 0.2\" تلقائياً في الملخص.")}
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th rowSpan={2} className="border border-slate-700 px-2 py-2 font-semibold">{L(ar, "Pen. (in)", "اختراق (in)")}</th>
                      <th colSpan={3} className="border border-slate-700 px-2 py-1.5 text-center text-blue-200">{L(ar, "Force (lbf)", "الحمل (lbf)")}</th>
                      <th colSpan={3} className="border border-slate-700 px-2 py-1.5 text-center text-emerald-200">{L(ar, "Stress (psi)", "الإجهاد (psi)")}</th>
                    </tr>
                    <tr className="bg-slate-700 text-white">
                      {ASTM_SPECIMEN_BLOWS.map(b => (
                        <th key={`f${b}`} className="border border-slate-600 px-2 py-1 font-mono">{b}</th>
                      ))}
                      {ASTM_SPECIMEN_BLOWS.map(b => (
                        <th key={`s${b}`} className="border border-slate-600 px-2 py-1 font-mono">{b}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ASTM_PENETRATION_IN.map((depth, di) => {
                      const is01 = Math.abs(depth - 0.1) < 0.001;
                      const is02 = Math.abs(depth - 0.2) < 0.001;
                      const rowCls = is01
                        ? "bg-amber-50/80 ring-1 ring-inset ring-amber-200"
                        : is02
                          ? "bg-blue-50/80 ring-1 ring-inset ring-blue-200"
                          : di % 2 === 0 ? "bg-white" : "bg-slate-50/40";
                      return (
                        <tr key={di} className={rowCls}>
                          <td className={`border border-slate-200 px-2 py-1 text-center font-mono font-bold ${is01 ? "text-amber-800" : is02 ? "text-blue-800" : "text-slate-700"}`}>
                            {fmtDepth(depth, "in")}
                            {is01 && <span className="block text-[9px] font-normal text-amber-600">CBR ÷1000</span>}
                            {is02 && <span className="block text-[9px] font-normal text-blue-600">CBR ÷1500</span>}
                          </td>
                          {displaySpecimens.map(sp => (
                            <td key={`l-${sp.id}`} className="border border-slate-200 px-1 py-0.5">
                              <Input
                                value={sp.penetrationLoads[di] ?? ""}
                                onChange={e => updateLoad(sp.id, di, e.target.value)}
                                disabled={submitted}
                                className={`h-7 text-[11px] text-center font-mono border-0 shadow-none ${is01 || is02 ? CELL_IN : "bg-transparent"}`}
                              />
                            </td>
                          ))}
                          {ASTM_SPECIMEN_BLOWS.map(b => (
                            <td key={`st-${b}-${di}`} className={`border border-slate-200 px-2 py-1 text-center font-mono text-slate-700 ${CELL_CALC}`}>
                              {fmtN(spByBlows(b)?.stresses[di], 0)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2 px-3 py-2 bg-slate-50 border-t text-[10px] text-slate-600">
                <span className="rounded-full bg-white border px-2 py-0.5">{L(ar, "Stress = Load ÷ 3 in²", "الإجهاد = الحمل ÷ 3 in²")}</span>
                <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5">{L(ar, "CBR @ 0.1\" = Load ÷ 1000 × 100", "CBR @ 0.1\" = حمل ÷ 1000 × 100")}</span>
                <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5">{L(ar, "CBR @ 0.2\" = Load ÷ 1500 × 100", "CBR @ 0.2\" = حمل ÷ 1500 × 100")}</span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">{L(ar, "Stress vs. Penetration", "الإجهاد مقابل الاختراق")}</p>
              {hasStressChart ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={stressChartData} margin={{ top: 8, right: 12, left: 4, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="depth" type="number" tick={{ fontSize: 9 }} domain={[0, 0.35]} label={{ value: L(ar, "Penetration (in)", "الاختراق (in)"), position: "insideBottom", offset: -12, fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} label={{ value: L(ar, "Stress (psi)", "الإجهاد (psi)"), angle: -90, position: "insideLeft", fontSize: 9 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <ReferenceLine x={0.1} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "0.1\"", position: "top", fontSize: 8, fill: "#b45309" }} />
                    <ReferenceLine x={0.2} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: "0.2\"", position: "top", fontSize: 8, fill: "#1d4ed8" }} />
                    <Line type="monotone" dataKey="s10" name="10" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="s30" name="30" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="s65" name="65" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] rounded-md border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-sm">
                  {L(ar, "Enter load readings", "أدخل قراءات الحمل")}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CBR summary + design values */}
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="pb-2 bg-gradient-to-r from-emerald-50/60 to-white border-b">
          <CardTitle className="text-base">{L(ar, "CBR Summary & Design Values", "ملخص CBR والقيم التصميمية")}</CardTitle>
          <p className="text-[11px] text-slate-500 mt-1">
            {L(ar, "CBR values are computed from loads at 0.1\" and 0.2\" only. Override corrected values if surcharge correction differs.", "تُحسب قيم CBR من الحمل عند 0.1\" و 0.2\" فقط. عدّل القيم المصححة عند الحاجة.")}
          </p>
        </CardHeader>
        <CardContent className="pt-4 space-y-5">
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th rowSpan={2} className="border border-slate-700 px-2 py-2">{L(ar, "Blows", "ضربات")}</th>
                  <th rowSpan={2} className="border border-slate-700 px-2 py-2">{L(ar, "Dry Dens.", "كثافة جافة")}</th>
                  <th rowSpan={2} className="border border-slate-700 px-2 py-2">{L(ar, "MC %", "رطوبة %")}</th>
                  <th colSpan={2} className="border border-slate-700 px-2 py-1.5 bg-amber-900/40 text-amber-100">{L(ar, "@ 0.1\"", "@ 0.1\"")}</th>
                  <th colSpan={2} className="border border-slate-700 px-2 py-1.5 bg-blue-900/40 text-blue-100">{L(ar, "@ 0.2\"", "@ 0.2\"")}</th>
                  <th colSpan={2} className="border border-slate-700 px-2 py-1.5">{L(ar, "Corrected", "مصحح")}</th>
                  <th rowSpan={2} className="border border-slate-700 px-2 py-2 bg-emerald-900/50 text-emerald-100">{L(ar, "Adopted", "المعتمد")}</th>
                </tr>
                <tr className="bg-slate-700 text-white text-[10px]">
                  <th className="border border-slate-600 px-2 py-1">{L(ar, "Load", "حمل")}</th>
                  <th className="border border-slate-600 px-2 py-1">CBR %</th>
                  <th className="border border-slate-600 px-2 py-1">{L(ar, "Load", "حمل")}</th>
                  <th className="border border-slate-600 px-2 py-1">CBR %</th>
                  <th className="border border-slate-600 px-2 py-1">0.1"</th>
                  <th className="border border-slate-600 px-2 py-1">0.2"</th>
                </tr>
              </thead>
              <tbody>
                {[...computed].sort((a, b) => a.blowsPerLayer - b.blowsPerLayer).map((sp, ri) => (
                  <tr key={sp.id} className={ri % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-2 py-2 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-white font-bold text-sm">{sp.blowsPerLayer}</span>
                    </td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-mono">{fmtN(sp.dryDensityPcf, 0)}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-mono">{fmtN(sp.moistureContent, 1)}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-mono text-slate-600 bg-amber-50/30">{fmtN(sp.load01, 0)}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-mono font-bold text-amber-800 bg-amber-50/50">{fmtN(sp.cbr01, 0)}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-mono text-slate-600 bg-blue-50/30">{fmtN(sp.load02, 0)}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-mono font-bold text-blue-800 bg-blue-50/50">{fmtN(sp.cbr02, 0)}</td>
                    <td className="border border-slate-200 px-1 py-0.5">
                      <Input
                        value={sp.correctedCbr01}
                        onChange={e => updateSpecimen(sp.id, "correctedCbr01", e.target.value)}
                        disabled={submitted}
                        placeholder={sp.correctedCbr01Val != null ? String(sp.correctedCbr01Val) : ""}
                        className="h-7 text-[11px] text-center font-mono bg-white"
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-0.5">
                      <Input
                        value={sp.correctedCbr02}
                        onChange={e => updateSpecimen(sp.id, "correctedCbr02", e.target.value)}
                        disabled={submitted}
                        placeholder={sp.correctedCbr02Val != null ? String(sp.correctedCbr02Val) : ""}
                        title={L(ar, "Used for design CBR if left blank", "يُستخدم في CBR التصميمي إذا تُرك فارغاً")}
                        className={`h-7 text-[11px] text-center font-mono ${sp.correctedCbr02 ? "bg-white" : "bg-emerald-50"}`}
                      />
                    </td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center">
                      <span className="inline-block min-w-[2.5rem] rounded-md bg-emerald-100 border border-emerald-300 px-2 py-1 font-mono font-bold text-emerald-900 text-sm">
                        {fmtN(sp.adoptedCbr, 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {designCbr && mddPcf != null && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: L(ar, "CBR @ 95% MDD", "CBR @ 95% MDD"), value: designCbr.cbr95, pcf: designCbr.targetPcf95.toFixed(1), box: "bg-blue-50 border-blue-200", title: "text-blue-700", val: "text-blue-900" },
                { label: L(ar, "CBR @ 98% MDD", "CBR @ 98% MDD"), value: designCbr.cbr98, pcf: designCbr.targetPcf98.toFixed(1), box: "bg-emerald-50 border-emerald-200", title: "text-emerald-700", val: "text-emerald-900" },
                { label: L(ar, "CBR @ 100% MDD", "CBR @ 100% MDD"), value: designCbr.cbr100, pcf: designCbr.targetPcf100.toFixed(1), box: "bg-purple-50 border-purple-200", title: "text-purple-700", val: "text-purple-900" },
              ].map(kpi => (
                <div key={kpi.label} className={`rounded-xl border p-4 text-center shadow-sm ${kpi.box}`}>
                  <p className={`text-[11px] font-medium ${kpi.title}`}>{kpi.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${kpi.val}`}>{fmtN(kpi.value, 0)}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{kpi.pcf} pcf</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">{L(ar, "Corrected CBR @ 0.2\" vs. Dry Density", "CBR المصحح @ 0.2\" مقابل الكثافة الجافة")}</p>
              {hasCbrChart ? (
                <ResponsiveContainer width="100%" height={280}>
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
                      label={{ value: L(ar, "Corrected CBR @ 0.2\" (%)", "CBR @ 0.2\" (%)"), angle: -90, position: "insideLeft", fontSize: 9 }}
                    />
                    <Tooltip />
                    <Scatter data={cbrDensityData} fill="#059669" line={{ stroke: "#059669", strokeWidth: 2 }} />
                    {designCbr && (
                      <>
                        <ReferenceLine x={designCbr.targetPcf95} stroke="#3b82f6" strokeDasharray="3 3" />
                        <ReferenceLine x={designCbr.targetPcf98} stroke="#10b981" strokeDasharray="3 3" />
                        <ReferenceLine x={designCbr.targetPcf100} stroke="#8b5cf6" strokeDasharray="3 3" />
                      </>
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] rounded-md border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-sm">
                  {L(ar, "Enter at least 2 specimens", "أدخل 2 عينات على الأقل")}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
              <p className="font-semibold text-slate-800">{L(ar, "How CBR is calculated", "طريقة حساب CBR")}</p>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>{L(ar, "CBR @ 0.1\" = dial load (lbf) ÷ 1,000 × 100", "CBR @ 0.1\" = الحمل ÷ 1,000 × 100")}</li>
                <li>{L(ar, "CBR @ 0.2\" = dial load (lbf) ÷ 1,500 × 100", "CBR @ 0.2\" = الحمل ÷ 1,500 × 100")}</li>
                <li>{L(ar, "Adopted CBR = higher of corrected values at 0.1\" and 0.2\"", "المعتمد = الأعلى بين المصحح عند 0.1\" و 0.2\"")}</li>
                <li>{L(ar, "Target density (pcf) = MDD (Mg/m³) × 62.428 × 95% / 98% / 100%", "الكثافة المستهدفة = MDD × 62.428 × النسبة")}</li>
                <li>{L(ar, "Design CBR = read corrected CBR @ 0.2\" from the density curve at each target", "CBR التصميمي = قراءة CBR المصحح @ 0.2\" من المنحنى عند كل كثافة مستهدفة")}</li>
              </ul>
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
