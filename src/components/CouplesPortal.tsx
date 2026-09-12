import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CoupleEvent,
  CoupleCollaborator,
  CoupleCollaboratorRole,
  CoupleVendor,
  EventQuestion,
  EventAnswer,
  GuestPortalConfig,
  PortalScheduleItem,
  CoupleChecklistItem,
  VenueMapPoint,
  VenueMapConfig,
  DEFAULT_MEAL_OPTIONS,
} from '../types';
import {
  getCoupleEvents,
  resolveCoupleInviteToken,
  acceptCoupleInvite,
  saveCoupleSession,
  saveCoupleSessionForEvent,
  loadCoupleSession,
  clearCoupleSession,
  getCoupleTokenFromLocation,
  buildCoupleInviteUrl,
  rotateCoupleInviteToken,
  rotateCoupleCollaboratorToken,
  addCoupleCollaborator,
  removeCoupleCollaborator,
  updateCoupleEvent,
  deriveRecommendedVenueCategories,
  submitCoupleLayout,
  setSpaceLayout,
  saveCoupleSpaceLayout,
} from '../services/couples/coupleService';
import { getCoupleAnswers, saveCoupleAnswers } from '../services/couples/coupleAnswersService';
import { getCoupleMessages, sendCoupleMessage, markCoupleChatRead, getUnreadCoupleMessageCounts } from '../services/couples/coupleChatService';
import {
  getCoupleGuests,
  addCoupleGuest,
  updateCoupleGuest,
  removeCoupleGuest,
  importCoupleGuests,
  exportCoupleGuestsCsv,
  buildGuestInviteUrl,
  buildDefaultCouplePortalConfig,
  getCouplePortalConfig,
  setCouplePortalConfig,
  rotateCoupleGuestToken,
} from '../services/couples/coupleGuestService';
import { getGuestPortalConfig } from '../utils/guestPortal';
import { parseGuestCsv } from '../utils/guestCsv';
import { getCoupleRsvpSubmissions, removeCoupleRsvp, upsertCoupleRsvp } from '../services/couples/coupleRsvpService';
import { getCoupleChecklist, addCoupleChecklistItem, toggleCoupleChecklistItem, removeCoupleChecklistItem } from '../services/couples/coupleChecklistService';
import { groupByPhase } from '../utils/groupByPhase';
import { getCoupleVendors, addCoupleVendor, updateCoupleVendor, removeCoupleVendor, getVenuePreferredVendors } from '../services/couples/coupleVendorService';
import { getVendorCategories, vendorCategoryLabel } from '../services/vendors/vendorCategoryService';
import { findWeddingPackage, PACKAGE_DURATIONS, INCLUDED_ITEMS } from '../services/couples/couplePackageService';
import { getActivePackageAddOns, findPackageAddOn, ADD_ON_CATEGORIES } from '../services/couples/coupleAddOnService';
import { getCoupleSetupTasks, addCoupleSetupTask, removeCoupleSetupTask } from '../services/couples/coupleSetupService';
import {
  getCoupleGuestEvents,
  addCoupleGuestEvent,
  updateCoupleGuestEvent,
  removeCoupleGuestEvent,
  assignGuestToEvent,
  removeGuestFromEvent,
  ensureDerivedGuestEvents,
  GUEST_EVENT_KIND_LABELS,
} from '../services/couples/coupleGuestEventService';
import { getVenues } from '../hooks/useLayoutState';
import { getVenueVendors } from '../hooks/useVendors';
import {
  getVenueMapConfigForPortal,
  findRainContingency,
  getVenueRules,
  normalizeVenueMapConfigForPortal,
  normalizeVenueRulesConfig,
} from '../services/wayfinding/venueWayfindingService';
import {
  eventDates,
  getVenueWeather,
  normalizeVenueWeatherConfig,
} from '../services/weather/venueWeatherService';
import { useBrandingConfig } from '../config';
import { applyDocumentBranding } from '../utils/documentBranding';
import { getPublicVenueBranding } from '../services/platform/publicVenueService';
import { getActiveOrganizationSlug, setActiveOrganizationSlug } from '../services/platform/organizationContext';
import { isPortalAccessActive } from '../services/couples/accessLifecycle';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { emit, on } from '../utils/appEvents';
import {
  buildCouplePortalSnapshot,
  hydrateCouplePortalSnapshot,
  isCoupleCloudEnabled,
  isPortalAccessError,
  pullCouplePortalSnapshot,
  resolveAuthoritativePortalVenueMap,
  saveCouplePortalSnapshot,
} from '../services/couples/coupleCloudSync';
import { EventQuestionsWizard } from './EventQuestionsWizard';
import { showToast } from './Toast';
import { createSecretRecord } from '../utils/auth';
import { sendCoupleEmail } from '../services/couples/coupleEmailService';
import { CoupleLayoutEditor } from './CoupleLayoutEditor';
import { VenueMapCanvas } from './VenueMapCanvas';
import { VenueMapRainPlanGuidance } from './VenueMapRainPlanGuidance';
import {
  hasRenderableVenueMapContent,
  projectVenueMap,
  rainContingencyValidationIssue,
} from '../utils/venueMapDesigner';
import { LodgingAssignmentsModal } from './LodgingAssignmentsModal';
import { normalizeEmail, normalizeUsPhone } from '../utils/contactQuality';
import { PortalInviteAccountSetup } from './PortalInviteAccountSetup';
import { signOutPortalAccount, type PortalInviteContext } from '../services/portal/portalInviteAccount';

// Safe formatters that never throw on malformed/incomplete date strings, so the
// couple portal can't crash with "Invalid time value" from bad schedule/guest data.
function safeTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function safeDateTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

import { CoupleTimelineTab } from './couple/CoupleTimelineTab';

function invitationCatalogArray<T>(
  catalog: Record<string, unknown> | undefined,
  key: string,
  legacyRead: () => T[],
): T[] {
  if (catalog === undefined) return legacyRead();
  return Array.isArray(catalog[key]) ? catalog[key] as T[] : [];
}

function resolveSnapshotInvite(
  events: CoupleEvent[],
  token: string,
): { event: CoupleEvent; collaborator: CoupleCollaborator } | null {
  for (const event of events) {
    if (event.inviteToken === token && isPortalAccessActive(event.inviteExpiresAt)) {
      const existing = event.collaborators.find((candidate) => (
        candidate.inviteToken === token || candidate.id === `col-${event.id}-owner`
      ));
      const collaborator = existing || {
        id: `col-${event.id}-owner`,
        name: event.coupleName,
        email: '',
        role: 'couple' as const,
        inviteToken: token,
        inviteIssuedAt: event.inviteIssuedAt || event.createdAt,
        inviteExpiresAt: event.inviteExpiresAt,
        accepted: true,
        invitedAt: event.createdAt,
      };
      return {
        event: existing ? event : { ...event, collaborators: [...event.collaborators, collaborator] },
        collaborator,
      };
    }
    const collaborator = event.collaborators.find((candidate) => (
      candidate.inviteToken === token
      && !candidate.revokedAt
      && isPortalAccessActive(candidate.inviteExpiresAt || event.inviteExpiresAt)
    ));
    if (collaborator) return { event, collaborator };
  }
  return null;
}

type TabId = 'overview' | 'package' | 'spaces' | 'questions' | 'design' | 'checklist' | 'timeline' | 'vendors' | 'guests' | 'portal' | 'chat' | 'collaborators';

interface CouplesPortalProps {
  coupleToken?: string;
  venueSlug?: string;
  onExitPortal: () => void;
}

/**
 * Couples Portal — the portal a booked couple (and their invited collaborators)
 * use after the wedding venue creates their event. Personal-account invitations
 * open an overview of the booked event, venue-space choices, and collaborator
 * management (planner / parents / vendors). Space-driven questions,
 * layout design/approval, and a per-couple guest portal are layered on next.
 */
function CouplesPortalSession({ coupleToken, venueSlug, onExitPortal }: CouplesPortalProps) {
  const localConfig = useBrandingConfig();
  const [publicVenueConfig, setPublicVenueConfig] = useState<typeof localConfig | null>(null);
  const config = publicVenueConfig || localConfig;
  const organizationSlug = getActiveOrganizationSlug();
  const linkVenueSlug = venueSlug || organizationSlug || undefined;
  const [persistedInviteToken, setPersistedInviteToken] = useState(coupleToken || '');
  const accountInviteToken = coupleToken || persistedInviteToken || undefined;
  const cloudAccountInvite = isCoupleCloudEnabled() && Boolean(accountInviteToken);
  const [portalAccountAccess, setPortalAccountAccess] = useState<'pending' | 'ready' | 'legacy'>(
    () => cloudAccountInvite ? 'pending' : 'legacy',
  );
  // Cloud map rendering must not depend on a successful browser-cache write.
  // `undefined` selects the local/legacy cache; `null` is an authoritative or
  // context-clearing absence; an object is the current invite-scoped map.
  const [remoteVenueMap, setRemoteVenueMap] = useState<VenueMapConfig | null | undefined>();
  const [venueMapRetryNonce, setVenueMapRetryNonce] = useState(0);
  // Venue-authored catalogs are immutable from this portal. In cloud mode they
  // render directly from the invitation-scoped snapshot; global browser storage
  // remains a compatibility cache only.
  const [remoteVenueCatalog, setRemoteVenueCatalog] = useState<Record<string, unknown> | undefined>(
    () => cloudAccountInvite ? {} : undefined,
  );
  const [cloudReadOnlyFallback, setCloudReadOnlyFallback] = useState(false);
  const cloudReadOnlyFallbackRef = useRef(false);
  const [failedCacheDomains, setFailedCacheDomains] = useState<string[]>([]);
  const handlePortalAccountReady = useCallback((context: PortalInviteContext) => {
    if (context.organizationSlug) setActiveOrganizationSlug(context.organizationSlug);
    setRemoteVenueMap(null);
    setRemoteVenueCatalog({});
    cloudReadOnlyFallbackRef.current = false;
    setCloudReadOnlyFallback(false);
    setFailedCacheDomains([]);
    setPortalAccountAccess('ready');
  }, []);
  const handleLegacyPortalInvite = useCallback(() => {
    setRemoteVenueMap(undefined);
    setRemoteVenueCatalog(undefined);
    cloudReadOnlyFallbackRef.current = false;
    setCloudReadOnlyFallback(false);
    setFailedCacheDomains([]);
    setPortalAccountAccess('legacy');
  }, []);

  useEffect(() => {
    if (coupleToken) setPersistedInviteToken(coupleToken);
  }, [coupleToken]);

  useEffect(() => {
    setRemoteVenueMap(cloudAccountInvite ? null : undefined);
    setRemoteVenueCatalog(cloudAccountInvite ? {} : undefined);
    cloudReadOnlyFallbackRef.current = false;
    setCloudReadOnlyFallback(false);
    setFailedCacheDomains([]);
    setPortalAccountAccess(cloudAccountInvite ? 'pending' : 'legacy');
  }, [accountInviteToken, cloudAccountInvite]);

  useEffect(() => {
    if (!venueSlug) return;
    void getPublicVenueBranding(venueSlug).then((branding) => {
      if (branding) setPublicVenueConfig(branding.config);
    });
  }, [venueSlug]);

  useEffect(() => {
    applyDocumentBranding({
      name: config.venueName,
      logoUrl: config.logoUrl,
      primaryColor: config.primaryColor,
      suffix: 'Couples Portal',
    });
  }, [config.venueName, config.logoUrl, config.primaryColor]);
  const [session, setSession] = useState(() => loadCoupleSession());
  const [events, setEvents] = useState<CoupleEvent[]>(() => getCoupleEvents());
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [invalidInvite, setInvalidInvite] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [demoSelectToken, setDemoSelectToken] = useState('');
  const cloudHydratingRef = useRef(false);
  const cloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Compare-and-swap base (Review #258 F-258-2): the updated_at of the last
  // pulled snapshot; the server refuses a save with 'conflict' when the row
  // moved in between (e.g. a guest submitted after our pull).
  const cloudSyncedAtRef = useRef<string | undefined>(undefined);
  const activeVenueRules = useMemo(() => (
    remoteVenueCatalog === undefined
      ? getVenueRules()
      : normalizeVenueRulesConfig(remoteVenueCatalog.venueRules)
  ), [remoteVenueCatalog]);
  const activeVenueWeather = useMemo(() => (
    remoteVenueCatalog === undefined
      ? getVenueWeather()
      : normalizeVenueWeatherConfig(remoteVenueCatalog.venueWeather)
  ), [remoteVenueCatalog]);

  const event = useMemo(
    () => events.find((e) => e.id === session?.eventId) || null,
    [events, session],
  );
  const me = useMemo(
    () => event?.collaborators.find((c) => c.id === session?.collaboratorId) || null,
    [event, session],
  );

  useEffect(() => {
    if (event && !isPortalAccessActive(event.inviteExpiresAt)) {
      clearCoupleSession();
      setSession(null);
    }
  }, [event]);

  // ── Tiered collaborator permissions ─────────────────────────────────────────
  // couple: full control. planner: design/spaces/guests/questions but not portal
  // branding or collaborators. family: can help answer questions + view + chat.
  // vendor: view + chat only.
  const myRole: CoupleCollaboratorRole = me?.role || 'couple';
  // A venue-marked "completed" event is locked for planning: everything is
  // view-only (the couple can still read and chat).
  const isComplete = event?.status === 'completed';
  const canEditSpaces = !cloudReadOnlyFallback && !isComplete && (myRole === 'couple' || myRole === 'planner');
  const canEditDesign = !cloudReadOnlyFallback && !isComplete && (myRole === 'couple' || myRole === 'planner');
  const canManageGuests = !cloudReadOnlyFallback && !isComplete && (myRole === 'couple' || myRole === 'planner');
  const canAnswerQuestions = !cloudReadOnlyFallback && !isComplete && myRole !== 'vendor';
  const canManagePortal = !cloudReadOnlyFallback && !isComplete && myRole === 'couple';
  const canManageCollaborators = !cloudReadOnlyFallback && !isComplete && myRole === 'couple';

  // Token-based entry: whenever coupleToken is provided (or in window.location),
  // resolve it and sign in. Importantly, if there is an existing session from a
  // different couple or old test event, we must override it with the newly requested
  // token so the user can switch directly to their newly created test wedding event.
  useEffect(() => {
    if (cloudAccountInvite && portalAccountAccess === 'pending') return;
    const tokenToResolve = accountInviteToken || getCoupleTokenFromLocation(window.location);
    if (!tokenToResolve) return;
    // Refresh events from storage so any newly created couple event is available
    const latestEvents = getCoupleEvents();
    setEvents(latestEvents);

    const resolved = resolveCoupleInviteToken(tokenToResolve);
    if (!resolved) {
      // In cloud mode the account gate runs before the private snapshot is
      // hydrated onto this device. Let the authenticated pull resolve it rather
      // than briefly declaring a valid personal invite invalid.
      if (!isCoupleCloudEnabled()) setInvalidInvite(true);
      return;
    }
    // If our active session is already for this exact couple and collaborator, nothing to do.
    if (
      session &&
      session.eventId === resolved.event.id &&
      session.collaboratorId === resolved.collaborator.id
    ) {
      return;
    }
    setInvalidInvite(false);
    saveCoupleSession(resolved.event.id, resolved.collaborator.id);
    acceptCoupleInvite(resolved.event.id, resolved.collaborator.id);
    const newSession = loadCoupleSession();
    setSession(newSession);
    setEvents(getCoupleEvents());
  }, [accountInviteToken, cloudAccountInvite, portalAccountAccess, session]);

  // Cross-device couple sync: Supabase is optional. New email-backed invites
  // require the isolated personal Auth session above; historical no-email links
  // retain token-only compatibility. Local services remain the immediate UI
  // cache while polling keeps another device's edits visible.
  const cloudToken = accountInviteToken || event?.inviteToken || '';
  const cloudVenueMapAuthoritative = isCoupleCloudEnabled() && Boolean(cloudToken);
  const activeVenueMap = resolveAuthoritativePortalVenueMap(
    remoteVenueMap,
    cloudVenueMapAuthoritative ? null : getVenueMapConfigForPortal(),
    cloudVenueMapAuthoritative,
  );
  useEffect(() => {
    if (cloudAccountInvite && portalAccountAccess === 'pending') return;
    if (!isCoupleCloudEnabled() || !cloudToken) return;
    let cancelled = false;
    // In-flight guard (Review #245 P1-A): skip a polling tick while the previous
    // pull is still running so a stalled network cannot stack requests.
    let pulling = false;

    const hydrateRemote = async () => {
      if (pulling) return;
      pulling = true;
      try {
        const pulled = await pullCouplePortalSnapshot(cloudToken, venueSlug);
        if (!pulled || cancelled) return;
        cloudSyncedAtRef.current = pulled.updatedAt;
        const snapshot = pulled.payload;
        cloudHydratingRef.current = true;
        setRemoteVenueCatalog((previous) => (
          JSON.stringify(previous) === JSON.stringify(snapshot) ? previous : snapshot
        ));
        if (Object.prototype.hasOwnProperty.call(snapshot, 'venueMapConfigs')) {
          const nextVenueMap = normalizeVenueMapConfigForPortal(
            snapshot.venueMapConfigs,
            { preservePortalStatus: true, preserveDuplicateIds: true },
          );
          setRemoteVenueMap((previous) => (
            JSON.stringify(previous) === JSON.stringify(nextVenueMap)
              ? previous
              : nextVenueMap
          ));
        }
        const hydration = hydrateCouplePortalSnapshot(snapshot);
        const snapshotEvents = Array.isArray(snapshot.coupleEvents)
          ? snapshot.coupleEvents as CoupleEvent[]
          : [];
        // The server response, not a global browser cache, owns this invitation.
        // Keep its exact scoped event set available even when localStorage rejects
        // one or every hydration write.
        const resolved = resolveSnapshotInvite(snapshotEvents, cloudToken);
        const visibleEvents = resolved
          ? snapshotEvents.map((candidate) => candidate.id === resolved.event.id ? resolved.event : candidate)
          : snapshotEvents;
        setEvents((previous) => (
          JSON.stringify(previous) === JSON.stringify(visibleEvents) ? previous : visibleEvents
        ));
        if (resolved) {
          const memorySession = saveCoupleSessionForEvent(
            resolved.event,
            resolved.collaborator.id,
          );
          const persistedSession = loadCoupleSession();
          const sessionPersisted = Boolean(
            persistedSession
            && persistedSession.eventId === memorySession.eventId
            && persistedSession.collaboratorId === memorySession.collaboratorId,
          );
          const failures = [
            ...hydration.failedDomains,
            ...(!sessionPersisted ? ['coupleSession'] : []),
          ];
          setFailedCacheDomains(failures);
          cloudReadOnlyFallbackRef.current = failures.length > 0;
          setCloudReadOnlyFallback(failures.length > 0);
          // Compare semantic fields only: persistence refreshes the rolling
          // expiry on every poll even when the authenticated identity is stable.
          setSession((previous) => (
            previous
              && previous.eventId === memorySession.eventId
              && previous.collaboratorId === memorySession.collaboratorId
              && previous.role === memorySession.role
              && previous.coupleName === memorySession.coupleName
                ? previous
                : memorySession
          ));
          setInvalidInvite(false);
        }
        cloudHydratingRef.current = false;
      } catch (err) {
        if (isPortalAccessError(err) && !cancelled) {
          // F-276-4: an authoritative expiry, revocation, venue suspension, or
          // account mismatch must close an already-hydrated portal. Preserve
          // the isolated Auth session so a valid replacement link can still
          // recognize the same personal account, but clear the local portal
          // session and force the invitation gate to verify access again.
          cloudHydratingRef.current = false;
          cloudSyncedAtRef.current = undefined;
          clearCoupleSession();
          setSession(null);
          setRemoteVenueMap(null);
          setRemoteVenueCatalog({});
          cloudReadOnlyFallbackRef.current = false;
          setCloudReadOnlyFallback(false);
          setFailedCacheDomains([]);
          setInvalidInvite(false);
          setPortalAccountAccess('pending');
        } else if (!cancelled) {
          // F-268-1 (Review #268): the RPC (or its fetch deadline) REJECTS on
          // network failure/stall — with only try/finally this surfaced as an
          // unhandled promise rejection every 5 seconds while offline. The poll
          // retries on its own, so stay quiet.
          console.debug('Couple portal cloud pull failed; retrying on the next poll.', err);
        }
      } finally {
        cloudHydratingRef.current = false;
        pulling = false;
      }
    };

    const pushLocalSnapshot = async () => {
      if (cloudHydratingRef.current || cloudReadOnlyFallbackRef.current) return;
      const activeEventId = event?.id || session?.eventId;
      if (!activeEventId) return;
      try {
        const snapshot = await buildCouplePortalSnapshot(activeEventId);
        if (!snapshot) return;
        const result = await saveCouplePortalSnapshot(cloudToken, snapshot, venueSlug, cloudSyncedAtRef.current);
        if (result === 'conflict') {
          // The snapshot moved since our last pull (a guest submitted, or another
          // device saved). Re-hydrate so the rebuilt snapshot merges those writes,
          // then retry once — instead of blindly overwriting and losing them.
          await hydrateRemote();
          const merged = await buildCouplePortalSnapshot(activeEventId);
          if (merged) await saveCouplePortalSnapshot(cloudToken, merged, venueSlug, cloudSyncedAtRef.current);
        }
      } catch (err) {
        // F-268-1 (Review #268): a rejected save used to escape as an unhandled
        // promise rejection (and the unmount flush in the cleanup would too).
        // The edit is safe locally — localStorage owns it and the next change
        // or visit re-pushes it — so surface the cloud failure through the
        // established typed channel (App-level toast, Review #245 P2-F).
        console.error('Couple portal cloud save failed:', err);
        emit('spm_cloud_sync_error', {
          domain: 'couple portal',
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });
      }
    };

    void hydrateRemote();
    const off = on('spm_data_changed', (detail) => {
      if (cloudHydratingRef.current || cloudReadOnlyFallbackRef.current || detail?.source === 'backend') return;
      const type = detail?.type || '';
      if (type !== 'all' && !type.includes('couple') && !type.includes('guest') && !type.includes('package')) return;
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = setTimeout(() => { void pushLocalSnapshot(); }, 350);
    });
    const poll = window.setInterval(() => { void hydrateRemote(); }, 5000);

    return () => {
      cancelled = true;
      off();
      window.clearInterval(poll);
      // F-264-1 (Review #264): a save was scheduled but never fired (the portal
      // closed inside the 350ms debounce window) — flush it instead of dropping
      // it, or the couple's last edit never reaches the cloud and other devices
      // keep a stale snapshot until the next manual edit.
      if (cloudSaveTimerRef.current) {
        clearTimeout(cloudSaveTimerRef.current);
        void pushLocalSnapshot();
      }
      cloudSaveTimerRef.current = null;
    };
  }, [cloudAccountInvite, cloudToken, event?.id, portalAccountAccess, session?.eventId, venueMapRetryNonce, venueSlug]);

  const handleManualLaunch = (tokenInput: string) => {
    const token = tokenInput.trim();
    if (!token) {
      showToast('Please enter or select an invitation token.', 'warning');
      return;
    }
    if (isCoupleCloudEnabled()) {
      // Manual QA entry must follow the same backend account gate as a clicked
      // email link; it must never become a bearer-token bypass.
      setPersistedInviteToken(token);
      setPortalAccountAccess('pending');
      setInvalidInvite(false);
      return;
    }
    const latestEvents = getCoupleEvents();
    setEvents(latestEvents);
    const resolved = resolveCoupleInviteToken(token);
    if (!resolved) {
      setInvalidInvite(true);
      showToast('No couple event found matching that token.', 'error');
      return;
    }
    setInvalidInvite(false);
    saveCoupleSession(resolved.event.id, resolved.collaborator.id);
    acceptCoupleInvite(resolved.event.id, resolved.collaborator.id);
    setSession(loadCoupleSession());
    setEvents(getCoupleEvents());
    try {
      window.location.hash = `#/couples-portal?token=${encodeURIComponent(token)}${organizationSlug ? `&venue=${encodeURIComponent(organizationSlug)}` : ''}`;
    } catch {
      // ignore
    }
    showToast(`Welcome to the Couples Portal, ${resolved.event.coupleName}!`, 'success');
  };

  const venues = useMemo(
    () => invitationCatalogArray(remoteVenueCatalog, 'venues', getVenues),
    [remoteVenueCatalog],
  );

  const refresh = () => setEvents(getCoupleEvents());

  // ── Questions (reuse venue's Event Questions, scoped per couple event) ──────
  const eventQuestions = useMemo<EventQuestion[]>(() => invitationCatalogArray(
    remoteVenueCatalog,
    'eventQuestions',
    () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.EVENT_QUESTIONS);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as EventQuestion[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
  ), [remoteVenueCatalog]);

  const coupleAnswers = useMemo<EventAnswer[]>(() => {
    if (!event) return [];
    return cloudReadOnlyFallback
      ? invitationCatalogArray<EventAnswer>(remoteVenueCatalog, 'coupleAnswers', () => [])
      : getCoupleAnswers(event.id);
  }, [cloudReadOnlyFallback, event, remoteVenueCatalog]);

  const handleSaveAnswers = (answers: EventAnswer[]) => {
    if (cloudReadOnlyFallback || !event) return;
    saveCoupleAnswers(event.id, answers);
    // Derive recommended venue categories from answers and narrow availableSpaces
    // to the venues whose category was selected by the couple's answers.
    const cats = deriveRecommendedVenueCategories(answers, eventQuestions);
    if (cats.length > 0) {
      const recommended = venues.filter((v) => cats.includes(v.category)).map((v) => v.id);
      // Preserve any spaces the couple already selected so a narrowing never leaves a
      // selected space unavailable (which would orphan it in selectedSpaces).
      const preserved = (event.selectedSpaces || []).filter((id) =>
        venues.some((v) => v.id === id),
      );
      const merged = Array.from(new Set([...preserved, ...recommended]));
      if (merged.length > 0) {
        updateCoupleEvent(event.id, { availableSpaces: merged });
        refresh();
      }
    }
  };

  // ── Chat (venue ↔ couple) ──────────────────────────────────────────────────
  const [chatDraft, setChatDraft] = useState('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [msgTick, setMsgTick] = useState(0);
  const messages = useMemo(() => {
    if (!event) return [];
    return cloudReadOnlyFallback
      ? invitationCatalogArray<ReturnType<typeof getCoupleMessages>[number]>(
          remoteVenueCatalog,
          'coupleMessages',
          () => [],
        )
      : getCoupleMessages(event.id);
  }, [cloudReadOnlyFallback, event, msgTick, remoteVenueCatalog]);
  // Unread venue→couple messages shown as a badge on the Chat tab. In degraded
  // mode avoid reading another invitation's global read cursor.
  const unreadVenueChat = useMemo(
    () => (event && !cloudReadOnlyFallback
      ? (getUnreadCoupleMessageCounts([event.id], 'couple')[event.id] || 0)
      : 0),
    [cloudReadOnlyFallback, event, msgTick],
  );

  // Refresh the chat periodically (and when the tab is opened) so the couple sees new
  // venue messages without having to send one themselves. While the Chat tab is open
  // the couple side is marked as "read" so the venue's unread badge stays accurate.
  const activeChatEventId = activeTab === 'chat' ? event?.id : undefined;
  useEffect(() => {
    if (!cloudReadOnlyFallback && activeChatEventId) {
      markCoupleChatRead(activeChatEventId, 'couple');
    }
    setMsgTick((t) => t + 1);
    const id = setInterval(() => {
      if (!cloudReadOnlyFallback && activeChatEventId) {
        markCoupleChatRead(activeChatEventId, 'couple');
      }
      setMsgTick((t) => t + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [activeChatEventId, cloudReadOnlyFallback]);

  // Auto-scroll the couple chat to the newest message when it updates.
  useEffect(() => {
    if (activeTab === 'chat') {
      const el = chatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [activeTab, msgTick]);

  const handleSendMessage = () => {
    if (cloudReadOnlyFallback || !event || !chatDraft.trim()) return;
    sendCoupleMessage({
      coupleEventId: event.id,
      senderId: me?.id || 'couple',
      senderName: me?.name || event.coupleName,
      senderSide: 'couple',
      message: chatDraft,
    });
    setChatDraft('');
    setMsgTick((t) => t + 1);
  };

  const handleLogout = () => {
    clearCoupleSession();
    setSession(null);
    if (cloudAccountInvite) {
      setRemoteVenueMap(null);
      setRemoteVenueCatalog({});
      cloudReadOnlyFallbackRef.current = false;
      setCloudReadOnlyFallback(false);
      setFailedCacheDomains([]);
      setActiveOrganizationSlug(null);
      // Do not remount the account lookup until local Supabase sign-out has
      // finished, or it can observe the still-valid JWT and reopen the portal.
      void signOutPortalAccount('couple')
        .catch(() => undefined)
        .then(() => setPortalAccountAccess('pending'));
    }
  };

  // ── Invite / collaborator handlers ─────────────────────────────────────────
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    role: 'planner' as CoupleCollaboratorRole,
  });
  const [inviteError, setInviteError] = useState('');

  // ── Guests management ────────────────────────────────────────────────────
  const [guestTick, setGuestTick] = useState(0);
  // Poll so the couple sees new guest RSVPs (submitted from another device)
  // without reloading the page.
  useEffect(() => {
    const id = setInterval(() => setGuestTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, []);
  const coupleGuests = useMemo(() => {
    if (!event) return [];
    return cloudReadOnlyFallback
      ? invitationCatalogArray<ReturnType<typeof getCoupleGuests>[number]>(
          remoteVenueCatalog,
          'coupleGuests',
          () => [],
        )
      : getCoupleGuests(event.id);
  }, [cloudReadOnlyFallback, event, guestTick, remoteVenueCatalog]);
  const coupleRsvps = useMemo(() => {
    if (!event) return [];
    return cloudReadOnlyFallback
      ? invitationCatalogArray<ReturnType<typeof getCoupleRsvpSubmissions>[number]>(
          remoteVenueCatalog,
          'coupleSubmissions',
          () => [],
        )
      : getCoupleRsvpSubmissions(event.id);
  }, [cloudReadOnlyFallback, event, guestTick, remoteVenueCatalog]);
  const [guestForm, setGuestForm] = useState({ name: '', email: '', phone: '' });
  const [expandedGuestRsvp, setExpandedGuestRsvp] = useState<string | null>(null);
  const [guestError, setGuestError] = useState('');
  const [editingGuest, setEditingGuest] = useState<{ id: string; name: string; email: string; emailLocked: boolean; phone: string; tableId?: string; roomId?: string } | null>(null);
  // Guest list search + RSVP filter so large weddings stay navigable.
  const [guestSearch, setGuestSearch] = useState('');
  const [guestFilter, setGuestFilter] = useState<'all' | 'attending' | 'not-attending' | 'no-response'>('all');
  // Manual RSVP recording (e.g. a guest responded by phone).
  const [rsvpGuestId, setRsvpGuestId] = useState<string | null>(null);
  const [rsvpRecord, setRsvpRecord] = useState({ attending: true as boolean, meal: '', plusOne: '', notes: '' });

  // ── Checklist (couple's own prep checklist) ───────────────────────────────
  const [checklistTick, setChecklistTick] = useState(0);
  const coupleChecklist = useMemo(() => {
    if (!event) return [];
    return cloudReadOnlyFallback
      ? invitationCatalogArray<ReturnType<typeof getCoupleChecklist>[number]>(
          remoteVenueCatalog,
          'coupleChecklists',
          () => [],
        )
      : getCoupleChecklist(event.id);
  }, [checklistTick, cloudReadOnlyFallback, event, remoteVenueCatalog]);
  const [newCheckItem, setNewCheckItem] = useState({ title: '', phase: '', dueDate: '' });
  const addCheckItem = () => {
    if (cloudReadOnlyFallback) return;
    if (!event || !newCheckItem.title.trim()) {
      showToast('Enter a checklist item.', 'warning');
      return;
    }
    addCoupleChecklistItem(event.id, {
      title: newCheckItem.title,
      phase: newCheckItem.phase,
      dueDate: newCheckItem.dueDate,
      createdBy: me?.id,
    });
    setNewCheckItem({ title: '', phase: '', dueDate: '' });
    setChecklistTick((t) => t + 1);
  };

  // ── Vendors (couple's vendors; pick from venue preferred or add custom) ───
  const [vendorTick, setVendorTick] = useState(0);
  const coupleVendors = useMemo(() => {
    if (!event) return [];
    return cloudReadOnlyFallback
      ? invitationCatalogArray<ReturnType<typeof getCoupleVendors>[number]>(
          remoteVenueCatalog,
          'coupleVendors',
          () => [],
        )
      : getCoupleVendors(event.id);
  }, [cloudReadOnlyFallback, event, remoteVenueCatalog, vendorTick]);
  const preferredVendors = useMemo(() => getVenuePreferredVendors(
    invitationCatalogArray(remoteVenueCatalog, 'vendors', getVenueVendors),
  ), [remoteVenueCatalog]);
  const vendorCategories = useMemo(() => invitationCatalogArray(
    remoteVenueCatalog,
    'vendorCategories',
    getVendorCategories,
  ), [remoteVenueCatalog]);
  const [customVendor, setCustomVendor] = useState({ name: '', category: 'other', contactName: '', email: '', phone: '', notes: '' });
  const addCustomVendor = () => {
    if (cloudReadOnlyFallback) return;
    if (!event || !customVendor.name.trim()) {
      showToast('Enter a vendor name.', 'warning');
      return;
    }
    const email = normalizeEmail(customVendor.email);
    const phone = normalizeUsPhone(customVendor.phone);
    if (!email.ok) {
      showToast(email.error || "That email address isn't valid.", 'warning');
      return;
    }
    if (!phone.ok) {
      showToast(phone.error || 'Enter a 10-digit US phone number.', 'warning');
      return;
    }
    addCoupleVendor(event.id, {
      name: customVendor.name,
      category: customVendor.category,
      source: 'custom',
      contactName: customVendor.contactName,
      email: email.value,
      phone: phone.display,
      notes: customVendor.notes,
    });
    setCustomVendor({ name: '', category: 'other', contactName: '', email: '', phone: '', notes: '' });
    setVendorTick((t) => t + 1);
  };
  const pickPreferredVendor = (v: { id: string; name: string; category: string; contactName?: string; email?: string; phone?: string; website?: string }) => {
    if (!event) return;
    const added = addCoupleVendor(event.id, {
      name: v.name,
      category: v.category,
      source: 'preferred',
      venueVendorId: v.id,
      contactName: v.contactName,
      email: v.email,
      phone: v.phone,
      website: v.website,
    });
    setVendorTick((t) => t + 1);
    showToast(added ? `${v.name} added to your vendors.` : `${v.name} is already on your list.`, added ? 'success' : 'info');
  };
  const setVendorStatus = (vendorId: string, status: CoupleVendor['status']) => {
    if (cloudReadOnlyFallback || !event) return;
    updateCoupleVendor(event.id, vendorId, { status });
    setVendorTick((t) => t + 1);
  };

  // ── Package & add-ons (couple's booked package + paid add-ons) ────────────
  const [pkgTick, setPkgTick] = useState(0);
  // Layout editor modal state.
  const [layoutEditorSpace, setLayoutEditorSpace] = useState<string | null>(null);
  const [lodgingAssignVenue, setLodgingAssignVenue] = useState<string | null>(null);
  useEffect(() => {
    if (!cloudReadOnlyFallback) return;
    setLayoutEditorSpace(null);
    setLodgingAssignVenue(null);
    setEditingGuest(null);
    setRsvpGuestId(null);
  }, [cloudReadOnlyFallback]);
  const bookedPackage = useMemo(() => {
    if (!event) return undefined;
    if (remoteVenueCatalog === undefined) return findWeddingPackage(event.packageId);
    const catalog = Array.isArray(remoteVenueCatalog.weddingPackages)
      ? remoteVenueCatalog.weddingPackages
      : [];
    return catalog.find((item) => (
      item && typeof item === 'object' && 'id' in item && item.id === event.packageId
    )) as NonNullable<ReturnType<typeof findWeddingPackage>> | undefined;
  }, [event, pkgTick, remoteVenueCatalog]);
  const addOnCatalog = useMemo(() => invitationCatalogArray(
    remoteVenueCatalog,
    'packageAddOns',
    getActivePackageAddOns,
  ).filter((addOn) => addOn.active), [remoteVenueCatalog]);
  const coupleAddOns = useMemo(() => event?.addOns || [], [event, pkgTick]);

  // ── Guest events (itinerary) ───────────────────────────────────────────────
  const [guestEventTick, setGuestEventTick] = useState(0);
  const coupleGuestEvents = useMemo(() => {
    if (!event) return [];
    return cloudReadOnlyFallback
      ? invitationCatalogArray<ReturnType<typeof getCoupleGuestEvents>[number]>(
          remoteVenueCatalog,
          'coupleGuestEvents',
          () => [],
        )
      : getCoupleGuestEvents(event.id);
  }, [cloudReadOnlyFallback, event, guestEventTick, remoteVenueCatalog]);
  const assignedGuestCount = (guestEventId: string) => coupleGuests.filter((guest) =>
    guest.guestEventIds?.includes(guestEventId),
  ).length;
  const [newGuestEvent, setNewGuestEvent] = useState({ title: '', capacity: '25', location: '' });
  const addGuestEvent = () => {
    if (cloudReadOnlyFallback) return;
    if (!event || !newGuestEvent.title.trim()) {
      showToast('Enter an event name.', 'warning');
      return;
    }
    const rawCap = newGuestEvent.capacity.trim();
    const cap = rawCap === '' ? 25 : Number(rawCap);
    addCoupleGuestEvent(event.id, {
      title: newGuestEvent.title,
      kind: 'custom',
      capacity: Number.isNaN(cap) || cap < 1 ? 25 : Math.round(cap),
      location: newGuestEvent.location.trim() || undefined,
    });
    setNewGuestEvent({ title: '', capacity: '25', location: '' });
    setGuestEventTick((t) => t + 1);
  };
  // Resolve the couple's selected add-ons to their catalog entries.
  const resolvedAddOns = useMemo(
    () => coupleAddOns
      .map((selection) => addOnCatalog.find((addOn) => addOn.id === selection.addOnId))
      .filter((addOn): addOn is NonNullable<typeof addOn> => Boolean(addOn)),
    [addOnCatalog, coupleAddOns],
  );
  // Auto-derive default guest events from the package + the couple's add-ons.
  // Keys on the set of add-on ids (not just their count) so adding a new add-on
  // later creates its matching guest event, while the idempotent service avoids
  // duplicating core events.
  const resolvedAddOnKey = resolvedAddOns.map((a) => a.id).sort().join('|');
  useEffect(() => {
    if (!event || cloudReadOnlyFallback) return;
    ensureDerivedGuestEvents(event.id, bookedPackage, resolvedAddOns);
    setGuestEventTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReadOnlyFallback, event?.id, bookedPackage?.id, resolvedAddOnKey]);
  const hasAddOn = (id: string) => coupleAddOns.some((a) => a.addOnId === id);
  const toggleAddOn = (addOnId: string) => {
    if (cloudReadOnlyFallback || !event) return;
    const current = event.addOns || [];
    const wasAdded = hasAddOn(addOnId);
    const next = wasAdded
      ? current.filter((a) => a.addOnId !== addOnId)
      : [...current, { addOnId, addedAt: new Date().toISOString() }];
    updateCoupleEvent(event.id, { addOns: next });
    // When the couple adds certain add-ons, auto-suggest a venue setup task so
    // the venue plans the corresponding prep (the venue keeps control/edits).
    const ao = findPackageAddOn(addOnId);
    if (!wasAdded && ao) {
      const existing = getCoupleSetupTasks(event.id);
      const tasks: { key: string; title: string }[] = [];
      if (ao.category === 'lodging') tasks.push({ key: 'lodging', title: 'Prepare lodging for overnight guests' });
      if (ao.category === 'activity') tasks.push({ key: 'activity', title: `Set up guided activity: ${ao.name}` });
      if (ao.category === 'ceremony-reception') tasks.push({ key: 'ceremony', title: `Set up add-on: ${ao.name}` });
      tasks.forEach((t) => {
        if (!existing.some((x) => x.suggested && x.title.toLowerCase().includes(t.key))) {
          addCoupleSetupTask(event.id, { title: t.title, suggested: true });
        }
      });
    } else if (wasAdded && ao) {
      // Removing an add-on: clean up the suggested setup task we auto-created so the
      // venue isn't left with a stale prep item. (Only remove tasks we marked
      // `suggested` from this add-on; the venue's own custom tasks stay.)
      const existing = getCoupleSetupTasks(event.id);
      const keywords = ao.category === 'lodging' ? ['lodging'] : ao.category === 'activity' ? ['activity'] : ao.category === 'ceremony-reception' ? ['ceremony'] : [];
      existing
        .filter((t) => t.suggested && keywords.some((k) => t.title.toLowerCase().includes(k)))
        .forEach((t) => removeCoupleSetupTask(event.id, t.id));
    }
    setPkgTick((t) => t + 1);
  };

  const handleAddGuest = () => {
    if (cloudReadOnlyFallback) return;
    if (!event || !guestForm.name.trim()) {
      setGuestError('Please enter the guest’s name.');
      return;
    }
    const email = normalizeEmail(guestForm.email);
    const phone = normalizeUsPhone(guestForm.phone);
    if (!email.ok) {
      setGuestError(email.error || "That email address isn't valid.");
      return;
    }
    if (!phone.ok) {
      setGuestError(phone.error || 'Enter a 10-digit US phone number.');
      return;
    }
    addCoupleGuest(event.id, {
      name: guestForm.name,
      email: email.value,
      phone: phone.display,
    });
    setGuestForm({ name: '', email: '', phone: '' });
    setGuestError('');
    setGuestTick((t) => t + 1);
  };

  const handleSaveGuestEdit = () => {
    if (cloudReadOnlyFallback || !event || !editingGuest) return;
    if (!editingGuest.name.trim()) {
      showToast('Please enter the guest’s name.', 'warning');
      return;
    }
    const email = normalizeEmail(editingGuest.email);
    const phone = normalizeUsPhone(editingGuest.phone);
    if (!email.ok) {
      showToast(email.error || "That email address isn't valid.", 'warning');
      return;
    }
    if (!phone.ok) {
      showToast(phone.error || 'Enter a 10-digit US phone number.', 'warning');
      return;
    }
    updateCoupleGuest(event.id, editingGuest.id, {
      name: editingGuest.name.trim(),
      email: email.value,
      phone: phone.display,
      tableId: editingGuest.tableId?.trim() || undefined,
      roomId: editingGuest.roomId?.trim() || undefined,
    });
    setEditingGuest(null);
    setGuestTick((t) => t + 1);
  };

  const saveRecordedRsvp = () => {
    if (cloudReadOnlyFallback || !event || !rsvpGuestId) return;
    const guest = coupleGuests.find((g) => g.id === rsvpGuestId);
    if (!guest) return;
    const existing = coupleRsvps.find((r) => r.guestId === guest.id);
    upsertCoupleRsvp(event.id, {
      id: existing?.id || `rsvp-${Date.now()}`,
      guestId: guest.id,
      eventName: event.id,
      eventKey: event.id,
      fullName: guest.name,
      email: guest.email || '',
      phone: guest.phone || '',
      attending: rsvpRecord.attending,
      mealChoice: rsvpRecord.attending ? rsvpRecord.meal || undefined : undefined,
      plusOneName: rsvpRecord.attending ? rsvpRecord.plusOne.trim() || undefined : undefined,
      notes: rsvpRecord.notes.trim() || undefined,
      attendingDays: rsvpRecord.attending ? existing?.attendingDays : [],
      // Manual RSVP defaults to the guest's assigned events (so per-event counts work).
      attendingEvents: rsvpRecord.attending
        ? existing?.attendingEvents && existing.attendingEvents.length > 0
          ? existing.attendingEvents
          : guest.guestEventIds || []
        : [],
      submittedAt: new Date().toISOString(),
    });
    setRsvpGuestId(null);
    setRsvpRecord({ attending: true, meal: '', plusOne: '', notes: '' });
    setGuestTick((t) => t + 1);
    showToast(`RSVP recorded for ${guest.name}.`, 'success');
  };

  const handleCopyGuestLink = (token: string, guestEmail?: string) => {
    const email = normalizeEmail(guestEmail, { required: true });
    if (!email.ok) {
      showToast('Add a valid email address before copying this guest’s personal account invite.', 'warning');
      return;
    }
    void navigator.clipboard?.writeText(buildGuestInviteUrl(token, event?.id, linkVenueSlug)).then(
      () => showToast('Guest account invite link copied to clipboard.', 'success'),
      () => showToast('Could not copy — try again.', 'warning'),
    );
  };

  const handleRotateGuestLink = (guestId: string, guestName: string) => {
    if (cloudReadOnlyFallback || !event) return;
    const guest = coupleGuests.find((candidate) => candidate.id === guestId);
    const email = normalizeEmail(guest?.email, { required: true });
    if (!email.ok) {
      showToast('Add a valid email address before reissuing this guest’s personal account invite.', 'warning');
      return;
    }
    const nextToken = rotateCoupleGuestToken(event.id, guestId);
    if (!nextToken) {
      showToast('This guest link could not be reissued.', 'warning');
      return;
    }
    setGuestTick((tick) => tick + 1);
    void navigator.clipboard?.writeText(buildGuestInviteUrl(nextToken, event.id, linkVenueSlug));
    showToast(`A new guest invite link was created for ${guestName}. Guest RSVP history was preserved.`, 'success');
  };

  const handleImportGuests = (content: string) => {
    if (cloudReadOnlyFallback || !event) return;
    // Use the robust shared CSV parser (quoted fields, header detection) for consistency
    // with the venue's guest import.
    const result = parseGuestCsv(content, getCoupleGuests(event.id));
    if (!result.ok) {
      showToast(result.error || 'Could not parse the CSV file.', 'warning');
      return;
    }
    const rows = (result.guests || []).map((g) => ({ name: g.name, email: g.email || '', phone: g.phone || '' }));
    const added = importCoupleGuests(event.id, rows);
    setGuestTick((t) => t + 1);
    showToast(`Imported ${added} guest${added === 1 ? '' : 's'}.`, 'success');
  };

  // ── Portal settings (per-couple guest portal customization) ────────────────
  const [portalConfigTick, setPortalConfigTick] = useState(0);
  const venueGuestPortalConfig = useMemo<GuestPortalConfig | null>(() => {
    if (remoteVenueCatalog === undefined) return getGuestPortalConfig();
    const value = remoteVenueCatalog.portalConfig;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as GuestPortalConfig
      : null;
  }, [remoteVenueCatalog]);
  const portalConfig = useMemo<GuestPortalConfig | null>(() => {
    if (!event) return null;
    if (cloudReadOnlyFallback) {
      const configs = remoteVenueCatalog?.couplePortalConfigs;
      if (configs && typeof configs === 'object' && !Array.isArray(configs)) {
        const direct = (configs as Record<string, unknown>)[event.id];
        if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
          return direct as GuestPortalConfig;
        }
      }
      return buildDefaultCouplePortalConfig(venueGuestPortalConfig, {
        coupleName: event.coupleName,
        eventDate: event.eventDate,
        eventEndDate: event.eventEndDate,
      });
    }
    return getCouplePortalConfig(event.id, venueGuestPortalConfig, {
      coupleName: event.coupleName,
      eventDate: event.eventDate,
      eventEndDate: event.eventEndDate,
    });
  }, [cloudReadOnlyFallback, event, portalConfigTick, remoteVenueCatalog, venueGuestPortalConfig]);

  // True only when the couple has actually personalized their guest portal beyond
  // the seeded defaults (hero image set, or welcome/meal options/deadline changed).
  const portalPersonalized = useMemo(() => {
    if (!portalConfig) return false;
    const venueCfg = venueGuestPortalConfig;
    const hasHero = !!portalConfig.heroImageUrl;
    const welcomeChanged = !!portalConfig.welcomeMessage && portalConfig.welcomeMessage !== venueCfg?.welcomeMessage;
    const deadlineSet = !!portalConfig.rsvpDeadlineDate;
    const themeSet = !!portalConfig.themeColor;
    const mealsChanged =
      !!portalConfig.mealOptions &&
      portalConfig.mealOptions.length > 0 &&
      (portalConfig.mealOptions.length !== (venueCfg?.mealOptions?.length ?? 0) ||
        portalConfig.mealOptions.some((o, i) => o.value !== venueCfg?.mealOptions?.[i]?.value));
    return hasHero || welcomeChanged || deadlineSet || themeSet || mealsChanged;
  }, [portalConfig, venueGuestPortalConfig]);

  const [portalDraft, setPortalDraft] = useState<GuestPortalConfig | null>(null);
  const [newMealOption, setNewMealOption] = useState('');
  const [newScheduleItem, setNewScheduleItem] = useState<{ title: string; startTime: string; location: string; dayIndex: number }>({ title: '', startTime: '', location: '', dayIndex: 0 });
  const [portalSaved, setPortalSaved] = useState(false);
  // Guest portal password the couple can set/change; empty keeps current, "clear" removes it.
  const [portalPasswordDraft, setPortalPasswordDraft] = useState('');
  const [portalPasswordDraftClear, setPortalPasswordDraftClear] = useState(false);

  useEffect(() => {
    if (portalConfig) setPortalDraft(portalConfig);
  }, [portalConfig]);

  const savePortalSettings = async () => {
    if (cloudReadOnlyFallback || !event || !portalDraft) return;
    let next = portalDraft;
    // Handle the portal password: set a new one (hashed), or clear it.
    const pw = portalPasswordDraft.trim();
    if (portalPasswordDraftClear) {
      next = { ...next, portalPasswordHash: undefined, portalPasswordSalt: undefined, portalPassword: undefined };
      setPortalPasswordDraft('');
      setPortalPasswordDraftClear(false);
    } else if (pw) {
      try {
        const { hash, salt } = await createSecretRecord(pw);
        next = { ...next, portalPasswordHash: hash, portalPasswordSalt: salt, portalPassword: undefined };
      } catch {
        showToast('Could not secure that password on this device.', 'warning');
        return;
      }
      setPortalPasswordDraft('');
    }
    setCouplePortalConfig(event.id, next);
    setPortalDraft(next);
    setPortalConfigTick((t) => t + 1);
    setPortalSaved(true);
    setTimeout(() => setPortalSaved(false), 2000);
    showToast('Guest portal settings saved.', 'success');
  };

  const handleInvite = () => {
    if (cloudReadOnlyFallback) return;
    if (!event || !inviteForm.name.trim() || !inviteForm.email.trim()) {
      setInviteError('Please provide a name and email.');
      return;
    }
    const inviteEmail = normalizeEmail(inviteForm.email, { required: true });
    if (!inviteEmail.ok) {
      setInviteError(inviteEmail.error || "That email address isn't valid.");
      return;
    }
    if (event.collaborators.some((c) => c.email.trim().toLowerCase() === inviteEmail.value)) {
      setInviteError('That email is already invited to this portal.');
      return;
    }
    const collab = addCoupleCollaborator(event.id, {
      name: inviteForm.name.trim(),
      email: inviteEmail.value,
      role: inviteForm.role,
    });
    if (collab) {
      setInviteForm({ name: '', email: '', role: 'planner' });
      setInviteError('');
      refresh();
    } else {
      setInviteError('Could not invite — the email may already be on this portal.');
    }
  };

  const coupleName = event?.coupleName || 'our wedding';
  const orgId = (config as any)?.organizationId || '';

  const handleEmailCollaborator = (email: string, name: string, token: string) => {
    if (cloudReadOnlyFallback) return;
    const url = buildCoupleInviteUrl(token, linkVenueSlug);
    const subject = 'Join our wedding planning portal';
    const body = `Hi ${name},\n\nYou've been invited! Open this private link to create your own Wedding VIP password and join our planning portal:\n\n${url}\n\nThis invitation is fixed to ${email}; please do not forward it.\n\n— ${coupleName}`;
    void sendCoupleEmail(email, {
      name,
      url,
      coupleName,
      kind: 'couple_invite',
      organizationId: orgId,
      subject,
      body,
    }).then((res) => {
      if (res === 'sent') showToast('Invitation email sent.', 'success');
      else if (res === 'mailto') showToast('Opening your email app to send the invite.', 'info');
    });
  };

  const handleEmailGuest = (email: string, name: string, token: string) => {
    if (cloudReadOnlyFallback) return;
    const url = buildGuestInviteUrl(token, event?.id, linkVenueSlug);
    const subject = `RSVP for ${coupleName}`;
    const body = `Hi ${name},\n\nYou've been invited! Open this private link to create your own Wedding VIP password and RSVP:\n\n${url}\n\nThis invitation is fixed to ${email}; please do not forward it.\n\n— ${coupleName}`;
    void sendCoupleEmail(email, {
      name,
      url,
      coupleName,
      kind: 'guest_invite',
      organizationId: orgId,
      subject,
      body,
    }).then((res) => {
      if (res === 'sent') showToast('Guest invite email sent.', 'success');
      else if (res === 'mailto') showToast('Opening your email app to send the invite.', 'info');
    });
  };

  /** Send a gentle RSVP reminder to a guest who hasn't responded yet. */
  const handleRemindGuest = (email: string, name: string, token: string) => {
    if (cloudReadOnlyFallback) return;
    const url = buildGuestInviteUrl(token, event?.id, linkVenueSlug);
    const subject = `Friendly reminder: RSVP for ${coupleName}`;
    const body =
      `Hi ${name},\n\n` +
      `We'd love to know if you can make it to ${coupleName}! ` +
      `Please RSVP using this link:\n\n${url}\n\n` +
      `— ${coupleName}`;
    void sendCoupleEmail(email, {
      name,
      url,
      coupleName,
      kind: 'guest_reminder',
      organizationId: orgId,
      subject,
      body,
    }).then((res) => {
      if (res === 'sent') showToast('Reminder email sent.', 'success');
      else if (res === 'mailto') showToast('Opening your email app to send the reminder.', 'info');
    });
  };

  /** Number of invited guests who have not responded (used for the reminder action). */
  const noResponseGuests = coupleGuests.filter((g) => !coupleRsvps.some((r) => r.guestId === g.id));

  // Search + RSVP-status filtered guest list for the Guests tab.
  const filteredGuests = coupleGuests.filter((g) => {
    const q = guestSearch.trim().toLowerCase();
    if (q && !`${g.name} ${g.email || ''} ${g.phone || ''}`.toLowerCase().includes(q)) return false;
    const rsvp = coupleRsvps.find((r) => r.guestId === g.id);
    if (guestFilter === 'attending') return !!rsvp?.attending;
    if (guestFilter === 'not-attending') return !!rsvp && !rsvp.attending;
    if (guestFilter === 'no-response') return !rsvp;
    return true;
  });

  const handleCopyInviteLink = (token: string) => {
    const url = buildCoupleInviteUrl(token, linkVenueSlug);
    void navigator.clipboard?.writeText(url).then(
      () => {},
      () => {},
    );
  };

  const handleRotateCoupleLink = () => {
    if (cloudReadOnlyFallback || !event) return;
    const ownerEmail = event.primaryEmail || event.collaborators.find((collaborator) => (
      collaborator.id === `col-${event.id}-owner`
      || collaborator.inviteToken === event.inviteToken
    ))?.email;
    if (!normalizeEmail(ownerEmail, { required: true }).ok) {
      showToast('Add a valid primary couple email before reissuing a personal account invite.', 'warning');
      return;
    }
    const nextToken = rotateCoupleInviteToken(event.id);
    if (!nextToken) {
      showToast('This couple link could not be reissued because access has closed.', 'warning');
      return;
    }
    refresh();
    void navigator.clipboard?.writeText(buildCoupleInviteUrl(nextToken, linkVenueSlug));
    showToast('A new couple invite link was created. Existing planning history was preserved.', 'success');
  };

  const handleRotateCollaboratorLink = (collaboratorId: string, collaboratorName: string) => {
    if (cloudReadOnlyFallback || !event) return;
    const collaborator = event.collaborators.find((candidate) => candidate.id === collaboratorId);
    if (!normalizeEmail(collaborator?.email, { required: true }).ok) {
      showToast('Add a valid collaborator email before reissuing a personal account invite.', 'warning');
      return;
    }
    const nextToken = rotateCoupleCollaboratorToken(event.id, collaboratorId);
    if (!nextToken) {
      showToast('This collaborator link could not be reissued because access has closed.', 'warning');
      return;
    }
    refresh();
    void navigator.clipboard?.writeText(buildCoupleInviteUrl(nextToken, linkVenueSlug));
    showToast(`A new link was created for ${collaboratorName}. Their role and planning history were preserved.`, 'success');
  };

  // ── Render states ──────────────────────────────────────────────────────────
  if (cloudAccountInvite && portalAccountAccess === 'pending' && accountInviteToken) {
    return (
      <PortalInviteAccountSetup
        kind="couple"
        token={accountInviteToken}
        venueSlug={venueSlug}
        branding={config}
        onAuthenticated={handlePortalAccountReady}
        onLegacyInvite={handleLegacyPortalInvite}
        onExit={onExitPortal}
      />
    );
  }

  if (cloudAccountInvite && portalAccountAccess === 'ready' && (!session || !event || !me)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-lg">
          <div className="text-4xl animate-pulse">💍</div>
          <p className="mt-3 text-sm font-semibold text-gray-700">Opening your Couples Portal…</p>
        </div>
      </div>
    );
  }

  if (invalidInvite || !session || !event || !me) {
    const allEvents = events.length > 0 ? events : getCoupleEvents();
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full space-y-4">
          <div className="text-center space-y-2">
            <div className="text-4xl">{invalidInvite ? '💌' : '💍'}</div>
            <h1 className="text-lg font-bold text-gray-900">
              {invalidInvite ? 'Invitation not found' : 'Couples Portal Access'}
            </h1>
            <p className="text-xs text-gray-600">
              {invalidInvite
                ? "This invitation link isn't valid. Try selecting your event below or paste your invitation token."
                : 'Sign in with your invitation link or select your booked wedding event below to plan your wedding.'}
            </p>
          </div>

          {/* Quick-Select Booked Couple (Local Test / Demo Mode) */}
          <div
            className="rounded-lg p-3 space-y-2 border"
            style={{
              backgroundColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 6%, transparent)`,
              borderColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 25%, transparent)`,
            }}
          >
            <label
              className="block text-xs font-bold uppercase tracking-wider"
              style={{ color: config.primaryDark || '#3d1a45' }}
            >
              ⚡ Quick-Select Booked Couple (Test Mode)
            </label>
            {allEvents.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No couple events exist yet. Create one in Admin → Couples first.</p>
            ) : (
              <div className="flex gap-2">
                <select
                  value={demoSelectToken}
                  onChange={(e) => setDemoSelectToken(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white border rounded-lg text-xs font-medium text-gray-800"
                  style={{ borderColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 35%, transparent)` }}
                  aria-label="Quick select couple event"
                >
                  <option value="">-- Select a booked couple --</option>
                  {allEvents.map((ev) => (
                    <option key={ev.id} value={ev.inviteToken}>
                      {ev.coupleName} ({ev.eventDate ? new Date(ev.eventDate).toLocaleDateString() : 'No date'} • Token: {ev.inviteToken})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleManualLaunch(demoSelectToken)}
                  disabled={!demoSelectToken}
                  className="px-3 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-50 transition-colors shrink-0"
                  style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                >
                  Launch ↗
                </button>
              </div>
            )}
          </div>

          {/* Enter Invitation Token Manually */}
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              🔑 Enter Invitation Token
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualLaunch(manualToken)}
                placeholder="e.g. cp-a1b2c3d4..."
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-mono"
                aria-label="Invitation token"
              />
              <button
                type="button"
                onClick={() => handleManualLaunch(manualToken)}
                disabled={!manualToken.trim()}
                className="px-3 py-1.5 rounded-lg bg-gray-800 text-white text-xs font-bold hover:bg-gray-900 disabled:opacity-50 transition-colors shrink-0"
              >
                Sign In
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100 flex justify-center">
            <button
              type="button"
              onClick={onExitPortal}
              className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
            >
              ← Return to Venue Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'questions', label: 'Questions', icon: '❓' },
    { id: 'spaces', label: 'Venue Spaces', icon: '🏛️' },
    { id: 'design', label: 'Design & Approval', icon: '🎨' },
    { id: 'package', label: 'Package', icon: '🎁' },
    { id: 'checklist', label: 'Checklist', icon: '✅' },
    { id: 'timeline', label: 'Timeline', icon: '📅' },
    { id: 'vendors', label: 'Vendors', icon: '🧰' },
    { id: 'guests', label: 'Guests', icon: '👥' },
    { id: 'portal', label: 'Portal Settings', icon: '🎛️' },
    { id: 'chat', label: 'Chat', icon: '💬' },
    { id: 'collaborators', label: 'People', icon: '👥' },
  ];

  const roleLabel = (r: CoupleCollaboratorRole) =>
    r === 'couple' ? 'Couple' : r === 'planner' ? 'Planner' : r === 'family' ? 'Family' : 'Vendor';

  const eligibleSpaces = venues.filter((v) => event.availableSpaces.includes(v.id));

  return (
    <div
      className="min-h-screen w-full flex flex-col overflow-y-auto"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${config.primaryColor || '#4A1942'} 5%, transparent), #f8fafc)`,
      }}
    >
      <header
        className="px-4 pt-4 pb-2.5 flex items-center justify-between bg-white/85 backdrop-blur-md border-b shadow-sm"
        style={{
          borderColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 15%, transparent)`,
        }}
      >
        <button
          type="button"
          onClick={onExitPortal}
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 underline underline-offset-2 transition-colors"
          aria-label="Return to login screen"
        >
          ← Back to Login
        </button>
        <div className="flex items-center gap-2.5 min-w-0">
          {config.logoUrl ? (
            <img src={config.logoUrl} alt={config.venueName} className="w-8 h-8 object-contain rounded-lg border border-gray-200 bg-white p-0.5 shrink-0 shadow-sm" />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 text-white shadow-sm" style={{ backgroundColor: config.primaryColor || '#4A1942' }}>
              💒
            </div>
          )}
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 truncate" style={{ fontFamily: config.headingFontFamily }}>
              💍 {config.venueName || 'Wedding Venue'}
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0"
              style={{
                backgroundColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 12%, transparent)`,
                color: config.primaryColor || '#4A1942',
              }}
            >
              Couples Portal
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-xs font-bold hover:underline transition-colors"
            style={{ color: config.primaryColor || '#4A1942' }}
            title="Switch to another couple event or test token"
          >
            🔄 Switch Couple
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900"
          >
            Sign out
          </button>
        </div>
      </header>

      {cloudReadOnlyFallback && (
        <div
          role="alert"
          className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm sm:mx-6"
        >
          <p className="font-bold">Secure read-only mode</p>
          <p className="mt-1 text-xs">
            This browser cannot currently preserve planning changes. You can safely review the latest venue snapshot, but editing is paused to prevent lost or conflicting updates. We’ll retry automatically.
          </p>
          <p className="sr-only">{failedCacheDomains.length} browser persistence domain{failedCacheDomains.length === 1 ? '' : 's'} unavailable.</p>
        </div>
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Full-Width Executive Hero Header Card */}
        <div
          className="rounded-2xl text-white p-6 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
          style={{
            background: `linear-gradient(135deg, ${config.primaryColor || '#4A1942'}, ${config.primaryLight || '#6b2c5c'}, ${config.primaryDark || '#3d1a45'})`,
          }}
        >
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-white/80 font-bold">Your Wedding Event</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold">{event.coupleName}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {event.eventDate && (
                <span className="rounded-full bg-white/20 px-3 py-1 font-semibold backdrop-blur-sm">
                  📅 {new Date(event.eventDate).toLocaleDateString()}
                </span>
              )}
              {event.guestCount && (
                <span className="rounded-full bg-white/20 px-3 py-1 font-semibold backdrop-blur-sm">👥 {event.guestCount} guests</span>
              )}
              <span
                className={`rounded-full px-3 py-1 font-bold backdrop-blur-sm ${
                  event.status === 'active'
                    ? 'bg-emerald-500/90'
                    : event.status === 'completed'
                      ? 'bg-sky-500/90'
                      : 'bg-white/25'
                }`}
              >
                {event.status === 'active'
                  ? '● Active Event'
                  : event.status === 'completed'
                    ? '✓ Completed'
                    : '● Invited'}
              </span>
              {event.packageId && bookedPackage && (
                <span className="rounded-full bg-white/20 px-3 py-1 font-semibold backdrop-blur-sm">
                  🎁 {bookedPackage.name}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-3 shrink-0">
            {/* Tastefully Integrated Venue Branding Attributes (Logo, Name, Email, Website) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/15 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-white/20 text-left">
              <div className="flex items-center gap-2.5 min-w-0">
                {config.logoUrl ? (
                  <img src={config.logoUrl} alt={config.venueName} className="w-9 h-9 object-contain rounded-lg bg-white p-1 border border-white/30 shrink-0 shadow-sm" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-lg shrink-0 border border-white/30 shadow-sm">
                    🏛️
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/80">Hosted at</div>
                  <div className="font-extrabold text-sm leading-tight text-white truncate">
                    {config.venueName || 'Seven Paths Manor'}
                  </div>
                </div>
              </div>
              {(config.supportEmail || config.websiteUrl) && (
                <div className="flex items-center gap-2 text-xs text-white/95 flex-wrap">
                  {config.supportEmail && (
                    <a
                      href={`mailto:${config.supportEmail}`}
                      className="hover:underline flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded-lg transition-colors font-semibold"
                      title={`Email venue coordinator: ${config.supportEmail}`}
                    >
                      <span>✉️</span>
                      <span>Email</span>
                    </a>
                  )}
                  {config.websiteUrl && (
                    <a
                      href={config.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded-lg transition-colors font-semibold"
                      title={`Visit venue website: ${config.websiteUrl}`}
                    >
                      <span>🌐</span>
                      <span>Website</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 justify-end">
              <div className="flex items-center gap-1.5 bg-white/15 rounded-xl px-3.5 py-2 text-xs font-bold backdrop-blur-sm">
                <span>🏛️ {event.selectedSpaces.length} spaces</span>
                <span>•</span>
                <span>👥 {event.collaborators.length} team</span>
              </div>
              <button
                type="button"
              onClick={() => handleCopyInviteLink(event.inviteToken)}
              className="px-3.5 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold backdrop-blur-sm transition-colors shadow-sm flex items-center gap-1.5"
              title="Copy your private Couples Portal invitation link"
            >
              <span>📋</span> Copy Portal Link
            </button>
            {canManageCollaborators && (
              <button
                type="button"
                onClick={handleRotateCoupleLink}
                className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold backdrop-blur-sm transition-colors shadow-sm flex items-center gap-1.5"
                title="Create a new couple link while preserving planning history"
              >
                <span>🔄</span> Reissue Link
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const url = buildCoupleInviteUrl(event.inviteToken, linkVenueSlug);
                const subject = `Your Wedding Planning Portal — ${event.coupleName}`;
                const body = `Hi ${event.coupleName},\n\nWe're so excited to work with you on your wedding!\n\nHere is your private link to access your Couples Portal, where you can design your floor layouts, manage your guest list & RSVPs, view wedding packages, and chat directly with our venue team:\n\n${url}\n\nWarm regards,\nThe Seven Paths Manor Team`;
                window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                showToast('Opening default email client with your invitation link.', 'info');
              }}
              className="px-3.5 py-2 rounded-xl bg-white text-xs font-extrabold transition-colors shadow-sm flex items-center gap-1.5 hover:bg-gray-100"
              style={{ color: config.primaryColor || '#4A1942' }}
              title="Email your invitation link via default email client"
            >
              <span>✉️</span> Email Invite
            </button>
          </div>
          </div>
        </div>

        {isComplete && (
          <div className="mt-3 rounded-xl bg-sky-50 border border-sky-200 px-4 py-3 text-sm text-sky-800">
            💐 <strong>This event is complete.</strong> Planning is now view-only — you can still
            review everything and message the venue.
          </div>
        )}

        {/* Executive Tab Navigation Strip */}
        <div className="flex flex-wrap items-center gap-1.5 mt-4 border-b border-gray-200 pb-3" role="tablist" aria-label="Couples portal sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center rounded-xl px-3.5 py-2 text-xs font-bold transition-colors shadow-sm ${
                activeTab === t.id
                  ? 'btn-primary bg-[#4A1942] text-white shadow'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
              style={activeTab === t.id ? { backgroundColor: config.primaryColor || '#4A1942' } : undefined}
            >
              <span className="mr-1.5 text-sm">{t.icon}</span> {t.label}
              {t.id === 'chat' && unreadVenueChat > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px]">
                  {unreadVenueChat}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Interactive Top KPI Strip (1-Click Jump Buttons) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('spaces')}
                  className="bg-white rounded-xl border border-gray-200 p-3.5 text-left shadow-sm hover:border-[#4A1942] hover:shadow transition-all group"
                >
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Selected Spaces</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1 group-hover:text-[#4A1942]">
                    {event.selectedSpaces.length} <span className="text-xs font-normal text-gray-400">/ {venues.length}</span>
                  </div>
                  <div className="text-[11px] text-[#4A1942] font-medium mt-1">🏛️ Manage spaces →</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('guests')}
                  className="bg-white rounded-xl border border-gray-200 p-3.5 text-left shadow-sm hover:border-emerald-500 hover:shadow transition-all group"
                >
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Invited Guests</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1 group-hover:text-emerald-700">
                    {coupleGuests.length} <span className="text-xs font-normal text-gray-400">total</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-medium mt-1">👥 Manage RSVPs →</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('design')}
                  className="bg-white rounded-xl border border-gray-200 p-3.5 text-left shadow-sm hover:border-amber-500 hover:shadow transition-all group"
                >
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Layout Status</div>
                  <div className="text-sm font-bold text-gray-900 mt-2 truncate group-hover:text-amber-800">
                    {event.layoutStatus === 'approved' ? '✓ Approved' : event.layoutStatus === 'pending' ? '⏳ Under Review' : '🎨 In Draft'}
                  </div>
                  <div className="text-[11px] text-amber-700 font-medium mt-1">Draw floor plan →</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('checklist')}
                  className="bg-white rounded-xl border border-gray-200 p-3.5 text-left shadow-sm hover:border-blue-500 hover:shadow transition-all group"
                >
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Prep Checklist</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1 group-hover:text-blue-700">
                    {coupleChecklist.filter((i) => i.done).length} <span className="text-xs font-normal text-gray-400">/ {coupleChecklist.length}</span>
                  </div>
                  <div className="text-[11px] text-blue-700 font-medium mt-1">✅ View checklist →</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('package')}
                  className="bg-white rounded-xl border border-gray-200 p-3.5 text-left shadow-sm hover:border-purple-500 hover:shadow transition-all group"
                >
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Package Cap</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1 group-hover:text-purple-700">
                    {event.guestCount ?? (bookedPackage ? bookedPackage.maxGuests : '—')}
                  </div>
                  <div className="text-[11px] text-purple-700 font-medium mt-1">🎁 Package rules →</div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  className="bg-white rounded-xl border border-gray-200 p-3.5 text-left shadow-sm hover:border-rose-500 hover:shadow transition-all group relative"
                >
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Venue Chat</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1 group-hover:text-rose-700">
                    {messages.length} <span className="text-xs font-normal text-gray-400">msgs</span>
                  </div>
                  <div className="text-[11px] text-rose-700 font-medium mt-1">
                    💬 {unreadVenueChat > 0 ? `${unreadVenueChat} unread →` : 'Message venue →'}
                  </div>
                </button>
              </div>

              {/* 2-Column / 3-Column Executive Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main 2-Column Area */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Smart "Next Step" Operational Banner */}
                  {(() => {
                    if (!canEditDesign && !canManageGuests && !canAnswerQuestions) return null;
                    const steps: { label: string; hint: string; done: boolean; tab: TabId }[] = [
                      { label: "Answer the venue's questions", hint: 'Narrows which spaces work for your day', done: coupleAnswers.length > 0, tab: 'questions' },
                      { label: 'Select your venue spaces', hint: "Choose the spaces you'll use", done: event.selectedSpaces.length > 0, tab: 'spaces' },
                      { label: 'Design & submit your layouts', hint: 'The venue reviews and approves these', done: event.layoutStatus === 'pending' || event.layoutStatus === 'approved', tab: 'design' },
                      { label: 'Invite your guests', hint: 'Send each guest their own link', done: coupleGuests.length > 0, tab: 'guests' },
                      { label: 'Personalize your guest portal', hint: 'Theme, schedule, meal options', done: portalPersonalized, tab: 'portal' },
                    ];
                    const next = steps.find((s) => !s.done);
                    if (!next) {
                      return (
                        <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-5 shadow-sm flex items-center justify-between gap-4">
                          <div>
                            <p className="text-base font-bold">🎉 You've completed all major planning milestones!</p>
                            <p className="text-xs text-emerald-100 mt-1">Your floor layouts, guest list, and portal settings are ready. Keep refining anytime.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab('design')}
                            className="px-4 py-2 bg-white text-emerald-800 font-bold text-xs rounded-xl hover:bg-emerald-50 shrink-0 transition-colors"
                          >
                            Review Layouts →
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div
                        className="rounded-2xl text-white p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                        style={{
                          background: `linear-gradient(135deg, ${config.primaryColor || '#4A1942'}, ${config.primaryDark || '#3d1a45'})`,
                        }}
                      >
                        <div className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wider font-bold text-white/80">Recommended Next Step</div>
                          <h3 className="text-lg font-bold">👉 {next.label}</h3>
                          <p className="text-xs text-white/90">{next.hint}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab(next.tab)}
                          className="px-5 py-2.5 bg-white font-bold text-xs rounded-xl shadow transition-colors shrink-0 hover:bg-gray-100"
                          style={{ color: config.primaryColor || '#4A1942' }}
                        >
                          Start This Step →
                        </button>
                      </div>
                    );
                  })()}

                  {/* Planning Progress Board */}
                  <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-sm text-gray-900">Your Planning Progress Board</h3>
                      <span
                        className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 12%, transparent)`,
                          color: config.primaryColor || '#4A1942',
                        }}
                      >
                        {[
                          coupleAnswers.length > 0,
                          event.selectedSpaces.length > 0,
                          event.layoutStatus === 'pending' || event.layoutStatus === 'approved',
                          coupleGuests.length > 0,
                          coupleGuestEvents.length > 0 && coupleGuests.some((g) => (g.guestEventIds || []).length > 0),
                          portalPersonalized,
                        ].filter(Boolean).length} / 6 completed
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { label: 'Questions answered', done: coupleAnswers.length > 0, tab: 'questions' as TabId, desc: 'Answers help suggest spaces' },
                        { label: 'Venue spaces selected', done: event.selectedSpaces.length > 0, tab: 'spaces' as TabId, desc: 'Ceremony, Reception, Cocktail' },
                        { label: 'Layouts submitted for approval', done: event.layoutStatus === 'pending' || event.layoutStatus === 'approved', tab: 'design' as TabId, desc: 'Venue review queue' },
                        { label: 'Guests invited & RSVPing', done: coupleGuests.length > 0, tab: 'guests' as TabId, desc: 'Manage RSVPs & meal choices' },
                        { label: 'Guest itinerary set up', done: coupleGuestEvents.length > 0 && coupleGuests.some((g) => (g.guestEventIds || []).length > 0), tab: 'guests' as TabId, desc: 'Multi-day guest invitations' },
                        { label: 'Guest portal personalized', done: portalPersonalized, tab: 'portal' as TabId, desc: 'Welcome message & schedule' },
                      ].map((step) => (
                        <button
                          key={step.label}
                          type="button"
                          onClick={() => setActiveTab(step.tab)}
                          className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                            step.done
                              ? 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-300'
                              : 'bg-white border-gray-200 hover:border-[#4A1942]/30 hover:bg-gray-50/50'
                          }`}
                        >
                          <span className="text-lg shrink-0 mt-0.5">{step.done ? '✅' : '⬜'}</span>
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm font-semibold ${step.done ? 'text-emerald-900' : 'text-gray-800'}`}>{step.label}</div>
                            <div className="text-xs text-gray-500 mt-0.5 truncate">{step.desc}</div>
                          </div>
                          <span className="text-xs text-gray-400 font-bold shrink-0 self-center">→</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Weather forecast for event days */}
                  {(() => {
                    const dates = eventDates(event.eventDate, event.eventEndDate);
                    const forecasts = dates
                      .map((d) => ({ d, f: activeVenueWeather.forecasts[d] }))
                      .filter((x) => x.f);
                    if (forecasts.length === 0) return null;
                    return (
                      <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
                        <h3 className="font-bold text-sm text-gray-900 mb-3">🌤️ Weather Forecast for Your Event Days</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {forecasts.map(({ d, f }) => (
                            <div key={d} className="rounded-xl border border-gray-200 p-3.5 bg-gray-50/60 flex items-center justify-between">
                              <div>
                                <div className="text-xs font-semibold text-gray-800">{new Date(d + 'T00:00:00').toLocaleDateString()}</div>
                                <div className="text-[11px] text-gray-500 mt-0.5">Outdoor spaces check</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{f.condition.includes('Rain') || (f.rainChance ?? 0) >= 50 ? '🌧️' : f.condition.includes('Cloud') ? '☁️' : '☀️'}</span>
                                <div className="text-right">
                                  <div className="text-xs font-bold text-gray-900">{f.condition}</div>
                                  <div className="text-[11px] text-gray-500">{f.tempLow}°–{f.tempHigh}° {f.rainChance != null && `• ☔ ${f.rainChance}%`}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Right Column (1 col on large screens) */}
                <div className="space-y-6">
                  {/* Package Summary Card */}
                  <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-gray-900">Your Booked Package</h3>
                      <button
                        type="button"
                        onClick={() => setActiveTab('package')}
                        className="text-xs font-semibold hover:underline"
                        style={{ color: config.primaryColor || '#4A1942' }}
                      >
                        Details →
                      </button>
                    </div>
                    {!bookedPackage ? (
                      <p className="text-xs text-gray-500 italic">No package assigned yet. The venue will configure your package soon.</p>
                    ) : (
                      <div
                        className="rounded-xl p-3.5 space-y-2 border"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 6%, transparent)`,
                          borderColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 20%, transparent)`,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="text-sm font-bold"
                            style={{ color: config.primaryDark || '#3d1a45' }}
                          >
                            {bookedPackage.name}
                          </span>
                          <span
                            className="text-[11px] text-white px-2.5 py-0.5 rounded-full font-bold"
                            style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                          >
                            {PACKAGE_DURATIONS.find((d) => d.id === bookedPackage.durationType)?.label}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          {bookedPackage.maxGuests} included guests • {bookedPackage.lodgingIncluded ? '🛏️ Lodging included' : 'No lodging'}
                        </div>
                        {(event.addOns?.length || 0) > 0 && (
                          <div
                            className="text-xs font-semibold pt-1 border-t"
                            style={{
                              color: config.primaryDark || '#3d1a45',
                              borderColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 20%, transparent)`,
                            }}
                          >
                            + {event.addOns!.length} active add-on(s) configured
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Collaboration Team Card */}
                  <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-gray-900">Your Planning Team</h3>
                      <button
                        type="button"
                        onClick={() => setActiveTab('collaborators')}
                        className="text-xs font-semibold hover:underline"
                        style={{ color: config.primaryColor || '#4A1942' }}
                      >
                        + Invite Someone
                      </button>
                    </div>
                    <div className="space-y-2">
                      {event.collaborators.map((c) => (
                        <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-gray-50/50 text-xs">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-800 truncate">{c.name}</div>
                            <div className="text-gray-500 text-[11px]">{roleLabel(c.role)}</div>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            {c.accepted ? 'Accepted ✓' : 'Invited'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Guest Portal Share Card */}
                  <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm space-y-3">
                    <h3 className="font-bold text-sm text-gray-900">Your Guest Portal</h3>
                    <p className="text-xs text-gray-500">
                      Share your wedding schedule, wayfinding maps, and RSVP links with your invited guests.
                    </p>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}${window.location.pathname}#/guest-portal?couple=${encodeURIComponent(event.id)}`;
                          void navigator.clipboard?.writeText(url).then(
                            () => showToast('Guest portal link copied to clipboard.', 'success'),
                            () => showToast('Could not copy — copy the link below.', 'warning'),
                          );
                        }}
                        className="w-full px-3.5 py-2 rounded-xl text-white text-xs font-bold hover:opacity-90 transition-opacity shadow-sm"
                        style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                      >
                        📋 Copy Guest Portal Link
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          window.open(`${window.location.origin}${window.location.pathname}#/guest-portal?couple=${encodeURIComponent(event.id)}&preview=1`, '_blank');
                        }}
                        className="w-full px-3.5 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-xs font-bold text-gray-700 transition-colors shadow-sm"
                      >
                        👁️ Preview Guest Portal ↗
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'package' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Columns: Package Details & Pricing */}
              <div className="lg:col-span-2 space-y-6">
                <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm space-y-4">
                  <h3 className="font-bold text-base text-gray-900">Your wedding package</h3>
                  {!bookedPackage ? (
                    <p className="text-xs text-gray-500 italic py-4">
                      Your venue hasn't assigned a package yet. Check back soon, or message the venue coordinator.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-gray-200 pb-3">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-xl font-bold text-gray-900">{bookedPackage.name}</span>
                          <span className="text-xs px-3 py-1 rounded-full bg-[#4A1942]/10 font-bold text-[#4A1942]">
                            {PACKAGE_DURATIONS.find((d) => d.id === bookedPackage.durationType)?.label}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-gray-500">
                          Package ID: <code>{bookedPackage.id}</code>
                        </div>
                      </div>
                      {bookedPackage.description && <p className="text-sm text-gray-700">{bookedPackage.description}</p>}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3.5">
                          <div className="text-xs text-gray-500 font-semibold">Included Guests</div>
                          <div className="font-bold text-gray-900 text-lg mt-0.5">{bookedPackage.maxGuests} guests</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3.5">
                          <div className="text-xs text-gray-500 font-semibold">Overnight Capacity</div>
                          <div className="font-bold text-gray-900 text-lg mt-0.5">{bookedPackage.maxOvernightGuests > 0 ? `${bookedPackage.maxOvernightGuests} overnight` : '—'}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3.5">
                          <div className="text-xs text-gray-500 font-semibold">On-site Lodging</div>
                          <div className="font-bold text-gray-900 text-lg mt-0.5">{bookedPackage.lodgingIncluded ? '✓ Included' : 'Available Add-on'}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Seasonal Pricing Tiers</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="rounded-lg bg-purple-50/60 border border-purple-200 p-3 text-center">
                            <div className="text-[11px] text-purple-900 font-semibold">Non-Peak Season</div>
                            <div className="font-bold text-purple-950 text-base mt-0.5">${bookedPackage.price.nonPeak.toLocaleString()}</div>
                          </div>
                          <div className="rounded-lg bg-purple-50/60 border border-purple-200 p-3 text-center">
                            <div className="text-[11px] text-purple-900 font-semibold">Peak Season</div>
                            <div className="font-bold text-purple-950 text-base mt-0.5">${bookedPackage.price.peak.toLocaleString()}</div>
                          </div>
                          <div className="rounded-lg bg-purple-50/60 border border-purple-200 p-3 text-center">
                            <div className="text-[11px] text-purple-900 font-semibold">Premier Weekend</div>
                            <div className="font-bold text-purple-950 text-base mt-0.5">${bookedPackage.price.premier.toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                      {bookedPackage.includedItems.length > 0 && (
                        <div className="pt-2 border-t border-gray-200">
                          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">Included Items & Features ({bookedPackage.includedItems.length})</div>
                          <div className="flex flex-wrap gap-2">
                            {bookedPackage.includedItems.map((id) => (
                              <span key={id} className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full px-3 py-1 font-semibold">
                                ✓ {INCLUDED_ITEMS.find((x) => x.id === id)?.label || id}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Add-On Marketplace & Live Cost Calculator */}
              <div className="space-y-6">
                <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap border-b border-gray-200 pb-3">
                    <div>
                      <h3 className="font-bold text-base text-gray-900">Add-ons you can add</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Customize your celebration with venue add-ons.
                      </p>
                    </div>
                    {coupleAddOns.length > 0 && (() => {
                      const total = resolvedAddOns.reduce((s, a) => s + (a.price || 0), 0);
                      return (
                        <div className="text-right bg-purple-50 border border-purple-200 rounded-xl px-3 py-1.5">
                          <div className="text-[10px] font-bold text-purple-900 uppercase tracking-wider">Selected Add-ons ({coupleAddOns.length})</div>
                          <div className="text-base font-bold text-[#4A1942]">
                            ${total.toLocaleString()}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  {addOnCatalog.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-4 text-center">No add-ons available right now.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                      {addOnCatalog.map((a) => {
                        const cat = ADD_ON_CATEGORIES.find((c) => c.id === a.category);
                        const added = hasAddOn(a.id);
                        return (
                          <div key={a.id} className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 transition-all ${
                            added
                              ? 'bg-emerald-50/70 border-emerald-300 shadow-sm'
                              : 'bg-white border-gray-200 hover:border-[#4A1942]/40 hover:bg-gray-50/50'
                          }`}>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                                <span>{cat?.icon}</span>
                                <span className="truncate">{a.name}</span>
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5 truncate">
                                {cat?.label}{a.priceNote ? ` • ${a.priceNote}` : ''}
                                {a.venueVendorId ? ` • ${venues.find((v) => v.id === a.venueVendorId)?.name || 'property'}` : ''}
                              </div>
                              {a.description && <div className="text-[11px] text-gray-600 mt-1 line-clamp-2">{a.description}</div>}
                            </div>
                            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2.5 shrink-0">
                              <span className="text-sm font-bold text-gray-900">${a.price.toLocaleString()}</span>
                              <button
                                type="button"
                                disabled={!canManageGuests}
                                onClick={() => toggleAddOn(a.id)}
                                className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors ${
                                  added
                                    ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                                    : 'btn-primary bg-[#4A1942] text-white hover:bg-[#3b1435]'
                                } disabled:opacity-50`}
                              >
                                {added ? '✓ Added' : '+ Add'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'spaces' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Pick which venue spaces you'd like to use for your event (ceremony,
                reception, cocktail hour, and more). Tap a pin on the map to open that
                space, or choose from the list below.
              </p>

              {/* Interactive venue map — drill into spaces/lodging */}
              {(() => {
                const sourceMap = activeVenueMap;
                if (!sourceMap) return null;
                const coupleMap = projectVenueMap(
                  sourceMap,
                  'couple',
                  undefined,
                  {
                    managedBaseImageOnly: isCoupleCloudEnabled(),
                    venues: isCoupleCloudEnabled() ? undefined : venues,
                  },
                );
                if (!hasRenderableVenueMapContent(coupleMap)) return null;
                const canOpenMapPoint = (point: VenueMapPoint) =>
                  !cloudReadOnlyFallback
                  && point.kind === 'space'
                  && Boolean(point.venueId)
                  && (
                    eligibleSpaces.some((venue) => venue.id === point.venueId)
                    || venues.some((venue) => venue.id === point.venueId && venue.category === 'lodging')
                  );
                return (
                  <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                    <h3 className="font-semibold text-sm mb-2">🗺️ Venue map</h3>
                    <VenueMapCanvas
                      map={coupleMap}
                      editable={false}
                      isPointInteractive={canOpenMapPoint}
                      pointActionLabel={() => 'Open this space.'}
                      hideMapWhenBackgroundUnavailable
                      onRetryBackgroundImage={() => setVenueMapRetryNonce((nonce) => nonce + 1)}
                      onPointClick={(p) => {
                        if (p.kind === 'space' && p.venueId) {
                          // Drill into the space: if it's an available event space, open
                          // the layout editor; if it's lodging, open the room-assignment
                          // panel so the couple can assign guests/rooms right from the map.
                          if (eligibleSpaces.some((v) => v.id === p.venueId)) {
                            setLayoutEditorSpace(p.venueId);
                          } else if (venues.find((v) => v.id === p.venueId)?.category === 'lodging') {
                            setLodgingAssignVenue(p.venueId);
                          }
                        }
                      }}
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      {cloudReadOnlyFallback
                        ? 'Space layouts and lodging assignments are view-only while browser persistence is unavailable.'
                        : coupleMap.points.some(canOpenMapPoint)
                          ? 'Tap a pin—or use the Map location actions list—to open a space layout or lodging assignment.'
                          : 'Venue-authored property map. Interactive space pins have not been added yet.'}
                    </p>
                  </div>
                );
              })()}
              {!canEditSpaces && (
                <p className="text-xs text-gray-500 italic">View-only — your role cannot change the selected spaces.</p>
              )}
              {eligibleSpaces.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-gray-500">
                  <div className="text-3xl mb-2">🏛️</div>
                  <p className="font-semibold text-gray-700">No spaces assigned yet</p>
                  <p className="text-sm mt-1">
                    The venue will let you know which spaces are available for your event.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {eligibleSpaces.map((space) => {
                    const selected = event.selectedSpaces.includes(space.id);
                    return (
                      <button
                        key={space.id}
                        type="button"
                        disabled={!canEditSpaces}
                        onClick={() => {
                          const next = selected
                            ? event.selectedSpaces.filter((s) => s !== space.id)
                            : [...event.selectedSpaces, space.id];
                          updateCoupleEvent(event.id, { selectedSpaces: next });
                          refresh();
                        }}
                        className={`text-left rounded-xl border p-5 transition-all ${
                          canEditSpaces
                            ? selected
                              ? 'border-[#4A1942] bg-[#4A1942]/10 shadow-md'
                              : 'border-gray-200 bg-white hover:border-[#4A1942]/40 hover:shadow'
                            : selected
                              ? 'border-[#4A1942]/40 bg-[#4A1942]/10'
                              : 'border-gray-200 bg-gray-50 cursor-default'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900 text-base">{space.name}</span>
                          <span className="text-xl">{selected ? '✅' : '➕'}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {space.width}' × {space.height}' • {space.capacity} capacity
                          {space.environment && (
                            <span className={`ml-1 inline-block px-1.5 py-0.5 rounded font-semibold ${space.environment === 'outdoor' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                              {space.environment === 'outdoor' ? '🌤️ outdoor' : space.environment === 'both' ? '🏛️ indoor/outdoor' : '🏠 indoor'}
                            </span>
                          )}
                        </div>
                        {selected && (() => {
                          const limit = bookedPackage ? bookedPackage.maxGuests : event.guestCount;
                          if (!limit || !space.capacity || space.capacity >= limit) return null;
                          return (
                            <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 font-medium">
                              ⚠️ This space seats {space.capacity} but you expect {limit} guests.
                            </div>
                          );
                        })()}
                        {(() => {
                          const backup = findRainContingency(activeVenueMap, space.id);
                          if (backup && (
                            isCoupleCloudEnabled()
                            || rainContingencyValidationIssue(backup, venues) === null
                          )) {
                            return (
                              <VenueMapRainPlanGuidance
                                rainContingencies={[backup]}
                                venues={venues}
                                compact
                              />
                            );
                          }
                          // Warn when an outdoor space is selected but has no venue-configured backup.
                          if (selected && space.environment === 'outdoor') {
                            return (
                              <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 font-medium">
                                ⚠️ No rain backup set — ask the venue about a contingency.
                              </div>
                            );
                          }
                          return null;
                        })()}
                        {selected && (
                          <div className="mt-4 pt-3 border-t border-gray-200/60 flex items-center justify-between">
                            <span
                              className="text-xs font-bold"
                              style={{ color: config.primaryColor || '#4A1942' }}
                            >
                              ✓ Selected for event
                            </span>
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLayoutEditorSpace(space.id);
                              }}
                              className="px-3 py-1.5 rounded-lg text-white text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-1 cursor-pointer hover:opacity-90"
                              style={{ backgroundColor: config.primaryColor || '#4A1942' }}
                            >
                              <span>🎨</span> Design Floor Plan →
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'collaborators' && (
            <div className="space-y-6">
              <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-3">
                  <div>
                    <h3 className="font-bold text-base text-gray-900">Invite & Manage Your Planning Team</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Invite your planner, parents, or vendors into your portal so they can help plan and approve layouts.
                    </p>
                  </div>
                  <span className="text-xs font-semibold bg-[#4A1942]/10 text-[#4A1942] px-3 py-1.5 rounded-full">
                    {event.collaborators.length} Team Member(s)
                  </span>
                </div>

                {!canManageCollaborators ? (
                  <p className="text-xs text-gray-500 italic">View-only — only the couple can invite or remove people.</p>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Invite New Team Member</label>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <input
                        type="text"
                        placeholder="Collaborator Name"
                        value={inviteForm.name}
                        onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                        className="px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-medium"
                        aria-label="Collaborator name"
                      />
                      <input
                        type="email"
                        placeholder="Email Address"
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                        className="px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-medium"
                        aria-label="Collaborator email"
                      />
                      <select
                        value={inviteForm.role}
                        onChange={(e) =>
                          setInviteForm({ ...inviteForm, role: e.target.value as CoupleCollaboratorRole })
                        }
                        className="px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-bold bg-white"
                        aria-label="Collaborator role"
                      >
                        <option value="couple">Co-owner (Full couple access)</option>
                        <option value="planner">Planner (Can edit layouts/guests)</option>
                        <option value="family">Family (Can view & chat)</option>
                        <option value="vendor">Vendor (Can view & chat)</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleInvite}
                        className="btn-primary px-4 py-2 rounded-xl bg-[#4A1942] text-white text-xs font-bold hover:bg-[#3b1435] shadow-sm transition-colors"
                      >
                        + Send Invite →
                      </button>
                    </div>
                    {inviteError && <p className="text-xs font-bold text-red-600 mt-1">{inviteError}</p>}
                  </div>
                )}
              </div>

              {/* 3-Column Team Card Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {event.collaborators.map((c: CoupleCollaborator) => (
                  <div
                    key={c.id}
                    className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm flex flex-col justify-between gap-4 hover:shadow transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
                        <div className="font-bold text-sm text-gray-900 truncate">{c.name}</div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          c.role === 'couple' ? 'bg-purple-100 text-purple-900' : c.role === 'planner' ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {roleLabel(c.role)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-2 space-y-1">
                        <div className="truncate">📧 {c.email || 'No email on file'}</div>
                        <div>Status: <span className="font-semibold text-gray-700">{c.accepted ? '✅ Accepted' : '⏳ Pending Invitation'}</span></div>
                        {c.invitedAt && <div className="text-[11px] text-gray-400">Invited: {new Date(c.invitedAt).toLocaleDateString()}</div>}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                      {canManageCollaborators && c.id !== me.id ? (
                        <select
                          value={c.role}
                          onChange={(e) => {
                            const role = e.target.value as CoupleCollaboratorRole;
                            updateCoupleEvent(event.id, {
                              collaborators: event.collaborators.map((x) => (x.id === c.id ? { ...x, role } : x)),
                            });
                            refresh();
                            showToast(`${c.name}'s role updated.`, 'success');
                          }}
                          className="text-xs font-bold px-2 py-1 border border-gray-300 rounded-lg bg-white"
                          aria-label={`Role for ${c.name}`}
                        >
                          <option value="couple">Co-owner</option>
                          <option value="planner">Planner</option>
                          <option value="family">Family</option>
                          <option value="vendor">Vendor</option>
                        </select>
                      ) : (
                        <span className="text-xs font-bold text-gray-400">Team Owner</span>
                      )}
                      <div className="flex items-center gap-2">
                        {canManageCollaborators && (
                          <button
                            type="button"
                            onClick={() => handleCopyInviteLink(c.inviteToken)}
                            className="text-xs font-bold hover:underline"
                            style={{ color: config.primaryColor || '#4A1942' }}
                            title="Copy collaborator invite link"
                          >
                            📋 Copy Link
                          </button>
                        )}
                        {canManageCollaborators && (
                          <button
                            type="button"
                            onClick={() => handleRotateCollaboratorLink(c.id, c.name)}
                            className="text-xs font-bold text-amber-700 hover:underline"
                            title="Create a new collaborator link while preserving their role and history"
                          >
                            Reissue
                          </button>
                        )}
                        {canManageCollaborators && c.email && (
                          <button
                            type="button"
                            onClick={() => handleEmailCollaborator(c.email, c.name, c.inviteToken)}
                            className="text-xs font-bold hover:underline"
                            style={{ color: config.primaryColor || '#4A1942' }}
                            title="Send email invite via mailto"
                          >
                            ✉️ Email
                          </button>
                        )}
                        {canManageCollaborators && c.id !== me.id && (
                          <button
                            type="button"
                            onClick={() => {
                              removeCoupleCollaborator(event.id, c.id);
                              refresh();
                            }}
                            className="text-xs font-bold text-red-600 hover:underline"
                            aria-label={`Remove ${c.name}`}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {event.collaborators.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-8 text-center text-gray-500">
                  <p>No collaborators yet. Invite your planner or family to get started.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'questions' && (
            <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
              <h3 className="font-semibold text-sm mb-1">Tell us about your event</h3>
              <p className="text-xs text-gray-500 mb-3">
                Answer the venue's questions to narrow down which spaces and layouts suit
                your guest count and plans. Your answers also recommend venue spaces.
              </p>
              {eventQuestions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 px-6 py-8 text-center text-gray-500 text-sm">
                  The venue hasn't set up any event questions yet.
                </div>
              ) : (
                <EventQuestionsWizard
                  questions={eventQuestions}
                  initialAnswers={coupleAnswers}
                  userId={me?.id || 'couple'}
                  eventId={event.id}
                  readOnly={!canAnswerQuestions}
                  onSaveAnswers={handleSaveAnswers}
                  onVenueFilterChange={() => {}}
                  onComplete={() => refresh()}
                />
              )}
            </div>
          )}

          {activeTab === 'design' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Approval Queue & Rules */}
              <div className="space-y-6">
                <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
                  <h3 className="font-bold text-sm text-gray-900 mb-1">Design & Approval Command Center</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Design each of your selected spaces in the layout planner, then submit for
                    the venue's approval. The venue reviews your layouts in their work queue.
                  </p>
                  {!canEditDesign && (
                    <p className="text-xs text-gray-500 italic mb-3">View-only — your role cannot edit or submit layouts.</p>
                  )}
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold ${
                        event.layoutStatus === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : event.layoutStatus === 'pending'
                            ? 'bg-amber-100 text-amber-800'
                            : event.layoutStatus === 'changes_requested'
                              ? 'bg-blue-100 text-blue-800'
                              : event.layoutStatus === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {event.layoutStatus === 'none'
                        ? 'Not started'
                        : event.layoutStatus === 'draft'
                          ? 'Draft'
                          : event.layoutStatus === 'pending'
                            ? 'Submitted — awaiting venue review'
                            : event.layoutStatus === 'approved'
                              ? 'Approved 🎉'
                              : event.layoutStatus === 'changes_requested'
                                ? 'Changes requested'
                                : 'Rejected'}
                    </span>
                  </div>
                  {event.layoutComment && (
                    <p className="mt-3 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5">
                      <span className="font-bold text-[#4A1942]">Venue note:</span> {event.layoutComment}
                    </p>
                  )}
                  {(event.layoutStatus === 'changes_requested' || event.layoutStatus === 'rejected') && (
                    <p className="mt-3 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2.5 font-medium">
                      {event.layoutStatus === 'changes_requested'
                        ? 'The venue asked for changes. Revise your layouts and resubmit for approval.'
                        : "The venue didn't approve these layouts. Review their note, revise, and resubmit when ready."}
                    </p>
                  )}
                  {event.layoutStatus === 'approved' && (
                    <p className="mt-3 text-xs text-green-800 bg-green-50 border border-green-200 rounded-xl px-3.5 py-2.5 font-medium">
                      These layouts are approved. If your plans change, you can revise and submit updated layouts for a new review.
                    </p>
                  )}
                  {event.layoutHistory && event.layoutHistory.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-200 space-y-1.5">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Review History Log</div>
                      {event.layoutHistory.map((h, i) => (
                        <div key={i} className="text-xs text-gray-600 bg-gray-50 p-2 rounded-lg">
                          <span className="font-bold">{h.action === 'approve' ? '✓ Approved' : h.action === 'reject' ? '✕ Rejected' : '↻ Changes requested'}</span>
                          {' by '}<span className="font-semibold">{h.byName}</span>
                          {h.comment ? ` — "${h.comment}"` : ''}
                          <span className="text-gray-400"> · {new Date(h.at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!event.selectedSpaces.length) {
                        showToast('Please select at least one venue space before submitting.', 'warning');
                        return;
                      }
                      const layouts = event.spaceLayouts || {};
                      const hasAnyDrawn = event.selectedSpaces.some((sid) => {
                        const sl = layouts[sid];
                        return sl?.layout && (sl.layout.tables.length > 0 || sl.layout.fixtures.length > 0 || sl.layout.decor.length > 0);
                      });
                      if (!hasAnyDrawn) {
                        showToast("You haven't drawn a layout for any selected space yet — the venue won't have a plan to review. Consider opening the layout editor for each space.", 'warning');
                        return;
                      }
                      submitCoupleLayout(event.id, { byName: me?.name });
                      refresh();
                    }}
                    className="btn-primary mt-4 w-full px-4 py-3 rounded-xl bg-[#4A1942] text-white text-xs font-bold hover:bg-[#3b1435] disabled:opacity-50 transition-colors shadow"
                    disabled={event.layoutStatus === 'pending' || event.layoutStatus === 'approved' || !canEditDesign}
                  >
                    {event.layoutStatus === 'pending'
                      ? 'Submitted — awaiting venue review'
                      : event.layoutStatus === 'approved'
                        ? 'Approved ✓'
                        : event.layoutStatus === 'changes_requested' || event.layoutStatus === 'rejected'
                          ? 'Resubmit for approval'
                          : 'Submit All Layouts for Approval →'}
                  </button>
                </div>

                <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
                  <h3 className="font-bold text-sm text-gray-900 mb-2">Your Event Days</h3>
                  <div className="space-y-2">
                    {(event.days && event.days.length > 0 ? event.days : []).map((day) => (
                      <div key={day.id} className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-gray-50/50 text-xs">
                        <span className="font-bold text-gray-900">{day.date}</span>
                        <span className="font-semibold text-[#4A1942]">{day.label}</span>
                      </div>
                    ))}
                    {(!event.days || event.days.length === 0) && (
                      <p className="text-xs text-gray-500 italic">
                        No event days configured yet (the venue sets these up).
                      </p>
                    )}
                  </div>
                </div>

                {activeVenueRules.rules.length > 0 && (
                  <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
                    <h3 className="font-bold text-sm text-gray-900 mb-2">📜 Venue Rules to Keep in Mind</h3>
                    <ul className="space-y-1.5 text-xs text-gray-600 list-disc list-inside">
                      {activeVenueRules.rules.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Right Column: Per-Space Floor Plan Editors */}
              <div className="space-y-4">
                <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="font-bold text-sm text-gray-900">Your Selected Venue Spaces</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Mark each selected space as designed and add notes so the venue can review
                      your plan before approving.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {event.selectedSpaces.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-4 text-center">No spaces selected yet. Select spaces in the "Venue Spaces" tab first.</p>
                    ) : (
                      event.selectedSpaces.map((spaceId) => {
                        const venue = venues.find((v) => v.id === spaceId);
                        const sl = (event.spaceLayouts || {})[spaceId];
                        return (
                          <div key={spaceId} className="rounded-xl border border-gray-200 p-4 bg-gray-50/40 space-y-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div>
                                <span className="font-bold text-sm text-gray-900">
                                  {venue?.name || spaceId}
                                </span>
                                {venue && (
                                  <span className="ml-2 text-xs text-gray-500">
                                    ({venue.capacity} cap)
                                  </span>
                                )}
                              </div>
                              <select
                                value={sl?.status || 'draft'}
                                disabled={!canEditDesign}
                                onChange={(e) => {
                                  setSpaceLayout(event.id, spaceId, {
                                    status: e.target.value as 'draft' | 'designed' | 'submitted',
                                  });
                                  refresh();
                                }}
                                className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs font-semibold bg-white disabled:bg-gray-50"
                                aria-label={`Design status for ${venue?.name || spaceId}`}
                              >
                                <option value="draft">Draft</option>
                                <option value="designed">Designed</option>
                                <option value="submitted">Submitted</option>
                              </select>
                            </div>
                            <input
                              type="text"
                              value={sl?.notes || ''}
                              disabled={!canEditDesign}
                              onChange={(e) => {
                                setSpaceLayout(event.id, spaceId, { notes: e.target.value });
                                refresh();
                              }}
                              placeholder="Notes for the venue (capacity, table layout, requests…)"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs disabled:bg-gray-50"
                              aria-label={`Notes for ${venue?.name || spaceId}`}
                            />
                            {canEditDesign && venue && (
                              <div className="pt-2 border-t border-gray-200/60 flex items-center justify-between gap-3 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setLayoutEditorSpace(spaceId)}
                                  className="btn-primary px-3.5 py-2 rounded-xl bg-[#4A1942] text-white text-xs font-bold hover:bg-[#3b1435] shadow-sm flex items-center gap-1.5 transition-colors"
                                >
                                  <span>🎨</span> {sl?.layout ? 'Edit Interactive Layout' : 'Draw Floor Layout'}
                                </button>
                                {sl?.layout && (
                                  <span className="text-xs font-medium text-gray-600">
                                    {sl.layout.tables.length} table(s) · {sl.layout.fixtures.length} fixture(s) · {sl.layout.decor.length} decor
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'checklist' && (
            <div className="space-y-6">
              <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-3">
                  <div>
                    <h3 className="font-bold text-base text-gray-900">Your event checklist</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Build your own prep checklist — based on your approved layouts and chosen decor.
                    </p>
                  </div>
                  {coupleChecklist.length > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5 text-right">
                      <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider block">Completion Status</span>
                      <span className="text-sm font-bold text-emerald-800">
                        {coupleChecklist.filter((i) => i.done).length} / {coupleChecklist.length} done
                      </span>
                    </div>
                  )}
                </div>

                {!canManageGuests ? (
                  <p className="text-xs text-gray-500 italic">View-only — your role cannot edit the checklist.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <input
                      type="text"
                      value={newCheckItem.title}
                      onChange={(e) => setNewCheckItem({ ...newCheckItem, title: e.target.value })}
                      placeholder="Checklist item (e.g. Finalize seating chart)"
                      className="sm:col-span-2 px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-medium"
                      aria-label="Checklist item title"
                    />
                    <input
                      type="text"
                      value={newCheckItem.phase}
                      onChange={(e) => setNewCheckItem({ ...newCheckItem, phase: e.target.value })}
                      placeholder="Phase (e.g. Planning, Setup, Day-of)"
                      className="px-3.5 py-2 border border-gray-300 rounded-xl text-xs font-medium"
                      aria-label="Checklist phase"
                    />
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newCheckItem.dueDate}
                        onChange={(e) => setNewCheckItem({ ...newCheckItem, dueDate: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-xs font-medium"
                        aria-label="Checklist due date"
                      />
                      <button
                        type="button"
                        onClick={addCheckItem}
                        className="btn-primary px-4 py-2 rounded-xl bg-[#4A1942] text-white text-xs font-bold hover:bg-[#3b1435] shadow-sm transition-colors"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 3-Column Phase-Grouped Kanban Checklist Board */}
              {coupleChecklist.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-gray-500">
                  <div className="text-3xl mb-2">✅</div>
                  <p className="font-bold text-gray-700 text-sm">No checklist items yet</p>
                  <p className="text-xs mt-1">Use the input bar above to add tasks for Planning, Setup, and Day-of.</p>
                </div>
              ) : (
                (() => {
                  const phaseGroups = groupByPhase(coupleChecklist);
                  const itemCount = (items: CoupleChecklistItem[]) =>
                    items.filter((i) => i.done).length;
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {phaseGroups.map(({ phase, items }) => (
                        <div key={phase} className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-3">
                              <span className="text-xs font-bold uppercase tracking-wider text-[#4A1942]">
                                {phase}
                              </span>
                              <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                {itemCount(items)}/{items.length}
                              </span>
                            </div>
                            <div className="space-y-2.5">
                              {items.map((item) => (
                                <div key={item.id} className={`rounded-xl border p-3 flex items-start gap-3 transition-colors ${
                                  item.done ? 'bg-emerald-50/60 border-emerald-200' : 'bg-gray-50/60 border-gray-200 hover:border-gray-300'
                                }`}>
                                  <button
                                    type="button"
                                    disabled={!canManageGuests}
                                    onClick={() => {
                                      toggleCoupleChecklistItem(event!.id, item.id);
                                      setChecklistTick((t) => t + 1);
                                    }}
                                    className={`shrink-0 mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center text-xs font-bold transition-colors ${
                                      item.done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-gray-300 text-transparent bg-white'
                                    }`}
                                    aria-label={`Toggle ${item.title}`}
                                  >
                                    ✓
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div className={`text-xs font-bold ${item.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{item.title}</div>
                                    {item.dueDate && (
                                      <div className="text-[11px] text-gray-500 mt-1">
                                        📅 {new Date(item.dueDate + 'T00:00:00').toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                  {canManageGuests && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        removeCoupleChecklistItem(event!.id, item.id);
                                        setChecklistTick((t) => t + 1);
                                      }}
                                      className="text-[11px] text-red-500 hover:underline font-semibold shrink-0"
                                      aria-label={`Remove ${item.title}`}
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {activeTab === 'timeline' && (
            <CoupleTimelineTab
              event={event}
              canEdit={canEditDesign}
              onNavigateToPackage={() => setActiveTab('package')}
            />
          )}

          {activeTab === 'vendors' && (
            <div className="space-y-6">
              <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
                <h3 className="font-bold text-base text-gray-900">Your vendors &amp; wedding team</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Pick from the venue's preferred partners below, or add your own directly booked vendors.
                </p>
                {!canManageGuests && (
                  <p className="text-xs text-gray-500 italic mt-2">View-only — your role cannot edit vendors.</p>
                )}
              </div>

              {/* Venue preferred vendors (read-only picks) */}
              {preferredVendors.length > 0 && (
                <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="font-bold text-base text-gray-900">🏛️ Venue Preferred Vendor Showcase</h3>
                    <p className="text-xs text-gray-500 mt-0.5">One-tap to add any of these verified partners to your wedding team.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {preferredVendors.map((v) => {
                      const already = coupleVendors.some((cv) => cv.venueVendorId === v.id);
                      return (
                        <div key={v.id} className="rounded-xl border border-gray-200 p-4 bg-gray-50/50 flex flex-col justify-between gap-4 shadow-sm hover:shadow transition-all">
                          <div>
                            <div className="flex items-center justify-between gap-2 border-b border-gray-200/80 pb-2">
                              <span className="text-sm font-bold text-gray-900 truncate">{v.name}</span>
                              {v.rating ? <span className="text-xs font-semibold text-amber-600 shrink-0">⭐ {v.rating}</span> : null}
                            </div>
                            <div className="text-xs text-gray-500 mt-2 space-y-1">
                              <div className="font-semibold text-[#4A1942] uppercase tracking-wide text-[10px]">
                                {vendorCategoryLabel(v.category)}
                              </div>
                              {v.contactName && <div>👤 {v.contactName}</div>}
                              {v.email && <div className="truncate">📧 {v.email}</div>}
                              {v.website && <div className="truncate">🌐 {v.website}</div>}
                            </div>
                            {v.description && (
                              <p className="text-xs text-gray-600 mt-2 line-clamp-3 leading-relaxed">{v.description}</p>
                            )}
                          </div>
                          {canManageGuests && (
                            <button
                              type="button"
                              disabled={already}
                              onClick={() => pickPreferredVendor(v)}
                              className={`w-full text-xs font-bold py-2 rounded-xl transition-colors shadow-sm ${
                                already
                                  ? 'bg-gray-200 text-gray-600 cursor-default'
                                  : 'btn-primary bg-[#4A1942] text-white hover:bg-[#3b1435]'
                              }`}
                            >
                              {already ? '✓ Already on Team' : '+ Add to My Team'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add custom vendor */}
              {canManageGuests && (
                <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                  <h3 className="font-semibold text-sm mb-2">➕ Add your own vendor</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={customVendor.name}
                      onChange={(e) => setCustomVendor({ ...customVendor, name: e.target.value })}
                      placeholder="Vendor name"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      aria-label="Custom vendor name"
                    />
                    <select
                      value={customVendor.category}
                      onChange={(e) => setCustomVendor({ ...customVendor, category: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                      aria-label="Custom vendor category"
                    >
                      {vendorCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={customVendor.contactName}
                      onChange={(e) => setCustomVendor({ ...customVendor, contactName: e.target.value })}
                      placeholder="Contact name"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      aria-label="Custom vendor contact"
                    />
                    <input
                      type="email"
                      value={customVendor.email}
                      onChange={(e) => setCustomVendor({ ...customVendor, email: e.target.value })}
                      placeholder="Email"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      aria-label="Custom vendor email"
                    />
                    <input
                      type="tel"
                      value={customVendor.phone}
                      onChange={(e) => setCustomVendor({ ...customVendor, phone: e.target.value })}
                      placeholder="Phone"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      aria-label="Custom vendor phone"
                    />
                    <input
                      type="text"
                      value={customVendor.notes}
                      onChange={(e) => setCustomVendor({ ...customVendor, notes: e.target.value })}
                      placeholder="Notes"
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      aria-label="Custom vendor notes"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addCustomVendor}
                    className="btn-primary mt-2 px-4 py-2 rounded-lg bg-[#4A1942] text-white text-sm font-medium hover:bg-[#3b1435]"
                  >
                    Add vendor
                  </button>
                </div>
              )}

              {/* Couple's vendor list */}
              <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <h3 className="font-bold text-base text-gray-900">Your Booked Wedding Team ({coupleVendors.length})</h3>
                  <span className="text-xs text-gray-500 font-semibold bg-gray-100 px-3 py-1 rounded-full">
                    {coupleVendors.filter((v) => v.status === 'booked').length} Booked
                  </span>
                </div>
                {coupleVendors.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-gray-500">
                    <div className="text-2xl mb-1">🧰</div>
                    <p className="text-sm font-bold text-gray-700">No wedding vendors added yet</p>
                    <p className="text-xs mt-0.5">Add your own vendor above or pick from the venue's preferred list.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {coupleVendors.map((v) => (
                      <div key={v.id} className="rounded-xl border border-gray-200 p-4 bg-gray-50/50 flex flex-col justify-between gap-3 shadow-sm hover:shadow transition-all">
                        <div>
                          <div className="flex items-center justify-between gap-2 border-b border-gray-200/80 pb-2">
                            <span className="text-sm font-bold text-gray-900 truncate">{v.name}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-900 bg-purple-100 px-2 py-0.5 rounded-full shrink-0">
                              {vendorCategoryLabel(v.category)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-2 space-y-1">
                            <div>{v.source === 'preferred' ? '🏛️ Venue Preferred Partner' : '👤 Directly Booked'}</div>
                            {v.contactName && <div>👤 {v.contactName}</div>}
                            {v.email && <div className="truncate">📧 {v.email}</div>}
                            {v.phone && <div>📞 {v.phone}</div>}
                            {v.cost != null && <div className="font-bold text-gray-900">💰 ${v.cost.toLocaleString()}</div>}
                          </div>
                          {v.notes && <div className="text-xs text-gray-600 mt-2 italic bg-white p-2 rounded border border-gray-200">{v.notes}</div>}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200/80">
                          <select
                            value={v.status}
                            disabled={!canManageGuests}
                            onChange={(e) => setVendorStatus(v.id, e.target.value as CoupleVendor['status'])}
                            className="px-2.5 py-1 border border-gray-300 rounded-lg text-xs font-bold bg-white disabled:bg-gray-50"
                            aria-label={`Status for ${v.name}`}
                          >
                            <option value="requested">Requested</option>
                            <option value="contacted">Contacted</option>
                            <option value="booked">Booked ✓</option>
                            <option value="declined">Declined</option>
                          </select>
                          {canManageGuests && (
                            <button
                              type="button"
                              onClick={() => {
                                removeCoupleVendor(event!.id, v.id);
                                setVendorTick((t) => t + 1);
                              }}
                              className="text-xs text-red-600 hover:underline font-semibold"
                              aria-label={`Remove ${v.name}`}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'guests' && (
            <div className="space-y-6">
              {/* Executive RSVP Summary (6 KPI Cards) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Invited Guests', value: coupleGuests.length, color: 'text-gray-900', icon: '👥' },
                  { label: 'Total Attending', value: coupleGuests.filter((g) => coupleRsvps.some((r) => r.guestId === g.id && r.attending)).length + coupleRsvps.filter((r) => r.attending && !!r.plusOneName).length, color: 'text-emerald-700 font-extrabold', icon: '✅' },
                  { label: 'Not Attending', value: coupleGuests.filter((g) => coupleRsvps.some((r) => r.guestId === g.id && !r.attending)).length, color: 'text-red-600 font-extrabold', icon: '❌' },
                  { label: 'No Response Yet', value: coupleGuests.filter((g) => !coupleRsvps.some((r) => r.guestId === g.id)).length, color: 'text-amber-600 font-extrabold', icon: '⏳' },
                  { label: 'Special Diets', value: coupleRsvps.filter((r) => r.attending && r.dietaryNotes && r.dietaryNotes.trim()).length, color: 'text-purple-700 font-extrabold', icon: '🥗' },
                  { label: 'Plus-Ones', value: coupleRsvps.filter((r) => r.attending && !!r.plusOneName).length, color: 'text-blue-700 font-extrabold', icon: '➕' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-white border border-gray-200 p-4 text-center shadow-sm">
                    <div className="text-xl">{s.icon}</div>
                    <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-500 font-semibold mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Quick Guest List Search & Status Filter */}
              <div className="rounded-xl bg-white border border-gray-200 p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                  <span className="text-sm">🔍</span>
                  <input
                    type="search"
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    placeholder="Quick search guest by name, email, or phone…"
                    aria-label="Quick search guests"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter guests by RSVP">
                  {([
                    ['all', 'All'],
                    ['attending', '✅ Attending'],
                    ['not-attending', '❌ Not attending'],
                    ['no-response', '⏳ No response'],
                  ] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setGuestFilter(val)}
                      aria-pressed={guestFilter === val}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        guestFilter === val
                          ? 'btn-primary bg-[#4A1942] text-white shadow-sm'
                          : 'bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200'
                      }`}
                      style={guestFilter === val ? { backgroundColor: config.primaryColor || '#4A1942' } : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const limit = bookedPackage ? bookedPackage.maxGuests : event.guestCount;
                if (!limit || coupleGuests.length <= limit) return null;
                return (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                    ⚠️ You've invited {coupleGuests.length} guests, which is above your{' '}
                    {bookedPackage ? 'package' : 'expected'} guest limit of {limit}.
                    Let the venue know if you'll need extra space.
                  </div>
                );
              })()}
              {/* Meal summary (for catering) */}
              {(() => {
                const attending = coupleRsvps.filter((r) => r.attending);
                // Total headcount = attending guests + their plus-ones.
                const headcount = attending.length + attending.filter((r) => !!r.plusOneName).length;
                const counts = new Map<string, number>();
                let unselected = 0;
                attending.forEach((r) => {
                  if (r.mealChoice) counts.set(r.mealChoice, (counts.get(r.mealChoice) || 0) + 1);
                  else unselected += 1; // attending guest with no meal chosen
                  // Plus-one headcount: a plus-one with a meal counts toward that
                  // meal; a plus-one without a meal still adds an "unselected" seat.
                  if (r.plusOneName) {
                    if (r.plusOneMealChoice) counts.set(r.plusOneMealChoice, (counts.get(r.plusOneMealChoice) || 0) + 1);
                    else unselected += 1;
                  }
                });
                const totalMeals = Array.from(counts.values()).reduce((a, b) => a + b, 0) + unselected;
                if (totalMeals === 0) return null;
                return (
                  <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                    <h3 className="font-semibold text-sm mb-2">🍽️ Meal counts</h3>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(counts.entries()).map(([value, n]) => (
                        <span key={value} className="text-sm bg-gray-100 rounded-full px-3 py-1 text-gray-700">
                          {(portalConfig?.mealOptions?.find((o) => o.value === value)?.label) || value}: <strong>{n}</strong>
                        </span>
                      ))}
                      {unselected > 0 && (
                        <span className="text-sm bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1">
                          No meal selected: <strong>{unselected}</strong>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {headcount} attending (incl. plus-ones) · {totalMeals} total meal(s) for catering.
                    </p>
                  </div>
                );
              })()}
              {/* Per-event RSVP headcount */}
              {coupleGuestEvents.length > 0 && (() => {
                const attending = coupleRsvps.filter((r) => r.attending);
                return (
                  <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                    <h3 className="font-semibold text-sm mb-2">🎟️ RSVPs per event</h3>
                    <div className="space-y-1.5">
                      {coupleGuestEvents.map((ge) => {
                        // Per-event headcount = attending guests (+ their plus-ones).
                        const eventAttending = attending.filter((r) => (r.attendingEvents || []).includes(ge.id));
                        const count = eventAttending.length + eventAttending.filter((r) => !!r.plusOneName).length;
                        const assigned = assignedGuestCount(ge.id);
                        const overCap = !!ge.capacity && count > ge.capacity;
                        return (
                          <div key={ge.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-gray-700">{ge.title}</span>
                            <span className={`text-xs ${overCap ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                              {count} attending / {assigned} invited{ge.capacity ? ` / ${ge.capacity} cap` : ''}
                              {overCap ? ' ⚠️ over capacity' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {/* Guest events & itinerary */}
              <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm">📅 Guest events &amp; itinerary</h3>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  These are the events your guests are invited to (from your package &amp; add-ons).
                  Set each event's capacity and assign specific guests to each one — e.g. a limited
                  rehearsal dinner or overnight lodging. Guests see only their assigned events and
                  RSVP to each.
                </p>
                {!canManageGuests && <p className="text-xs text-gray-500 italic mb-3">View-only — your role cannot edit guest events.</p>}
                <div className="space-y-2">
                  {coupleGuestEvents.length === 0 && <p className="text-xs text-gray-400">No guest events yet. Assign a package to auto-create them.</p>}
                  {coupleGuestEvents.map((ge) => {
                    const assigned = assignedGuestCount(ge.id);
                    const over = assigned > ge.capacity;
                    return (
                      <div key={ge.id} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-800">{ge.title}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{GUEST_EVENT_KIND_LABELS[ge.kind]}</span>
                              {ge.derived && <span className="text-xs text-[#4A1942]/70">auto</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {ge.dayIndex != null && event.days?.[ge.dayIndex] ? `Day ${ge.dayIndex + 1} (${event.days[ge.dayIndex].date})` : 'All days'}
                              {ge.startTime ? ` · ${safeTime(ge.startTime)}` : ''}
                              {ge.location ? ` · ${ge.location}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${over ? 'bg-red-100 text-red-700' : 'bg-[#4A1942]/10 text-[#4A1942]'}`}>
                              {assigned}/{ge.capacity} assigned
                            </span>
                            {canManageGuests && (
                              <button type="button" onClick={() => { removeCoupleGuestEvent(event!.id, ge.id); setGuestEventTick((t) => t + 1); }} className="text-xs text-red-500 hover:underline" aria-label={`Remove ${ge.title}`}>
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Edit schedule (capacity, time, location) */}
                        {canManageGuests && (
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-2 text-xs text-gray-500">
                              Capacity
                              <input
                                type="number"
                                min={1}
                                value={ge.capacity}
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  const n = raw === '' ? 1 : Number(raw);
                                  if (Number.isNaN(n) || n < 1) return; // ignore invalid/empty
                                  updateCoupleGuestEvent(event!.id, ge.id, { capacity: Math.round(n) });
                                  setGuestEventTick((t) => t + 1);
                                }}
                                className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-xs"
                                aria-label={`Capacity for ${ge.title}`}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-500">
                              Location
                              <input
                                type="text"
                                value={ge.location || ''}
                                onChange={(e) => {
                                  updateCoupleGuestEvent(event!.id, ge.id, { location: e.target.value || undefined });
                                  setGuestEventTick((t) => t + 1);
                                }}
                                placeholder="e.g. Garden"
                                className="px-2 py-1 border border-gray-300 rounded-lg text-xs w-32"
                                aria-label={`Location for ${ge.title}`}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-500">
                              Time
                              <input
                                type="datetime-local"
                                value={ge.startTime ? ge.startTime.slice(0, 16) : ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) return;
                                  const dt = new Date(v);
                                  if (Number.isNaN(dt.getTime())) return;
                                  updateCoupleGuestEvent(event!.id, ge.id, { startTime: dt.toISOString() });
                                  setGuestEventTick((t) => t + 1);
                                }}
                                className="px-2 py-1 border border-gray-300 rounded-lg text-xs"
                                aria-label={`Start time for ${ge.title}`}
                              />
                            </label>
                            {event?.days && event.days.length > 1 && (
                              <label className="flex items-center gap-2 text-xs text-gray-500">
                                Day
                                <select
                                  value={ge.dayIndex ?? 0}
                                  onChange={(e) => {
                                    updateCoupleGuestEvent(event!.id, ge.id, { dayIndex: Number(e.target.value) });
                                    setGuestEventTick((t) => t + 1);
                                  }}
                                  className="px-2 py-1 border border-gray-300 rounded-lg text-xs bg-white"
                                  aria-label={`Day for ${ge.title}`}
                                >
                                  {event.days.map((d, idx) => (
                                    <option key={d.id} value={idx}>{idx + 1}. {d.label}</option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {canManageGuests && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="text-xs font-medium text-gray-500 mb-1">Add a custom guest event</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input type="text" value={newGuestEvent.title} onChange={(e) => setNewGuestEvent({ ...newGuestEvent, title: e.target.value })} placeholder="Event name" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" aria-label="Custom event name" />
                      <input type="number" value={newGuestEvent.capacity} min={1} onChange={(e) => setNewGuestEvent({ ...newGuestEvent, capacity: e.target.value })} placeholder="Capacity" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" aria-label="Custom event capacity" />
                      <input type="text" value={newGuestEvent.location} onChange={(e) => setNewGuestEvent({ ...newGuestEvent, location: e.target.value })} placeholder="Location (optional)" className="px-3 py-2 border border-gray-300 rounded-lg text-sm sm:col-span-2" aria-label="Custom event location" />
                    </div>
                    <button type="button" onClick={addGuestEvent} className="btn-primary mt-2 px-3 py-1.5 rounded-lg bg-[#4A1942] text-white text-xs font-medium hover:bg-[#3b1435]">+ Add event</button>
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                <h3 className="font-semibold text-sm mb-1">Manage your guests</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Add guests, send each one their own invite link to your guest portal, and
                  see who has RSVP'd.
                </p>
                {!canManageGuests && (
                  <p className="text-xs text-gray-500 italic mb-3">View-only — your role cannot add, edit, or remove guests.</p>
                )}
                {canManageGuests && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Guest name"
                      value={guestForm.name}
                      onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      aria-label="Guest name"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={guestForm.email}
                      onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      aria-label="Guest email"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={guestForm.phone}
                      onChange={(e) => setGuestForm({ ...guestForm, phone: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      aria-label="Guest phone"
                    />
                    <button
                      type="button"
                      onClick={handleAddGuest}
                      className="btn-primary px-3 py-2 rounded-lg bg-[#4A1942] text-white text-sm font-medium hover:bg-[#3b1435]"
                    >
                      ➕ Add guest
                    </button>
                  </div>
                )}
                {guestError && canManageGuests && <p className="text-xs text-red-600 mt-2">{guestError}</p>}
                {canManageGuests && (
                  <>
                  <input
                    id="couple-guest-csv-upload"
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    aria-label="Import couple guests CSV"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      e.currentTarget.value = '';
                      if (!file) return;
                      const reader = new FileReader();
                      let completed = false;
                      const finish = (value: string) => {
                        if (completed) return;
                        completed = true;
                        handleImportGuests(value);
                      };
                      reader.onload = () => finish(String(reader.result || ''));
                      reader.onerror = () => setGuestError('Could not read the guest CSV file.');
                      try {
                        reader.readAsText(file);
                      } catch {
                        setGuestError('Could not read the guest CSV file.');
                      }
                    }}
                  />
                  <label htmlFor="couple-guest-csv-upload" className="mt-3 inline-flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                    📥 Import guests (CSV: name,email,phone)
                  </label>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!event) return;
                    exportCoupleGuestsCsv(event.id, coupleRsvps);
                    showToast('Guest list exported as CSV.', 'success');
                  }}
                  className="ml-3 text-xs text-[#4A1942] hover:underline"
                >
                  📤 Export CSV
                </button>
              </div>

              <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-sm">
                    Guest list ({coupleGuests.length})
                  </h3>
                  {canManageGuests && noResponseGuests.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
                        const rows = noResponseGuests.map((g) => [g.name, g.email || '', g.phone || ''].map(esc).join(','));
                        const csv = ['Name,Email,Phone', ...rows].join('\n');
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'no-response-guests.csv';
                        a.click();
                        URL.revokeObjectURL(url);
                        showToast(`Exported ${noResponseGuests.length} guest${noResponseGuests.length === 1 ? '' : 's'} who haven't responded. Use the 🔔 per-guest button to send a reminder email.`, 'info');
                      }}
                      className="text-xs text-amber-600 hover:underline"
                      title="Download a CSV of guests who haven't responded so you can follow up"
                    >
                      📄 No-response list ({noResponseGuests.length})
                    </button>
                  )}
                </div>
                {coupleGuests.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 px-6 py-8 text-center text-gray-500 text-sm">
                    No guests yet. Add your first guest above.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <input
                        type="search"
                        value={guestSearch}
                        onChange={(e) => setGuestSearch(e.target.value)}
                        placeholder="Search guests…"
                        aria-label="Search guests"
                        className="flex-1 min-w-[160px] px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <div className="flex gap-1.5" role="group" aria-label="Filter guests by RSVP">
                        {([
                          ['all', 'All'],
                          ['attending', '✅ Attending'],
                          ['not-attending', '❌ Not attending'],
                          ['no-response', '⏳ No response'],
                        ] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setGuestFilter(val)}
                            aria-pressed={guestFilter === val}
                            className={`px-2.5 py-1.5 rounded-full text-xs ${
                              guestFilter === val
                                ? 'btn-primary bg-[#4A1942] text-white'
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {filteredGuests.length === 0 ? (
                      <p className="text-xs text-gray-400 py-6 text-center">
                        No guests match this search/filter.
                      </p>
                    ) : (
                  <div className="space-y-2">
                    {filteredGuests.map((g) => {
                      const rsvp = coupleRsvps.find((r) => r.guestId === g.id);
                      return (
                        <div key={g.id} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-sm text-gray-800 truncate">{g.name}</div>
                              <div className="text-xs text-gray-500 truncate">
                                {g.email || '—'} {g.phone ? `• ${g.phone}` : ''}
                                {g.tableId ? ` • 🪑 ${g.tableId}` : ''}
                                {g.roomId ? ` • 🛏️ ${g.roomId}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => setExpandedGuestRsvp(expandedGuestRsvp === g.id ? null : g.id)}
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  rsvp ? (rsvp.attending ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') : 'bg-gray-100 text-gray-500'
                                }`}
                                aria-label={`RSVP details for ${g.name}`}
                              >
                                {rsvp ? (rsvp.attending ? 'Attending' : 'Not attending') : 'No RSVP'}
                              </button>
                            {canManageGuests && g.token && (
                              <button
                                type="button"
                                onClick={() => handleCopyGuestLink(g.token!, g.email)}
                                className="text-xs text-[#4A1942] hover:underline"
                              >
                                Copy link
                              </button>
                            )}
                            {canManageGuests && g.token && (
                              <button
                                type="button"
                                onClick={() => handleRotateGuestLink(g.id, g.name)}
                                className="text-xs text-amber-700 hover:underline"
                                title="Create a new link while preserving this guest's RSVP history"
                              >
                                Reissue link
                              </button>
                            )}
                            {canManageGuests && g.email && g.token && (
                              <button
                                type="button"
                                onClick={() => handleEmailGuest(g.email!, g.name, g.token!)}
                                className="text-xs text-[#4A1942] hover:underline"
                              >
                                ✉️ Email invite
                              </button>
                            )}
                            {canManageGuests && !rsvp && g.email && g.token && (
                              <button
                                type="button"
                                onClick={() => handleRemindGuest(g.email!, g.name, g.token!)}
                                className="text-xs text-amber-600 hover:underline"
                                title="Send an RSVP reminder to this guest"
                              >
                                🔔 Remind
                              </button>
                            )}
                            {canManageGuests && (
                              <button
                                type="button"
                                onClick={() => {
                                  const existing = coupleRsvps.find((r) => r.guestId === g.id);
                                  setRsvpRecord({
                                    attending: existing?.attending ?? true,
                                    meal: existing?.mealChoice || '',
                                    plusOne: existing?.plusOneName || '',
                                    notes: existing?.notes || '',
                                  });
                                  setRsvpGuestId(rsvpGuestId === g.id ? null : g.id);
                                }}
                                className="text-xs text-teal-600 hover:underline"
                                title="Record or edit this guest's RSVP (e.g. from a phone call)"
                              >
                                📝 Record RSVP
                              </button>
                            )}
                            {canManageGuests && (
                              <button
                                type="button"
                                onClick={() => setEditingGuest({ id: g.id, name: g.name, email: g.email || '', emailLocked: Boolean(g.email?.trim()), phone: g.phone || '', tableId: g.tableId || '', roomId: g.roomId || '' })}
                                className="text-xs text-gray-500 hover:underline"
                              >
                                ✏️ Edit
                              </button>
                            )}
                            {canManageGuests && (
                              <button
                                type="button"
                                onClick={() => {
                                  removeCoupleGuest(event!.id, g.id);
                                  removeCoupleRsvp(event!.id, g.id);
                                  setGuestTick((t) => t + 1);
                                }}
                                className="text-xs text-red-500 hover:underline"
                                aria-label={`Remove ${g.name}`}
                              >
                                Remove
                              </button>
                            )}
                            </div>
                          </div>
                          {editingGuest && editingGuest.id === g.id && (
                            <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <input
                                type="text"
                                value={editingGuest.name}
                                onChange={(e) => setEditingGuest({ ...editingGuest, name: e.target.value })}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                placeholder="Name"
                                aria-label="Edit guest name"
                              />
                              <input
                                type="email"
                                value={editingGuest.email}
                                onChange={(e) => setEditingGuest({ ...editingGuest, email: e.target.value })}
                                readOnly={editingGuest.emailLocked}
                                className={`px-3 py-2 border border-gray-300 rounded-lg text-sm ${editingGuest.emailLocked ? 'bg-gray-100 text-gray-600' : ''}`}
                                placeholder="Email required before inviting"
                                aria-label="Edit guest email"
                                title={editingGuest.emailLocked ? 'The email is fixed to this personal account invitation.' : undefined}
                              />
                              <input
                                type="tel"
                                value={editingGuest.phone}
                                onChange={(e) => setEditingGuest({ ...editingGuest, phone: e.target.value })}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                placeholder="Phone"
                                aria-label="Edit guest phone"
                              />
                              <input
                                type="text"
                                value={editingGuest.tableId || ''}
                                onChange={(e) => setEditingGuest({ ...editingGuest, tableId: e.target.value })}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                placeholder="Table / seat (e.g. Table 4)"
                                aria-label="Edit guest table or seat"
                              />
                              <input
                                type="text"
                                value={editingGuest.roomId || ''}
                                onChange={(e) => setEditingGuest({ ...editingGuest, roomId: e.target.value })}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                placeholder="Room (e.g. Room 12)"
                                aria-label="Edit guest room"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveGuestEdit}
                                  className="btn-primary px-3 py-2 rounded-lg bg-[#4A1942] text-white text-sm font-medium hover:bg-[#3b1435]"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingGuest(null)}
                                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                          {rsvpGuestId === g.id && (
                            <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Attending?</label>
                                <select
                                  value={rsvpRecord.attending ? 'yes' : 'no'}
                                  onChange={(e) => setRsvpRecord({ ...rsvpRecord, attending: e.target.value === 'yes' })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                  aria-label="Recorded attending status"
                                >
                                  <option value="yes">Yes</option>
                                  <option value="no">No</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Meal choice</label>
                                <select
                                  value={rsvpRecord.meal}
                                  disabled={!rsvpRecord.attending}
                                  onChange={(e) => setRsvpRecord({ ...rsvpRecord, meal: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
                                  aria-label="Recorded meal choice"
                                >
                                  <option value="">No meal</option>
                                  {(portalConfig?.mealOptions && portalConfig.mealOptions.length > 0
                                    ? portalConfig.mealOptions
                                    : DEFAULT_MEAL_OPTIONS
                                  ).map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </div>
                              <input
                                type="text"
                                value={rsvpRecord.plusOne}
                                disabled={!rsvpRecord.attending}
                                onChange={(e) => setRsvpRecord({ ...rsvpRecord, plusOne: e.target.value })}
                                placeholder="Plus one name"
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-50"
                                aria-label="Recorded plus one"
                              />
                              <input
                                type="text"
                                value={rsvpRecord.notes}
                                onChange={(e) => setRsvpRecord({ ...rsvpRecord, notes: e.target.value })}
                                placeholder="Notes (e.g. dietary)"
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                aria-label="Recorded notes"
                              />
                              <div className="flex gap-2 sm:col-span-2">
                                <button
                                  type="button"
                                  onClick={saveRecordedRsvp}
                                  className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700"
                                >
                                  Save RSVP
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRsvpGuestId(null)}
                                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                          {expandedGuestRsvp === g.id && rsvp && (
                            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600 space-y-1">
                              {rsvp.mealChoice && <p>🍽️ Meal: {(portalConfig?.mealOptions && portalConfig.mealOptions.find((o) => o.value === rsvp.mealChoice)?.label) || rsvp.mealChoice}</p>}
                              {rsvp.plusOneName && (
                                <p>➕ Plus one: {rsvp.plusOneName}
                                  {rsvp.plusOneMealChoice ? ` · ${(portalConfig?.mealOptions?.find((o) => o.value === rsvp.plusOneMealChoice)?.label) || rsvp.plusOneMealChoice}` : ''}
                                </p>
                              )}
                              {rsvp.dietaryNotes && <p>🥗 Dietary: {rsvp.dietaryNotes}</p>}
                              {rsvp.specialNeeds && <p>♿ Special needs: {rsvp.specialNeeds}</p>}
                              {rsvp.notes && <p>📝 Notes: {rsvp.notes}</p>}
                              {rsvp.attendingDays && rsvp.attendingDays.length > 0 && (
                                <p>📅 Days: {rsvp.attendingDays.map((d) => d.replace('day', 'Day ')).join(', ')}</p>
                              )}
                              {!rsvp.mealChoice && !rsvp.plusOneName && !rsvp.dietaryNotes && !rsvp.specialNeeds && !rsvp.notes && (
                                <p className="text-gray-400">No meal/dietary details provided.</p>
                              )}
                              {rsvp.attendingEvents && rsvp.attendingEvents.length > 0 && (
                                <p>📅 Attending: {rsvp.attendingEvents.map((id) => coupleGuestEvents.find((guestEvent) => guestEvent.id === id)?.title || id).join(', ')}</p>
                              )}
                            </div>
                          )}
                          {/* Per-guest event assignment (which events this guest is invited to) */}
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            <div className="text-xs font-medium text-gray-500 mb-1">Invited to events</div>
                            {coupleGuestEvents.length === 0 ? (
                              <p className="text-xs text-gray-400">No guest events defined yet.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {coupleGuestEvents.map((ge) => {
                                  const checked = (g.guestEventIds || []).includes(ge.id);
                                  const atCap = !checked && assignedGuestCount(ge.id) >= ge.capacity;
                                  return (
                                    <button
                                      key={ge.id}
                                      type="button"
                                      disabled={!canManageGuests}
                                      onClick={() => {
                                        if (checked) {
                                          removeGuestFromEvent(event!.id, g.id, ge.id);
                                        } else {
                                          if (atCap) {
                                            showToast(`${ge.title} is at capacity (${ge.capacity}).`, 'warning');
                                            return;
                                          }
                                          assignGuestToEvent(event!.id, g.id, ge.id);
                                        }
                                        setGuestEventTick((t) => t + 1);
                                        setGuestTick((t) => t + 1);
                                      }}
                                      className={`text-[11px] px-2 py-1 rounded-full border disabled:cursor-default ${
                                        checked
                                          ? 'btn-primary bg-[#4A1942] text-white border-[#4A1942]'
                                          : atCap
                                            ? 'bg-gray-100 text-gray-400 border-gray-200'
                                            : 'bg-white text-gray-600 border-gray-300 hover:border-[#4A1942]/40'
                                      }`}
                                    >
                                      {checked ? '✓ ' : ''}{ge.title}{atCap && !checked ? ` (full)` : ''}
                                    </button>
                                  );
                                })}
                                </div>
                              )}
                            </div>
                        </div>
                      );
                    })}
                  </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'portal' && (
            <div className="space-y-3">
              <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm">
                <h3 className="font-semibold text-sm mb-1">Your guest portal settings</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Personalize the portal your guests see — the welcome message, schedule,
                  and meal choices. These were pre-filled from the venue; adjust them to fit
                  your day.
                </p>

                {!canManagePortal && (
                  <p className="text-xs text-gray-500 italic mb-3">View-only — only the couple can change portal settings.</p>
                )}

                {!portalDraft ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : !canManagePortal ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-2">
                    {portalDraft.welcomeMessage && (
                      <p><span className="font-medium">Welcome:</span> {portalDraft.welcomeMessage}</p>
                    )}
                    {portalDraft.rsvpMessage && (
                      <p><span className="font-medium">RSVP message:</span> {portalDraft.rsvpMessage}</p>
                    )}
                    <p>
                      <span className="font-medium">Visible tabs:</span>{' '}
                      {[
                        ['showRSVP', 'RSVP'],
                        ['showSchedule', 'Schedule'],
                        ['showMap', 'Map'],
                        ['showLodging', 'Lodging'],
                        ['showWayfinding', 'Wayfinding'],
                      ]
                        .filter(([k]) => portalDraft[k as keyof GuestPortalConfig])
                        .map(([, l]) => l)
                        .join(', ') || 'None'}
                    </p>
                    {(portalDraft.scheduleItems?.length || 0) > 0 && (
                      <p><span className="font-medium">Schedule items:</span> {portalDraft.scheduleItems!.length}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Hero image */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Hero image (URL)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={portalDraft.heroImageUrl || ''}
                          onChange={(e) => setPortalDraft({ ...portalDraft, heroImageUrl: e.target.value })}
                          placeholder="https://…/hero.jpg"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          aria-label="Hero image URL"
                        />
                        <button
                          type="button"
                          onClick={() => setPortalDraft({ ...portalDraft, heroImageUrl: '' })}
                          className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-500 hover:bg-gray-50"
                        >
                          Clear
                        </button>
                      </div>
                      {portalDraft.heroImageUrl && (
                        <img
                          src={portalDraft.heroImageUrl}
                          alt="Hero preview"
                          className="mt-2 h-24 w-full object-cover rounded-lg border border-gray-200"
                        />
                      )}
                    </div>
                    {/* Theme color — lets each couple brand their own guest portal.
                        Defaults to the venue brand color when unset. */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Theme color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={portalDraft.themeColor || ''}
                          onChange={(e) => setPortalDraft({ ...portalDraft, themeColor: e.target.value })}
                          className="w-10 h-9 rounded border border-gray-300 cursor-pointer bg-white"
                          aria-label="Guest portal theme color"
                        />
                        <input
                          type="text"
                          value={portalDraft.themeColor || ''}
                          onChange={(e) => setPortalDraft({ ...portalDraft, themeColor: e.target.value })}
                          placeholder="e.g. #B76E79 (blush) — blank uses the venue brand color"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          aria-label="Guest portal theme color hex"
                        />
                        <button
                          type="button"
                          onClick={() => setPortalDraft({ ...portalDraft, themeColor: '' })}
                          className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-500 hover:bg-gray-50"
                          title="Reset to the venue's brand color"
                        >
                          Reset
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">
                        Pick a color that matches your wedding. Leave blank to use the venue's brand color.
                      </p>
                    </div>
                    {/* Portal password (optional) */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Portal password (optional)
                      </label>
                      <input
                        type="password"
                        value={portalPasswordDraft}
                        onChange={(e) => { setPortalPasswordDraft(e.target.value); setPortalPasswordDraftClear(false); }}
                        placeholder={portalDraft.portalPasswordHash ? '•••••••• (a password is set — type a new one to change)' : 'Set a password guests must enter'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        aria-label="Guest portal password"
                        autoComplete="new-password"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        Require guests to enter a password to view the portal. Leave blank to keep the current password.
                      </p>
                      {portalDraft.portalPasswordHash && (
                        <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={portalPasswordDraftClear}
                            onChange={(e) => { setPortalPasswordDraftClear(e.target.checked); if (e.target.checked) setPortalPasswordDraft(''); }}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                          Remove the password (no password required)
                        </label>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Welcome message
                      </label>
                      <textarea
                        rows={2}
                        value={portalDraft.welcomeMessage || ''}
                        onChange={(e) => setPortalDraft({ ...portalDraft, welcomeMessage: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="Welcome to our wedding!"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        RSVP message
                      </label>
                      <textarea
                        rows={2}
                        value={portalDraft.rsvpMessage || ''}
                        onChange={(e) => setPortalDraft({ ...portalDraft, rsvpMessage: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          RSVP deadline
                        </label>
                        <input
                          type="date"
                          value={portalDraft.rsvpDeadlineDate || ''}
                          onChange={(e) => setPortalDraft({ ...portalDraft, rsvpDeadlineDate: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                          Guests can RSVP until this date. Leave blank to keep RSVP open until the event.
                        </p>
                        {!portalDraft.rsvpDeadlineDate && event.eventDate && (
                          <button
                            type="button"
                            onClick={() => {
                              const d = new Date(event.eventDate + 'T00:00:00');
                              d.setDate(d.getDate() - 21); // ~3 weeks before
                              if (!Number.isNaN(d.getTime())) {
                                setPortalDraft({ ...portalDraft, rsvpDeadlineDate: d.toISOString().slice(0, 10) });
                              }
                            }}
                            className="mt-1 text-xs text-[#4A1942] hover:underline"
                          >
                            ✨ Set to ~3 weeks before your event
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Guest access closes
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={portalDraft.accessGracePeriodHours ?? 24}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            const n = raw === '' ? 36 : Number(raw);
                            setPortalDraft({ ...portalDraft, accessGracePeriodHours: Number.isNaN(n) || n < 0 ? 24 : n });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>

                    {/* Tabs */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Visible tabs
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {(
                          [
                            ['showRSVP', 'RSVP'],
                            ['showSchedule', 'Schedule'],
                            ['showMap', 'Map'],
                            ['showLodging', 'Lodging'],
                            ['showWayfinding', 'Wayfinding'],
                          ] as [keyof GuestPortalConfig, string][]
                        ).map(([key, label]) => (
                          <label key={key} className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!portalDraft[key]}
                              onChange={(e) => setPortalDraft({ ...portalDraft, [key]: e.target.checked })}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Meal options */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Meal choices
                      </label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {(portalDraft.mealOptions && portalDraft.mealOptions.length > 0
                          ? portalDraft.mealOptions
                          : DEFAULT_MEAL_OPTIONS
                        ).map((opt) => (
                          <span key={opt.value} className="inline-flex items-center gap-1.5 rounded-full border border-[#4A1942]/20 bg-[#4A1942]/10 px-3 py-1 text-sm text-[#4A1942]">
                            {opt.label}
                            <button
                              type="button"
                              onClick={() =>
                                setPortalDraft({
                                  ...portalDraft,
                                  mealOptions: (portalDraft.mealOptions && portalDraft.mealOptions.length > 0
                                    ? portalDraft.mealOptions
                                    : DEFAULT_MEAL_OPTIONS
                                  ).filter((o) => o.value !== opt.value),
                                })
                              }
                              className="text-[#4A1942]/70 hover:text-[#4A1942] font-bold leading-none"
                              aria-label={`Remove ${opt.label}`}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newMealOption}
                          onChange={(e) => setNewMealOption(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const label = newMealOption.trim();
                              if (!label) return;
                              const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                              const current = portalDraft.mealOptions && portalDraft.mealOptions.length > 0 ? portalDraft.mealOptions : DEFAULT_MEAL_OPTIONS;
                              if (!current.some((o) => o.value === value)) {
                                setPortalDraft({ ...portalDraft, mealOptions: [...current, { value, label }] });
                              }
                              setNewMealOption('');
                            }
                          }}
                          placeholder="Add a meal option (Enter)"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          aria-label="Add meal option"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const label = newMealOption.trim();
                            if (!label) return;
                            const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                            const current = portalDraft.mealOptions && portalDraft.mealOptions.length > 0 ? portalDraft.mealOptions : DEFAULT_MEAL_OPTIONS;
                            if (!current.some((o) => o.value === value)) {
                              setPortalDraft({ ...portalDraft, mealOptions: [...current, { value, label }] });
                            }
                            setNewMealOption('');
                          }}
                          className="btn-primary px-4 py-2 rounded-lg bg-[#4A1942] text-white text-sm font-medium hover:bg-[#3b1435]"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    {/* Schedule items */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Schedule
                      </label>
                      <div className="space-y-2 mb-2">
                        {(portalDraft.scheduleItems || []).map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-sm">
                            <span className="flex-1">{item.title}</span>
                            <span className="text-gray-500 text-xs">{safeDateTime(item.startTime)}</span>
                            <button
                              type="button"
                              onClick={() => setPortalDraft({ ...portalDraft, scheduleItems: (portalDraft.scheduleItems || []).filter((s) => s.id !== item.id) })}
                              className="text-red-400 hover:text-red-600"
                              aria-label={`Remove ${item.title}`}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {(!portalDraft.scheduleItems || portalDraft.scheduleItems.length === 0) && (
                          <p className="text-xs text-gray-400">No schedule items yet.</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Title"
                          value={newScheduleItem.title}
                          onChange={(e) => setNewScheduleItem({ ...newScheduleItem, title: e.target.value })}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          aria-label="Schedule item title"
                        />
                        <input
                          type="datetime-local"
                          value={newScheduleItem.startTime}
                          onChange={(e) => setNewScheduleItem({ ...newScheduleItem, startTime: e.target.value })}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          aria-label="Schedule item time"
                        />
                        <input
                          type="text"
                          placeholder="Location (optional)"
                          value={newScheduleItem.location}
                          onChange={(e) => setNewScheduleItem({ ...newScheduleItem, location: e.target.value })}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          aria-label="Schedule item location"
                        />
                        {event?.days && event.days.length > 1 ? (
                          <select
                            value={newScheduleItem.dayIndex}
                            onChange={(e) => setNewScheduleItem({ ...newScheduleItem, dayIndex: Number(e.target.value) })}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                            aria-label="Schedule item day"
                          >
                            {event.days.map((d, idx) => (
                              <option key={d.id} value={idx}>{idx + 1}. {d.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (!newScheduleItem.title.trim()) return;
                            // If the couple left the time blank, anchor the item to
                            // noon on its day (instead of an arbitrary "now").
                            let startTime = '';
                            if (newScheduleItem.startTime) {
                              startTime = new Date(newScheduleItem.startTime).toISOString();
                            } else {
                              const dayDate = event?.days?.[newScheduleItem.dayIndex]?.date || event?.eventDate;
                              startTime = dayDate
                                ? new Date(`${dayDate}T12:00:00`).toISOString()
                                : new Date().toISOString(); // last resort: keep type valid
                            }
                            const item: PortalScheduleItem = {
                              id: `sched-${Date.now()}`,
                              title: newScheduleItem.title.trim(),
                              startTime,
                              location: newScheduleItem.location || undefined,
                              dayIndex: newScheduleItem.dayIndex,
                            };
                            setPortalDraft({ ...portalDraft, scheduleItems: [...(portalDraft.scheduleItems || []), item] });
                            setNewScheduleItem({ title: '', startTime: '', location: '', dayIndex: 0 });
                          }}
                          className="btn-primary px-4 py-2 rounded-lg bg-[#4A1942] text-white text-sm font-medium hover:bg-[#3b1435]"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={savePortalSettings}
                      className="w-full py-3 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"
                    >
                      {portalSaved ? '✅ Saved!' : '💾 Save portal settings'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm flex flex-col h-[65vh] min-h-[450px]">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div>
                  <h3 className="font-bold text-base text-gray-900">💬 Direct Venue Chat</h3>
                  <p className="text-xs text-gray-500">Instant messages between your wedding team and the venue coordinator.</p>
                </div>
                <span className="text-xs font-semibold bg-[#4A1942]/10 text-[#4A1942] px-3 py-1 rounded-full">
                  {messages.length} total messages
                </span>
              </div>
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-3 border border-gray-200/60 rounded-xl p-4 bg-gray-50/70">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-3xl mb-2">💬</div>
                    <p className="text-sm font-bold text-gray-700">No messages yet</p>
                    <p className="text-xs mt-0.5">Say hello to your venue coordinator or ask a question about your wedding!</p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        m.senderSide === 'couple'
                          ? 'ml-auto bg-[#4A1942] text-white rounded-br-none'
                          : 'bg-white border border-gray-200 text-gray-900 rounded-bl-none'
                      }`}
                    >
                      <div className={`text-[11px] font-bold mb-1 flex items-center justify-between gap-4 ${m.senderSide === 'couple' ? 'text-purple-200' : 'text-gray-500'}`}>
                        <span>{m.senderName} ({m.senderSide === 'venue' ? '🏛️ Venue Team' : '💍 Couple Team'})</span>
                        {m.createdAt && <span className="font-normal opacity-80">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                      </div>
                      <div className="leading-relaxed">{m.message}</div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2.5 mt-4 pt-3 border-t border-gray-100">
                <input
                  type="text"
                  value={chatDraft}
                  disabled={cloudReadOnlyFallback}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                  placeholder="Message your venue coordinator..."
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#4A1942]/20 focus:border-[#4A1942] outline-none"
                  aria-label="Chat message"
                />
                <button
                  type="button"
                  disabled={cloudReadOnlyFallback || !chatDraft.trim()}
                  onClick={handleSendMessage}
                  className="btn-primary px-6 py-2.5 rounded-xl bg-[#4A1942] text-white text-sm font-bold hover:bg-[#3b1435] shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send →
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="px-4 py-4 text-center text-xs text-gray-500">
        {config.venueName || 'Wedding Venue'} · Couples Portal
      </footer>

      {/* Embedded layout editor for a selected space */}
      {layoutEditorSpace && (() => {
        const venue = venues.find((v) => v.id === layoutEditorSpace);
        if (!venue) return null;
        const sl = (event.spaceLayouts || {})[layoutEditorSpace];
        return (
          <CoupleLayoutEditor
            venue={venue}
            initial={sl?.layout || null}
            guestCount={event.guestCount || bookedPackage?.maxGuests || undefined}
            onSave={(layout) => {
              if (cloudReadOnlyFallback) return;
              saveCoupleSpaceLayout(event.id, layoutEditorSpace, layout);
              refresh();
              showToast(`${venue.name} layout saved.`, 'success');
            }}
            onClose={() => setLayoutEditorSpace(null)}
          />
        );
      })()}

      {/* Lodging drill-in: assign guests/rooms from the venue map */}
      {lodgingAssignVenue && (() => {
        const venue = venues.find((v) => v.id === lodgingAssignVenue);
        if (!venue) return null;
        return (
          <LodgingAssignmentsModal
            venue={venue}
            guests={coupleGuests}
            onAssign={(guestId, room) => {
              if (cloudReadOnlyFallback) return;
              updateCoupleGuest(event.id, guestId, { roomId: room });
              setGuestTick((t) => t + 1);
              showToast('Guest assigned to a room.', 'success');
            }}
            onUnassign={(guestId) => {
              if (cloudReadOnlyFallback) return;
              updateCoupleGuest(event.id, guestId, { roomId: undefined });
              setGuestTick((t) => t + 1);
            }}
            onClose={() => setLodgingAssignVenue(null)}
          />
        );
      })()}
    </div>
  );
}

/** Keep React state isolated to one URL-provided couple invitation context. */
export default function CouplesPortal(props: CouplesPortalProps) {
  const contextKey = JSON.stringify([
    props.coupleToken || '',
    props.venueSlug || '',
  ]);
  return <CouplesPortalSession key={contextKey} {...props} />;
}
