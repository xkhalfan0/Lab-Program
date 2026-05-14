/**
 * TestRouter — Smart routing component that renders the correct test form
 * based on the distribution's testType code or formTemplate field.
 *
 * URL: /test/:distributionId
 */
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertCircle, FlaskConical } from "lucide-react";

// Import all test form components
import ConcreteCubes from "./ConcreteCubes";
import ConcreteCore from "./ConcreteCore";
import ConcreteBlocks from "./ConcreteBlocks";
import Interlock from "./Interlock";
import SteelRebar from "./SteelRebar";
import SteelBendRebend from "./SteelBendRebend";
import SieveAnalysis from "./SieveAnalysis";
import SoilProctor from "./SoilProctor";
import SoilAtterberg from "./SoilAtterberg";
import SoilFieldDensity from "./SoilFieldDensity";
import SoilCBR from "./SoilCBR";
import AsphaltMarshall from "./AsphaltMarshall";
import AsphaltCore from "./AsphaltCore";
import AsphaltBitumenExtraction from "./AsphaltBitumenExtraction";
import AggSpecificGravity from "./AggSpecificGravity";
import AggShapeIndex from "./AggShapeIndex";
import AggCrushingImpact from "./AggCrushingImpact";
import AggLAAbrasion from "./AggLAAbrasion";
import SteelStructural from "./SteelStructural";
import SteelAnchorBolt from "./SteelAnchorBolt";
import CementSettingTime from "./CementSettingTime";
import ConcreteBeam from "./ConcreteBeam";
import ConcreteFoam from "./ConcreteFoam";
import AsphaltHotBin from "./AsphaltHotBin";
import AsphaltExtractedSieve from "./AsphaltExtractedSieve";
import ConcreteMixGrad from "./ConcreteMixGrad";
import AsphaltSprayRate from "./AsphaltSprayRate";

// ─── Map formTemplate (CamelCase from DB) → component ─────────────────────
const FORM_MAP: Record<string, React.ComponentType> = {
  // Concrete
  "ConcreteCubes":            ConcreteCubes,
  "ConcreteCore":             ConcreteCore,
  "ConcreteBlocks":           ConcreteBlocks,
  "ConcreteFoam":             ConcreteFoam,
  "ConcreteBeam":             ConcreteBeam,
  "ConcreteMixGrad":          ConcreteMixGrad,
  "CementSetting":            CementSettingTime,
  "SieveAnalysis":            SieveAnalysis,
  // Soil
  "SoilAtterberg":            SoilAtterberg,
  "SoilProctor":              SoilProctor,
  "SoilCBR":                  SoilCBR,
  "SoilFieldDensity":         SoilFieldDensity,
  // Steel
  "SteelRebar":               SteelRebar,
  "SteelBendRebend":          SteelBendRebend,
  "SteelAnchorBolt":          SteelAnchorBolt,
  "SteelStructural":          SteelStructural,
  // Asphalt
  "AsphaltHotBin":            AsphaltHotBin,
  "AsphaltBitumenExtraction": AsphaltBitumenExtraction,
  "AsphaltExtractedSieve":    AsphaltExtractedSieve,
  "AsphaltMarshall":          AsphaltMarshall,
  "AsphaltCore":              AsphaltCore,
  "AsphaltSprayRate":         AsphaltSprayRate,
  // Aggregate
  "AggSieveAnalysis":         SieveAnalysis,
  "AggCrushingImpact":        AggCrushingImpact,
  "AggLAAbrasion":            AggLAAbrasion,
  // Legacy snake_case keys (backward compat)
  "concrete_cubes":           ConcreteCubes,
  "concrete_cores":           ConcreteCore,
  "concrete_blocks":          ConcreteBlocks,
  "interlock":                Interlock,
  "steel_rebar":              SteelRebar,
  "steel_bend_rebend":        SteelBendRebend,
  "sieve_analysis":           SieveAnalysis,
  "agg_specific_gravity":     AggSpecificGravity,
  "agg_shape_index":          AggShapeIndex,
  "agg_crushing":             AggCrushingImpact,
  "agg_impact":               AggCrushingImpact,
  "agg_la_abrasion":          AggLAAbrasion,
  "soil_proctor":             SoilProctor,
  "soil_atterberg":           SoilAtterberg,
  "soil_field_density":       SoilFieldDensity,
  "soil_cbr":                 SoilCBR,
  "asphalt_marshall":         AsphaltMarshall,
  "asphalt_core":             AsphaltCore,
  "asphalt_bitumen_extraction": AsphaltBitumenExtraction,
  "steel_structural":         SteelStructural,
  "cement_setting_time":      CementSettingTime,
  "concrete_beam":            ConcreteBeam,
  "concrete_mix_grad":        ConcreteMixGrad,
  "asphalt_hotbin":           AsphaltHotBin,
  "asphalt_extracted_sieve":  AsphaltExtractedSieve,
  "asphalt_spray_rate":       AsphaltSprayRate,
  "steel_anchor_bolt":        SteelAnchorBolt,
  "concrete_foam":            ConcreteFoam,
};

// ─── Map the 32 approved test codes → form component ──────────────────────
const CODE_TO_COMPONENT: Record<string, React.ComponentType> = {
  // Concrete (10)
  "CONC_CUBE":              ConcreteCubes,
  "CONC_CORE":              ConcreteCore,
  "CONC_BLOCK":             ConcreteBlocks,
  "CONC_INTERLOCK":         Interlock,
  "CONC_FOAM":              ConcreteFoam,
  "CONC_FOAM_DENSITY":      ConcreteFoam,
  "CEM_SETTING_TIME":       CementSettingTime,
  "CONC_MORTAR_SAND":       SieveAnalysis,
  "CONC_BEAM":              ConcreteBeam,
  "CONC_BEAM_SMALL":        ConcreteBeam,
  "CONC_BEAM_LARGE":        ConcreteBeam,
  "CONC_MIX_GRAD":          ConcreteMixGrad,
  // Soil (5)
  "SOIL_SIEVE":             SieveAnalysis,
  "SOIL_ATTERBERG":         SoilAtterberg,
  "SOIL_PROCTOR":           SoilProctor,
  "SOIL_CBR":               SoilCBR,
  "SOIL_FIELD_DENSITY":     SoilFieldDensity,
  // Steel (5)
  "STEEL_REBAR":            SteelRebar,
  "STEEL_BEND":             SteelBendRebend,
  "STEEL_REBEND":           SteelBendRebend,
  "STEEL_ANCHOR":           SteelAnchorBolt,
  "STEEL_STRUCTURAL":       SteelStructural,
  // Asphalt (6)
  "ASPH_HOTBIN":            AsphaltHotBin,
  "ASPH_BITUMEN_EXTRACT":   AsphaltBitumenExtraction,
  "ASPH_EXTRACTED_SIEVE":   AsphaltExtractedSieve,
  "ASPH_MARSHALL":          AsphaltMarshall,
  "ASPH_MARSHALL_DENSITY":  AsphaltMarshall,
  "ASPH_ACWC":              AsphaltMarshall,
  "ASPH_ACBC":              AsphaltMarshall,
  "ASPH_DBM":               AsphaltMarshall,
  "ASPH_CORE":              AsphaltCore,
  "ASPH_SPRAY":             AsphaltSprayRate,
  "ASPH_SPRAY_SS1":         AsphaltSprayRate,
  "ASPH_SPRAY_SS1H":        AsphaltSprayRate,
  "ASPH_SPRAY_CRS1":        AsphaltSprayRate,
  "ASPH_SPRAY_MC30":        AsphaltSprayRate,
  "ASPH_SPRAY_MC70":        AsphaltSprayRate,
  "ASPH_SPRAY_MC250":       AsphaltSprayRate,
  "ASPH_SPRAY_CUSTOM":      AsphaltSprayRate,
  // Aggregate (6)
  "AGG_SIEVE":              SieveAnalysis,
  "AGG_SG":                 AggSpecificGravity,
  "AGG_FLAKINESS_ELONGATION": AggShapeIndex,
  "AGG_CRUSHING":           AggCrushingImpact,
  "AGG_IMPACT":             AggCrushingImpact,
  "AGG_LA":                 AggLAAbrasion,
  // Aliases (saved / legacy codes that must still open the same form)
  "AGG_LA_ABRASION":        AggLAAbrasion,
  "CONC_FOAM_CUBE":         ConcreteFoam,
};

export default function TestRouter() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");

  const { data: dist, isLoading, error } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: !!distId }
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin text-slate-400" size={32} />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !dist) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto p-8">
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <AlertCircle className="mx-auto text-red-400" size={40} />
              <p className="font-semibold text-slate-700">Distribution not found</p>
              <p className="text-sm text-slate-500">Distribution ID: {distId}</p>
              <Button onClick={() => setLocation("/technician")} variant="outline">
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // 1. Try to resolve via the new 32-code map first
  let FormComponent: React.ComponentType | null = dist.testType
    ? (CODE_TO_COMPONENT[dist.testType] ?? null)
    : null;

  // 2. Fallback: try formTemplate from the DB record (cast to any for backward compat)
  if (!FormComponent && (dist as any).formTemplate) {
    FormComponent = FORM_MAP[(dist as any).formTemplate] ?? null;
  }

  if (!FormComponent) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto p-8">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <FlaskConical className="text-blue-500" size={28} />
                <div>
                  <h2 className="font-bold text-slate-800 text-lg">{dist.testName}</h2>
                  <p className="text-sm text-slate-500">Distribution: {dist.distributionCode}</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
                <p className="font-semibold mb-1">Test Form Not Available</p>
                <p>
                  A specialized form for test type <strong>{dist.testType}</strong> is not yet available.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-0.5">Test Type</p>
                  <p className="font-semibold text-slate-700">{dist.testType ?? "—"}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-0.5">Priority</p>
                  <p className="font-semibold text-slate-700 capitalize">{dist.priority}</p>
                </div>
              </div>
              <Button onClick={() => setLocation("/technician")} variant="ghost" size="sm">
                Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return <FormComponent />;
}
