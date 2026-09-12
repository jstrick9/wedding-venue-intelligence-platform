import type { FixtureType, TableSpec, User, UserPermissions } from '../types';
import { hasGranularPermission, resolveUserPermissions, userHasAssignedRoles } from './rbacBridge';

function permissionEnabled(value: boolean | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function getPermissions(user: User | null | undefined): UserPermissions {
  return resolveUserPermissions(user);
}

export function isAdminUser(user: User | null | undefined): boolean {
  return user?.role === 'admin';
}

export function isStaffUser(user: User | null | undefined): boolean {
  return user?.role === 'staff';
}

export function isGuestUser(user: User | null | undefined): boolean {
  return user?.role === 'guest';
}

export function canViewLayout(user: User | null | undefined): boolean {
  if (!user) return false;
  if (userHasAssignedRoles(user)) {
    return permissionEnabled(getPermissions(user).canViewLayout, false);
  }
  if (isAdminUser(user)) return true;
  return permissionEnabled(getPermissions(user).canViewLayout, true);
}

export function canEditLayout(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isGuestUser(user) && !userHasAssignedRoles(user)) return false;
  if (userHasAssignedRoles(user)) {
    return permissionEnabled(getPermissions(user).canEditLayout, false);
  }
  if (isAdminUser(user) || isStaffUser(user)) return true;
  return permissionEnabled(getPermissions(user).canEditLayout, true);
}

export function canManageGuests(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isGuestUser(user) && !userHasAssignedRoles(user)) return false;
  if (userHasAssignedRoles(user)) {
    return permissionEnabled(getPermissions(user).canManageGuests, false);
  }
  if (isAdminUser(user) || isStaffUser(user)) return true;
  return permissionEnabled(getPermissions(user).canManageGuests, true);
}

export function canPrintLayouts(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isGuestUser(user) && !userHasAssignedRoles(user)) return false;
  if (userHasAssignedRoles(user)) {
    return permissionEnabled(getPermissions(user).canPrint, false);
  }
  if (isAdminUser(user) || isStaffUser(user)) return true;
  return permissionEnabled(getPermissions(user).canPrint, true);
}

export function canExportLayouts(user: User | null | undefined): boolean {
  if (!user) return false;
  if (isGuestUser(user) && !userHasAssignedRoles(user)) return false;
  if (userHasAssignedRoles(user)) {
    return permissionEnabled(getPermissions(user).canExport, false);
  }
  if (isAdminUser(user) || isStaffUser(user)) return true;
  return permissionEnabled(getPermissions(user).canExport, true);
}

export function canAccessAdminPanel(user: User | null | undefined): boolean {
  if (!user) return false;
  if (userHasAssignedRoles(user)) {
    return hasGranularPermission(user, 'admin.panel.access');
  }
  return isAdminUser(user);
}

export function canManageUsers(user: User | null | undefined): boolean {
  if (!user) return false;
  if (userHasAssignedRoles(user)) {
    return (
      hasGranularPermission(user, 'admin.users.manage') ||
      hasGranularPermission(user, 'admin.users.invite') ||
      permissionEnabled(getPermissions(user).canInviteUsers, false)
    );
  }
  return isAdminUser(user) || permissionEnabled(getPermissions(user).canInviteUsers, false);
}

export function canAccessOperationsPanel(user: User | null | undefined): boolean {
  if (!user) return false;
  if (userHasAssignedRoles(user)) {
    return (
      hasGranularPermission(user, 'staff.operations.access') ||
      hasGranularPermission(user, 'admin.panel.access')
    );
  }
  return isAdminUser(user) || isStaffUser(user);
}

export function canManageOperationsData(user: User | null | undefined): boolean {
  return canAccessOperationsPanel(user);
}

export function canUseTableSpec(user: User | null | undefined, spec: TableSpec): boolean {
  if (spec.archived) return false;
  if (userHasAssignedRoles(user)) return canEditLayout(user);
  if (isAdminUser(user)) return true;
  if (!canEditLayout(user)) return false;
  return true;
}

export function canSeeFixtureType(user: User | null | undefined, fixture: FixtureType): boolean {
  if (userHasAssignedRoles(user)) {
    if (!canViewLayout(user)) return false;
    return fixture.visibleToUsers !== false || hasGranularPermission(user, 'admin.panel.access');
  }
  if (isAdminUser(user)) return true;
  if (!canViewLayout(user)) return false;
  return fixture.visibleToUsers !== false;
}

export function canPlaceFixtureType(user: User | null | undefined, fixture: FixtureType): boolean {
  if (fixture.archived) return false;
  if (userHasAssignedRoles(user)) {
    if (!canEditLayout(user)) return false;
    if (fixture.visibleToUsers === false && !hasGranularPermission(user, 'admin.panel.access')) return false;
    if (fixture.isSelectable === false) return false;
    return true;
  }
  if (isAdminUser(user)) return true;
  if (!canEditLayout(user)) return false;
  if (fixture.visibleToUsers === false) return false;
  if (fixture.isSelectable === false) return false;
  return true;
}

export function canMoveFixture(user: User | null | undefined, fixture: FixtureType): boolean {
  if (fixture.isPermanent) return false;
  if (userHasAssignedRoles(user)) {
    if (!canEditLayout(user)) return false;
    if (fixture.isLocked && !hasGranularPermission(user, 'admin.panel.access')) return false;
    return true;
  }
  if (isAdminUser(user)) return true;
  if (!canEditLayout(user)) return false;
  if (fixture.isLocked) return false;
  return true;
}
