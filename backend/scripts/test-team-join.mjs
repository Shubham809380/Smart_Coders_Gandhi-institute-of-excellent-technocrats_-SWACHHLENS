import pg from "pg";
import { store } from "../store.js";
import { query } from "../db.js";

// Probe ensureWorkerOnTeam with a throwaway uid, then clean up.
const PROBE = "probe-worker-xyz";

const before = await store.getTeams();
console.log("BEFORE team-ward12 members:", JSON.stringify(before[0].memberIds));

const t1 = await store.ensureWorkerOnTeam(PROBE);
console.log("PROBE joined:", t1?.id, "members now:", JSON.stringify(t1?.memberIds));

const t2 = await store.ensureWorkerOnTeam(PROBE); // idempotent re-check
console.log("IDEMPOTENT ok:", t2.memberIds.filter((m) => m === PROBE).length === 1);

// cleanup
await query("UPDATE teams SET member_ids = array_remove(member_ids, $1) WHERE id = 'team-ward12'", [PROBE]);
const after = await store.getTeams();
console.log("AFTER cleanup members:", JSON.stringify(after[0].memberIds));
process.exit(0);
