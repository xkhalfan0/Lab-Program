import { checkAndUpdateSampleStatusAfterSubmission, getSampleById } from "../db";

/**
 * Test the automatic status transition logic after test submission.
 *
 * Usage:
 *   pnpm run test:status-flow -- 123
 *   TEST_SAMPLE_ID=123 pnpm run test:status-flow
 */
async function testStatusFlow() {
  console.log("Testing status transition flow");

  const cliSampleId = Number(process.argv[2]);
  const envSampleId = Number(process.env.TEST_SAMPLE_ID);
  const testSampleId = Number.isFinite(cliSampleId) && cliSampleId > 0
    ? cliSampleId
    : Number.isFinite(envSampleId) && envSampleId > 0
      ? envSampleId
      : 1;

  console.log(`\nTesting sample ID: ${testSampleId}`);
  console.log("Checking if all distributions are completed...");

  try {
    const before = await getSampleById(testSampleId);
    if (!before) {
      throw new Error(`Sample ${testSampleId} was not found or is deleted.`);
    }

    console.log(`Current status: ${before.status}`);
    const nextStatus = await checkAndUpdateSampleStatusAfterSubmission(testSampleId);
    const after = await getSampleById(testSampleId);

    console.log(`Computed status: ${nextStatus ?? "unchanged"}`);
    console.log(`Database status after check: ${after?.status ?? "unknown"}`);
    console.log("Status update logic executed successfully.");
  } catch (error) {
    console.error("Status update failed:", error);
    process.exit(1);
  }
}

void testStatusFlow();
