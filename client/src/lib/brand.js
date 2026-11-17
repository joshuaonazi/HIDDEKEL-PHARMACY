// Shown on the login page, before anyone is signed in.
// Later this will come from the pharmacy settings so each client gets their own name.
export const DEFAULT_PHARMACY_NAME = 'Hiddekel Pharmacy and Store'

// "Hiddekel Pharmacy and Store" -> { first: "Hiddekel", rest: "Pharmacy and Store" }
export function splitName(name = DEFAULT_PHARMACY_NAME) {
  const [first, ...rest] = name.trim().split(/\s+/)
  return { first, rest: rest.join(' ') }
}
