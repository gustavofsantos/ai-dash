import { dashDb } from "../server/data/dash.db.ts";
import { DashRepository } from "../server/data/dash.repository.ts";
import { ReconcileService } from "../server/services/reconcile.service.ts";

const repository = new DashRepository(dashDb);
const reconcileService = new ReconcileService(repository);

export async function reconcileRepo(cwd: string) {
  await reconcileService.reconcileRepo(cwd);
}
