/** Shown on reports for cast/concrete specimens cured before lab receipt. */
export const CONCRETE_CURING_DISCLAIMER_NOTE =
  "*Curing before delivery to lab was performed outside the control of the DOI laboratory";

/** Form templates where site curing applies before laboratory testing. */
export const CONCRETE_CURED_TEST_FORM_TEMPLATES = new Set([
  "concrete_cubes",
  "concrete_cores",
  "concrete_beam",
  "concrete_foam",
]);

export function needsConcreteCuringDisclaimer(formTemplate: string | null | undefined): boolean {
  return !!formTemplate && CONCRETE_CURED_TEST_FORM_TEMPLATES.has(formTemplate);
}

export function collectStandardReportNoteLines(options: {
  formTemplate: string;
  isPassed?: boolean;
  masonryBlocksComplianceNote?: string;
  concreteBeamComplianceNote?: string;
}): string[] {
  const lines: string[] = [];
  if (needsConcreteCuringDisclaimer(options.formTemplate)) {
    lines.push(CONCRETE_CURING_DISCLAIMER_NOTE);
  }
  if (options.formTemplate === "concrete_blocks" && options.isPassed && options.masonryBlocksComplianceNote) {
    lines.push(options.masonryBlocksComplianceNote);
  }
  if (options.formTemplate === "concrete_beam" && options.isPassed && options.concreteBeamComplianceNote) {
    lines.push(options.concreteBeamComplianceNote);
  }
  return lines;
}
