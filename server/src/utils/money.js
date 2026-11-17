// All money maths is done in kobo (whole numbers) so totals never drift by a fraction.
export const toKobo = (naira) => Math.round(Number(naira) * 100);
export const fromKobo = (kobo) => kobo / 100;
