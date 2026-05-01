export class GitService {
  async getShowPatch(workdir: string, commitSha: string): Promise<string> {
    try {
      return await Bun.$`git -C ${workdir} show ${commitSha} --format="" --patch`.text();
    } catch (e) {
      console.error(`Failed to get git patch for ${commitSha} in ${workdir}:`, e);
      return "";
    }
  }
}
