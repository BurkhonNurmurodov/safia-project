/**
 * The task board's TIERS — one spelling for every surface that reads or writes
 * a task: /tasks, the shared form (components/tasks/TaskFormModal) and the
 * «Rahbariyat vazifalari» block on «Smena kunligi».
 *
 *   leader          brigadir → lider              /api/tasks
 *   supervisor      smena menejeri → brigadir     /api/brigadir-tasks
 *   shift-manager   top menejer → smena menejeri  /api/shift-manager-tasks
 *
 * A row is WRITTEN through the router that owns its tier (`endpointFor`) —
 * the one rule the backend keeps (`services/task_board.py`).
 */
export const KIND_LEADER = "leader";
export const KIND_SUP = "supervisor";
export const KIND_SM = "shift-manager";

// Top of the org chart first — the order tiers are listed and sorted in.
export const TIERS = [KIND_SM, KIND_SUP, KIND_LEADER];
export const tierRank = (kind) => {
  const i = TIERS.indexOf(kind);
  return i < 0 ? TIERS.length : i;
};

const ENDPOINT = {
  [KIND_SUP]: "/api/brigadir-tasks",
  [KIND_SM]: "/api/shift-manager-tasks",
};
export const endpointFor = (kind) => ENDPOINT[kind] || "/api/tasks";

// The field a CREATE body names the assignee by, per tier.
export const ASSIGNEE_FIELD = {
  [KIND_LEADER]: "leader_profile_id",
  [KIND_SUP]: "supervisor_manager_id",
  [KIND_SM]: "profile_id",
};

// The id of the person a board row was set for — a unit for a brigadir, a
// profile for a leader or a shift manager.
export const assigneeIdOf = (r) =>
  r.assignee_kind === KIND_SUP ? r.supervisor_manager_id
    : r.assignee_kind === KIND_SM ? r.assignee_profile_id
    : r.leader_profile_id;
