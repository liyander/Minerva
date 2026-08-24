// Canonical roles for the training platform.
//
// The database historically stored the learner role as 'operator'. Rather than
// rewriting every existing row and check, 'operator' is treated as an alias of
// 'trainee' everywhere through normaliseRole().
export const ROLES = {
  TRAINEE: 'trainee',
  TRAINER: 'trainer',
  ADMIN: 'admin',
  DEVELOPER: 'developer',
}

export const ASSIGNABLE_ROLES = [ROLES.TRAINEE, ROLES.TRAINER, ROLES.ADMIN]

const ALIASES = {
  operator: ROLES.TRAINEE,
  student: ROLES.TRAINEE,
  user: ROLES.TRAINEE,
  instructor: ROLES.TRAINER,
  teacher: ROLES.TRAINER,
}

export function normaliseRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return ALIASES[value] || value || ROLES.TRAINEE
}

export function isRole(role, ...expected) {
  const actual = normaliseRole(role)
  return expected.map(normaliseRole).includes(actual)
}

export const APPROVAL = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

export function roleLabel(role) {
  const normalised = normaliseRole(role)
  return {
    [ROLES.TRAINEE]: 'Trainee',
    [ROLES.TRAINER]: 'Trainer',
    [ROLES.ADMIN]: 'Admin',
    [ROLES.DEVELOPER]: 'Developer',
  }[normalised] || 'Trainee'
}

/**
 * Trainers self-register and must be approved by an admin before they can sign
 * in; trainees are approved immediately so the platform stays low-friction.
 */
export function initialApprovalFor(role) {
  return normaliseRole(role) === ROLES.TRAINER ? APPROVAL.PENDING : APPROVAL.APPROVED
}
