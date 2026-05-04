// Environment variables and args passed to git hook scripts.
// See fixtures/hooks/git/ for real examples.

export interface GitPostCommit {
  GIT_DIR: string;
  GIT_WORK_TREE: string;
}

export interface GitPrepareCommitMsg {
  GIT_DIR: string;
  GIT_WORK_TREE: string;
  commit_msg_file: string;
  commit_source: string;
  sha1: string;
}

export type GitPayload = GitPostCommit | GitPrepareCommitMsg;
