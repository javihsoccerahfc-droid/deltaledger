"use server";

import { revalidatePath } from "next/cache";
import { seedSampleEngineeringChange } from "../../db/seed";

export async function seedSampleDataAction(): Promise<string> {
  const ecId = await seedSampleEngineeringChange();
  revalidatePath("/engineering-changes");
  return ecId;
}
