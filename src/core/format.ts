/** A whole number with an apostrophe between the thousands: 12345 -> 12'345. Gold and prices are shown this way. */
export function thousands(n: number): string {
  const whole = Math.round(n);
  const digits = String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return whole < 0 ? `-${digits}` : digits;
}
