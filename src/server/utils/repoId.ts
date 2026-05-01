/**
 * Generates a stable 12-character ID for a repository based on its path.
 */
export async function getRepoId(path: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256").update(path).digest("hex");
  return hash.slice(0, 12);
}
