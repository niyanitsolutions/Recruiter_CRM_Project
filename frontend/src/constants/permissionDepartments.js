// Single source of truth for the "Department" concept used by
// Users → Permissions → Department (UserForm.jsx) and reused by
// Targets → Create/Edit Target's Department dropdown (TargetsPage.jsx).
// This is the permission-group department, not the free-form org
// Department master (departmentService/`/departments/`).
export const PERM_DEPT_OPTIONS = [
  { value: 'owner',                 label: 'Owner' },
  { value: 'admin',                 label: 'Admin' },
  { value: 'client_coordinator',    label: 'Client Coordinator' },
  { value: 'candidate_coordinator', label: 'Candidate Coordinator' },
  { value: 'recruiter',             label: 'Recruiter' },
  { value: 'hr',                    label: 'HR' },
  { value: 'accounts',              label: 'Accounts' },
  { value: 'partner',               label: 'Partner' },
]
