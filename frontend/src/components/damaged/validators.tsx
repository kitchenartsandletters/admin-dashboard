/**
 * Validates an EAN-13 / ISBN-13 checksum.
 */
export function isValidEan13(input: string): boolean {
  // 1. Remove any hyphens or spaces that might come from manual entry
  const code = input.replace(/[-\s]/g, '');

  // 2. Strict length check for exactly 13 digits
  if (!/^\d{13}$/.test(code)) return false;

  const digits = code.split('').map(Number);
  const checkDigit = digits.pop();
  
  const sum = digits.reduce((acc, digit, idx) => {
    // EAN-13 uses weights of 1 and 3 alternating
    const weight = idx % 2 === 0 ? 1 : 3;
    return acc + (digit * weight);
  }, 0);

  const calculatedCheck = (10 - (sum % 10)) % 10;
  return calculatedCheck === checkDigit;
}