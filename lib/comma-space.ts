// Saved log text always reads "a, b": spaces before a comma are dropped and exactly one space follows it.
// A comma at the very end is kept without a trailing space.
export function spaceAfterComma(value: string): string {
  return value.replace(/\s*,\s*/g, ', ').trimEnd();
}
