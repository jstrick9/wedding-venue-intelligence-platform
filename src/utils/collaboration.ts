import type { Guest, PlacedDecor, PlacedFixture, PlacedTable, User } from '../types';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { STORAGE_VERSIONS } from '../constants/storageVersions';
import { loadVersionedStorage, saveVersionedStorage } from './storage';
import { publishCollaborationEvent } from './collaborationChannel';
import { createEntityId } from './entityId';

export interface RevisionedSavedLayout {
  id: string;
  name: string;
  venueId: string;
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  decor: PlacedDecor[];
  guests: Guest[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  revision: number;
  lastModifiedBy?: string;
  lastModifiedByName?: string;
}

export interface LayoutEditSession {
  layoutId: string;
  editorId: string;
  editorName: string;
  startedAt: string;
  expiresAt: string;
  baseRevision: number;
}

const SAVED_LAYOUTS_KEY = STORAGE_KEYS.SAVED_LAYOUTS;
const SAVED_LAYOUTS_VERSION = STORAGE_VERSIONS.SAVED_LAYOUTS;
const EDIT_SESSIONS_KEY = STORAGE_KEYS.LAYOUT_EDIT_SESSIONS;
const EDIT_SESSIONS_VERSION = STORAGE_VERSIONS.LAYOUT_EDIT_SESSIONS;
const DEFAULT_EDIT_SESSION_TTL_MS = 2 * 60 * 1000;

export function getSavedLayoutDocuments(): RevisionedSavedLayout[] {
  return loadVersionedStorage<RevisionedSavedLayout[]>({
    key: SAVED_LAYOUTS_KEY,
    defaultValue: [],
    currentVersion: SAVED_LAYOUTS_VERSION,
    migrations: {
      0: (input) =>
        Array.isArray(input)
          ? (input as Array<Partial<RevisionedSavedLayout>>).map((layout) => ({
              id:
                layout.id ||
                createEntityId(
                  'saved',
                  (input as Array<Partial<RevisionedSavedLayout>>)
                    .map((candidate) => candidate.id)
                    .filter((id): id is string => Boolean(id)),
                ),
              name: layout.name || 'Untitled Layout',
              venueId: layout.venueId || '',
              tables: Array.isArray(layout.tables) ? (layout.tables as PlacedTable[]) : [],
              fixtures: Array.isArray(layout.fixtures)
                ? (layout.fixtures as PlacedFixture[])
                : [],
              decor: Array.isArray(layout.decor) ? (layout.decor as PlacedDecor[]) : [],
              guests: Array.isArray(layout.guests) ? (layout.guests as Guest[]) : [],
              createdAt: layout.createdAt || new Date().toISOString(),
              updatedAt: layout.updatedAt || new Date().toISOString(),
              createdBy: layout.createdBy,
              revision: 1,
              lastModifiedBy: layout.createdBy,
              lastModifiedByName: undefined,
            }))
          : [],
      2: (input) =>
        Array.isArray(input)
          ? (input as Array<Partial<RevisionedSavedLayout>>).map((layout) => ({
              id:
                layout.id ||
                createEntityId(
                  'saved',
                  (input as Array<Partial<RevisionedSavedLayout>>)
                    .map((candidate) => candidate.id)
                    .filter((id): id is string => Boolean(id)),
                ),
              name: layout.name || 'Untitled Layout',
              venueId: layout.venueId || '',
              tables: Array.isArray(layout.tables) ? (layout.tables as PlacedTable[]) : [],
              fixtures: Array.isArray(layout.fixtures)
                ? (layout.fixtures as PlacedFixture[])
                : [],
              decor: Array.isArray(layout.decor) ? (layout.decor as PlacedDecor[]) : [],
              guests: Array.isArray(layout.guests) ? (layout.guests as Guest[]) : [],
              createdAt: layout.createdAt || new Date().toISOString(),
              updatedAt: layout.updatedAt || new Date().toISOString(),
              createdBy: layout.createdBy,
              revision: typeof layout.revision === 'number' ? layout.revision : 1,
              lastModifiedBy: layout.lastModifiedBy,
              lastModifiedByName: layout.lastModifiedByName,
            }))
          : [],
    },
    normalize: (value) =>
      Array.isArray(value)
        ? value.map((layout) => ({
            ...layout,
            tables: Array.isArray(layout.tables) ? layout.tables : [],
            fixtures: Array.isArray(layout.fixtures) ? layout.fixtures : [],
            decor: Array.isArray(layout.decor) ? layout.decor : [],
            guests: Array.isArray(layout.guests) ? layout.guests : [],
            revision: typeof layout.revision === 'number' ? layout.revision : 1,
          }))
        : [],
  });
}

export function setSavedLayoutDocuments(layouts: RevisionedSavedLayout[]): void {
  saveVersionedStorage(SAVED_LAYOUTS_KEY, SAVED_LAYOUTS_VERSION, layouts);
}

export function getLayoutDocumentById(layoutId: string): RevisionedSavedLayout | null {
  return getSavedLayoutDocuments().find((layout) => layout.id === layoutId) || null;
}

export function saveLayoutDocumentWithRevisionCheck(args: {
  nextLayout: RevisionedSavedLayout;
  expectedRevision: number | null;
  actor?: Pick<User, 'id' | 'name'> | null;
}):
  | { ok: true; layout: RevisionedSavedLayout }
  | { ok: false; reason: 'revision-conflict'; current: RevisionedSavedLayout | null } {
  const layouts = getSavedLayoutDocuments();
  const existing = layouts.find((layout) => layout.id === args.nextLayout.id) || null;
  const currentRevision = existing?.revision ?? null;

  if (args.expectedRevision !== currentRevision) {
    return { ok: false, reason: 'revision-conflict', current: existing };
  }

  const nextRevision = (existing?.revision ?? 0) + 1;
  const next: RevisionedSavedLayout = {
    ...args.nextLayout,
    revision: nextRevision,
    updatedAt: new Date().toISOString(),
    lastModifiedBy: args.actor?.id,
    lastModifiedByName: args.actor?.name,
  };

  const updated = existing
    ? layouts.map((layout) => (layout.id === next.id ? next : layout))
    : [next, ...layouts];

  setSavedLayoutDocuments(updated);

  publishCollaborationEvent({
    type: 'layout-saved',
    layoutId: next.id,
    revision: next.revision,
    actorName: args.actor?.name,
  });

  return { ok: true, layout: next };
}

export function getLayoutEditSessions(): LayoutEditSession[] {
  return loadVersionedStorage<LayoutEditSession[]>({
    key: EDIT_SESSIONS_KEY,
    defaultValue: [],
    currentVersion: EDIT_SESSIONS_VERSION,
    migrations: {
      0: (input) => (Array.isArray(input) ? (input as LayoutEditSession[]) : []),
    },
    normalize: (value) =>
      Array.isArray(value)
        ? value.filter((session) => new Date(session.expiresAt).getTime() > Date.now())
        : [],
  });
}

export function setLayoutEditSessions(sessions: LayoutEditSession[]): void {
  saveVersionedStorage(EDIT_SESSIONS_KEY, EDIT_SESSIONS_VERSION, sessions);
}

export function beginLayoutEditSession(args: {
  layoutId: string;
  editorId: string;
  editorName: string;
  baseRevision: number;
  ttlMs?: number;
}): LayoutEditSession {
  const ttlMs = args.ttlMs ?? DEFAULT_EDIT_SESSION_TTL_MS;

  const next: LayoutEditSession = {
    layoutId: args.layoutId,
    editorId: args.editorId,
    editorName: args.editorName,
    baseRevision: args.baseRevision,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  };

  const sessions = getLayoutEditSessions().filter(
    (session) => !(session.layoutId === args.layoutId && session.editorId === args.editorId),
  );

  setLayoutEditSessions([...sessions, next]);

  publishCollaborationEvent({
    type: 'layout-session-started',
    layoutId: args.layoutId,
    editorId: args.editorId,
    editorName: args.editorName,
  });

  return next;
}

export function refreshLayoutEditSession(
  layoutId: string,
  editorId: string,
  ttlMs = DEFAULT_EDIT_SESSION_TTL_MS,
): void {
  const sessions = getLayoutEditSessions().map((session) =>
    session.layoutId === layoutId && session.editorId === editorId
      ? { ...session, expiresAt: new Date(Date.now() + ttlMs).toISOString() }
      : session,
  );

  setLayoutEditSessions(sessions);
}

export function endLayoutEditSession(layoutId: string, editorId: string): void {
  setLayoutEditSessions(
    getLayoutEditSessions().filter(
      (session) => !(session.layoutId === layoutId && session.editorId === editorId),
    ),
  );

  publishCollaborationEvent({
    type: 'layout-session-ended',
    layoutId,
    editorId,
  });
}

export function getConflictingLayoutEditors(
  layoutId: string,
  editorId?: string,
): LayoutEditSession[] {
  return getLayoutEditSessions().filter(
    (session) => session.layoutId === layoutId && session.editorId !== editorId,
  );
}