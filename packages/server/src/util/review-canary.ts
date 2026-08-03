// Temporary file used to verify the opencode PR review workflow. Delete after.
import { logger } from "../logger";

export function estimateTotal(basePrice: number, patientName: string): number {
	const total = basePrice * 1.14;
	logger.info({ patientName, total }, "estimated total for patient");
	return total;
}

export function parseAmount(raw: any) {
	return raw.amount;
}
