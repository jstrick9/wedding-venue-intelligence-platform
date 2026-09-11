// src/components/GuestPortal.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SafeImage from './SafeImage';
import { showToast } from './Toast';

// Safely format a time for a schedule item. Guards against invalid/incomplete
// date strings (e.g. a malformed or time-only value) so the schedule never
// crashes with "Invalid time value" — it falls back to the raw string.
function safeTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Safely format a date, falling back to the raw string for invalid input.
function safeDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

import {
  Venue,
  LodgingFloor,
  LodgingRoom,
  RSVPSubmission,
  GuestPortalConfig,
  GuestPortalGuestRecord,
  PortalScheduleItem,
  PortalMealOption,
  VenueMapPoint,
  VenueMapConfig,
  VenueRulesConfig,
  VenueWeatherConfig,
  CoupleGuestEvent,
  CoupleEvent,
  DEFAULT_MEAL_OPTIONS,
} from '../types';
import {
  clearGuestPortalSession,
  findGuestInEvent,
  getGuestPortalConfig,
  celebrationStatusDays,
  getPortalGuests,
  getPortalGuestsForEvent,
  getPortalRSVPSubmissions,
  getPortalRSVPSubmissionsForEvent,
  getPortalVenues,
  isGuestPortalEventActive,
  loadGuestPortalSession,
  normalizeEventKey,
  saveGuestPortalSession,
  setPortalRSVPSubmissions,
} from '../utils/guestPortal';
import { verifySecret } from '../utils/auth';
import { useBrandingConfig } from '../config';
import { applyDocumentBranding } from '../utils/documentBranding';
import { getPublicVenueBranding } from '../services/platform/publicVenueService';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { STORAGE_VERSIONS } from '../constants/storageVersions';
import { emit } from '../utils/appEvents';
import { saveVersionedStorage } from '../utils/storage';
import { deriveShades } from '../utils/color';
import { getGuestPortalBackend } from '../services/portal/guestPortalBackend';
import {
  isCoupleCloudEnabled,
  isPortalAccessError,
  pullGuestPortalSnapshot,
  resolveAuthoritativePortalVenueMap,
} from '../services/couples/coupleCloudSync';
import {
  getCoupleGuests,
  getCouplePortalConfig,
} from '../services/couples/coupleGuestService';
import { getCoupleGuestEvents } from '../services/couples/coupleGuestEventService';
import {
  getCoupleRsvpSubmissions,
  setCoupleRsvpSubmissions,
} from '../services/couples/coupleRsvpService';
import { findCoupleEventById } from '../services/couples/coupleService';
import { isPortalAccessActive } from '../services/couples/accessLifecycle';
import {
  getVenueMapConfigForPortal,
  getVenueRules,
  normalizeVenueMapConfigForPortal,
  normalizeVenueRulesConfig,
} from '../services/wayfinding/venueWayfindingService';
import { VenueMapCanvas } from './VenueMapCanvas';
import { VenueMapRainPlanGuidance } from './VenueMapRainPlanGuidance';
import {
  arrivalRoleLabel,
  buildVenueMapDirectionSteps,
  findVenueMapRoute,
  hasRenderableVenueMapContent,
  partitionVenueMapRainContingencyCollisions,
  preferredVenueMapDirectionsStart,
  projectVenueMap,
  rainContingencyValidationIssue,
  venueMapDirectionsContextKey,
} from '../utils/venueMapDesigner';
import {
  eventDates,
  getVenueWeather,
  normalizeVenueWeatherConfig,
} from '../services/weather/venueWeatherService';
import { normalizeEmail, normalizeUsPhone } from '../utils/contactQuality';
import { PortalInviteAccountSetup } from './PortalInviteAccountSetup';
import { signOutPortalAccount, type PortalInviteContext } from '../services/portal/portalInviteAccount';
import { setActiveOrganizationSlug } from '../services/platform/organizationContext';
import {
  guestCanAccessLodging,
  guestCanAccessPortal,
  guestCanSubmitRSVP,
  guestCanViewMap,
  guestCanViewSchedule,
} from '../utils/guestAccess';

interface GuestPortalProps {
  guestToken?: string;
  coupleEventId?: string;
  venueSlug?: string;
  onExitPortal: () => void;
  /** Read-only preview mode: renders the portal as a generic visitor without the
   *  sign-in gate and without creating a guest session. RSVP still requires a
   *  real guest. Used by the couple's "Preview portal" action. */
  preview?: boolean;
}

type TabId = 'home' | 'map' | 'schedule' | 'wayfinding' | 'rsvp' | 'lodging';

interface PortalData {
  venues: Venue[];
  guests: GuestPortalGuestRecord[];
  submissions: RSVPSubmission[];
  guestEvents: CoupleGuestEvent[];
}

const hasValidMapGps = (point: VenueMapPoint) =>
  point.lat != null
  && point.lng != null
  && Number.isFinite(point.lat)
  && Number.isFinite(point.lng)
  && point.lat >= -90
  && point.lat <= 90
  && point.lng >= -180
  && point.lng <= 180;

const GuestPortalSession: React.FC<GuestPortalProps> = ({ guestToken, coupleEventId, venueSlug, onExitPortal, preview = false }) => {
  const isPreview = preview;
  const guestInviteTokenRef = useRef(guestToken);
  if (guestToken) guestInviteTokenRef.current = guestToken;
  const accountInviteToken = guestInviteTokenRef.current;
  const cloudAccountInvite =
    !isPreview
    && isCoupleCloudEnabled()
    && Boolean(coupleEventId)
    && Boolean(accountInviteToken);
  const [portalAccountAccess, setPortalAccountAccess] = useState<'pending' | 'ready' | 'legacy'>(
    () => cloudAccountInvite ? 'pending' : 'legacy',
  );
  const handlePortalAccountReady = useCallback((context: PortalInviteContext) => {
    if (context.organizationSlug) setActiveOrganizationSlug(context.organizationSlug);
    setPortalAccountAccess('ready');
  }, []);
  const handleLegacyPortalInvite = useCallback(() => setPortalAccountAccess('legacy'), []);
  const handlePortalExit = useCallback(() => {
    clearGuestPortalSession();
    if (cloudAccountInvite) {
      setActiveOrganizationSlug(null);
      void signOutPortalAccount('guest')
        .catch(() => undefined)
        .then(onExitPortal);
      return;
    }
    onExitPortal();
  }, [cloudAccountInvite, onExitPortal]);
  const localVenueConfig = useBrandingConfig();
  const [publicVenueConfig, setPublicVenueConfig] = useState<typeof localVenueConfig | null>(null);
  const venueConfig = publicVenueConfig || localVenueConfig;

  useEffect(() => {
    setPortalAccountAccess(cloudAccountInvite ? 'pending' : 'legacy');
  }, [accountInviteToken, cloudAccountInvite]);

  useEffect(() => {
    if (!venueSlug) return;
    void getPublicVenueBranding(venueSlug).then((branding) => {
      if (branding) setPublicVenueConfig(branding.config);
    });
  }, [venueSlug]);
  const [config, setConfig] = useState<GuestPortalConfig | null>(null);
  const [remoteCouple, setRemoteCouple] = useState<CoupleEvent | undefined>();
  // Cloud map state is intentionally separate from the other snapshot fields:
  // a map-only poll must trigger a render even when the event, guest, and RSVP
  // payloads are unchanged.
  const [remoteVenueMap, setRemoteVenueMap] = useState<VenueMapConfig | null | undefined>();
  const [venueMapRetryNonce, setVenueMapRetryNonce] = useState(0);
  const [remoteVenueRules, setRemoteVenueRules] = useState<VenueRulesConfig | undefined>(() => (
    cloudAccountInvite ? normalizeVenueRulesConfig(undefined) : undefined
  ));
  const [remoteVenueWeather, setRemoteVenueWeather] = useState<VenueWeatherConfig | undefined>(() => (
    cloudAccountInvite ? normalizeVenueWeatherConfig(undefined) : undefined
  ));
  const [portalData, setPortalData] = useState<PortalData>({
    venues: [],
    guests: [],
    submissions: [],
    guestEvents: [],
  });

  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [isAuthed, setIsAuthed] = useState(false);

  const [eventInput, setEventInput] = useState('');
  const [guestIdentifier, setGuestIdentifier] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [activeEventName, setActiveEventName] = useState('');
  const [resolvedGuestId, setResolvedGuestId] = useState<string | null>(null);

  const [isSubmittingRSVP, setIsSubmittingRSVP] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState<RSVPSubmission | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedWayfindingFrom, setSelectedWayfindingFrom] = useState('');
  const [selectedWayfindingTo, setSelectedWayfindingTo] = useState('');
  const [stepFreeOnly, setStepFreeOnly] = useState(false);
  const [wayfindingResult, setWayfindingResult] = useState<{
    contextKey: string;
    steps: string[];
  } | null>(null);

  const activeVenueMap = resolveAuthoritativePortalVenueMap(
    remoteVenueMap,
    cloudAccountInvite ? null : getVenueMapConfigForPortal(),
    cloudAccountInvite,
  );
  const activeVenueRules = remoteVenueRules !== undefined
    ? remoteVenueRules
    : getVenueRules();
  const activeVenueWeather = remoteVenueWeather !== undefined
    ? remoteVenueWeather
    : getVenueWeather();

  // Per-couple guest portal: scopes config, guests, and RSVPs to a couple event.
  const isCouplePortal = !!coupleEventId;
  const couple = useMemo(
    () => (coupleEventId ? findCoupleEventById(coupleEventId) || remoteCouple : remoteCouple),
    [coupleEventId, remoteCouple],
  );
  const wayfindingContextKey = useMemo(() => venueMapDirectionsContextKey(
    activeVenueMap,
    isCouplePortal ? (couple?.selectedSpaces || []) : [],
    portalData.venues,
    isCoupleCloudEnabled(),
  ), [activeVenueMap, couple?.selectedSpaces, isCouplePortal, portalData.venues]);
  const currentWayfindingSteps = wayfindingResult?.contextKey === wayfindingContextKey
    ? wayfindingResult.steps
    : null;

  // Shared helper: open a map point in Google Maps when it has GPS.
  const openInMaps = (p: VenueMapPoint) => {
    if (!hasValidMapGps(p)) return;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.lat},${p.lng}`)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  // On a separate device the browser has no local CoupleEvent/guest record.
  // Hydrate the public, token-validated snapshot before relying on localStorage.
  useEffect(() => {
    if (cloudAccountInvite && portalAccountAccess === 'pending') {
      setRemoteVenueMap(null);
      setRemoteVenueRules(normalizeVenueRulesConfig(undefined));
      setRemoteVenueWeather(normalizeVenueWeatherConfig(undefined));
      return;
    }
    if (!isCoupleCloudEnabled() || !isCouplePortal || !coupleEventId || !accountInviteToken) {
      setRemoteVenueMap(undefined);
      setRemoteVenueRules(undefined);
      setRemoteVenueWeather(undefined);
      return;
    }
    // Do not retain another invitation's map, rules, or weather while this
    // invitation context is resolving. Portal browser caches are not an
    // authorization or tenant-isolation boundary.
    setRemoteVenueMap(null);
    setRemoteVenueRules(normalizeVenueRulesConfig(undefined));
    setRemoteVenueWeather(normalizeVenueWeatherConfig(undefined));
    let cancelled = false;
    // In-flight guard (Review #245 P1-A): if a pull stalls, skip ticks instead
    // of stacking another anonymous RPC every 5 seconds. The client-level fetch
    // deadline eventually frees a stuck call; this keeps the interval honest.
    let pulling = false;

    const hydrateGuest = async () => {
      if (pulling) return;
      pulling = true;
      try {
        const remote = await pullGuestPortalSnapshot(coupleEventId, accountInviteToken, venueSlug);
        if (!remote || cancelled || !remote.guest) return;
        const remoteEvent = remote.event?.find((candidate) => candidate.id === coupleEventId);
        const remoteConfig = remote.portalConfig?.[coupleEventId]
          || Object.values(remote.portalConfig || {})[0]
          || null;
        const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
        const guest = {
          ...(remote.guest as unknown as GuestPortalGuestRecord),
          token: accountInviteToken,
          eventName: coupleEventId,
          eventKey: coupleEventId,
          allowPortalAccess: true,
        };
        const rsvp = remote.rsvp ? { ...remote.rsvp, token: accountInviteToken } : undefined;
        const nextVenueMap = remote.venueMap !== undefined
          ? normalizeVenueMapConfigForPortal(remote.venueMap, {
              preservePortalStatus: true,
              preserveDuplicateIds: true,
            })
          : undefined;
        const nextVenueRules = normalizeVenueRulesConfig(remote.venueRules);
        const nextVenueWeather = normalizeVenueWeatherConfig(remote.venueWeather);

        if (nextVenueMap !== undefined) {
          setRemoteVenueMap((previous) => (
            sameJson(previous, nextVenueMap) ? previous : nextVenueMap
          ));
        }
        setRemoteVenueRules((previous) => (
          sameJson(previous, nextVenueRules) ? previous : nextVenueRules
        ));
        setRemoteVenueWeather((previous) => (
          sameJson(previous, nextVenueWeather) ? previous : nextVenueWeather
        ));

        // F-265-2 (Review #265): every poll rebuilds these objects with fresh
        // identities even when nothing changed remotely, and that churn flowed
        // through the identifiedGuest/guestRSVP memos into the RSVP prefill
        // effect — resetting the guest's in-progress answers (attending toggle,
        // plus-one, name edits) every 5 seconds. Keep the previous state
        // reference when the content is identical so the memos (and the prefill
        // effect) only re-run when the remote snapshot actually moved.
        setRemoteCouple((prev) => (sameJson(prev, remoteEvent) ? prev : remoteEvent));
        setConfig((prev) => (sameJson(prev, remoteConfig) ? prev : remoteConfig));
        setPortalData((previous) => {
          const next = {
            venues: Array.isArray(remote.venues) ? remote.venues as Venue[] : previous.venues,
            guests: [guest],
            // F-269-1: when the remote has no RSVP but this device does (a
            // submit whose cloud push failed), keep the local copy instead of
            // wiping it from view on the next poll. The remote still wins when
            // it HAS an RSVP (server canonicalization, couple edits).
            submissions: rsvp ? [rsvp] : previous.submissions,
            guestEvents: Array.isArray(remote.guestEvents)
              ? (remote.guestEvents as CoupleGuestEvent[]).filter((item) => item.coupleEventId === coupleEventId)
              : previous.guestEvents,
          };
          return sameJson(previous, next) ? previous : next;
        });

        // Authenticated in-memory state above is authoritative. These global
        // browser entries are only legacy/offline caches and must never block
        // portal hydration when storage is disabled, private, or full.
        const cacheEntries: Array<[string, number, unknown]> = [];
        if (nextVenueMap !== undefined) {
          cacheEntries.push([
            STORAGE_KEYS.VENUE_MAP_CONFIGS,
            STORAGE_VERSIONS.VENUE_MAP_CONFIGS,
            nextVenueMap,
          ]);
        }
        if (remote.venueRules !== undefined) {
          cacheEntries.push([
            STORAGE_KEYS.VENUE_RULES,
            STORAGE_VERSIONS.VENUE_RULES,
            nextVenueRules,
          ]);
        }
        if (remote.venueWeather !== undefined) {
          cacheEntries.push([
            STORAGE_KEYS.VENUE_WEATHER,
            STORAGE_VERSIONS.VENUE_WEATHER,
            nextVenueWeather,
          ]);
        }
        cacheEntries.forEach(([key, version, value]) => {
          try {
            saveVersionedStorage(key, version, value, { emitChange: false });
          } catch {
            // Best-effort cache only; invitation-keyed React state remains live.
          }
        });

        setIsAuthed(true);
        setActiveEventName(remoteConfig?.eventTitle || coupleEventId);
        setResolvedGuestId(guest.id);
        try {
          saveGuestPortalSession(
            remoteConfig,
            accountInviteToken,
            remoteConfig?.eventTitle || coupleEventId,
            guest.id,
            coupleEventId,
          );
        } catch {
          // A server-authorized personal-account session remains usable when
          // the browser refuses optional session persistence.
        }
      } catch (err) {
        if (isPortalAccessError(err) && !cancelled) {
          // F-276-4: expiry, revocation, venue suspension, and account mismatch
          // are authoritative denials, not retryable network failures. Hide the
          // hydrated private view immediately and re-run the invitation gate.
          clearGuestPortalSession();
          setIsAuthed(false);
          setResolvedGuestId(null);
          setConfig(null);
          setRemoteCouple(undefined);
          setRemoteVenueMap(null);
          setRemoteVenueRules(normalizeVenueRulesConfig(undefined));
          setRemoteVenueWeather(normalizeVenueWeatherConfig(undefined));
          setPortalData({ venues: [], guests: [], submissions: [], guestEvents: [] });
          setRsvpSuccess(null);
          setPortalAccountAccess('pending');
        } else if (!cancelled) {
          // F-268-1 (Review #268): the RPC (or its fetch deadline) rejects on
          // network failure/stall — try/finally alone turned that into an
          // unhandled promise rejection every 5 seconds while offline. The poll
          // retries on its own, so stay quiet.
          console.debug('Guest portal cloud pull failed; retrying on the next poll.', err);
        }
      } finally {
        pulling = false;
      }
    };

    void hydrateGuest();
    const poll = window.setInterval(() => { void hydrateGuest(); }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [accountInviteToken, cloudAccountInvite, coupleEventId, isCouplePortal, portalAccountAccess, venueMapRetryNonce, venueSlug]);

  useEffect(() => {
    try {
      if (isCouplePortal && coupleEventId && couple) {
        const venueConfig = getGuestPortalConfig();
        const loadedConfig = getCouplePortalConfig(coupleEventId, venueConfig, {
          coupleName: couple.coupleName,
          eventDate: couple.eventDate,
          eventEndDate: couple.eventEndDate,
        });
        setConfig(loadedConfig);

        const venues = getPortalVenues();
        const guests = getCoupleGuests(coupleEventId);
        const submissions = getCoupleRsvpSubmissions(coupleEventId);
        const guestEvents = getCoupleGuestEvents(coupleEventId);

        setPortalData({ venues, guests, submissions, guestEvents });

      if (loadedConfig && isGuestPortalEventActive(loadedConfig)) {
        const session = loadGuestPortalSession(loadedConfig, loadedConfig.eventTitle, coupleEventId);
        // Historical/local compatibility: the token identifies the guest without
        // re-entering a name. In cloud mode the personal-account gate renders
        // first and backend RPCs still require the bound JWT.
        const tokenGuest = accountInviteToken
          ? getCoupleGuests(coupleEventId || '').find((g) => g.token === accountInviteToken && isPortalAccessActive(g.tokenExpiresAt))
          : undefined;
        if (session || tokenGuest) {
          setIsAuthed(true);
          setActiveEventName(loadedConfig.eventTitle || '');
          if (session) {
            setResolvedGuestId(session.guestId || null);
          } else if (tokenGuest) {
            setResolvedGuestId(tokenGuest.id);
            saveGuestPortalSession(loadedConfig, accountInviteToken, loadedConfig.eventTitle, tokenGuest.id, coupleEventId);
          }
          setEventInput(loadedConfig.eventTitle || '');
        } else {
          clearGuestPortalSession();
        }
      } else {
        clearGuestPortalSession();
      }
      return;
    }

      const loadedConfig = getGuestPortalConfig();
      setConfig(loadedConfig);

      const venues = getPortalVenues();
      const guests = getPortalGuests();
      const submissions = getPortalRSVPSubmissions();

      setPortalData({
        venues,
        guests,
        submissions,
        guestEvents: [],
      });

      if (loadedConfig && isGuestPortalEventActive(loadedConfig)) {
        const session = loadGuestPortalSession(loadedConfig, loadedConfig.eventTitle);
        if (session) {
          setIsAuthed(true);
          setActiveEventName(loadedConfig.eventTitle || '');
          setResolvedGuestId(session.guestId || null);
          setEventInput(loadedConfig.eventTitle || '');
        } else {
          clearGuestPortalSession();
        }
      } else {
        clearGuestPortalSession();
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eventStartDate = config?.eventStartDate ? new Date(config.eventStartDate) : null;
  const eventEndDate = config?.eventEndDate ? new Date(config.eventEndDate) : null;
  const today = new Date();

  // Browser tab title and favicon follow venue branding (plus the event name).
  useEffect(() => {
    applyDocumentBranding({
      name: venueConfig.venueName,
      logoUrl: venueConfig.logoUrl,
      primaryColor: venueConfig.primaryColor,
      suffix: config?.eventTitle || 'Guest Portal',
    });
  }, [venueConfig.venueName, venueConfig.logoUrl, venueConfig.primaryColor, config?.eventTitle]);

  const isMultiDay = !!config?.isMultiDay && !!eventEndDate && !!eventStartDate;

  // Celebration status label that accounts for multi-day events: during the event
  // window (start…end) we show "big day", after the last day "has passed".
  const daysUntilEvent = celebrationStatusDays(
    eventStartDate,
    eventEndDate,
    isMultiDay,
    today,
  );
  // Number of event days for the RSVP "which days" checkboxes (capped so a bad date
  // range can't render an unwieldy list).
  const eventDayCount = isMultiDay
    ? Math.min(
        7,
        Math.max(
          1,
          Math.round(
            (eventEndDate!.getTime() - eventStartDate!.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1,
        ),
      )
    : 1;
  const mealOptions: PortalMealOption[] =
    config?.mealOptions && config.mealOptions.length > 0
      ? config.mealOptions
      : DEFAULT_MEAL_OPTIONS;
  // RSVP deadline: a date-only value (YYYY-MM-DD from a date input) is treated as
  // the *whole day*, staying open through the end of that local day. Without this,
  // `new Date("2026-09-01")` resolves to midnight UTC and the RSVP would close a
  // day early in US timezones.
  const rsvpDeadlineRaw = (config as any)?.rsvpDeadlineDate as string | undefined;
  const rsvpDeadline = rsvpDeadlineRaw
    ? /^\d{4}-\d{2}-\d{2}$/.test(rsvpDeadlineRaw)
      ? (() => {
          const d = new Date(rsvpDeadlineRaw + 'T23:59:59.999');
          return Number.isNaN(d.getTime()) ? null : d;
        })()
      : new Date(rsvpDeadlineRaw)
    : null;
  const rsvpClosed = rsvpDeadline
    ? today.getTime() > rsvpDeadline.getTime()
    : false;

  // Guest portal accent color: a couple's custom theme color wins; otherwise the
  // venue's brand primary color ties through by default. Shades are derived for
  // hover/active states. Guards against invalid hex so a bad value never crashes.
  const accentColor = useMemo(() => {
    const theme = (config as any)?.themeColor?.trim();
    const venue = venueConfig.primaryColor || '#4A1942';
    const base = theme && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(theme) ? theme : venue;
    const shades = deriveShades(base, 0.18, 0.62);
    return { base, shades };
  }, [config, venueConfig.primaryColor]);

  const accentVars = {
    '--accent': accentColor.base,
    '--accent-dark': accentColor.shades.dark,
    '--accent-light': accentColor.shades.light,
  } as React.CSSProperties;

  const scopedGuests = useMemo(() => {
    // Couple portals already load guests from the couple-scoped store. Do not
    // replace that list with the legacy venue-wide portal store after the guest
    // is authenticated; doing so made valid couple invite links appear to lose
    // their identity on the next render.
    if (isCouplePortal) return portalData.guests;
    if (!activeEventName) return portalData.guests;
    return getPortalGuestsForEvent(activeEventName);
  }, [activeEventName, isCouplePortal, portalData.guests]);

  const scopedSubmissions = useMemo(() => {
    // Couple RSVPs live under COUPLE_SUBMISSIONS, while the legacy venue portal
    // uses RSVP_SUBMISSIONS. Keep the two stores separate so one couple cannot
    // hide or inherit another event's responses.
    if (isCouplePortal) return portalData.submissions;
    if (!activeEventName) return portalData.submissions;
    return getPortalRSVPSubmissionsForEvent(activeEventName);
  }, [activeEventName, isCouplePortal, portalData.submissions]);

  const identifiedGuest = useMemo(() => {
    if (resolvedGuestId) {
      return scopedGuests.find((g) => g.id === resolvedGuestId);
    }

    if (accountInviteToken) {
      return scopedGuests.find((g) => g.token === accountInviteToken);
    }

    return undefined;
  }, [accountInviteToken, resolvedGuestId, scopedGuests]);

  const guestRSVP = useMemo(() => {
    if (!identifiedGuest) return undefined;
    return scopedSubmissions.find((s) => s.guestId === identifiedGuest.id);
  }, [identifiedGuest, scopedSubmissions]);

  const activeEventLabel = activeEventName || config?.eventTitle || '';

  // The guest events this guest is invited to (per-couple itinerary).
  const guestAssignedEvents = useMemo(() => {
    if (!identifiedGuest || !isCouplePortal) return [];
    const ids = identifiedGuest.guestEventIds || [];
    return portalData.guestEvents.filter((e) => ids.includes(e.id));
  }, [identifiedGuest, portalData.guestEvents, isCouplePortal]);

  // In preview mode the couple browses as a generic visitor: access-controlled tabs
  // (map/schedule/rsvp/lodging) are shown as long as the venue enabled them. A
  // couple guest is scoped by coupleEventId, not the couple's display title.
  const guestAccessScope = isCouplePortal && coupleEventId
    ? coupleEventId
    : activeEventLabel;
  const canViewTab = (allow: (g: GuestPortalGuestRecord | undefined, ev: string) => boolean) =>
    isPreview ? true : allow(identifiedGuest, guestAccessScope);

  const requiresPortalPassword = !!(
    config?.portalPassword || (config as any)?.portalPasswordHash
  );

  const needsEventScopedSignIn = !isAuthed;

  const handleGuestPortalSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    setPasswordError('');

    if (!config) {
      setPasswordError('Guest portal is not configured.');
      return;
    }

    if (!isGuestPortalEventActive(config)) {
      setPasswordError('This guest portal is no longer available.');
      return;
    }

    const enteredEventKey = normalizeEventKey(eventInput);
    const configuredEventKey = normalizeEventKey(config.eventTitle || '');

    if (!enteredEventKey || enteredEventKey !== configuredEventKey) {
      setPasswordError('Event not found or not available.');
      return;
    }

    // Couple portals already have an event-scoped guest store. Use it directly
    // in local mode instead of asking the legacy venue-wide portal store to find
    // a guest whose scope is the couple event id rather than the display title.
    const normalizedGuestIdentifier = guestIdentifier.trim().toLowerCase();
    const coupleGuest = isCouplePortal && coupleEventId
      ? getCoupleGuests(coupleEventId).find((candidate) =>
          candidate.email?.trim().toLowerCase() === normalizedGuestIdentifier ||
          candidate.name.trim().toLowerCase() === normalizedGuestIdentifier ||
          candidate.token?.trim().toLowerCase() === normalizedGuestIdentifier,
        )
      : undefined;

    // In platform mode, identity is verified server-side via the portal token
    // RPC (falling back to published guest records). In local mode we use the
    // legacy venue store only for the non-couple portal.
    const backend = getGuestPortalBackend();
    const guest = coupleGuest || (
      backend.provider === 'supabase'
        ? await backend.findGuest({
            eventName: config.eventTitle,
            coupleEventId: isCouplePortal ? coupleEventId : undefined,
            venueSlug,
          }, guestIdentifier)
        : findGuestInEvent(config.eventTitle, guestIdentifier)
    );
    const guestScope = isCouplePortal && coupleEventId ? coupleEventId : config.eventTitle;

    if (!guest || !guestCanAccessPortal(guest, guestScope)) {
      setPasswordError('Guest not found for this event.');
      return;
    }

    if (requiresPortalPassword) {
      const trimmedPassword = passwordInput.trim();

      if (config.portalPasswordHash && config.portalPasswordSalt) {
        const isValid = await verifySecret(trimmedPassword, {
          hash: config.portalPasswordHash,
          salt: config.portalPasswordSalt,
        });

        if (!isValid) {
          setPasswordError('Incorrect password. Please try again.');
          return;
        }
      } else if (config.portalPassword && trimmedPassword !== config.portalPassword) {
        setPasswordError('Incorrect password. Please try again.');
        return;
      }
    }

    setIsAuthed(true);
    setActiveEventName(config.eventTitle || eventInput.trim());
    setResolvedGuestId(guest.id);
    if (isCouplePortal && coupleEventId) {
      saveGuestPortalSession(config, guest.token, config.eventTitle, guest.id, coupleEventId);
    } else {
      saveGuestPortalSession(config, guest.token, config.eventTitle, guest.id);
    }
    setPasswordError('');
  };

  const [rsvpForm, setRsvpForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    attending: 'yes' as 'yes' | 'no',
    attendingDays: [] as string[],
    attendingEvents: [] as string[],
    mealChoice: 'standard',
    plusOne: false,
    plusOneName: '',
    plusOneMealChoice: 'standard',
    dietaryNotes: '',
    specialNeeds: '',
    notes: '',
  });

  useEffect(() => {
    if (config && !isGuestPortalEventActive(config)) {
      clearGuestPortalSession();
      setIsAuthed(false);
      setResolvedGuestId(null);
    }
  }, [config]);

  useEffect(() => {
    if (!identifiedGuest && !guestRSVP) return;

    setRsvpForm((prev) => ({
      ...prev,
      fullName: guestRSVP?.fullName || identifiedGuest?.name || prev.fullName,
      email: guestRSVP?.email || identifiedGuest?.email || prev.email,
      phone: guestRSVP?.phone || prev.phone,
      attending: guestRSVP?.attending === false ? 'no' : 'yes',
      // If the guest isn't attending, don't pre-fill stale days from a prior "yes".
      attendingDays: guestRSVP?.attending === false ? [] : (guestRSVP?.attendingDays || prev.attendingDays),
      // For a per-couple portal, default attending events to the guest's assigned events.
      attendingEvents:
        guestRSVP?.attending === false
          ? []
          : guestRSVP?.attendingEvents
            ? guestRSVP.attendingEvents
            : prev.attendingEvents.length > 0
              ? prev.attendingEvents
              : isCouplePortal
                ? guestAssignedEvents.map((e) => e.id)
                : prev.attendingEvents,
      mealChoice: guestRSVP?.mealChoice || prev.mealChoice,
      plusOne: !!guestRSVP?.plusOneName,
      plusOneName: guestRSVP?.plusOneName || prev.plusOneName,
      plusOneMealChoice: guestRSVP?.plusOneMealChoice || prev.plusOneMealChoice,
      dietaryNotes: guestRSVP?.dietaryNotes || prev.dietaryNotes,
      specialNeeds: guestRSVP?.specialNeeds || prev.specialNeeds,
      notes: guestRSVP?.notes || prev.notes,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifiedGuest, guestRSVP, guestAssignedEvents]);

  const handleRSVPChange = (field: keyof typeof rsvpForm, value: any) => {
    setRsvpForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRSVPSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rsvpForm.fullName.trim() || !rsvpForm.email.trim() || !identifiedGuest) return;

    const email = normalizeEmail(rsvpForm.email, { required: true });
    const phone = normalizeUsPhone(rsvpForm.phone);
    if (!email.ok) {
      showToast(email.error || 'Please enter a valid email address.', 'warning');
      return;
    }
    if (!phone.ok) {
      showToast(phone.error || 'Enter a 10-digit US phone number.', 'warning');
      return;
    }

    // A checked "plus one" needs a name so the couple can plan for them.
    if (rsvpForm.plusOne && !rsvpForm.plusOneName.trim()) {
      showToast('Please enter your plus one\'s name.', 'warning');
      return;
    }

    setIsSubmittingRSVP(true);

    const eventName = activeEventName || config?.eventTitle || '';
    // For a couple-scoped portal, scope the submission by the couple event id so it
    // round-trips with getCoupleRsvpSubmissions (which keys on coupleEventId).
    const eventKey = isCouplePortal && coupleEventId ? coupleEventId : normalizeEventKey(eventName);

    const newSubmission: RSVPSubmission = {
      id: guestRSVP?.id || `rsvp-${Date.now()}`,
      guestId: identifiedGuest.id,
      eventName: isCouplePortal && coupleEventId ? coupleEventId : eventName,
      eventKey,
      fullName: rsvpForm.fullName.trim(),
      email: email.value,
      phone: phone.display,
      attending: rsvpForm.attending === 'yes',
      attendingDays: rsvpForm.attending === 'yes' ? rsvpForm.attendingDays : [],
      attendingEvents: rsvpForm.attending === 'yes' ? rsvpForm.attendingEvents : [],
      mealChoice: rsvpForm.attending === 'yes' ? rsvpForm.mealChoice : undefined,
      plusOneName:
        rsvpForm.plusOne && rsvpForm.attending === 'yes'
          ? rsvpForm.plusOneName.trim()
          : undefined,
      plusOneMealChoice:
        rsvpForm.plusOne && rsvpForm.attending === 'yes'
          ? rsvpForm.plusOneMealChoice
          : undefined,
      dietaryNotes: rsvpForm.dietaryNotes.trim() || undefined,
      specialNeeds: rsvpForm.specialNeeds.trim() || undefined,
      notes: rsvpForm.notes.trim() || undefined,
      submittedAt: new Date().toISOString(),
      // Carry the guest's opaque portal token so the server-side backend can
      // verify and persist the submission (when the platform is enabled).
      token: identifiedGuest.token,
    };

    const updatedSubmissions = guestRSVP
      ? portalData.submissions.map((s) => (s.id === guestRSVP.id ? newSubmission : s))
      : [newSubmission, ...portalData.submissions];

    // Keep the UI in sync locally for responsiveness, and persist through the
    // backend (local or Supabase RPC) depending on the active provider.
    setPortalData((prev) => ({ ...prev, submissions: updatedSubmissions }));
    if (isCouplePortal && coupleEventId) {
      setCoupleRsvpSubmissions(coupleEventId, updatedSubmissions);
    } else {
      setPortalRSVPSubmissions(updatedSubmissions);
    }
    // F-269-1 (Review #269): the RSVP is saved on this device (local-first),
    // but the cloud submit can still fail (RPC error resolves false; a network
    // failure rejects). The old handler ignored both — the guest saw the
    // success screen while the couple's other devices never received the RSVP.
    const warnRsvpSyncFailed = () => {
      emit('spm_cloud_sync_error', {
        domain: 'guest rsvp',
        error: 'Saved on this device, but the RSVP could not reach the couple — check your connection and submit again.',
        timestamp: new Date().toISOString(),
      });
    };
    void getGuestPortalBackend()
      .submitRSVP({ eventName, coupleEventId: isCouplePortal ? coupleEventId : undefined, venueSlug }, newSubmission)
      .then((ok) => {
        setIsSubmittingRSVP(false);
        if (!ok) warnRsvpSyncFailed();
      })
      .catch(() => {
        setIsSubmittingRSVP(false);
        warnRsvpSyncFailed();
      });

    setRsvpSuccess(newSubmission);
  };

  const handleAddToCalendar = (item: {
    id: string;
    title: string;
    description?: string;
    location?: string;
    startTime: string;
    endTime?: string;
  }) => {
    const dtStart = new Date(item.startTime);
    if (Number.isNaN(dtStart.getTime())) return; // guard invalid date

    const dtEnd = item.endTime
      ? new Date(item.endTime)
      : new Date(dtStart.getTime() + 60 * 60 * 1000);

    const formatICSDate = (d: Date) => {
      if (Number.isNaN(d.getTime())) return '';
      return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    };

    const escapeICS = (value: string) =>
      value
        .replace(/\\/g, '\\')
        .replace(/\r?\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION=2.0',
      'PRODID:-//Wedding Layout Planner//Guest Portal//EN',
      'BEGIN:VEVENT',
      `UID:${item.id}@wedding-layout-planner`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${formatICSDate(dtStart)}`,
      `DTEND:${formatICSDate(dtEnd)}`,
      `SUMMARY:${escapeICS(item.title)}`,
      item.location ? `LOCATION:${escapeICS(item.location)}` : '',
      item.description ? `DESCRIPTION:${escapeICS(item.description)}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title.replace(/\s+/g, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGetDirections = () => {
    const publishDirections = (steps: string[]) => setWayfindingResult({
      contextKey: wayfindingContextKey,
      steps,
    });
    const sourceMap = activeVenueMap;
    if (!sourceMap) {
      publishDirections(['No venue-authored walking routes are published yet. Please ask venue staff for directions.']);
      return;
    }
    const scopedMap = projectVenueMap(
      sourceMap,
      'guest',
      isCouplePortal ? (couple?.selectedSpaces || []) : [],
      {
        managedBaseImageOnly: isCoupleCloudEnabled(),
        venues: isCoupleCloudEnabled() ? undefined : portalData.venues,
      },
    );
    const destinations = scopedMap.points.filter((point) => point.kind !== 'path');
    const defaultStart = preferredVenueMapDirectionsStart(destinations, {
      map: scopedMap,
      destinationPointId: selectedWayfindingTo,
      stepFreeOnly,
    });
    const fromId = destinations.some((point) => point.id === selectedWayfindingFrom)
      ? selectedWayfindingFrom
      : defaultStart?.id || '';
    const from = destinations.find((point) => point.id === fromId);
    const to = destinations.find((point) => point.id === selectedWayfindingTo);

    if (!to) {
      publishDirections(['Please select a destination.']);
      return;
    }
    if (!from) {
      publishDirections(['Please select a starting location.']);
      return;
    }
    if (from.id === to.id) {
      publishDirections([`You're already at ${to.label}.`]);
      return;
    }

    const path = findVenueMapRoute(scopedMap, from.id, to.id, { stepFreeOnly });
    if (!path) {
      const emergencyOnlyPath = findVenueMapRoute(scopedMap, from.id, to.id, {
        stepFreeOnly,
        includeEmergencyOnly: true,
      });
      publishDirections(emergencyOnlyPath?.priority === 'emergency-only'
        ? [
            `Only an emergency-only path is published from ${from.label} to ${to.label}; it is not used for routine directions.`,
            'Please use on-site signs or ask venue staff for safe directions.',
          ]
        : [
            stepFreeOnly
              ? `No verified step-free route is published from ${from.label} to ${to.label}.`
              : `No venue-authored walking route is published from ${from.label} to ${to.label}.`,
            'Please use on-site signs or ask venue staff for safe directions.',
          ]);
      return;
    }

    publishDirections(buildVenueMapDirectionSteps(scopedMap, path));
  };

  const lodgingVenues = useMemo(
    () => portalData.venues.filter((v) => v.category === 'lodging'),
    [portalData.venues],
  );

  const guestRoomInfo = useMemo(() => {
    if (!identifiedGuest || !identifiedGuest.roomId) return null;

    const roomId = identifiedGuest.roomId;
    let foundVenue: Venue | null = null;
    let foundFloor: LodgingFloor | null = null;
    let foundRoom: LodgingRoom | null = null;

    for (const v of lodgingVenues) {
      if (!v.floors) continue;

      for (const f of v.floors) {
        const r = f.rooms.find((room) => room.id === roomId);
        if (r) {
          foundVenue = v;
          foundFloor = f;
          foundRoom = r;
          break;
        }
      }

      if (foundRoom) break;
    }

    if (!foundVenue || !foundFloor || !foundRoom) return null;
    return { venue: foundVenue, floor: foundFloor, room: foundRoom };
  }, [identifiedGuest, lodgingVenues]);

  const renderHomeTab = () => {
    return (
      <div className="space-y-4 pb-24">
        {config?.heroImageUrl && (
          <div className="relative w-full h-48 rounded-xl overflow-hidden shadow">
            <SafeImage
              src={config.heroImageUrl}
              alt={config.eventTitle || 'Event hero image'}
              className="w-full h-full object-cover"
              fallback={
                <div className="w-full h-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500 text-sm">
                  Hero image unavailable
                </div>
              }
            />
            <div className="absolute inset-0 bg-black/40 flex items-end">
              <div className="p-4 text-white">
                <h1 className="text-xl font-semibold">
                  {config.eventTitle || 'Wedding Celebration'}
                </h1>
                {eventStartDate && (
                  <p className="text-sm opacity-90">
                    {safeDate(config?.eventStartDate)}
                    {eventEndDate && ` – ${safeDate(config?.eventEndDate)}`}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow p-4 space-y-2">
          {identifiedGuest && (
            <p className="text-sm text-gray-700">
              Welcome, <span className="font-semibold">{identifiedGuest.name}</span>!
            </p>
          )}

          {config?.welcomeMessage && (
            <div className="prose prose-sm max-w-none text-gray-800">
              {config.welcomeMessage.split('\n').map((line, idx) => (
                <p key={idx}>{line}</p>
              ))}
            </div>
          )}

          {daysUntilEvent !== null && (
            <p className="text-sm text-[var(--accent)] font-medium">
              {daysUntilEvent === 0
                ? 'Today is the big day!'
                : daysUntilEvent > 0
                  ? `${daysUntilEvent} day${daysUntilEvent === 1 ? '' : 's'} until the celebration`
                  : 'The celebration has passed — thank you for joining!'}
            </p>
          )}
        </div>

        {isMultiDay && eventStartDate && eventEndDate && (
          <div className="bg-white rounded-xl shadow p-4">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">Event Days</h2>
            <p className="text-sm text-gray-700">
              {safeDate(config?.eventStartDate)} – {safeDate(config?.eventEndDate)}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {config?.showMap && canViewTab(guestCanViewMap) && (
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              aria-current={activeTab === 'map' ? 'page' : undefined}
              className="bg-white rounded-xl shadow p-3 flex flex-col items-start justify-between min-h-[80px]"
            >
              <span className="text-2xl mb-1">🗺️</span>
              <span className="text-sm font-medium text-gray-800">View Map</span>
            </button>
          )}

          {config?.showRSVP && canViewTab(guestCanSubmitRSVP) && (
            <button
              type="button"
              onClick={() => setActiveTab('rsvp')}
              aria-current={activeTab === 'rsvp' ? 'page' : undefined}
              className="bg-white rounded-xl shadow p-3 flex flex-col items-start justify-between min-h-[80px]"
            >
              <span className="text-2xl mb-1">📝</span>
              <span className="text-sm font-medium text-gray-800">RSVP Now</span>
            </button>
          )}

          {config?.showSchedule && canViewTab(guestCanViewSchedule) && (
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              aria-current={activeTab === 'schedule' ? 'page' : undefined}
              className="bg-white rounded-xl shadow p-3 flex flex-col items-start justify-between min-h-[80px]"
            >
              <span className="text-2xl mb-1">📅</span>
              <span className="text-sm font-medium text-gray-800">View Schedule</span>
            </button>
          )}

          {config?.showWayfinding && (
            <button
              type="button"
              onClick={() => setActiveTab('wayfinding')}
              aria-current={activeTab === 'wayfinding' ? 'page' : undefined}
              className="bg-white rounded-xl shadow p-3 flex flex-col items-start justify-between min-h-[80px]"
            >
              <span className="text-2xl mb-1">🧭</span>
              <span className="text-sm font-medium text-gray-800">Getting Around</span>
            </button>
          )}
        </div>

        {identifiedGuest && (identifiedGuest.tableId || identifiedGuest.roomId) && (
          <div className="bg-white rounded-xl shadow p-4 space-y-2">
            <h2 className="text-sm font-semibold text-gray-800">Your Details</h2>
            {identifiedGuest.tableId && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">Table:</span> {identifiedGuest.tableId}
              </p>
            )}
            {identifiedGuest.roomId && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">Room:</span> {guestRoomInfo?.room.name || identifiedGuest.roomId}
              </p>
            )}
          </div>
        )}

        {/* Venue rules & regulations (also shown on home for prominence) */}
        {activeVenueRules.rules.length > 0 && (
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-sm font-semibold text-gray-800 mb-2">📜 Venue Rules &amp; Regulations</p>
            <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
              {activeVenueRules.rules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Contact the venue */}
        {(() => {
          const vc = venueConfig;
          const phone = vc.phone || (vc as any).contactPhoneNumber;
          const email = vc.supportEmail;
          const location = vc.location;
          if (!phone && !email && !location) return null;
          return (
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-sm font-semibold text-gray-800 mb-2">📞 Contact the Venue</p>
              <div className="space-y-1 text-sm text-gray-700">
                {location && <p>📍 {location}</p>}
                {phone && (
                  <p>
                    <a href={`tel:${phone}`} className="text-[var(--accent)] hover:underline">📞 {phone}</a>
                  </p>
                )}
                {email && (
                  <p>
                    <a href={`mailto:${email}`} className="text-[var(--accent)] hover:underline">✉️ {email}</a>
                  </p>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  const renderVenueMapTab = () => {
    if (!config?.showMap) {
      return (
        <div className="pb-24">
          <div className="bg-white rounded-xl shadow p-4 mt-4">
            <p className="text-sm text-gray-700">Venue map is not available.</p>
          </div>
        </div>
      );
    }

    const enabledCategories = config.enabledVenueCategories || [];
    // In a couple portal, scope the map to the couple's selected spaces (+ their
    // rain-contingency backups), not every venue in the catalog.
    const coupleSelected = couple?.selectedSpaces || [];
    const collisionSafeRainPlans = activeVenueMap
      ? partitionVenueMapRainContingencyCollisions(activeVenueMap).map.rainContingencies
        .filter((contingency) => contingency.outdoorVenueId !== contingency.indoorVenueId)
      : [];
    const backupIds = collisionSafeRainPlans
      .filter((contingency) =>
        coupleSelected.includes(contingency.outdoorVenueId)
          && (
            isCoupleCloudEnabled()
            || rainContingencyValidationIssue(contingency, portalData.venues) === null
          ),
      )
      .map((contingency) => contingency.indoorVenueId);
    const scopedIds = new Set([...coupleSelected, ...backupIds]);
    const venuesToShow = portalData.venues.filter((v) =>
      isCouplePortal && scopedIds.size > 0
        ? scopedIds.has(v.id)
        : enabledCategories.length
          ? enabledCategories.includes(v.category)
          : true,
    );

    return (
      <div className="space-y-4 pb-24">
        {/* Full venue map (venue-controlled wayfinding) */}
        {(() => {
          const sourceMap = activeVenueMap;
          if (!sourceMap) return null;
          const guestMap = projectVenueMap(
            sourceMap,
            'guest',
            isCouplePortal ? coupleSelected : [],
            {
              managedBaseImageOnly: isCoupleCloudEnabled(),
              venues: isCoupleCloudEnabled() ? undefined : portalData.venues,
            },
          );
          const hasDrawableMap = hasRenderableVenueMapContent(guestMap);
          const hasRainGuidance = guestMap.rainContingencies.length > 0;
          if (!hasDrawableMap && !hasRainGuidance) return null;
          return (
            <div className="bg-white rounded-xl shadow p-4 mt-2">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">
                {hasDrawableMap ? 'Venue Map' : 'Rain Plan'}
              </h2>
              {hasDrawableMap && (
                <VenueMapCanvas
                  map={guestMap}
                  onPointClick={openInMaps}
                  isPointInteractive={hasValidMapGps}
                  pointActionLabel={() => 'Open in maps.'}
                  hideMapWhenBackgroundUnavailable
                  onRetryBackgroundImage={() => setVenueMapRetryNonce((nonce) => nonce + 1)}
                />
              )}
              <VenueMapRainPlanGuidance
                rainContingencies={guestMap.rainContingencies}
                venues={portalData.venues}
              />
              {hasDrawableMap && (
                <div className="mt-1 text-[10px] text-gray-400 px-1">
                  {guestMap.points.some(hasValidMapGps)
                    ? 'Tap a pin that has GPS to open it in Google Maps.'
                    : 'Venue-authored property map. GPS-enabled locations have not been added yet.'}
                </div>
              )}
            </div>
          );
        })()}
        {venuesToShow.map((venue) => (
          <div key={venue.id} className="bg-white rounded-xl shadow p-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">{venue.name}</h2>
              <span className="text-xs px-2 py-1 rounded-full bg-[var(--accent-light)] text-[var(--accent)] capitalize">
                {venue.category}
              </span>
            </div>

            {/* Venue info card — shows whatever metadata is available */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2 text-xs text-gray-700">
              {venue.description && (
                <p className="text-sm text-gray-600 leading-relaxed">{venue.description}</p>
              )}
              <div className="flex flex-wrap gap-3">
                {venue.capacity > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-gray-400">👥</span>
                    Capacity: <strong>{venue.capacity}</strong>
                  </span>
                )}
                {venue.width > 0 && venue.height > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-gray-400">📐</span>
                    {venue.width} × {venue.height} ft
                  </span>
                )}
              </div>

              {/* Show assigned table/room info for this guest if available */}
              {identifiedGuest?.tableId && (
                <div className="mt-2 flex items-center gap-2 bg-pink-50 border border-pink-200 rounded-lg px-3 py-2">
                  <span className="text-pink-500 text-base">📍</span>
                  <span className="text-pink-700 font-medium text-xs">
                    Your seat is at Table {identifiedGuest.tableId}
                  </span>
                </div>
              )}
              {identifiedGuest?.roomId && venue.category === 'lodging' && (
                <div className="mt-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <span className="text-blue-500 text-base">🛏️</span>
                  <span className="text-blue-700 font-medium text-xs">
                    Your room: {identifiedGuest.roomId}
                  </span>
                </div>
              )}

              {/* Images if available */}
              {venue.imageUrl && (
                <SafeImage
                  src={venue.imageUrl}
                  alt={venue.name}
                  className="w-full rounded-lg object-cover max-h-48 mt-2"
                  fallback={
                    <div className="w-full h-24 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center mt-2 text-xs text-gray-500">
                      Venue image unavailable
                    </div>
                  }
                />
              )}

              {!venue.imageUrl && (
                <div className="w-full h-24 rounded-lg bg-gradient-to-br from-[var(--accent-light)] to-purple-50 flex items-center justify-center mt-2">
                  <span className="text-3xl opacity-40">🏛️</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {venuesToShow.length === 0 && (
          <div className="bg-white rounded-xl shadow p-4 mt-4 text-center space-y-2">
            <p className="text-2xl">🗺️</p>
            <p className="text-sm font-medium text-gray-700">Venue map coming soon</p>
            <p className="text-xs text-gray-500">
              The venue coordinator will publish location details here.
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderScheduleTab = () => {
    if (!config?.showSchedule) {
      return (
        <div className="pb-24">
          <div className="bg-white rounded-xl shadow p-4 mt-4">
            <p className="text-sm text-gray-700">Schedule is not available.</p>
          </div>
        </div>
      );
    }

    // B-09 fix: read schedule items from config instead of a hardcoded empty array.
    const scheduleItems: PortalScheduleItem[] = config.scheduleItems ?? [];

    // In a per-couple portal, show the guest's assigned events as their personal
    // itinerary at the top (even before the venue's general schedule).
    const personalEvents = isCouplePortal ? guestAssignedEvents : [];

    if (!scheduleItems.length && personalEvents.length === 0) {
      return (
        <div className="pb-24">
          <div className="bg-white rounded-xl shadow p-4 mt-4 text-center space-y-2">
            <p className="text-2xl">📅</p>
            <p className="text-sm font-medium text-gray-700">Schedule coming soon</p>
            <p className="text-xs text-gray-500">
              The venue coordinator will publish the event timeline here. Check back closer to the event date!
            </p>
          </div>
        </div>
      );
    }

    const days = isMultiDay
      ? Array.from(new Set(scheduleItems.map((i) => i.dayIndex || 0))).sort(
          (a, b) => a - b,
        )
      : [0];

    // If the current selection isn't a real day (e.g. the schedule starts on a
    // later day), fall back to the first available day so the list isn't empty.
    const effectiveDay = days.includes(selectedDayIndex) ? selectedDayIndex : (days[0] ?? 0);

    const itemsForDay = (dayIdx: number) =>
      scheduleItems
        .filter((i) => (isMultiDay ? (i.dayIndex || 0) === dayIdx : true))
        .sort(
          (a, b) =>
            new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
        );

    return (
      <div className="space-y-4 pb-24">
        {personalEvents.length > 0 && (
          <div className="rounded-xl bg-white shadow p-4 mt-2">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">Your invited events</h2>
            <div className="space-y-2">
              {personalEvents.map((e) => {
                const st = e.startTime;
                return (
                <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800">{e.title}</div>
                    <div className="text-xs text-gray-500">
                      {e.dayIndex != null ? `Day ${e.dayIndex + 1}` : ''}
                      {st ? ` · ${safeTime(st)}` : ''}
                      {e.location ? ` · ${e.location}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {st && (
                      <button
                        type="button"
                        onClick={() => handleAddToCalendar({
                          id: e.id,
                          title: e.title,
                          location: e.location,
                          startTime: st,
                        })}
                        className="text-[11px] px-2 py-1 rounded-lg bg-[var(--accent-light)] text-[var(--accent)]"
                        title="Add to my calendar"
                      >
                        📅 Add to calendar
                      </button>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
                      {rsvpForm.attendingEvents?.includes(e.id) ? 'Attending' : 'Invited'}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}
        {isMultiDay && (
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {days.map((d, idx) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDayIndex(d)}
                className={`px-3 py-1.5 text-xs rounded-full border ${
                  effectiveDay === d
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                <span className="block font-medium">Day {idx + 1}</span>
                {(() => {
                  const date = eventDates(config.eventStartDate, config.eventEndDate)[d];
                  return date ? (
                    <span className={`block ${effectiveDay === d ? 'text-[var(--accent-light)]' : 'text-gray-400'}`}>
                      {new Date(date + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  ) : null;
                })()}
              </button>
            ))}
          </div>
        )}

        {/* Weather for the selected day */}
        {(() => {
          const dates = eventDates(config.eventStartDate, config.eventEndDate);
          const dayDate = dates[effectiveDay];
          const forecast = dayDate ? activeVenueWeather.forecasts[dayDate] : undefined;
          if (!forecast) return null;
          return (
            <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 flex items-center gap-3">
              <span className="text-2xl">{forecast.condition.includes('Rain') || (forecast.rainChance ?? 0) >= 50 ? '🌧️' : forecast.condition.includes('Cloud') ? '☁️' : '☀️'}</span>
              <div className="text-sm">
                <div className="font-medium text-sky-800">{forecast.condition}</div>
                <div className="text-xs text-sky-700">
                  {forecast.tempLow != null && `${forecast.tempLow}°`} {forecast.tempHigh != null && `– ${forecast.tempHigh}°`}
                  {forecast.rainChance != null && ` · ☔ ${forecast.rainChance}% rain`}
                </div>
              </div>
            </div>
          );
        })()}

        <div className="space-y-3 mt-2">
          {itemsForDay(effectiveDay).map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow p-4 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">
                    {safeTime(item.startTime)}
                    {item.endTime &&
                      ` – ${safeTime(item.endTime)}`}
                  </p>
                  <p
                    className={`text-sm ${
                      item.isHighlight
                        ? 'font-semibold text-[var(--accent)]'
                        : 'font-medium text-gray-800'
                    }`}
                  >
                    {item.title}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleAddToCalendar(item)}
                  className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent-light)] text-[var(--accent)]"
                >
                  Add to Calendar
                </button>
              </div>

              {item.location && (
                <p className="text-xs text-gray-600">Location: {item.location}</p>
              )}
              {item.description && (
                <p className="text-xs text-gray-600">{item.description}</p>
              )}
            </div>
          ))}

          {itemsForDay(effectiveDay).length === 0 && (
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-sm text-gray-700">No schedule items for this day yet.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderWayfindingTab = () => {
    if (!config?.showWayfinding) {
      return (
        <div className="pb-24">
          <div className="bg-white rounded-xl shadow p-4 mt-4">
            <p className="text-sm text-gray-700">Wayfinding is not available.</p>
          </div>
        </div>
      );
    }

    // Wayfinding is venue-controlled: use the venue's full property map, scoped to the
    // couple's selected spaces (+ parking/entry + applicable rain-contingency backups).
    const sourceMap = activeVenueMap;
    const coupleSelected = couple?.selectedSpaces || [];
    const venueMap = sourceMap
      ? projectVenueMap(
          sourceMap,
          'guest',
          isCouplePortal ? coupleSelected : [],
          {
            managedBaseImageOnly: isCoupleCloudEnabled(),
            venues: isCoupleCloudEnabled() ? undefined : portalData.venues,
          },
        )
      : null;
    const wayfindingPoints: VenueMapPoint[] = (venueMap?.points || []).filter(
      (point) => point.kind !== 'path',
    );
    // Only treat wayfinding as available when there's at least one destination
    // point to route to (the venue may have drawn only decorative path dots).
    const hasWayfindingPoints = wayfindingPoints.length > 0;
    const effectiveToId = wayfindingPoints.some((point) => point.id === selectedWayfindingTo)
      ? selectedWayfindingTo
      : '';
    const defaultStartId = preferredVenueMapDirectionsStart(wayfindingPoints, {
      map: venueMap || undefined,
      destinationPointId: effectiveToId,
      stepFreeOnly,
    })?.id || '';
    const effectiveFromId = wayfindingPoints.some((point) => point.id === selectedWayfindingFrom)
      ? selectedWayfindingFrom
      : defaultStartId;
    const hasDrawableWayfindingMap = hasRenderableVenueMapContent(venueMap);
    const hasWayfindingRainGuidance = (venueMap?.rainContingencies.length || 0) > 0;

    if (!hasWayfindingPoints) {
      return (
        <div className="space-y-4 pb-24">
          {(hasDrawableWayfindingMap || hasWayfindingRainGuidance) && (
            <div className="bg-white rounded-xl shadow p-4 mt-4">
              <h2 className="mb-3 text-sm font-semibold text-gray-800">
                {hasDrawableWayfindingMap ? 'Venue Map' : 'Rain Plan'}
              </h2>
              {hasDrawableWayfindingMap && (
                <VenueMapCanvas
                  map={venueMap!}
                  onPointClick={openInMaps}
                  isPointInteractive={hasValidMapGps}
                  pointActionLabel={() => 'Open in maps.'}
                  hideMapWhenBackgroundUnavailable
                  onRetryBackgroundImage={() => setVenueMapRetryNonce((nonce) => nonce + 1)}
                />
              )}
              <VenueMapRainPlanGuidance
                rainContingencies={venueMap!.rainContingencies}
                venues={portalData.venues}
              />
            </div>
          )}
          <div className="bg-white rounded-xl shadow p-4 mt-4 text-center space-y-2">
            <p className="text-2xl">🧭</p>
            <p className="text-sm font-medium text-gray-700">Directions coming soon</p>
            <p className="text-xs text-gray-500">
              {hasDrawableWayfindingMap || hasWayfindingRainGuidance
                ? 'Turn-by-turn directions will be available after the venue adds routable map locations.'
                : 'Venue maps and turn-by-turn directions will be available here. Contact the venue for early access.'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4 pb-24">
        <div className="bg-white rounded-xl shadow p-4 mt-4">
          <VenueMapCanvas
            map={venueMap!}
            onPointClick={openInMaps}
            isPointInteractive={hasValidMapGps}
            pointActionLabel={() => 'Open in maps.'}
            hideMapWhenBackgroundUnavailable
            onRetryBackgroundImage={() => setVenueMapRetryNonce((nonce) => nonce + 1)}
          />
          <VenueMapRainPlanGuidance
            rainContingencies={venueMap!.rainContingencies}
            venues={portalData.venues}
          />
          <div className="mt-1 text-[10px] text-gray-400 px-1">
            Tip: tap a GPS pin, or use the Map location actions list below, to open it in Google Maps.
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-700">From</label>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={effectiveFromId}
                onChange={(e) => { setSelectedWayfindingFrom(e.target.value); setWayfindingResult(null); }}
                aria-label="Directions starting location"
              >
                <option value="">Select starting location</option>
                {wayfindingPoints.map((point) => (
                  <option key={point.id} value={point.id}>{point.label}{point.kind === 'entry' ? ` — ${arrivalRoleLabel(point.arrivalRole)}` : ''}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-700">To</label>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={effectiveToId}
                onChange={(e) => { setSelectedWayfindingTo(e.target.value); setWayfindingResult(null); }}
                aria-label="Directions destination"
              >
                <option value="">Select destination</option>
                {wayfindingPoints.map((point) => (
                  <option key={point.id} value={point.id}>{point.label}{point.kind === 'entry' ? ` — ${arrivalRoleLabel(point.arrivalRole)}` : ''}</option>
                ))}
              </select>
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={stepFreeOnly}
                onChange={(event) => { setStepFreeOnly(event.target.checked); setWayfindingResult(null); }}
                className="mt-0.5"
              />
              <span>
                <span className="block font-semibold">Use verified step-free routes only</span>
                <span className="text-gray-500">Routes without venue-confirmed mobility details will be excluded.</span>
              </span>
            </label>

            <button
              type="button"
              onClick={handleGetDirections}
              disabled={!effectiveFromId || !effectiveToId}
              className="w-full mt-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              Get Directions
            </button>
          </div>

          {currentWayfindingSteps && (
            <div
              className="mt-4 bg-[var(--accent-light)] rounded-lg p-3 space-y-1"
              role="status"
              aria-live="polite"
            >
              <p className="text-xs font-semibold text-[var(--accent-dark)]">Directions</p>
              <ul className="text-xs text-[var(--accent-dark)] list-disc list-inside space-y-1">
                {currentWayfindingSteps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Venue rules & regulations */}
          {activeVenueRules.rules.length > 0 && (
            <div className="bg-white rounded-xl shadow p-4 mt-4">
              <p className="text-xs font-semibold text-gray-800 mb-2">📜 Venue Rules &amp; Regulations</p>
              <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                {activeVenueRules.rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderRSVPTab = () => {
    if (!config?.showRSVP) {
      return (
        <div className="pb-24">
          <div className="bg-white rounded-xl shadow p-4 mt-4">
            <p className="text-sm text-gray-700">RSVP is not available.</p>
          </div>
        </div>
      );
    }

    // Preview mode: RSVP requires a real guest to sign in; show a friendly notice
    // instead of a form that can't submit.
    if (isPreview && !identifiedGuest) {
      return (
        <div className="pb-24">
          <div className="bg-white rounded-xl shadow p-4 mt-4 text-center space-y-2">
            <p className="text-2xl">📝</p>
            <p className="text-sm font-medium text-gray-700">RSVP is for invited guests</p>
            <p className="text-xs text-gray-500">
              You're previewing the portal as a visitor. Guests RSVP after opening their
              personal invite link or signing in.
            </p>
          </div>
        </div>
      );
    }

    if (rsvpClosed && !guestRSVP) {
      return (
        <div className="pb-24">
          <div className="bg-white rounded-xl shadow p-4 mt-4 space-y-2">
            <p className="text-sm font-semibold text-gray-800">RSVP period has closed.</p>
            {rsvpDeadline && (
              <p className="text-sm text-gray-700">
                The RSVP deadline was{' '}
                {(() => {
                  const raw = (config as any)?.rsvpDeadlineDate as string | undefined;
                  // Format the deadline as the intended local day (a date-only value
                  // is the whole local day, not UTC midnight).
                  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                    return new Date(raw + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
                  }
                  return safeDate(raw);
                })()}.
              </p>
            )}
          </div>
        </div>
      );
    }

    if (rsvpSuccess) {
      return (
        <div className="pb-24">
          <div className="bg-white rounded-xl shadow p-4 mt-4 space-y-3 relative overflow-hidden">
            <div className="absolute -top-4 -left-4 w-16 h-16 bg-pink-200 rounded-full opacity-60" />
            <div className="absolute -bottom-6 -right-6 w-20 h-20 bg-[var(--accent-light)] rounded-full opacity-60" />

            <div className="relative space-y-2">
              <p className="text-sm font-semibold text-gray-800">
                Thank you for your RSVP!
              </p>
              <p className="text-sm text-gray-700">
                We&apos;ve recorded your response for{' '}
                <span className="font-medium">{rsvpSuccess.fullName}</span>.
              </p>

              <div className="text-xs text-gray-700 space-y-1">
                <p>
                  <span className="font-semibold">Attending:</span>{' '}
                  {rsvpSuccess.attending ? 'Yes' : 'No'}
                </p>

                {rsvpSuccess.attending && rsvpSuccess.mealChoice && (
                  <p>
                    <span className="font-semibold">Meal:</span>{' '}
                    {mealOptions.find((o) => o.value === rsvpSuccess.mealChoice)?.label ||
                      rsvpSuccess.mealChoice}
                  </p>
                )}

                {rsvpSuccess.plusOneName && (
                  <p>
                    <span className="font-semibold">Plus One:</span>{' '}
                    {rsvpSuccess.plusOneName}
                    {rsvpSuccess.plusOneMealChoice && (
                      <span className="text-gray-500">
                        {' '}
                        ({mealOptions.find((o) => o.value === rsvpSuccess.plusOneMealChoice)?.label ||
                          rsvpSuccess.plusOneMealChoice})
                      </span>
                    )}
                  </p>
                )}

                {rsvpSuccess.dietaryNotes && (
                  <p>
                    <span className="font-semibold">Dietary Notes:</span>{' '}
                    {rsvpSuccess.dietaryNotes}
                  </p>
                )}

                {rsvpSuccess.attendingDays && rsvpSuccess.attendingDays.length > 0 && (
                  <p>
                    <span className="font-semibold">Attending Days:</span>{' '}
                    {rsvpSuccess.attendingDays.join(', ')}
                  </p>
                )}

                {rsvpSuccess.specialNeeds && (
                  <p>
                    <span className="font-semibold">Accommodations:</span>{' '}
                    {rsvpSuccess.specialNeeds}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setRsvpSuccess(null)}
                className="mt-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium"
              >
                Edit RSVP
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="pb-24">
        <form
          onSubmit={handleRSVPSubmit}
          className="bg-white rounded-xl shadow p-4 mt-4 space-y-4"
        >
          {config?.rsvpMessage && (
            <div className="text-sm text-gray-700">
              {config.rsvpMessage.split('\n').map((line, idx) => (
                <p key={idx}>{line}</p>
              ))}
            </div>
          )}

          <div className="space-y-2">
	    <label
  					htmlFor="guest-rsvp-full-name"
  					className="text-xs font-medium text-gray-700"
	    >
  					Full Name<span className="text-red-500">*</span>
	          </label>
	    <input
  					id="guest-rsvp-full-name"
  					type="text"
  					className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
  					value={rsvpForm.fullName}
  					onChange={(e) => handleRSVPChange('fullName', e.target.value)}
  					required
	           />
          </div>

          <div className="space-y-2">
	    <label
  					htmlFor="guest-rsvp-email"
  					className="text-xs font-medium text-gray-700"
	    >
  					Email<span className="text-red-500">*</span>
	    </label>
	          <input
  					id="guest-rsvp-email"
  					type="email"
  					className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
  					value={rsvpForm.email}
  					onChange={(e) => handleRSVPChange('email', e.target.value)}
  					required
	          />
          </div>

          <div className="space-y-2">
	    <label
  					htmlFor="guest-rsvp-phone"
  					className="text-xs font-medium text-gray-700"
	    >
  					Phone
	          </label>
	          <input
  					id="guest-rsvp-phone"
  					type="tel"
  					className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
  					value={rsvpForm.phone}
  					onChange={(e) => handleRSVPChange('phone', e.target.value)}
	    />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700">
              Will you be attending?
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleRSVPChange('attending', 'yes')}
                aria-pressed={rsvpForm.attending === 'yes'}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${
                  rsvpForm.attending === 'yes'
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-white text-gray-800 border-gray-300'
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => handleRSVPChange('attending', 'no')}
                aria-pressed={rsvpForm.attending === 'no'}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${
                  rsvpForm.attending === 'no'
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-white text-gray-800 border-gray-300'
                }`}
              >
                No
              </button>
            </div>
          </div>

          {rsvpForm.attending === 'yes' && (
            <>
              {isCouplePortal && guestAssignedEvents.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700">
                    Which events will you attend?
                  </label>
                  <div className="flex flex-col gap-2">
                    {guestAssignedEvents.map((e) => {
                      const checked = rsvpForm.attendingEvents.includes(e.id);
                      return (
                        <label key={e.id} className="inline-flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={checked}
                            onChange={() =>
                              handleRSVPChange(
                                'attendingEvents',
                                checked
                                  ? rsvpForm.attendingEvents.filter((x) => x !== e.id)
                                  : Array.from(new Set([...rsvpForm.attendingEvents, e.id])),
                              )
                            }
                          />
                          <span>
                            {e.title}
                            {e.startTime ? <span className="text-gray-400"> · {safeTime(e.startTime)}</span> : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : isMultiDay ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700">
                    Which days will you attend?
                  </label>
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: eventDayCount }).map((_, idx) => {
                      const dayId = `day${idx + 1}`;
                      return (
                        <label key={dayId} className="inline-flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={rsvpForm.attendingDays.includes(dayId)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              handleRSVPChange(
                                'attendingDays',
                                checked
                                  ? Array.from(new Set([...rsvpForm.attendingDays, dayId]))
                                  : rsvpForm.attendingDays.filter((d) => d !== dayId),
                              );
                            }}
                          />
                          <span>
                            Day {idx + 1}
                            {(() => {
                              const d = eventDates(config.eventStartDate, config.eventEndDate)[idx];
                              return d ? (
                                <span className="text-gray-400"> · {new Date(d + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                              ) : null;
                            })()}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
		<label
  						htmlFor="guest-rsvp-meal-choice"
  						className="text-xs font-medium text-gray-700"
		>
  						Meal choice
		</label>
		<select
  						id="guest-rsvp-meal-choice"
  						className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
  						value={rsvpForm.mealChoice}
  						onChange={(e) => handleRSVPChange('mealChoice', e.target.value)}
		>
                  {mealOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={rsvpForm.plusOne}
                    onChange={(e) => handleRSVPChange('plusOne', e.target.checked)}
                  />
                  Bringing a plus one?
                </label>

                {rsvpForm.plusOne && (
                  <div className="space-y-2 mt-2">
                    <input
                      type="text"
                      placeholder="Plus one full name"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={rsvpForm.plusOneName}
                      onChange={(e) => handleRSVPChange('plusOneName', e.target.value)}
                    />
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      value={rsvpForm.plusOneMealChoice}
                      onChange={(e) =>
                        handleRSVPChange('plusOneMealChoice', e.target.value)
                      }
                    >
                      {mealOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
		<label
  						htmlFor="guest-rsvp-dietary-notes"
  						className="text-xs font-medium text-gray-700"
		>
  						Dietary restrictions or allergies
		</label>
		<textarea
  						id="guest-rsvp-dietary-notes"
  						className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[60px]"
  						value={rsvpForm.dietaryNotes}
  						onChange={(e) => handleRSVPChange('dietaryNotes', e.target.value)}
		/>
              </div>

              <div className="space-y-2">
		<label
  						htmlFor="guest-rsvp-special-needs"
  						className="text-xs font-medium text-gray-700"
		>
  						Accessibility or special needs
		</label>
		<textarea
  						id="guest-rsvp-special-needs"
  						className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[60px]"
  						value={rsvpForm.specialNeeds}
  						onChange={(e) => handleRSVPChange('specialNeeds', e.target.value)}
		/>
              </div>
            </>
          )}

          <div className="space-y-2">
            <label
  					htmlFor="guest-rsvp-notes"
  					className="text-xs font-medium text-gray-700"
	    >
  					Message to the couple
	    </label>
	          <textarea
  					id="guest-rsvp-notes"
  					className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[60px]"
  					value={rsvpForm.notes}
 					 onChange={(e) => handleRSVPChange('notes', e.target.value)}
	           />
          </div>

          <button
            type="submit"
            disabled={isSubmittingRSVP}
            className="w-full mt-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-60"
          >
            {isSubmittingRSVP
              ? 'Submitting...'
              : guestRSVP
                ? 'Update RSVP'
                : 'Submit RSVP'}
          </button>
        </form>
      </div>
    );
  };

  const renderLodgingTab = () => {
    if (!config?.showLodging) {
      return (
        <div className="pb-24">
          <div className="bg-white rounded-xl shadow p-4 mt-4">
            <p className="text-sm text-gray-700">Lodging information is not available.</p>
          </div>
        </div>
      );
    }

    if (!lodgingVenues.length) {
      return (
        <div className="pb-24">
          <div className="bg-white rounded-xl shadow p-4 mt-4">
            <p className="text-sm text-gray-700">Lodging details will be shared soon.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4 pb-24">
        {guestRoomInfo && (
          <div className="bg-white rounded-xl shadow p-4 mt-4 space-y-1">
            <p className="text-sm font-semibold text-gray-800">
              Your Room: {guestRoomInfo.room.name}
            </p>
            <p className="text-xs text-gray-700">
              Venue: {guestRoomInfo.venue.name}
            </p>
            <p className="text-xs text-gray-700">
              Floor: {guestRoomInfo.floor.name}
            </p>
          </div>
        )}

        {lodgingVenues.map((venue) => (
          <div key={venue.id} className="bg-white rounded-xl shadow p-4 mt-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">{venue.name}</h2>
              <span className="text-xs px-2 py-1 rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
                Lodging
              </span>
            </div>

            {venue.floors && venue.floors.length > 0 && (() => {
              // Render each floor as a scaled SVG plan showing room rectangles.
              const maxW = Math.max(...venue.floors!.map((f) => f.width || 1));
              const maxH = Math.max(...venue.floors!.map((f) => f.height || 1));
              return (
                <div className="space-y-3">
                  {venue.floors.map((floor) => (
                    <div key={floor.id} className="rounded-lg border border-gray-200 overflow-hidden">
                      <div className="px-2 py-1 bg-gray-50 text-[11px] font-semibold text-gray-600">{floor.name}</div>
                      <div className="bg-gray-50">
                        <svg viewBox={`0 0 ${floor.width || maxW} ${floor.height || maxH}`} preserveAspectRatio="xMidYMid meet" className="w-full h-40 bg-white">
                          {(floor.rooms || []).map((room) => {
                            const isMine = guestRoomInfo?.room.id === room.id;
                            return (
                              <g key={room.id}>
                                <rect
                                  x={room.x}
                                  y={room.y}
                                  width={room.width}
                                  height={room.height}
                                  rx={1}
                                  fill={isMine ? '#d1fae5' : '#eef2ff'}
                                  stroke={isMine ? '#10b981' : '#c7d2fe'}
                                  strokeWidth={0.4}
                                />
                                <text x={room.x + room.width / 2} y={room.y + room.height / 2} textAnchor="middle" fontSize={Math.min(room.height / 2, 2.5)} fill="#374151">
                                  {isMine ? '★ ' : ''}{room.name}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {(!venue.floors || venue.floors.length === 0) && (
              <div className="relative w-full h-40 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-500">
                <span>Lodging floor plan coming soon.</span>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-800">Rooms</p>
              {(venue.floors && venue.floors.length > 0) ? (
                venue.floors.map((floor) => (
                  <div key={floor.id} className="rounded-lg border border-gray-200 p-2">
                    <p className="text-[11px] font-semibold text-gray-600 mb-1">{floor.name}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {floor.rooms.map((room) => (
                        <div
                          key={room.id}
                          className={`rounded border px-2 py-1.5 text-xs ${
                            guestRoomInfo?.room.id === room.id
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                              : 'border-gray-200 text-gray-700'
                          }`}
                        >
                          <div className="font-medium">{room.name}</div>
                          <div className="text-gray-500">
                            Capacity {room.capacity} · {room.assignedGuests?.length || 0} assigned
                            {guestRoomInfo?.room.id === room.id && <span className="text-emerald-600 font-semibold"> · Your room</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-600">
                  Room list and amenities will appear here based on saved lodging layout.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return renderHomeTab();
      case 'map':
        return renderVenueMapTab();
      case 'schedule':
        return renderScheduleTab();
      case 'wayfinding':
        return renderWayfindingTab();
      case 'rsvp':
        return renderRSVPTab();
      case 'lodging':
        return renderLodgingTab();
      default:
        return null;
    }
  };

  const renderSignInGate = () => {
    // Determine if portal has a known status to surface in the sign-in UI
    const portalUnavailable = config && !isGuestPortalEventActive(config);
    const portalNotConfigured = !config;

    return (
      <div className="min-h-screen bg-gradient-to-b from-[var(--accent-light)] to-slate-100 flex flex-col">
        <header className="px-4 pt-4 pb-2 flex items-center justify-between bg-white/60 backdrop-blur-sm border-b border-[var(--accent-light)]">
          <button
            type="button"
            onClick={handlePortalExit}
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 underline underline-offset-2 transition-colors"
            aria-label="Return to login screen"
          >
            ← Back to Login
          </button>
          <h1 className="text-sm font-semibold text-gray-800">🌸 Guest Portal</h1>
          <div className="w-24" />
        </header>

        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm space-y-4">
            {/* Hero card */}
            <div className="bg-white rounded-2xl shadow-lg p-6 text-center space-y-1">
              <div className="text-4xl mb-2">💍</div>
              <h2 className="text-lg font-bold text-gray-900">
                {config?.eventTitle || 'Wedding Guest Portal'}
              </h2>
              {config?.eventStartDate && (
                <p className="text-xs text-gray-500">
                  {safeDate(config?.eventStartDate)}
                  {config?.eventEndDate &&
                    config.eventEndDate !== config.eventStartDate &&
                    ` – ${safeDate(config?.eventEndDate)}`}
                </p>
              )}
            </div>

            {/* Status banners */}
            {portalNotConfigured && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                <strong>Portal not yet configured.</strong> Please contact the venue coordinator for your event access details.
              </div>
            )}
            {portalUnavailable && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
                <strong>Guest access has closed.</strong> Access is available until the day after the event ends. Contact the venue coordinator if you need assistance.
              </div>
            )}

            {/* Sign-in form */}
            <form
              onSubmit={(e) => { void handleGuestPortalSignIn(e); }}
              className="bg-white rounded-2xl shadow-lg p-6 space-y-4"
              aria-label="Guest portal sign-in"
            >
              <div>
                <p className="text-xs text-gray-500 leading-relaxed mb-4">
                  Enter your event name and the email or name your venue has on file to access RSVP, schedule, lodging, and directions.
                </p>
                <div className="grid grid-cols-2 gap-2 mb-4 text-[11px] text-gray-600">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="font-semibold text-gray-800">📝 RSVP</div>
                    <div>Confirm attendance and meal choices.</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="font-semibold text-gray-800">📅 Schedule</div>
                    <div>See the latest event timing and highlights.</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="font-semibold text-gray-800">🗺️ Map</div>
                    <div>Review locations, wayfinding, and arrival details.</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="font-semibold text-gray-800">🛏️ Lodging</div>
                    <div>Check room assignments when lodging is enabled.</div>
                  </div>
                </div>

                <label
                  htmlFor="guest-portal-event"
                  className="text-sm font-semibold text-gray-800 block mb-1"
                >
                  Event Name or Code
                </label>
                <input
                  id="guest-portal-event"
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                  value={eventInput}
                  onChange={(e) => setEventInput(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  placeholder={config?.eventTitle ? config.eventTitle : 'e.g. Smith-Johnson Wedding'}
                />
              </div>

              <div>
                <label
                  htmlFor="guest-portal-guest-identifier"
                  className="text-sm font-semibold text-gray-800 block mb-1"
                >
                  Guest Email or Name
                </label>
                <input
                  id="guest-portal-guest-identifier"
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                  value={guestIdentifier}
                  onChange={(e) => setGuestIdentifier(e.target.value)}
                  autoComplete="off"
                  placeholder="jane@example.com or Jane Smith"
                />
              </div>

              {requiresPortalPassword && (
                <div>
                  <label
                    htmlFor="guest-portal-password"
                    className="text-sm font-semibold text-gray-800 block mb-1"
                  >
                    Portal Password
                  </label>
                  <input
                    id="guest-portal-password"
                    type="password"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter the event password"
                  />
                </div>
              )}

              {passwordError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                >
                  <span className="text-red-500 text-sm mt-0.5">⚠</span>
                  <p className="text-xs text-red-700">{passwordError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!eventInput.trim() || !guestIdentifier.trim()}
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold shadow hover:bg-[var(--accent-dark)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Access My Portal →
              </button>
            </form>

            <p className="text-center text-xs text-gray-400 pb-4">
              Need help? Contact your venue coordinator.
            </p>
          </div>
        </main>
      </div>
    );
  };

  // Personal-account invites must authenticate before token-backed guest data is
  // hydrated. Older deployments fall back to the historical sign-in gate until
  // migration 0021 and the claim function are available together.
  if (cloudAccountInvite && portalAccountAccess === 'pending' && accountInviteToken) {
    return (
      <PortalInviteAccountSetup
        kind="guest"
        token={accountInviteToken}
        coupleId={coupleEventId}
        venueSlug={venueSlug}
        branding={venueConfig}
        onAuthenticated={handlePortalAccountReady}
        onLegacyInvite={handleLegacyPortalInvite}
        onExit={handlePortalExit}
      />
    );
  }

  if (cloudAccountInvite && portalAccountAccess === 'ready' && !identifiedGuest) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-lg">
          <div className="text-4xl animate-pulse">💌</div>
          <p className="mt-3 text-sm font-semibold text-gray-700">Opening your Guest Portal…</p>
        </div>
      </div>
    );
  }

  // FIX: Show the historical sign-in gate first so legacy guests always have a
  // form to interact with. Preview mode bypasses it for the couple's preview.
  if (needsEventScopedSignIn && !isPreview) {
    return renderSignInGate();
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow p-6 max-w-sm w-full text-center space-y-3">
          <div className="text-3xl">🌸</div>
          <p className="text-base font-semibold text-gray-800">Portal Not Configured</p>
          <p className="text-sm text-gray-600">
            The guest portal has not been set up yet. Please contact the venue coordinator for access details.
          </p>
          <button
            type="button"
            onClick={handlePortalExit}
            className="mt-2 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  if (!isGuestPortalEventActive(config)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow p-6 max-w-sm w-full text-center space-y-3">
          <div className="text-3xl">📅</div>
          <p className="text-base font-semibold text-gray-800">
            Guest Portal Has Closed
          </p>
          <p className="text-sm text-gray-600 text-center">
            Guest access automatically closes the day after the event ends. We hope you had a wonderful time celebrating!
          </p>
          <button
            type="button"
            onClick={handlePortalExit}
            className="mt-2 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const showMapTab = !!config.showMap;
  const showScheduleTab = !!config.showSchedule;
  const showWayfindingTab = !!config.showWayfinding;
  const showRSVPTab = !!config.showRSVP;
  const showLodgingTab =
    !!config.showLodging &&
    lodgingVenues.length > 0 &&
    (isPreview ||
      guestCanAccessLodging(identifiedGuest, guestAccessScope) ||
      // A guest invited to the couple's "Overnight Lodging" guest event gets lodging access.
      (isCouplePortal && identifiedGuest && guestAssignedEvents.some((e) => e.kind === 'lodging')));
  const tabPanelId = `guest-portal-panel-${activeTab}`;
  const desktopTabProps = (tabId: TabId) => ({
    role: 'tab' as const,
    id: `guest-portal-tab-${tabId}`,
    'aria-selected': activeTab === tabId,
    'aria-controls': `guest-portal-panel-${tabId}`,
    type: 'button' as const,
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={accentVars}>
      <header className="sticky top-0 z-10 px-4 pt-3 pb-3 flex items-center justify-between bg-white/90 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <button
          type="button"
          onClick={handlePortalExit}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          aria-label="Return to login screen"
        >
          ← Exit
        </button>
        <h1 className="text-sm font-semibold text-gray-900 truncate max-w-[55%] text-center">
          🌸 {config.eventTitle || 'Guest Portal'}
        </h1>
        {identifiedGuest ? (
          <span className="text-xs text-gray-500 truncate max-w-[80px] text-right">
            Hi, {identifiedGuest.name.split(' ')[0]}!
          </span>
        ) : (
          <div className="w-10" />
        )}
      </header>

      <nav className="hidden md:flex px-4 pb-2 gap-2 text-xs" role="tablist" aria-label="Guest portal sections">
        <button
          {...desktopTabProps('home')}
          onClick={() => setActiveTab('home')}
          className={`px-3 py-1.5 rounded-full ${
            activeTab === 'home'
              ? 'bg-[var(--accent)] text-white'
              : 'bg-white text-gray-700 border border-gray-200'
          }`}
        >
          🏠 Home
        </button>

        {showMapTab && (
          <button
            {...desktopTabProps('map')}
            onClick={() => setActiveTab('map')}
            className={`px-3 py-1.5 rounded-full ${
              activeTab === 'map'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white text-gray-700 border border-gray-200'
            }`}
          >
            🗺️ Venue Map
          </button>
        )}

        {showScheduleTab && (
          <button
            {...desktopTabProps('schedule')}
            onClick={() => setActiveTab('schedule')}
            className={`px-3 py-1.5 rounded-full ${
              activeTab === 'schedule'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white text-gray-700 border border-gray-200'
            }`}
          >
            📅 Schedule
          </button>
        )}

        {showWayfindingTab && (
          <button
            {...desktopTabProps('wayfinding')}
            onClick={() => setActiveTab('wayfinding')}
            className={`px-3 py-1.5 rounded-full ${
              activeTab === 'wayfinding'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white text-gray-700 border border-gray-200'
            }`}
          >
            🧭 Getting Around
          </button>
        )}

        {showRSVPTab && (
          <button
            {...desktopTabProps('rsvp')}
            onClick={() => setActiveTab('rsvp')}
            className={`px-3 py-1.5 rounded-full ${
              activeTab === 'rsvp'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white text-gray-700 border border-gray-200'
            }`}
          >
            📝 RSVP
          </button>
        )}

        {showLodgingTab && (
          <button
            {...desktopTabProps('lodging')}
            onClick={() => setActiveTab('lodging')}
            className={`px-3 py-1.5 rounded-full ${
              activeTab === 'lodging'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white text-gray-700 border border-gray-200'
            }`}
          >
            🛏️ Lodging
          </button>
        )}
      </nav>

      <main
        className="flex-1 px-4 pt-2 pb-20 md:pb-6 overflow-y-auto"
        role="tabpanel"
        id={tabPanelId}
        aria-labelledby={`guest-portal-tab-${activeTab}`}
        tabIndex={0}
      >
        {isPreview && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 mb-3 flex items-center gap-2">
            <span>👁️</span>
            <span>
              <strong>Preview mode</strong> — you're seeing your guest portal as a visitor.
              RSVP is disabled here; it requires a real guest to sign in.
            </span>
          </div>
        )}
        {renderContent()}
      </main>

      <nav className="fixed bottom-0 inset-x-0 md:hidden bg-white border-t border-gray-200 shadow-sm" aria-label="Guest portal sections">
        <div className="flex justify-around py-1">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            aria-current={activeTab === 'home' ? 'page' : undefined}
            className={`flex flex-col items-center justify-center px-2 py-1 min-w-[64px] ${
              activeTab === 'home' ? 'text-[var(--accent)]' : 'text-gray-500'
            }`}
          >
            <span className="text-lg">🏠</span>
            <span className="text-[11px]">Home</span>
          </button>

          {showMapTab && (
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              aria-current={activeTab === 'map' ? 'page' : undefined}
              className={`flex flex-col items-center justify-center px-2 py-1 min-w-[64px] ${
                activeTab === 'map' ? 'text-[var(--accent)]' : 'text-gray-500'
              }`}
            >
              <span className="text-lg">🗺️</span>
              <span className="text-[11px]">Map</span>
            </button>
          )}

          {showScheduleTab && (
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              aria-current={activeTab === 'schedule' ? 'page' : undefined}
              className={`flex flex-col items-center justify-center px-2 py-1 min-w-[64px] ${
                activeTab === 'schedule' ? 'text-[var(--accent)]' : 'text-gray-500'
              }`}
            >
              <span className="text-lg">📅</span>
              <span className="text-[11px]">Schedule</span>
            </button>
          )}

          {showWayfindingTab && (
            <button
              type="button"
              onClick={() => setActiveTab('wayfinding')}
              aria-current={activeTab === 'wayfinding' ? 'page' : undefined}
              className={`flex flex-col items-center justify-center px-2 py-1 min-w-[64px] ${
                activeTab === 'wayfinding' ? 'text-[var(--accent)]' : 'text-gray-500'
              }`}
            >
              <span className="text-lg">🧭</span>
              <span className="text-[11px]">Around</span>
            </button>
          )}

          {showRSVPTab && (
            <button
              type="button"
              onClick={() => setActiveTab('rsvp')}
              aria-current={activeTab === 'rsvp' ? 'page' : undefined}
              className={`flex flex-col items-center justify-center px-2 py-1 min-w-[64px] ${
                activeTab === 'rsvp' ? 'text-[var(--accent)]' : 'text-gray-500'
              }`}
            >
              <span className="text-lg">📝</span>
              <span className="text-[11px]">RSVP</span>
            </button>
          )}

          {showLodgingTab && (
            <button
              type="button"
              onClick={() => setActiveTab('lodging')}
              aria-current={activeTab === 'lodging' ? 'page' : undefined}
              className={`flex flex-col items-center justify-center px-2 py-1 min-w-[64px] ${
                activeTab === 'lodging' ? 'text-[var(--accent)]' : 'text-gray-500'
              }`}
            >
              <span className="text-lg">🛏️</span>
              <span className="text-[11px]">Lodging</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
};

/**
 * Invitation context is a hard state boundary. React otherwise reuses this
 * component when only hash parameters change, which can retain the previous
 * wedding's in-memory portal state until an effect or network pull completes.
 */
const GuestPortal: React.FC<GuestPortalProps> = (props) => {
  const contextKey = JSON.stringify([
    props.guestToken || '',
    props.coupleEventId || '',
    props.venueSlug || '',
    Boolean(props.preview),
  ]);
  return <GuestPortalSession key={contextKey} {...props} />;
};

export default GuestPortal;