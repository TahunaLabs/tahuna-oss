const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function shortId(prefix?: string): string {
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return prefix ? `${prefix}_${out}` : out;
}
