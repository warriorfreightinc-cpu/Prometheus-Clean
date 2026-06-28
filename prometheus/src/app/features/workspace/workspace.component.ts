import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, finalize, forkJoin, Observable, of, Subscription, switchMap } from 'rxjs';
import { BrainApiService } from '../../core/api/brain-api.service';
import { ChatbbApiService } from '../../core/api/chatbb-api.service';
import { LoadsApiService } from '../../core/api/loads-api.service';
import { MatchingApiService } from '../../core/api/matching-api.service';
import { GeocodeResult, LocationApiService } from '../../core/api/location-api.service';
import { MessagesApiService } from '../../core/api/messages-api.service';
import { PostsApiService } from '../../core/api/posts-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { PrometheusSocketEvent, PrometheusSocketService } from '../../core/realtime/prometheus-socket.service';
import { formatChatTimeLabel } from '../../shared/time/chat-time-label';
import { DispatchImportRejectedRow, DispatchIntakeService, ParsedDispatchDraft } from './dispatch-intake.service';
import {
  AssistantRoomResponse,
  AuthUser,
  BrokerPostUpsertPayload,
  ChatbbAction,
  CarrierPostUpsertPayload,
  ChatbbPlan,
  ChatbbRuntimeStatus,
  ChatbbThreadMessage,
  CompanySetupStatus,
  DirectMessage,
  DirectRoom,
  DirectRoomResponse,
  ExecuteRoomIntegrationPayload,
  InboxDot,
  LoadAccessRequest,
  ManualPlacePayload,
  MatchCandidate,
  MatchingAssistantEvent,
  MatchSnapshot,
  MatchSourcePostType,
  PostSearchPayload,
  PostLocation,
  PrometheusBrainApproval,
  PrometheusBrainPromptResponse,
  PrometheusLoad,
  PrometheusLoadStatus,
  RoomIntegrationChoice,
  RoomIntegrationExecutionResponse,
  UpdateBrainSettingsPayload,
  UpdateDirectRoomWorkflowPayload,
  WorkspacePost,
} from '../../shared/types/models';

type WorkspaceTab = 'masterOnboarding' | 'companySetup' | 'dispatch' | 'matching' | 'loads' | 'direct';
type DispatchMode = 'create' | 'edit';
type LoadConsoleView = 'active' | 'library' | 'readyToBill' | 'archived';
type DirectConsoleView = 'booking' | 'main' | 'company';
type SetupProvider = 'highway' | 'mycarrierpacket' | 'truckstop' | string;
type WorkspaceMetric = { title: string; count: number; note: string };
type Option<T> = { value: T; label: string };
type EquipmentPreset = { value: string; label: string; codes: string[] };
type DispatchSource = 'manual' | 'excel' | 'document' | 'tms';
type WorkspaceTabConfig = { id: WorkspaceTab; title: string; detail: string };
type ConsoleBubble = { id: string; sender: 'assistant' | 'user' | 'system'; text: string; label?: string; createdAt?: string | null };
type SavedDispatchTemplate = { id: string; label: string; prompt: string; role: 'broker' | 'carrier'; createdAt: string };
type PendingDispatchImport = {
  sourceLabel: string;
  role: 'broker' | 'carrier';
  drafts: ParsedDispatchDraft[];
  rejected: DispatchImportRejectedRow[];
  createdAt: string;
};
type DirectConsoleTab = { id: DirectConsoleView; label: string; detail: string };
type BrokerInviteStatus = 'saved' | 'pending';
type DriverRosterItem = {
  id: string;
  name: string;
  truckLabel: string;
  status: 'ready' | 'enRoute' | 'break';
  location: string;
};
type DirectContactRecord = {
  id: string;
  roomId: string | null;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  savedAt: string;
  status?: BrokerInviteStatus;
  note?: string;
  muted?: boolean;
  archived?: boolean;
  deleted?: boolean;
  updatedAt?: string;
};
type DirectMailEntry = {
  id: string;
  author: string;
  text: string;
  direction: 'outbound' | 'system';
  date: string;
  target: string;
};
type DirectRoomWorkflowState = {
  brokerApproved: boolean;
  carrierApproved: boolean;
  consoleOpened: boolean;
  setupProvider: SetupProvider | null;
  driverId: string | null;
  driverName: string;
  truckLabel: string;
  trackingProvider: string | null;
  trackingShared: boolean;
  contactSaved?: boolean;
  delivered: boolean;
};
type BrokerDeskEntry = {
  id: string;
  roomId: string | null;
  contactName: string;
  companyName: string;
  email: string;
  phone: string;
  status: 'live' | BrokerInviteStatus;
  lastTouched: string;
  unread: number;
  note: string;
  muted: boolean;
  archived: boolean;
  deleted: boolean;
  isSaved: boolean;
};
type CompanyThreadSummary = {
  id: string;
  name: string;
  roleLabel: string;
  snapshot: string;
  unread: number;
};
type CompanyThreadMessage = {
  id: string;
  author: string;
  text: string;
  sender: 'me' | 'peer' | 'system';
  date: string;
};
type BookingAssistantEntry = {
  id: string;
  label: string;
  text: string;
  date: string;
  source: 'ai' | 'room' | 'system';
  mine?: boolean;
  actions?: BookingAssistantAction[];
};
type BookingAssistantAction = {
  type:
    | 'approveBooking'
    | 'rejectOffer'
    | 'chooseSetupProvider'
    | 'assignDriver'
    | 'connectEld'
    | 'sendMacroPoint'
    | 'chooseTrackingProvider'
    | 'allowTracking'
    | 'denyTracking'
    | 'confirmDelivered'
    | 'rejectDelivered'
    | 'cancelWithTonu'
    | 'cancelWithoutTonu';
  label: string;
  value?: string;
  integrationChoice?: RoomIntegrationChoice;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
};
type BookingConfirmationAction = 'approve' | 'reject';
type BookingConfirmationWindow = {
  action: BookingConfirmationAction;
  roomId: string;
  openedAt: string;
  expiresAt: string;
};
type RouteIntelligenceSource = 'matching' | 'booking';
type RouteTrackingStatus = 'notConnected' | 'connected' | 'live';
type RoutePreviewMode = 'offline';
type RoutePreviewPointKind = 'truck' | 'pickup' | 'stop' | 'delivery';
type RoutePreviewSegmentKind = 'deadhead' | 'loaded';
type RoutePreviewPoint = {
  kind: RoutePreviewPointKind;
  label: string;
  x: number;
  y: number;
};
type RoutePreviewSegment = {
  kind: RoutePreviewSegmentKind;
  points: string;
};
type RouteIntelligencePanelState = {
  open: boolean;
  source: RouteIntelligenceSource;
  laneLabel: string;
  originLabel: string;
  destinationLabel: string;
  stops: string[];
  truckLocationLabel: string;
  deadheadMiles: number | null;
  loadedMiles: number | null;
  totalMiles: number | null;
  postedRate: number | null;
  suggestedRate: number | null;
  fuelEstimate: number | null;
  tollEstimate: number | null;
  routeProvider: string;
  trackingProvider: string | null;
  trackingStatus: RouteTrackingStatus;
  hazmatNotes: string[];
  previewMode: RoutePreviewMode;
  previewPoints: RoutePreviewPoint[];
  previewSegments: RoutePreviewSegment[];
};
type LoadBoardItem = {
  loadId: string;
  ownPostId: string;
  reference: string;
  origin: string;
  destination: string;
  lane: string;
  brokerName: string;
  counterpartyName: string;
  driverName: string;
  truckLabel: string;
  rateLabel: string;
  dispatcherName: string;
  summary: string;
  lastActivity: string;
  status: PrometheusLoadStatus;
  statusLabel: string;
  statusTone: 'active' | 'warning' | 'billing' | 'muted';
  isMine: boolean;
  pendingAccessRequests: LoadAccessRequest[];
  myPendingAccessRequest: LoadAccessRequest | null;
  canApproveAccess: boolean;
  load: PrometheusLoad;
};

const CAPACITY_OPTIONS: Option<string>[] = [
  { value: 'full', label: 'Full' },
  { value: 'partial', label: 'Partial' },
];

const EQUIPMENT_PRESETS: EquipmentPreset[] = [
  { value: 'VR', label: 'Van / Reefer', codes: ['V', 'R'] },
  { value: 'V', label: 'Van only', codes: ['V'] },
  { value: 'R', label: 'Reefer', codes: ['R'] },
  { value: 'F', label: 'Flatbed', codes: ['F'] },
  { value: 'S', label: 'Step deck', codes: ['S'] },
  { value: 'P', label: 'Power only', codes: ['P'] },
  { value: 'C', label: 'Tanker', codes: ['C'] },
  { value: 'VF', label: 'Van / Flatbed', codes: ['V', 'F'] },
  { value: 'VRF', label: 'Van / Reefer / Flatbed', codes: ['V', 'R', 'F'] },
];

const WORKSPACE_TABS: WorkspaceTabConfig[] = [
  { id: 'masterOnboarding', title: 'Master Onboarding', detail: 'Approve company paperwork, setup, active, and inactive companies' },
  { id: 'companySetup', title: 'Company Setup', detail: 'Finish payment and create users after approval' },
  { id: 'matching', title: 'AI Transportation Center', detail: 'Post, search, match, route, and book hazmat work with Prometheus' },
  { id: 'loads', title: 'Loads Console', detail: 'Review posted capacity, lane status, and next operational moves' },
  { id: 'direct', title: 'Direct Chat Console', detail: 'Work broker-carrier conversations in a dedicated room view' },
];

const DIRECT_CONSOLE_TABS: DirectConsoleTab[] = [
  { id: 'booking', label: 'Booking chat', detail: 'Use the lane AI to walk setup, tracking, and booking actions.' },
  { id: 'main', label: 'Main chat', detail: 'Work broker contacts and keep the conversation simple.' },
  { id: 'company', label: 'Company chat', detail: 'Keep coworker chat and access handoff in one internal room.' },
];

const DRIVER_ROSTER: DriverRosterItem[] = [
  { id: 'drv-bob', name: 'Bob Carter', truckLabel: 'Unit 401 / V 53\'', status: 'ready', location: 'Chicago, IL' },
  { id: 'drv-alex', name: 'Alex Moreno', truckLabel: 'Unit 218 / V 53\'', status: 'enRoute', location: 'Gary, IN' },
  { id: 'drv-tina', name: 'Tina Brooks', truckLabel: 'Unit 512 / R 53\'', status: 'break', location: 'Joliet, IL' },
  { id: 'drv-sam', name: 'Sam Patel', truckLabel: 'Unit 330 / F 48\'', status: 'ready', location: 'Philadelphia, PA' },
];

@Component({
  selector: 'app-workspace',
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.scss'],
})
export class WorkspaceComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly dispatchDefaultsKey = 'prometheus.dispatch.defaults';
  private readonly dispatchTemplatesKey = 'prometheus.dispatch.templates';
  private readonly directWorkflowKey = 'prometheus.direct.workflow';
  private readonly directContactsKey = 'prometheus.direct.contacts';
  private readonly directMailKey = 'prometheus.direct.mail';
  private readonly companyChatKey = 'prometheus.direct.company';
  private readonly noLiveLoadCancellationMessage = 'This booking does not have a live load yet. Reject the offer or cancel the approval before it becomes a live load.';

  readonly capacityOptions = CAPACITY_OPTIONS;
  readonly equipmentPresets = EQUIPMENT_PRESETS;
  readonly directConsoleTabs = DIRECT_CONSOLE_TABS;
  readonly driverRoster = DRIVER_ROSTER;
  readonly dispatchForm: FormGroup = this.createDispatchForm();
  readonly brainSettingsForm: FormGroup = this.fb.group({
    memoryMode: ['off'],
    auditRetentionDays: [365, [Validators.required, Validators.min(1)]],
    allowProviderTools: [false],
  });
  @ViewChild('dispatchNarrativeInput') dispatchNarrativeInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('dispatchThreadRef') dispatchThreadRef?: ElementRef<HTMLDivElement>;

  activeTab: WorkspaceTab = 'matching';
  dispatchMode: DispatchMode = 'create';
  user: AuthUser | null = null;
  adminSetupStatus: string | null = null;
  loading = true;
  roomsLoading = false;
  chatbbLoading = false;
  dispatchSubmitting = false;
  workspaceError = '';
  brainSettingsMessage = '';
  brainSettingsError = '';
  brainSettingsSaving = false;
  chatbbError = '';
  dispatchError = '';
  dispatchMessage = '';
  dispatchNarrative = '';
  dispatchSource: DispatchSource = 'manual';
  dispatchSourceMessage = 'Natural-language intake is active. Type the truck or load details and Prometheus will structure the post.';
  dispatchPreview: ParsedDispatchDraft | null = null;
  pendingDispatchImport: PendingDispatchImport | null = null;
  dispatchConsoleMessages: ConsoleBubble[] = [];
  readonly showDispatchAssistText = false;
  directMessage = '';
  directMailMessage = '';
  chatbbPrompt = '';
  matchingConsoleMessages: ConsoleBubble[] = [];
  routeIntelligencePanel: RouteIntelligencePanelState = this.emptyRouteIntelligencePanel();
  posts: WorkspacePost[] = [];
  companyPosts: WorkspacePost[] = [];
  loads: PrometheusLoad[] = [];
  matchSnapshot: MatchSnapshot | null = null;
  matchCandidates: MatchCandidate[] = [];
  rooms: DirectRoom[] = [];
  previewDirectRooms: DirectRoom[] = [];
  chatbbMessages: ChatbbThreadMessage[] = [];
  runtimeStatus: ChatbbRuntimeStatus | null = null;
  savedTemplates: SavedDispatchTemplate[] = [];
  inboxCount = 0;
  matchesLoading = false;
  loadCreatePending = false;
  loadActionPendingId = '';
  loadError = '';
  loadMessage = '';
  loadConsoleView: LoadConsoleView = 'active';
  activeDirectConsoleView: DirectConsoleView = 'main';
  directWorkflow: Record<string, DirectRoomWorkflowState> = {};
  directContacts: DirectContactRecord[] = [];
  directMailThreads: Record<string, DirectMailEntry[]> = {};
  companyChatThreads: Record<string, CompanyThreadMessage[]> = {};
  directSetupPickerOpen = false;
  directDriverPickerOpen = false;
  directTrackingConfirmOpen = false;
  directCancelConfirmOpen = false;
  bookingAssistantAction: 'setupProvider' | 'driverSelection' | 'trackingConnect' | 'trackingApi' | 'trackingAllow' | 'cancelTonu' | 'deliverConfirm' | null = null;
  bookingSetupProviderActions: BookingAssistantAction[] = [
    { type: 'chooseSetupProvider', label: 'Highway', value: 'highway' },
    { type: 'chooseSetupProvider', label: 'MyCarrierPacket', value: 'mycarrierpacket' },
    { type: 'chooseSetupProvider', label: 'Truckstop', value: 'truckstop' },
  ];
  bookingTrackingProviderActions: BookingAssistantAction[] = [
    { type: 'connectEld', label: 'Connect ELD' },
    { type: 'sendMacroPoint', label: 'Send MacroPoint' },
  ];
  bookingConfirmationWindow: BookingConfirmationWindow | null = null;
  bookingConfirmationSecondsRemaining = 0;
  selectedBrokerContactId = '';
  brokerInviteOpen = false;
  directContactSearch = '';
  showArchivedDirectContacts = false;
  brokerInviteForm = {
    contactName: '',
    companyName: '',
    email: '',
    phone: '',
  };
  selectedCompanyThreadId = '';
  companyMessage = '';
  accessRequestLoad: LoadBoardItem | null = null;
  accessVerificationCode = '';
  selectedPostId = '';
  selectedRoomId = '';
  matchError = '';
  roomCreateError = '';
  roomCreateMessage = '';
  roomCreatePendingId = '';
  pendingBrainApprovals: PrometheusBrainApproval[] = [];
  private announcedMatchKeys = new Set<string>();
  private matchingAssistantEventKeys = new Set<string>();
  private socketSubscription: Subscription | null = null;
  private bookingConfirmationTimer: number | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly session: AuthSessionService,
    private readonly postsApi: PostsApiService,
    private readonly matchingApi: MatchingApiService,
    private readonly brainApi: BrainApiService,
    private readonly loadsApi: LoadsApiService,
    private readonly messagesApi: MessagesApiService,
    private readonly chatbbApi: ChatbbApiService,
    private readonly locationApi: LocationApiService,
    private readonly dispatchIntake: DispatchIntakeService,
    private readonly router: Router,
    private readonly socket: PrometheusSocketService
  ) {}

  ngOnInit(): void {
    this.startNewDispatch();
    this.loadDirectConsoleState();
    this.user = this.session.currentUser;
    if (this.user) {
      if (this.user.role === 'superadmin') this.activeTab = 'masterOnboarding';
      else if (this.canManageCompanySetup) this.activeTab = 'companySetup';
      this.loadSavedTemplates();
      this.primeConsoleMessages();
      this.seedDispatchNarrative();
      this.connectAssistantSocket();
      this.loadWorkspaceData(this.user);
      return;
    }
    this.session.restoreSession().pipe(catchError(() => of(false))).subscribe(() => {
      this.user = this.session.currentUser;
      if (!this.user) {
        this.router.navigate(['/sign-in']);
        return;
      }
      if (this.user.role === 'superadmin') this.activeTab = 'masterOnboarding';
      else if (this.canManageCompanySetup) this.activeTab = 'companySetup';
      this.loadSavedTemplates();
      this.primeConsoleMessages();
      this.seedDispatchNarrative();
      this.connectAssistantSocket();
      this.loadWorkspaceData(this.user);
    });
  }

  ngAfterViewInit(): void {
    this.queueDispatchNarrativeResize();
    this.queueDispatchThreadScroll();
  }

  ngOnDestroy(): void {
    this.socketSubscription?.unsubscribe();
    this.clearBookingConfirmationTimer();
  }

  get isBroker(): boolean { return this.user?.role === 'broker'; }
  get isCarrier(): boolean { return this.user?.role === 'carrier'; }
  get isMasterAccount(): boolean { return this.user?.role === 'superadmin'; }
  get isCompanyAdmin(): boolean { return this.user?.role === 'admin'; }
  get canManageCompanySetup(): boolean {
    return ['admin', 'supervisor', 'superadmin'].includes(String(this.user?.role ?? ''));
  }
  get workspaceTabs(): WorkspaceTabConfig[] {
    if (this.isMasterAccount) {
      return WORKSPACE_TABS.filter((tab) => tab.id === 'masterOnboarding' || tab.id === 'companySetup');
    }
    if (this.canManageCompanySetup) {
      return WORKSPACE_TABS.filter((tab) => tab.id === 'companySetup');
    }
    return WORKSPACE_TABS.filter((tab) => tab.id !== 'masterOnboarding' && tab.id !== 'companySetup');
  }
  get allWorkspacePosts(): WorkspacePost[] {
    return this.mergeWorkspacePosts(this.companyPosts, this.posts);
  }
  get selectedPost(): WorkspacePost | null { return this.allWorkspacePosts.find((post) => post._id === this.selectedPostId) ?? null; }
  get selectedRoom(): DirectRoom | null {
    const availableRooms = this.directBookingRooms;
    return availableRooms.find((room) => room.id === this.selectedRoomId) ?? availableRooms[0] ?? null;
  }
  get activeConversation(): DirectMessage[] {
    if (this.activeTab === 'direct' && this.activeDirectConsoleView === 'main') {
      return this.selectedBrokerRoom?.messages ?? [];
    }
    return this.selectedRoom?.messages ?? [];
  }
  get selectedRoomWorkflow(): DirectRoomWorkflowState | null {
    const room = this.selectedRoom;
    return this.resolveRoomWorkflow(room);
  }
  get selectedRoomMetaItems(): string[] {
    return this.getBookingRoomMetaItems(this.selectedRoom);
  }
  get selectedRoomDriverSummary(): string {
    const workflow = this.selectedRoomWorkflow;
    if (workflow?.driverName) {
      return workflow.truckLabel ? `${workflow.driverName} / ${workflow.truckLabel}` : workflow.driverName;
    }
    const load = this.selectedRoomLoad;
    if (load?.driver?.name) {
      return load.driver.truckLabel ? `${load.driver.name} / ${load.driver.truckLabel}` : load.driver.name;
    }
    return 'No driver assigned yet';
  }
  get selectedRoomSetupLabel(): string {
    const provider = this.selectedRoomWorkflow?.setupProvider;
    if (provider === 'highway') return 'Highway setup staged';
    if (provider === 'mycarrierpacket') return 'MyCarrierPacket setup staged';
    if (provider === 'truckstop') return 'Truckstop setup staged';
    if (provider) return `${this.setupProviderDisplayLabel(provider)} setup staged`;
    return 'Setup not staged';
  }
  get selectedRoomTrackingLabel(): string {
    const workflow = this.selectedRoomWorkflow;
    if (!workflow) return 'Tracking not shared';
    if (workflow.trackingShared) {
      return workflow.trackingProvider ? `Tracking live via ${workflow.trackingProvider}` : 'Tracking live';
    }
    if (workflow.trackingProvider) {
      return `${workflow.trackingProvider} connected`;
    }
    return 'Tracking not shared';
  }
  get selectedRoomRateLabel(): string {
    const bid = this.selectedRoom?.maxBid;
    return typeof bid === 'number' ? `$${bid.toLocaleString('en-US')}` : '';
  }
  get selectedRoomReferenceLabel(): string {
    return this.selectedRoomLoad?.reference
      || this.stringValue(this.selectedRoom?.post?.refNum)
      || this.selectedRoom?.equipmentLabel
      || 'Booking preview';
  }
  get selectedRoomIsPreview(): boolean {
    return this.isPreviewRoom(this.selectedRoom?.id ?? '');
  }
  get selectedRoomBookingReady(): boolean {
    return this.selectedRoom?.bookingStatus === 'booked';
  }
  currentUserApprovedBooking(room: DirectRoom | null | undefined = this.selectedRoom): boolean {
    if (!room || !this.user) return false;
    if (this.user.role === 'broker') return Boolean(room.brokerApprovedBooking);
    if (this.user.role === 'carrier') return Boolean(room.carrierApprovedBooking);
    return Boolean(room.brokerApprovedBooking && room.carrierApprovedBooking);
  }
  get selectedRoomSetupReady(): boolean { return !!this.selectedRoomWorkflow?.setupProvider; }
  get selectedRoomDriverReady(): boolean { return !!this.selectedRoomWorkflow?.driverName || !!this.selectedRoomLoad?.driver?.name; }
  get selectedRoomContactReady(): boolean { return !!this.selectedRoomWorkflow?.contactSaved || !!this.selectedRoomContactRecord; }
  get selectedRoomTrackingReady(): boolean { return !!this.selectedRoomWorkflow?.trackingShared; }
  get selectedRoomDeliveredReady(): boolean {
    return !!this.selectedRoomWorkflow?.delivered || this.selectedRoomLoad?.status === 'readyToBill' || this.selectedRoomLoad?.status === 'archived';
  }
  get selectedRoomCanSendToLoadsConsole(): boolean {
    return !!this.selectedRoom && !!this.selectedRoomLoad && this.selectedRoomDeliveredReady;
  }
  get selectedRoomTrackingNote(): string {
    const workflow = this.selectedRoomWorkflow;
    if (!workflow) return 'Tracking not shared yet.';
    if (workflow.trackingShared) {
      return workflow.trackingProvider
        ? `Tracking is active through ${workflow.trackingProvider}.`
        : 'Tracking is active for this booking.';
    }
    if (workflow.trackingProvider) {
      return `${workflow.trackingProvider} is connected, but tracking still needs your approval.`;
    }
    return 'Tracking not shared yet.';
  }
  get selectedRoomDeliveredNote(): string {
    return this.selectedRoomDeliveredReady
      ? 'Delivered confirmed and ready for billing.'
      : 'Delivered not confirmed yet.';
  }
  get selectedRoomCompanyLabel(): string {
    return this.selectedRoom?.companyName || this.selectedRoomLoad?.broker?.companyName || 'Broker company pending';
  }
  get selectedRoomContactLabel(): string {
    return this.selectedRoom?.contactName || this.selectedRoomLoad?.broker?.contactName || 'Broker contact pending';
  }
  get selectedRoomContactRecord(): DirectContactRecord | null {
    const room = this.selectedRoom;
    if (!room) return null;
    return this.directContacts.find((entry) => !entry.deleted && entry.roomId === room.id)
      ?? this.directContacts.find((entry) => !entry.deleted && entry.email && entry.email === room.contactEmail)
      ?? null;
  }
  get selectedRoomMailThread(): DirectMailEntry[] {
    return this.selectedRoom ? this.directMailThreads[this.selectedRoom.id] ?? [] : [];
  }
  get brokerDeskEntries(): BrokerDeskEntry[] {
    const entryMap = new Map<string, BrokerDeskEntry>();
    const deletedContactKeys = new Set<string>();
    const roomSource = this.rooms.length
      ? this.rooms
      : this.previewDirectRooms;

    this.directContacts.forEach((contact) => {
      const keys = this.directContactKeys(contact);
      if (contact.deleted) {
        keys.forEach((key) => deletedContactKeys.add(key));
        return;
      }
      const key = this.primaryDirectContactKey(contact);
      entryMap.set(key, {
        id: contact.id,
        roomId: contact.roomId,
        contactName: contact.contactName || 'Saved broker',
        companyName: contact.companyName || 'Unknown company',
        email: contact.email,
        phone: contact.phone,
        status: contact.status ?? 'saved',
        lastTouched: contact.updatedAt ?? contact.savedAt,
        unread: 0,
        note: contact.note || (contact.status === 'pending' ? 'Invite pending approval.' : 'Saved broker contact.'),
        muted: Boolean(contact.muted),
        archived: Boolean(contact.archived),
        deleted: false,
        isSaved: true,
      });
    });

    roomSource.forEach((room) => {
      const roomKeys = this.directRoomContactKeys(room);
      if (roomKeys.some((roomKey) => deletedContactKeys.has(roomKey))) return;
      const existingKey = roomKeys.find((roomKey) => entryMap.has(roomKey));
      const key = existingKey ?? this.primaryDirectRoomKey(room);
      const existing = existingKey ? entryMap.get(existingKey) : undefined;
      entryMap.set(key, {
        id: existing?.id ?? room.id,
        roomId: room.id,
        contactName: existing?.contactName || room.contactName,
        companyName: existing?.companyName || room.companyName,
        email: existing?.email || room.contactEmail,
        phone: existing?.phone || room.contactPhone,
        status: 'live',
        lastTouched: room.lastMessageAt ?? existing?.lastTouched ?? new Date().toISOString(),
        unread: this.roomUnreadCount(room),
        note: room.maxBid !== null
          ? `Latest quoted rate ${this.formatCurrency(room.maxBid)}.`
          : existing?.note || 'Live room is open with this broker.',
        muted: Boolean(existing?.muted),
        archived: Boolean(existing?.archived),
        deleted: false,
        isSaved: Boolean(existing?.isSaved),
      });
    });

    return [...entryMap.values()].sort((left, right) => {
      const leftPriority = left.status === 'live' ? 0 : left.status === 'pending' ? 2 : 1;
      const rightPriority = right.status === 'live' ? 0 : right.status === 'pending' ? 2 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      const rightTime = right.lastTouched ? new Date(right.lastTouched).getTime() : 0;
      const leftTime = left.lastTouched ? new Date(left.lastTouched).getTime() : 0;
      return rightTime - leftTime;
    });
  }
  get visibleBrokerDeskEntries(): BrokerDeskEntry[] {
    return this.brokerDeskEntries.filter((entry) => this.showArchivedDirectContacts ? entry.archived : !entry.archived);
  }
  get directSearchResults(): BrokerDeskEntry[] {
    const search = this.directContactSearch.trim().toLowerCase();
    const source = search ? this.brokerDeskEntries : this.visibleBrokerDeskEntries;
    const results = search
      ? source.filter((entry) => this.brokerDeskSearchText(entry).includes(search))
      : source;
    return results.slice(0, 8);
  }
  get selectedBrokerDeskEntry(): BrokerDeskEntry | null {
    if (this.selectedBrokerContactId) {
      return this.brokerDeskEntries.find((entry) => entry.id === this.selectedBrokerContactId) ?? null;
    }
    if (this.selectedRoomId) {
      return this.brokerDeskEntries.find((entry) => entry.roomId === this.selectedRoomId) ?? null;
    }
    return this.visibleBrokerDeskEntries[0] ?? null;
  }
  get selectedBrokerRoom(): DirectRoom | null {
    const roomId = this.selectedBrokerDeskEntry?.roomId;
    if (!roomId) return null;
    return this.directBookingRooms.find((room) => room.id === roomId) ?? null;
  }
  get companyThreadSummaries(): CompanyThreadSummary[] {
    const uniqueLoads = new Map<string, CompanyThreadSummary>();

    this.teamActiveLoads.forEach((item) => {
      const key = `load-${item.loadId}`;
      uniqueLoads.set(key, {
        id: key,
        name: item.dispatcherName,
        roleLabel: item.reference,
        snapshot: `${item.origin} -> ${item.destination}`,
        unread: 0,
      });
    });

    if (!uniqueLoads.size) {
      this.previewCompanyThreadSummaries().forEach((thread) => {
        uniqueLoads.set(thread.id, thread);
      });
    }

    return [...uniqueLoads.values()];
  }
  get selectedCompanyThread(): CompanyThreadSummary | null {
    const preferred = this.selectedCompanyThreadId
      ? this.companyThreadSummaries.find((entry) => entry.id === this.selectedCompanyThreadId) ?? null
      : null;
    return preferred ?? this.companyThreadSummaries[0] ?? null;
  }
  get selectedCompanyMessages(): CompanyThreadMessage[] {
    const thread = this.selectedCompanyThread;
    return thread ? this.companyChatThreads[thread.id] ?? [] : [];
  }
  get bookingAssistantEntries(): BookingAssistantEntry[] {
    const roomEntries = (this.selectedRoom?.messages ?? []).map((message, index) => ({
      id: `room-${index}-${message.date ?? 'pending'}`,
      label: message.role === this.user?.role ? 'You' : (this.selectedRoom?.contactName || 'Broker / carrier'),
      text: message.type === 'bid'
        ? `Bid moved to ${this.formatCurrency(this.asNumberOrNull(message.bid) ?? 0)}`
        : (message.text ?? ''),
      date: message.date ?? new Date().toISOString(),
      source: 'room' as const,
      mine: message.role === this.user?.role,
    }));

    const lastAssistantIndex = this.chatbbMessages.reduce(
      (lastIndex, message, index) => message.sender === 'assistant' ? index : lastIndex,
      -1
    );
    const aiEntries = this.chatbbMessages.map((message, index) => ({
      id: `ai-${index}-${message.createdAt}`,
      label: message.sender === 'assistant' ? 'Prometheus AI' : 'You',
      text: message.text,
      date: message.createdAt,
      source: 'ai' as const,
      mine: message.sender === 'user',
      actions: this.bookingAssistantActionsForMessage(message.sender, index, lastAssistantIndex),
    }));

    const timeline = [...roomEntries, ...aiEntries].sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : 0;
      const rightTime = right.date ? new Date(right.date).getTime() : 0;
      return leftTime - rightTime;
    });
    const approvalPrompt = this.bookingApprovalPromptEntry();
    const entries = approvalPrompt ? [...timeline, approvalPrompt] : timeline;
    return entries.sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : 0;
      const rightTime = right.date ? new Date(right.date).getTime() : 0;
      return leftTime - rightTime;
    });
  }
  get directBookingRooms(): DirectRoom[] {
    if (this.rooms.length >= 3) return this.rooms;
    const previewRooms = this.previewDirectRooms.length
      ? this.previewDirectRooms
      : this.createPreviewBookingRooms(this.selectedPost);

    if (!this.rooms.length) return previewRooms;

    const existingIds = new Set(this.rooms.map((room) => room.id));
    const fillerRooms = previewRooms.filter((room) => !existingIds.has(room.id)).slice(0, Math.max(0, 3 - this.rooms.length));
    return [...this.rooms, ...fillerRooms];
  }

  private bookingApprovalPromptEntry(): BookingAssistantEntry | null {
    const room = this.selectedRoom;
    if (!room || this.selectedRoomLoad || room.bookingStatus === 'booked' || room.bookingStatus === 'cancelled') return null;

    const userApproved = this.currentUserApprovedBooking(room);
    const otherSideLabel = this.user?.role === 'broker' ? 'carrier' : 'broker';
    const text = userApproved
      ? `Your booking approval is saved. Waiting on the ${otherSideLabel} approval before Prometheus generates the live load in Booking Chat.`
      : `Prometheus has this hazmat booking ready. Approve booking or reject the offer?`;

    return {
      id: `booking-approval-${room.id}`,
      label: 'Prometheus AI',
      text,
      date: room.bookingStatusUpdatedAt ?? room.lastMessageAt ?? new Date(0).toISOString(),
      source: 'ai',
      actions: [
        { type: 'approveBooking', label: 'Approve booking', disabled: userApproved },
        { type: 'rejectOffer', label: 'Reject offer' },
      ],
    };
  }

  private bookingAssistantActionsForMessage(
    sender: 'assistant' | 'user' | 'system',
    index: number,
    lastAssistantIndex: number
  ): BookingAssistantAction[] | undefined {
    if (sender !== 'assistant' || index !== lastAssistantIndex) return undefined;

    switch (this.bookingAssistantAction) {
      case 'setupProvider':
        return this.bookingSetupProviderActions;
      case 'driverSelection':
        return this.driverRoster.map((driver) => ({
          type: 'assignDriver',
          label: `${driver.name} / ${driver.truckLabel}`,
          value: driver.id,
        }));
      case 'trackingConnect':
        return this.bookingTrackingProviderActions;
      case 'trackingAllow':
        return [
          { type: 'allowTracking', label: 'Allow tracking', tone: 'primary' },
          { type: 'denyTracking', label: 'Keep red' },
        ];
      case 'cancelTonu':
        return [
          { type: 'cancelWithTonu', label: 'Waiting on TONU' },
          { type: 'cancelWithoutTonu', label: 'Cancel load now', tone: 'danger' },
        ];
      case 'deliverConfirm':
        return [
          { type: 'confirmDelivered', label: 'Mark delivered', tone: 'primary' },
          { type: 'rejectDelivered', label: 'Keep active' },
        ];
      default:
        return undefined;
    }
  }

  get postCount(): number { return this.posts.length; }
  get liveRoomCount(): number { return this.rooms.length; }
  get roomBidCount(): number { return this.rooms.filter((room) => room.maxBid !== null).length; }
  get dispatchTitle(): string { return this.dispatchMode === 'edit' ? 'Edit selected post' : 'Create a live post'; }
  get dispatchSubmitLabel(): string {
    if (this.dispatchSubmitting) return this.dispatchMode === 'edit' ? 'Saving...' : 'Creating...';
    return this.dispatchMode === 'edit' ? 'Save post' : 'Create post';
  }
  get dispatchRoleLabel(): string {
    return this.isBroker ? 'loads' : 'trucks';
  }
  get dispatchSingularLabel(): string {
    return this.isBroker ? 'load' : 'truck';
  }
  get dispatchPlaceholder(): string {
    return this.isBroker
      ? 'Type a load post and press Enter.'
      : 'Type a truck post and press Enter.';
  }
  get dispatchExampleLines(): string[] {
    return this.isBroker
      ? [
          '1 load from Chicago, IL to Philadelphia, PA dry van 42000 lbs ready today for $2500',
          '2 loads from Joliet, IL to Dallas, TX reefer 38000 tomorrow',
        ]
      : [
          'I have 2 trucks in Chicago, IL ready today van 45000 open destination',
          '1 reefer in Atlanta, GA going to Charlotte, NC tomorrow 42000',
        ];
  }
  get dispatchStarterPrompts(): string[] {
    return this.dispatchExampleLines;
  }
  get visibleTemplates(): SavedDispatchTemplate[] {
    const role = this.user?.role === 'broker' ? 'broker' : 'carrier';
    return this.savedTemplates.filter((template) => template.role === role).slice(0, 6);
  }

  get latestPlan(): ChatbbPlan | null {
    for (let index = this.chatbbMessages.length - 1; index >= 0; index -= 1) {
      const message = this.chatbbMessages[index];
      if (message.sender === 'assistant' && message.plan) return message.plan;
    }
    return null;
  }

  get loadBoardItems(): LoadBoardItem[] {
    return this.loads.map((load) => this.buildLoadBoardItem(load));
  }

  get myActiveLoads(): LoadBoardItem[] {
    return this.loadBoardItems.filter((item) => item.isMine && item.status === 'active');
  }

  get teamActiveLoads(): LoadBoardItem[] {
    return this.loadBoardItems.filter((item) => !item.isMine && item.status === 'active');
  }

  get activeLoadCount(): number {
    return this.myActiveLoads.length + this.teamActiveLoads.length;
  }

  get libraryLoads(): LoadBoardItem[] {
    return this.loadBoardItems.filter((item) => item.status === 'library');
  }

  get readyToBillLoads(): LoadBoardItem[] {
    return this.loadBoardItems.filter((item) => item.status === 'readyToBill');
  }

  get archivedLoads(): LoadBoardItem[] {
    return this.loadBoardItems.filter((item) => item.status === 'archived');
  }

  get loadLibraryCount(): number {
    return this.libraryLoads.length;
  }

  get loadBoardMetrics(): WorkspaceMetric[] {
    return [
      { title: 'Active loads', count: this.activeLoadCount, note: 'Live work still moving across this company desk.' },
      { title: 'Library', count: this.libraryLoads.length, note: 'Delivered loads waiting on BOL or billing documents.' },
      { title: 'Ready to bill', count: this.readyToBillLoads.length, note: 'Loads with billing documents staged for export.' },
      { title: 'Finished', count: this.archivedLoads.length, note: 'Completed loads archived after billing review.' },
      { title: 'Team visible', count: this.teamActiveLoads.length, note: 'Read-only company loads from other dispatchers that you can monitor or take over later.' },
    ];
  }

  get selectedRoomLoad(): PrometheusLoad | null {
    const room = this.selectedRoom;
    if (!room) return null;
    return this.loads.find((load) => (
      load.source?.brokerPostId === room.brokerPostId
      && load.source?.carrierPostId === room.carrierPostId
    )) ?? null;
  }

  get selectedRoomBookingContext(): { title: string; note: string } {
    if (this.selectedRoomLoad) {
      return {
        title: this.selectedRoomLoad.reference || this.formatLane(this.selectedPost),
        note: this.selectedRoomLoad.status === 'library'
          ? 'Canceled or delivered work can stay in Library while you wait on BOL or TONU.'
          : this.selectedRoomLoad.status === 'readyToBill'
            ? 'This booking is ready to bill once the paperwork is complete.'
            : 'This load is active and the booking room stays tied to the live load.',
      };
    }

    return {
      title: this.formatLane(this.selectedPost),
      note: 'This room is still negotiating or confirming the booking before it moves into Loads Console.',
    };
  }

  get counterpartLabel(): string {
    return this.isBroker ? 'Carrier matches' : 'Broker matches';
  }
  get showRouteIntelligencePanel(): boolean {
    return this.routeIntelligencePanel.open
      && (
        (this.routeIntelligencePanel.source === 'matching' && this.activeTab === 'matching')
        || (
          this.routeIntelligencePanel.source === 'booking'
          && this.activeTab === 'direct'
          && this.activeDirectConsoleView === 'booking'
        )
      );
  }

  selectTab(tab: WorkspaceTab): void {
    if (!this.workspaceTabs.some((availableTab) => availableTab.id === tab)) return;
    this.activeTab = tab;
    if (tab === 'loads') this.loadConsoleView = 'active';
    if (tab === 'matching' && this.selectedRoom && !this.chatbbMessages.length && !this.chatbbLoading) this.loadChatbbThread();
    if (tab === 'direct' && this.activeDirectConsoleView === 'booking' && this.selectedRoom && !this.chatbbLoading) this.loadChatbbThread();
  }

  handleCompanySetupStatus(status: CompanySetupStatus): void {
    this.adminSetupStatus = status.status;
  }

  saveBrainSettings(): void {
    if (!this.canManageCompanySetup) return;

    this.brainSettingsMessage = '';
    this.brainSettingsError = '';

    if (this.brainSettingsForm.invalid) {
      this.brainSettingsError = 'Set audit retention to at least 1 day.';
      return;
    }

    const settings = this.brainSettingsForm.getRawValue();
    const payload: UpdateBrainSettingsPayload = {
      memoryMode: settings.memoryMode ?? 'off',
      auditRetentionDays: Number(settings.auditRetentionDays ?? 365),
      allowProviderTools: Boolean(settings.allowProviderTools),
    };

    this.brainSettingsSaving = true;
    this.brainApi.updateSettings(payload).pipe(
      finalize(() => {
        this.brainSettingsSaving = false;
      })
    ).subscribe({
      next: () => this.addSystemNotice('Brain settings saved.'),
      error: () => {
        this.brainSettingsError = 'Brain settings could not be saved right now.';
      },
    });
  }

  applyDispatchPrompt(prompt: string): void {
    this.dispatchNarrative = prompt;
    this.queueDispatchNarrativeResize();
  }

  handleDispatchNarrativeKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    this.submitNarrativeDispatch();
  }

  handleDispatchNarrativeInput(textarea?: HTMLTextAreaElement): void {
    this.resizeDispatchNarrativeInput(textarea);
  }

  selectDispatchSource(source: DispatchSource): void {
    this.dispatchSource = source;
    this.dispatchError = '';
    this.dispatchMessage = '';
    this.dispatchPreview = null;

    if (source === 'manual') {
      this.dispatchSourceMessage = 'Natural-language intake is active. Type the truck or load details and Prometheus will structure the post.';
      return;
    }

    const labels: Record<Exclude<DispatchSource, 'manual'>, string> = {
      excel: 'Excel upload',
      document: 'PDF / screenshot intake',
      tms: 'TMS import',
    };
    this.dispatchSourceMessage = `${labels[source]} is staged as the next connector block. The dispatch panel is ready for manual text intake now.`;
    this.appendDispatchBubble('assistant', this.dispatchSourceMessage, 'Dispatch bot');
  }

  resetDispatchNarrative(): void {
    this.dispatchPreview = null;
    this.dispatchError = '';
    this.dispatchMessage = '';
    this.seedDispatchNarrative(true);
    this.queueDispatchNarrativeResize();
    this.appendDispatchBubble('assistant', `The ${this.dispatchSingularLabel} draft was reset. Type a fresh note whenever you are ready.`, 'Dispatch bot');
  }

  submitNarrativeDispatch(): void {
    if (!this.user || this.dispatchSubmitting) return;

    this.dispatchError = '';
    this.dispatchMessage = '';

    const note = this.dispatchNarrative.trim();
    if (!note) {
      this.dispatchError = `Type the ${this.dispatchSingularLabel} details first.`;
      return;
    }

    this.appendDispatchBubble('user', note, 'You');
    const role = this.isBroker ? 'broker' : 'carrier';
    const parsed = this.dispatchIntake.parse(role, note);
    if (parsed.error || !parsed.draft) {
      this.dispatchPreview = null;
      this.dispatchError = parsed.error || 'Prometheus could not parse that dispatch note.';
      this.appendDispatchBubble('assistant', this.dispatchError, 'Dispatch bot');
      return;
    }

    const dispatchDraft = parsed.draft;
    this.dispatchPreview = dispatchDraft;
    this.dispatchSubmitting = true;

    forkJoin({
      origin: this.resolveDispatchPlace(dispatchDraft.origin),
      destination: dispatchDraft.destination ? this.resolveDispatchPlace(dispatchDraft.destination) : of(null),
    })
      .pipe(
        switchMap(({ origin, destination }) => {
          const requests = this.buildNarrativeDispatchRequests(dispatchDraft, origin, destination);
          return forkJoin(requests);
        }),
        finalize(() => (this.dispatchSubmitting = false))
      )
      .subscribe({
        next: (createdPosts) => {
          const noun = this.isBroker ? 'load' : 'truck';
          this.dispatchMessage = createdPosts.length === 1
            ? `1 ${noun} post was created from the dispatch block.`
            : `${createdPosts.length} ${this.dispatchRoleLabel} posts were created from the dispatch block.`;
          const createdLanes = createdPosts
            .slice(0, 5)
            .map((post, index) => `${index + 1}. ${this.formatLane(post)} | ${this.formatEquipment(post)} | ${this.formatMetric(post)}`)
            .join('\n');
          this.dispatchNarrative = '';
          this.appendDispatchBubble(
            'assistant',
            `${this.dispatchMessage}\n${dispatchDraft.summary}\nPrometheus is checking matches in the AI Transportation Center.`,
            'Dispatch bot'
          );
          this.appendMatchingBubble(
            'assistant',
            `Prometheus posted ${createdPosts.length} ${this.dispatchRoleLabel}.\n${createdLanes}\nI am checking for matching hazmat ${this.isBroker ? 'trucks' : 'loads'} now.`,
            'Prometheus'
          );
          this.queueDispatchNarrativeResize();
          this.selectedPostId = createdPosts[0]?._id ?? this.selectedPostId;
          this.refreshWorkspace();
        },
        error: (error) => {
          const backendMessage = Array.isArray(error?.error?.message) ? error.error.message.join(', ') : error?.error?.message;
          this.dispatchError = backendMessage || 'The dispatch note could not be turned into live posts.';
          this.appendDispatchBubble('assistant', this.dispatchError, 'Dispatch bot');
        },
      });
  }

  submitMatchingConsole(): void {
    const prompt = String(this.chatbbPrompt ?? '').trim();
    if (!prompt) return;

    if (this.handleMatchingConsoleCommand(prompt)) {
      this.chatbbPrompt = '';
      return;
    }

    if (this.isTransportationCenterPostPrompt(prompt)) {
      this.submitTransportationCenterPost(prompt);
      return;
    }

    if (this.shouldStagePromptAsImport(prompt)) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.chatbbPrompt = '';
      this.importMatchingConsoleText(prompt, 'pasted list');
      return;
    }

    this.sendBrainMatchingPrompt(prompt);
  }

  handleMatchingImportFile(file: File): void {
    if (!file) return;

    const fileName = file.name || 'uploaded file';
    this.appendMatchingBubble('user', `Import ${fileName}`, 'You');

    if (!this.isReadableTextImportFile(file)) {
      this.appendMatchingBubble('assistant', this.unsupportedImportFileMessage(file), 'Prometheus');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.importMatchingConsoleText(String(reader.result ?? ''), fileName);
    };
    reader.onerror = () => {
      this.appendMatchingBubble(
        'assistant',
        `I could not read ${fileName}. Try saving it as CSV or plain text, then import it again.`,
        'Prometheus'
      );
    };
    reader.readAsText(file);
  }

  importMatchingConsoleText(rawText: string, sourceLabel = 'pasted list'): void {
    const text = String(rawText ?? '').trim();
    if (!text) {
      this.pendingDispatchImport = null;
      this.appendMatchingBubble('assistant', 'I did not find any text in that import. Paste the rows or upload a CSV/text file and I will stage the drafts here.', 'Prometheus');
      return;
    }

    if (!this.user) {
      this.appendMatchingBubble('assistant', 'Sign in first and I can turn that list into draft posts for your desk.', 'Prometheus');
      return;
    }

    if (typeof this.dispatchIntake.parseBatch !== 'function') {
      this.appendMatchingBubble('assistant', 'The import parser is not available in this session yet. Paste one load or truck at a time and I can still help.', 'Prometheus');
      return;
    }

    const role = this.isBroker ? 'broker' : 'carrier';
    const result = this.dispatchIntake.parseBatch(role, text);
    if (!result.drafts.length) {
      this.pendingDispatchImport = null;
      this.appendMatchingBubble('assistant', this.buildEmptyImportMessage(sourceLabel, result.rejected), 'Prometheus');
      return;
    }

    this.pendingDispatchImport = {
      sourceLabel,
      role,
      drafts: result.drafts,
      rejected: result.rejected,
      createdAt: new Date().toISOString(),
    };
    this.appendMatchingBubble('assistant', this.buildImportReviewMessage(this.pendingDispatchImport), 'Prometheus');
  }

  private isTransportationCenterPostPrompt(prompt: string): boolean {
    if (typeof this.dispatchIntake.parse !== 'function') return false;

    const normalized = prompt.toLowerCase();
    if (/^\s*(find|search|show|do you have|what|where)\b/.test(normalized)) {
      return false;
    }

    const asksToPost = /\b(post|create|add)\b/.test(normalized);
    if (!asksToPost) return false;

    return this.isBroker
      ? /\b(load|loads|shipment|shipments|hazmat)\b/.test(normalized)
      : /\b(truck|trucks|driver|drivers|unit|ready|empty|available)\b/.test(normalized);
  }

  private shouldStagePromptAsImport(prompt: string): boolean {
    const normalized = prompt.toLowerCase();
    if (normalized.includes('\n')) return true;
    return /^(import|paste|uploaded|from email|from csv)\b/.test(normalized);
  }

  private isReadableTextImportFile(file: File): boolean {
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    return type.startsWith('text/')
      || name.endsWith('.csv')
      || name.endsWith('.tsv')
      || name.endsWith('.txt')
      || name.endsWith('.eml');
  }

  private unsupportedImportFileMessage(file: File): string {
    const name = (file.name || '').toLowerCase();
    if (file.type?.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(name)) {
      return [
        'I can receive the picture now, but OCR is not connected in this test slice yet.',
        'For this round, paste the load rows as text or upload CSV/text and I will stage drafts before anything goes live.',
        'The next provider/import slice can add picture OCR so screenshots become draft posts too.',
      ].join('\n');
    }

    if (/\.(xls|xlsx)$/i.test(name)) {
      return [
        'I can see the spreadsheet upload, but XLS/XLSX parsing is not connected yet.',
        'Export it as CSV for this test and I will read the rows into draft posts for approval.',
      ].join('\n');
    }

    if (/\.pdf$/i.test(name)) {
      return 'PDF intake is staged, but text extraction is not connected yet. Paste the email/list text or upload CSV/text and I will prepare the drafts.';
    }

    return 'I can import CSV, text, TSV, or email text right now. Save this file as CSV/text or paste the rows here and I will prepare draft posts.';
  }

  private buildImportReviewMessage(pending: PendingDispatchImport): string {
    const noun = pending.role === 'broker' ? 'load' : 'truck';
    const plural = `${noun}${pending.drafts.length === 1 ? '' : 's'}`;
    const rows = pending.drafts
      .slice(0, 6)
      .map((draft, index) => `${index + 1}. ${draft.summary}`)
      .join('\n');
    const rejectedLine = pending.rejected.length
      ? `\n${pending.rejected.length} row${pending.rejected.length === 1 ? '' : 's'} needs a little help. I will leave those out until you correct them.`
      : '';

    return [
      `I read ${pending.drafts.length} draft ${plural} from ${pending.sourceLabel}.`,
      rows,
      `${rejectedLine}`,
      'Nothing is live yet. Type "approve import" and I will post the clean drafts, or type "cancel import" and I will clear them.',
    ].filter(Boolean).join('\n');
  }

  private buildEmptyImportMessage(sourceLabel: string, rejected: DispatchImportRejectedRow[]): string {
    const examples = this.isBroker
      ? 'Example: Chicago, IL to Jacksonville, FL V53 42000 lbs $2500'
      : 'Example: truck Chicago, IL to Jacksonville, FL V53 42000 lbs';
    const rejectedPreview = rejected.length
      ? `\nI found ${rejected.length} row${rejected.length === 1 ? '' : 's'}, but they were missing city/state lane details.`
      : '';
    return `I looked at ${sourceLabel}, but I could not turn it into draft ${this.dispatchRoleLabel} yet.${rejectedPreview}\n${examples}`;
  }

  private submitTransportationCenterPost(note: string): void {
    if (!this.user || this.dispatchSubmitting) return;

    this.chatbbPrompt = '';
    this.chatbbError = '';
    this.dispatchError = '';
    this.dispatchMessage = '';
    this.appendMatchingBubble('user', note, 'You');

    const role = this.isBroker ? 'broker' : 'carrier';
    const parsed = this.dispatchIntake.parse(role, note);
    if (parsed.error || !parsed.draft) {
      this.dispatchPreview = null;
      this.dispatchError = parsed.error || 'Prometheus could not parse that dispatch note.';
      this.appendMatchingBubble(
        'assistant',
        `${this.dispatchError}\nSend it like: "post 1 ${this.isBroker ? 'load' : 'truck'} from Chicago, IL ${this.isBroker ? 'to Memphis, TN ' : ''}53 dry van hazmat 42000 lbs".`,
        'Prometheus'
      );
      return;
    }

    const dispatchDraft = parsed.draft;
    this.dispatchPreview = dispatchDraft;
    this.dispatchSubmitting = true;

    forkJoin({
      origin: this.resolveDispatchPlace(dispatchDraft.origin),
      destination: dispatchDraft.destination ? this.resolveDispatchPlace(dispatchDraft.destination) : of(null),
    })
      .pipe(
        switchMap(({ origin, destination }) => forkJoin(this.buildNarrativeDispatchRequests(dispatchDraft, origin, destination))),
        finalize(() => (this.dispatchSubmitting = false))
      )
      .subscribe({
        next: (createdPosts) => {
          const createdLanes = createdPosts
            .slice(0, 5)
            .map((post, index) => `${index + 1}. ${this.formatLane(post)} | ${this.formatEquipment(post)} | ${this.formatMetric(post)}`)
            .join('\n');
          this.dispatchNarrative = '';
          this.dispatchMessage = createdPosts.length === 1
            ? `Prometheus posted 1 ${this.isBroker ? 'load' : 'truck'}.`
            : `Prometheus posted ${createdPosts.length} ${this.dispatchRoleLabel}.`;
          this.selectedPostId = createdPosts[0]?._id ?? this.selectedPostId;
          this.appendMatchingBubble(
            'assistant',
            `${this.dispatchMessage}\n${dispatchDraft.summary}\n${createdLanes}\nI am checking for matching hazmat ${this.isBroker ? 'trucks' : 'loads'} now and I will keep this center updated when a better option appears.`,
            'Prometheus'
          );
          this.refreshWorkspace();
        },
        error: (error) => {
          const backendMessage = Array.isArray(error?.error?.message) ? error.error.message.join(', ') : error?.error?.message;
          this.dispatchError = backendMessage || 'The dispatch note could not be turned into a live post.';
          this.appendMatchingBubble('assistant', this.dispatchError, 'Prometheus');
        },
      });
  }

  useSavedTemplate(template: SavedDispatchTemplate): void {
    this.dispatchNarrative = template.prompt;
    this.queueDispatchNarrativeResize();
    this.activeTab = 'matching';
    this.appendMatchingBubble('assistant', `Template "${template.label}" is ready in the AI Transportation Center. Review it, adjust if needed, then send it as a post.`, 'Prometheus');
  }

  refreshWorkspace(): void {
    if (!this.user) return;
    this.loading = true;
    this.workspaceError = '';
    this.matchError = '';
    this.roomCreateError = '';
    this.roomCreateMessage = '';
    this.loadError = '';
    this.loadWorkspaceData(this.user, true);
  }

  selectPost(postId: string): void {
    const post = this.allWorkspacePosts.find((entry) => entry._id === postId);
    if (!post) return;
    this.selectedPostId = postId;
    this.selectedRoomId = '';
    this.rooms = [];
    this.previewDirectRooms = [];
    this.matchSnapshot = null;
    this.matchCandidates = [];
    this.directMessage = '';
    this.chatbbPrompt = '';
    this.matchError = '';
    this.roomCreateError = '';
    this.roomCreateMessage = '';
    this.resetChatbbState();
    this.appendMatchingBubble(
      'assistant',
      `Selected posting: ${this.formatLane(post)}.\nPrometheus is ranking hazmat counterpart options for this lane now. You can type "show matches", "book match 1", "save this as template", or "show my posted ${this.dispatchRoleLabel}".`,
      'Prometheus'
    );
    this.loadMatchCandidates(post);
    this.loadRooms(post);
  }

  selectRoom(roomId: string, force = false): void {
    const room = this.directBookingRooms.find((entry) => entry.id === roomId);
    if (!room || (!force && roomId === this.selectedRoomId)) return;
    this.selectedRoomId = roomId;
    this.selectedBrokerContactId = this.brokerDeskEntries.find((entry) => entry.roomId === roomId)?.id ?? roomId;
    this.directMessage = '';
    this.directMailMessage = '';
    this.directSetupPickerOpen = false;
    this.directDriverPickerOpen = false;
    this.directTrackingConfirmOpen = false;
    this.directCancelConfirmOpen = false;
    this.bookingAssistantAction = null;
    this.brokerInviteOpen = false;
    this.ensureDirectRoomWorkflow(room.id);
    if (this.isPreviewRoom(room.id)) {
      this.resetChatbbState();
      return;
    }
    if (this.roomUnreadCount(room) > 0) {
      this.messagesApi.clearCount(this.getPostPair(room)).subscribe({ next: () => this.updateSeenCounts(room.id, 0) });
    }
    this.loadRoomMessages(room);
    if (this.activeTab === 'matching' || (this.activeTab === 'direct' && this.activeDirectConsoleView === 'booking')) {
      this.loadChatbbThread();
    } else {
      this.resetChatbbState();
    }
  }

  selectDirectConsoleView(view: DirectConsoleView): void {
    this.activeDirectConsoleView = view;
    this.directSetupPickerOpen = false;
    this.directDriverPickerOpen = false;
    this.directTrackingConfirmOpen = false;
    this.directCancelConfirmOpen = false;
    this.bookingAssistantAction = null;
    this.brokerInviteOpen = false;
    if (view === 'booking' && this.selectedRoom) {
      this.loadChatbbThread();
    }
    if (view === 'company' && !this.selectedCompanyThreadId) {
      this.selectedCompanyThreadId = this.companyThreadSummaries[0]?.id ?? '';
    }
  }

  approveSelectedBooking(role: 'broker' | 'carrier'): void {
    const room = this.selectedRoom;
    if (!room) return;
    const workflow = this.ensureDirectRoomWorkflow(room.id);
    if (role === 'broker') workflow.brokerApproved = true;
    if (role === 'carrier') workflow.carrierApproved = true;
    this.persistDirectWorkflow();
    this.loadMessage = role === 'broker'
      ? 'Broker approval is marked. Prometheus can now ask the carrier to approve the booking.'
      : 'Carrier approval is marked. Both sides can move the booking into the booking console.';
    this.loadError = '';
  }

  confirmSelectedBookingApproval(): void {
    const room = this.selectedRoom;
    if (!room || !this.user) return;
    this.messagesApi.updateBookingStatus({
      brokerPostId: room.brokerPostId,
      carrierPostId: room.carrierPostId,
      action: 'approve',
    }).subscribe({
      next: (updated) => {
        this.applyUpdatedRoom(updated);
        this.loadError = '';
        if (updated.bookingStatus === 'booked') {
          this.loadMessage = 'Both sides approved. Prometheus is generating the live load in Booking Chat.';
          this.appendBookingAssistantMessage('assistant', 'Both sides approved the booking. I am generating the live load in Booking Chat now.');
          this.createLoadFromSelectedRoom(true);
          return;
        }
        this.loadMessage = 'Booking approval saved. Prometheus will ask the other side to approve.';
        this.appendBookingAssistantMessage('assistant', 'Your approval is saved. I will keep this booking here until the other side approves.');
      },
      error: () => {
        this.loadError = 'Prometheus could not save booking approval.';
      },
    });
  }

  cancelSelectedBookingApproval(): void {
    const room = this.selectedRoom;
    if (!room || !this.user) return;
    this.messagesApi.updateBookingStatus({
      brokerPostId: room.brokerPostId,
      carrierPostId: room.carrierPostId,
      action: 'cancel',
    }).subscribe({
      next: (updated) => {
        this.applyUpdatedRoom(updated);
        this.loadError = '';
        this.loadMessage = 'The offer was rejected for this booking.';
        this.appendBookingAssistantMessage('assistant', 'Offer rejected. This booking will not move forward unless a new booking is opened.');
      },
      error: () => {
        this.loadError = 'Prometheus could not cancel the booking approval.';
      },
    });
  }

  openBookingConfirmation(action: BookingConfirmationAction = 'approve'): void {
    const room = this.selectedRoom;
    if (!room) return;
    const openedAt = new Date();
    const expiresAt = new Date(openedAt.getTime() + 5 * 60 * 1000);
    this.bookingConfirmationWindow = {
      action,
      roomId: room.id,
      openedAt: openedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    this.bookingConfirmationSecondsRemaining = 300;
    this.loadError = '';
    this.startBookingConfirmationTimer();
    const actionLabel = action === 'approve' ? 'booking approval' : 'offer rejection';
    this.appendBookingAssistantMessage(
      'assistant',
      `Final confirmation window is open for this ${actionLabel}. It expires in 5 minutes.`
    );
  }

  acceptBookingConfirmation(now = new Date()): void {
    const confirmation = this.bookingConfirmationWindow;
    if (!confirmation) return;
    if (this.isBookingConfirmationExpired(now)) {
      this.expireBookingConfirmation();
      return;
    }
    this.selectedRoomId = confirmation.roomId;
    this.closeBookingConfirmation();
    if (confirmation.action === 'reject') {
      this.cancelSelectedBookingApproval();
      return;
    }
    this.confirmSelectedBookingApproval();
  }

  rejectBookingConfirmation(now = new Date()): void {
    const confirmation = this.bookingConfirmationWindow;
    if (!confirmation) return;
    if (this.isBookingConfirmationExpired(now)) {
      this.expireBookingConfirmation();
      return;
    }
    this.selectedRoomId = confirmation.roomId;
    this.closeBookingConfirmation();
    if (confirmation.action === 'reject') {
      this.appendBookingAssistantMessage('assistant', 'Booking approval is still pending. Nothing was rejected.');
      return;
    }
    this.cancelSelectedBookingApproval();
  }

  closeBookingConfirmation(): void {
    this.clearBookingConfirmationTimer();
    this.bookingConfirmationWindow = null;
    this.bookingConfirmationSecondsRemaining = 0;
  }

  formatBookingConfirmationTimer(): string {
    const seconds = Math.max(0, this.bookingConfirmationSecondsRemaining);
    const minutesPart = Math.floor(seconds / 60);
    const secondsPart = String(seconds % 60).padStart(2, '0');
    return `${minutesPart}:${secondsPart}`;
  }

  bookingConfirmationTitle(confirmation: BookingConfirmationWindow): string {
    return confirmation.action === 'reject' ? 'Confirm rejection' : 'Final confirmation';
  }

  bookingConfirmationBody(confirmation: BookingConfirmationWindow): string {
    if (confirmation.action === 'reject') {
      return 'Confirm rejecting this offer. Prometheus will cancel approval for both sides and keep this load out of Booking Chat.';
    }
    return 'Prometheus will only create the live Booking Chat load after both sides accept this booking.';
  }

  bookingConfirmationAcceptLabel(confirmation: BookingConfirmationWindow): string {
    return confirmation.action === 'reject' ? 'Confirm rejection' : 'Accept booking';
  }

  bookingConfirmationRejectLabel(confirmation: BookingConfirmationWindow): string {
    return confirmation.action === 'reject' ? 'Keep booking' : 'Reject booking';
  }

  private startBookingConfirmationTimer(): void {
    this.clearBookingConfirmationTimer();
    this.bookingConfirmationTimer = window.setInterval(() => {
      this.refreshBookingConfirmationTimer();
    }, 1000);
  }

  private clearBookingConfirmationTimer(): void {
    if (this.bookingConfirmationTimer === null) return;
    window.clearInterval(this.bookingConfirmationTimer);
    this.bookingConfirmationTimer = null;
  }

  private refreshBookingConfirmationTimer(now = new Date()): void {
    if (!this.bookingConfirmationWindow) return;
    const remaining = Math.ceil((new Date(this.bookingConfirmationWindow.expiresAt).getTime() - now.getTime()) / 1000);
    if (remaining <= 0) {
      this.expireBookingConfirmation();
      return;
    }
    this.bookingConfirmationSecondsRemaining = remaining;
  }

  private isBookingConfirmationExpired(now = new Date()): boolean {
    const confirmation = this.bookingConfirmationWindow;
    return !confirmation || new Date(confirmation.expiresAt).getTime() <= now.getTime();
  }

  private expireBookingConfirmation(): void {
    this.closeBookingConfirmation();
    this.loadError = 'The booking confirmation expired before it was accepted.';
    this.appendBookingAssistantMessage(
      'assistant',
      'The booking confirmation window expired. Ask Prometheus to book it again if this load is still good.'
    );
  }

  bookingAssistantActionClass(action: BookingAssistantAction): string {
    if (action.tone === 'primary' || action.type === 'approveBooking') return 'primary-button';
    if (action.tone === 'danger') return 'ghost-button status-button--danger';
    return 'secondary-button';
  }

  runBookingAssistantAction(action: BookingAssistantAction | BookingAssistantAction['type']): void {
    const actionType = typeof action === 'string' ? action : action.type;
    const actionValue = typeof action === 'string' ? undefined : action.value;
    const actionLabel = typeof action === 'string' ? undefined : action.label;
    if (typeof action !== 'string') {
      this.appendBookingAssistantMessage('user', action.label);
    }

    if (actionType === 'approveBooking') {
      this.openBookingConfirmation('approve');
      return;
    }
    if (actionType === 'rejectOffer') {
      this.openBookingConfirmation('reject');
      return;
    }
    if (actionType === 'chooseSetupProvider') {
      this.executeSetupProvider(actionValue || actionLabel || 'manual', actionLabel, typeof action === 'string' ? undefined : action.integrationChoice);
      return;
    }
    if (actionType === 'assignDriver') {
      const driver = this.driverRoster.find((entry) => entry.id === actionValue);
      if (driver) this.assignDriverToSelectedRoom(driver);
      return;
    }
    if (actionType === 'connectEld') {
      this.bookingAssistantAction = 'trackingApi';
      this.appendBookingAssistantMessage('assistant', 'Paste the ELD or tracking API token now. Prometheus will stage the connector and then ask if you want to allow tracking.');
      return;
    }
    if (actionType === 'sendMacroPoint') {
      this.executeTrackingProvider('macropoint', 'MacroPoint', { provider: 'macropoint', label: 'MacroPoint', category: 'tracking', source: 'broker' });
      return;
    }
    if (actionType === 'chooseTrackingProvider') {
      this.executeTrackingProvider(
        actionValue || (typeof action === 'string' ? 'tracking' : action.label),
        typeof action === 'string' ? 'Tracking provider' : action.label,
        typeof action === 'string' ? undefined : action.integrationChoice
      );
      return;
    }
    if (actionType === 'allowTracking') {
      this.handleTrackingAssist(true);
      return;
    }
    if (actionType === 'denyTracking') {
      this.handleTrackingAssist(false);
      return;
    }
    if (actionType === 'confirmDelivered') {
      this.confirmSelectedBookingDelivered();
      return;
    }
    if (actionType === 'rejectDelivered') {
      this.bookingAssistantAction = null;
      this.appendBookingAssistantMessage('assistant', 'Delivered was canceled. The load stays active in Booking chat.');
      return;
    }
    if (actionType === 'cancelWithTonu') {
      this.handleSelectedLoadCancellation(true);
      this.bookingAssistantAction = null;
      return;
    }
    if (actionType === 'cancelWithoutTonu') {
      this.handleSelectedLoadCancellation(false);
      this.bookingAssistantAction = null;
      return;
    }
    this.cancelSelectedBookingApproval();
  }

  openSelectedBookingConsole(): void {
    const room = this.selectedRoom;
    if (!room) return;
    const workflow = this.ensureDirectRoomWorkflow(room.id);
    if (!workflow.brokerApproved || !workflow.carrierApproved) {
      this.loadError = 'Both broker and carrier need to approve the booking before the booking console opens.';
      return;
    }
    workflow.consoleOpened = true;
    this.persistDirectWorkflow();
    this.activeDirectConsoleView = 'booking';
    this.loadChatbbThread();
    this.loadError = '';
    this.loadMessage = 'Booking console is live. Finish setup, assign the driver, and continue the room thread here.';
  }

  selectBrokerDeskEntry(entry: BrokerDeskEntry): void {
    this.selectedBrokerContactId = entry.id;
    this.brokerInviteOpen = false;
    this.directContactSearch = '';
    if (entry.roomId) {
      this.selectRoom(entry.roomId, true);
      return;
    }
    this.selectedRoomId = '';
    this.directMessage = '';
    this.resetChatbbState();
  }

  toggleBrokerInviteForm(): void {
    this.brokerInviteOpen = !this.brokerInviteOpen;
    if (!this.brokerInviteOpen) {
      this.resetBrokerInviteForm();
    }
  }

  saveBrokerInvite(): void {
    const contactName = this.brokerInviteForm.contactName.trim();
    const companyName = this.brokerInviteForm.companyName.trim();
    const email = this.brokerInviteForm.email.trim();
    const phone = this.brokerInviteForm.phone.trim();
    if (!contactName || !companyName || !email) {
      this.loadError = 'Broker name, company name, and email are required before Prometheus can stage an invite.';
      return;
    }

    const record: DirectContactRecord = {
      id: `broker-${Date.now()}`,
      roomId: null,
      companyName,
      contactName,
      email,
      phone,
      savedAt: new Date().toISOString(),
      status: 'pending',
      note: 'Invite staged. Prometheus can send an account invite when the broker connector is live.',
      muted: false,
      archived: false,
      deleted: false,
    };

    this.upsertDirectContact(record, 24);
    this.persistDirectContacts();
    this.selectedBrokerContactId = record.id;
    this.brokerInviteOpen = false;
    this.directContactSearch = '';
    this.resetBrokerInviteForm();
    this.loadError = '';
    this.loadMessage = `${companyName} is staged in Main chat. When the invite connector is live, Prometheus can send the broker invite from here.`;
  }

  saveBrokerDeskEntryContact(entry: BrokerDeskEntry): void {
    const record = this.createDirectContactRecordFromEntry(entry);
    this.upsertDirectContact({ ...record, archived: false, deleted: false }, 24);
    this.persistDirectContacts();
    this.selectedBrokerContactId = record.id;
    if (record.roomId) this.selectedRoomId = record.roomId;
    this.activeDirectConsoleView = 'main';
    this.brokerInviteOpen = false;
    this.directContactSearch = '';
    this.loadError = '';
    this.loadMessage = `${record.contactName || record.companyName} is saved in Direct Chat contacts.`;
  }

  muteSelectedBrokerConversation(): void {
    const entry = this.selectedBrokerDeskEntry;
    if (!entry) return;
    const record = this.createDirectContactRecordFromEntry(entry);
    this.upsertDirectContact({ ...record, muted: !record.muted, deleted: false }, 24);
    this.persistDirectContacts();
    this.selectedBrokerContactId = record.id;
    this.loadError = '';
    this.loadMessage = record.muted
      ? `${record.contactName || record.companyName} is unmuted.`
      : `${record.contactName || record.companyName} is muted.`;
  }

  archiveSelectedBrokerConversation(): void {
    const entry = this.selectedBrokerDeskEntry;
    if (!entry) return;
    const record = this.createDirectContactRecordFromEntry(entry);
    this.upsertDirectContact({ ...record, archived: true, deleted: false }, 24);
    this.persistDirectContacts();
    this.selectedBrokerContactId = record.id;
    this.loadError = '';
    this.loadMessage = `${record.contactName || record.companyName} is archived from the active Direct Chat list.`;
  }

  deleteSelectedBrokerConversation(): void {
    const entry = this.selectedBrokerDeskEntry;
    if (!entry) return;
    const record = this.createDirectContactRecordFromEntry(entry);
    this.upsertDirectContact({ ...record, muted: false, archived: false, deleted: true }, 24);
    this.persistDirectContacts();
    this.selectedBrokerContactId = '';
    this.selectedRoomId = '';
    this.directMessage = '';
    this.loadError = '';
    this.loadMessage = `${record.contactName || record.companyName} was removed from your Direct Chat contacts. Booking history stays protected.`;
  }

  chooseSetupProvider(provider: SetupProvider, displayLabel?: string): void {
    const room = this.selectedRoom;
    if (!room) return;
    const workflow = this.ensureDirectRoomWorkflow(room.id);
    const providerValue = this.stringValue(provider) || this.stringValue(displayLabel) || 'manual';
    workflow.setupProvider = providerValue;
    this.persistDirectWorkflow();
    this.directSetupPickerOpen = false;
    this.bookingAssistantAction = null;
    this.loadError = '';
    const label = this.stringValue(displayLabel) || this.setupProviderDisplayLabel(providerValue);
    this.persistSelectedBookingWorkflow('setup', {
      setupProvider: providerValue,
      setupLabel: label,
      setupSource: this.user?.role || 'manual',
    });
    this.loadMessage = `${label} setup is staged for ${room.contactName}. The live connector can plug into this button later.`;
    this.appendBookingAssistantMessage('assistant', `${label} setup is staged for this booking. Prometheus is ready for the next step.`);
  }

  private executeSetupProvider(provider: string, label?: string, choice?: RoomIntegrationChoice): void {
    const room = this.selectedRoom;
    if (!room) return;
    const fallbackLabel = this.stringValue(label) || this.setupProviderDisplayLabel(provider);
    const fallback = this.localIntegrationExecutionResult('setup', provider, fallbackLabel, choice);
    const execute = this.messagesApi.executeRoomIntegration?.bind(this.messagesApi);
    if (!execute) {
      this.applySetupExecution(fallback);
      return;
    }

    execute(this.roomIntegrationExecutionPayload(room, 'setup', provider, fallbackLabel, choice)).pipe(
      catchError((error) => {
        console.warn('Booking Chat setup provider execution failed; staging locally.', error);
        return of(fallback);
      })
    ).subscribe((result) => this.applySetupExecution(result));
  }

  handleTrackingAssist(shareTracking: boolean): void {
    const room = this.selectedRoom;
    if (!room) return;
    const workflow = this.ensureDirectRoomWorkflow(room.id);
    workflow.trackingShared = shareTracking;
    this.persistDirectWorkflow();
    this.persistSelectedBookingWorkflow('tracking', {
      trackingProvider: workflow.trackingProvider ?? undefined,
      trackingShared: shareTracking,
    });
    this.directTrackingConfirmOpen = false;
    this.bookingAssistantAction = null;
    this.loadError = '';
    this.loadMessage = shareTracking
      ? 'Tracking is marked as shared for this booking. The live ELD/tracking connector can hang off this action next.'
      : 'Tracking stays manual for this booking. Prometheus can keep guiding status updates in the booking lane.';
    this.appendBookingAssistantMessage(
      'assistant',
      shareTracking
        ? `Tracking is active${workflow.trackingProvider ? ` through ${workflow.trackingProvider}` : ''}.`
        : 'Tracking stays off for now. You can enable it later from the Track button.'
    );
    if (shareTracking) {
      this.openBookingRouteIntelligencePanel();
    }
  }

  private stageConnectedTrackingProvider(providerLabel: string): void {
    const room = this.selectedRoom;
    if (!room) return;
    const workflow = this.ensureDirectRoomWorkflow(room.id);
    workflow.trackingProvider = providerLabel;
    workflow.trackingShared = true;
    this.persistDirectWorkflow();
    this.persistSelectedBookingWorkflow('tracking', {
      trackingProvider: providerLabel,
      trackingShared: true,
    });
    this.bookingAssistantAction = null;
    this.directTrackingConfirmOpen = false;
    this.loadError = '';
    this.loadMessage = `${providerLabel} tracking is staged for this booking.`;
    this.appendBookingAssistantMessage('assistant', `${providerLabel} tracking is green for this booking.`);
    this.openBookingRouteIntelligencePanel();
  }

  private executeTrackingProvider(provider: string, label?: string, choice?: RoomIntegrationChoice): void {
    const room = this.selectedRoom;
    if (!room) return;
    const fallbackLabel = this.stringValue(label) || this.setupProviderDisplayLabel(provider);
    const fallback = this.localIntegrationExecutionResult(choice?.category === 'eld' ? 'eld' : 'tracking', provider, fallbackLabel, choice);
    const execute = this.messagesApi.executeRoomIntegration?.bind(this.messagesApi);
    if (!execute) {
      this.applyTrackingExecution(fallback);
      return;
    }

    execute(this.roomIntegrationExecutionPayload(room, fallback.category, provider, fallbackLabel, choice)).pipe(
      catchError((error) => {
        console.warn('Booking Chat tracking provider execution failed; staging locally.', error);
        return of(fallback);
      })
    ).subscribe((result) => this.applyTrackingExecution(result));
  }

  private roomIntegrationExecutionPayload(
    room: DirectRoom,
    category: RoomIntegrationChoice['category'],
    provider: string,
    label: string,
    choice?: RoomIntegrationChoice
  ): ExecuteRoomIntegrationPayload {
    return {
      ...this.getPostPair(room),
      category: choice?.category || category || 'manual',
      provider: this.stringValue(choice?.provider) || provider,
      label: this.stringValue(choice?.label) || label,
      source: choice?.source || 'manual',
    };
  }

  private localIntegrationExecutionResult(
    category: RoomIntegrationChoice['category'],
    provider: string,
    label: string,
    choice?: RoomIntegrationChoice
  ): RoomIntegrationExecutionResponse {
    const normalizedCategory = category || 'manual';
    const normalizedProvider = this.stringValue(choice?.provider) || provider || 'manual';
    const normalizedLabel = this.stringValue(choice?.label) || label || this.setupProviderDisplayLabel(normalizedProvider);
    const kind = normalizedCategory === 'setup' ? 'setup' : 'tracking';
    return {
      status: 'staged',
      mode: normalizedProvider === 'manual' ? 'manual' : 'placeholder',
      provider: normalizedProvider,
      label: normalizedLabel,
      category: normalizedCategory,
      source: choice?.source || 'manual',
      setupUrl: choice?.setupUrl,
      message: `${normalizedLabel} ${kind} is staged. Add live credentials in Company Integrations to send it through the provider automatically.`,
    };
  }

  private applySetupExecution(result: RoomIntegrationExecutionResponse): void {
    const room = this.selectedRoom;
    if (!room) return;
    if (result.status !== 'staged') {
      this.bookingAssistantAction = null;
      this.loadError = result.message || `${result.label} setup is not available yet.`;
      this.appendBookingAssistantMessage('assistant', this.loadError);
      return;
    }

    const workflow = this.ensureDirectRoomWorkflow(room.id);
    workflow.setupProvider = result.provider || result.label || 'manual';
    this.persistDirectWorkflow();
    this.persistSelectedBookingWorkflow('setup', {
      setupProvider: workflow.setupProvider,
      setupLabel: result.label || this.setupProviderDisplayLabel(workflow.setupProvider),
      setupSource: result.source,
    });
    this.directSetupPickerOpen = false;
    this.bookingAssistantAction = null;
    this.loadError = '';
    this.loadMessage = result.message;
    this.appendBookingAssistantMessage('assistant', result.message);
  }

  private applyTrackingExecution(result: RoomIntegrationExecutionResponse): void {
    const room = this.selectedRoom;
    if (!room) return;
    if (result.status !== 'staged') {
      this.bookingAssistantAction = null;
      this.loadError = result.message || `${result.label} tracking is not available yet.`;
      this.appendBookingAssistantMessage('assistant', this.loadError);
      return;
    }

    const workflow = this.ensureDirectRoomWorkflow(room.id);
    workflow.trackingProvider = result.label || result.provider || 'Tracking provider';
    workflow.trackingShared = true;
    this.persistDirectWorkflow();
    this.persistSelectedBookingWorkflow('tracking', {
      trackingProvider: workflow.trackingProvider,
      trackingSource: result.source,
      trackingShared: true,
    });
    this.bookingAssistantAction = null;
    this.directTrackingConfirmOpen = false;
    this.loadError = '';
    this.loadMessage = result.message;
    this.appendBookingAssistantMessage('assistant', result.message);
    this.openBookingRouteIntelligencePanel();
  }

  beginSetupAssist(): void {
    const room = this.selectedRoom;
    if (!room) return;
    this.directSetupPickerOpen = false;
    this.directDriverPickerOpen = false;
    this.directTrackingConfirmOpen = false;
    this.directCancelConfirmOpen = false;
    this.messagesApi.getRoomIntegrationChoices(this.getPostPair(room)).pipe(
      catchError((error) => this.handleRoomIntegrationLookupError(error))
    ).subscribe((choices) => {
      const setupChoices = this.activeRoomIntegrationChoices(choices?.setup);
      this.bookingAssistantAction = 'setupProvider';
      this.bookingSetupProviderActions = setupChoices.length
        ? setupChoices.map((choice) => ({
          type: 'chooseSetupProvider',
          label: choice.label,
          value: choice.provider,
          integrationChoice: choice,
        }))
        : this.defaultSetupProviderActions();
      this.appendBookingAssistantMessage(
        'assistant',
        setupChoices.length
          ? `Which setup method should I use for this broker? ${setupChoices.map((choice) => choice.label).join(', ')}.`
          : 'Which setup provider should be staged for this booking?'
      );
    });
  }

  beginDriverAssist(): void {
    if (!this.selectedRoom) return;
    this.directDriverPickerOpen = false;
    this.directSetupPickerOpen = false;
    this.directTrackingConfirmOpen = false;
    this.directCancelConfirmOpen = false;
    this.bookingAssistantAction = 'driverSelection';
    const drivers = this.driverRoster
      .map((driver) => `${driver.name} (${this.driverStatusLabel(driver.status)} / ${driver.location})`)
      .join(', ');
    this.appendBookingAssistantMessage('assistant', `Which driver and truck should I assign? Available now: ${drivers}.`);
  }

  beginTrackingAssist(): void {
    const room = this.selectedRoom;
    if (!room) return;
    this.directTrackingConfirmOpen = false;
    this.directDriverPickerOpen = false;
    this.directSetupPickerOpen = false;
    this.directCancelConfirmOpen = false;
    const workflow = this.ensureDirectRoomWorkflow(room.id);
    if (workflow.trackingShared) {
      this.bookingAssistantAction = null;
      this.appendBookingAssistantMessage('assistant', `Tracking is already active${workflow.trackingProvider ? ` through ${workflow.trackingProvider}` : ''}.`);
      this.openBookingRouteIntelligencePanel();
      return;
    }
    if (!workflow.trackingProvider) {
      this.messagesApi.getRoomIntegrationChoices(this.getPostPair(room)).pipe(
        catchError((error) => this.handleRoomIntegrationLookupError(error))
      ).subscribe((choices) => {
        const trackingChoices = this.activeRoomIntegrationChoices(choices?.tracking);
        this.bookingAssistantAction = 'trackingConnect';
        this.bookingTrackingProviderActions = trackingChoices.length
          ? trackingChoices.map((choice) => ({
            type: 'chooseTrackingProvider',
            label: choice.label,
            value: choice.provider,
            integrationChoice: choice,
          }))
          : this.defaultTrackingProviderActions();
        this.appendBookingAssistantMessage(
          'assistant',
          trackingChoices.length
            ? `Tracking can be started through broker tracking or carrier ELD. Which one should I use? ${trackingChoices.map((choice) => choice.label).join(', ')}.`
            : 'Tracking is still red. Connect your ELD/API or send MacroPoint?'
        );
      });
      return;
    }
    this.bookingAssistantAction = 'trackingAllow';
    this.appendBookingAssistantMessage('assistant', `The ${workflow.trackingProvider} connection is ready. Do you want to allow tracking for this truck? Reply yes or no.`);
  }

  openSelectedBookingRouteMap(): void {
    if (!this.selectedRoom) return;
    this.directSetupPickerOpen = false;
    this.directDriverPickerOpen = false;
    this.directTrackingConfirmOpen = false;
    this.directCancelConfirmOpen = false;
    this.bookingAssistantAction = null;
    this.openBookingRouteIntelligencePanel();
  }

  beginCancellationAssist(): void {
    if (!this.selectedRoom) return;
    if (!this.selectedRoomLoad) {
      this.loadError = '';
      this.bookingAssistantAction = null;
      this.appendBookingAssistantMessage('assistant', this.noLiveLoadCancellationMessage);
      return;
    }
    this.directCancelConfirmOpen = false;
    this.directDriverPickerOpen = false;
    this.directSetupPickerOpen = false;
    this.directTrackingConfirmOpen = false;
    this.bookingAssistantAction = 'cancelTonu';
    this.appendBookingAssistantMessage('assistant', 'The load is being canceled. Is this waiting on TONU or accessorials, or should Prometheus cancel the active load now?');
  }

  markSelectedBookingDelivered(): void {
    if (!this.selectedRoomLoad) {
      this.loadError = '';
      this.appendBookingAssistantMessage('assistant', 'I need a live load in Booking Chat before I can mark it delivered.');
      return;
    }
    this.bookingAssistantAction = 'deliverConfirm';
    this.appendBookingAssistantMessage(
      'assistant',
      this.selectedRoomTrackingReady
        ? 'Do you want to mark this load delivered and move it to Ready to bill?'
        : 'Tracking is still red. If the broker waived tracking, mark delivered anyway. Otherwise enable tracking first.'
    );
  }

  assignDriverToSelectedRoom(driver: DriverRosterItem): void {
    const room = this.selectedRoom;
    if (!room) return;
    const workflow = this.ensureDirectRoomWorkflow(room.id);
    this.loadError = '';

    if (!this.selectedRoomLoad) {
      workflow.driverId = driver.id;
      workflow.driverName = driver.name;
      workflow.truckLabel = driver.truckLabel;
      this.persistDirectWorkflow();
      this.persistSelectedBookingWorkflow('driver', {
        driverId: driver.id,
        driverName: driver.name,
        truckLabel: driver.truckLabel,
      });
      this.directDriverPickerOpen = false;
      this.bookingAssistantAction = null;
      this.loadMessage = `${driver.name} is staged for this booking. Move the room into Loads Console to persist the driver assignment.`;
      this.appendBookingAssistantMessage('assistant', `${driver.name} is staged for this booking. Move the room into Loads Console when you are ready.`);
      return;
    }

    this.loadMessage = '';
    this.loadActionPendingId = this.selectedRoomLoad._id;
    this.loadsApi.updateLoad(this.selectedRoomLoad._id, {
      driverName: driver.name,
      truckLabel: driver.truckLabel,
    }).pipe(finalize(() => (this.loadActionPendingId = ''))).subscribe({
      next: (load) => {
        workflow.driverId = driver.id;
        workflow.driverName = driver.name;
        workflow.truckLabel = driver.truckLabel;
        this.persistDirectWorkflow();
        this.persistSelectedBookingWorkflow('driver', {
          driverId: driver.id,
          driverName: driver.name,
          truckLabel: driver.truckLabel,
        });
        this.directDriverPickerOpen = false;
        this.bookingAssistantAction = null;
        this.loads = this.loads.map((entry) => entry._id === load._id ? load : entry);
        this.loadMessage = `${driver.name} is assigned to ${load.reference}.`;
        this.appendBookingAssistantMessage('assistant', `${driver.name} is now assigned to ${load.reference}.`);
      },
      error: (error) => {
        const backendMessage = Array.isArray(error?.error?.message) ? error.error.message.join(', ') : error?.error?.message;
        this.loadError = backendMessage || 'Prometheus could not save that driver assignment.';
      },
    });
  }

  saveCurrentBrokerContact(): void {
    const room = this.selectedRoom;
    if (!room) return;

    const nextRecord: DirectContactRecord = {
      id: this.selectedRoomContactRecord?.id ?? `contact-${room.id}`,
      roomId: room.id,
      companyName: room.companyName,
      contactName: room.contactName,
      email: room.contactEmail,
      phone: room.contactPhone,
      savedAt: new Date().toISOString(),
      status: 'saved',
      muted: false,
      archived: false,
      deleted: false,
    };

    this.upsertDirectContact(nextRecord, 18);
    this.persistDirectContacts();
    const workflow = this.ensureDirectRoomWorkflow(room.id);
    workflow.contactSaved = true;
    this.persistDirectWorkflow();
    this.persistSelectedBookingWorkflow('contact', {
      contactSaved: true,
      contactName: nextRecord.contactName,
      contactEmail: nextRecord.email,
    });
    this.selectedBrokerContactId = nextRecord.id;
    this.activeDirectConsoleView = 'main';
    this.loadError = '';
    this.loadMessage = `${room.contactName || room.companyName} is now saved in Direct Chat contacts.`;
    this.appendBookingAssistantMessage('assistant', `${room.contactName || room.companyName} is now saved in Main chat contacts.`);
  }

  sendSelectedLoadToLoadsConsole(): void {
    if (!this.selectedRoomCanSendToLoadsConsole || !this.selectedRoomLoad) {
      this.loadError = 'Mark this booking delivered before sending it to Loads Console.';
      return;
    }
    this.loadError = '';
    this.loadMessage = `${this.selectedRoomLoad.reference} is ready in Loads Console.`;
    this.persistSelectedBookingWorkflow('readyToBill', { readyToBill: true });
    this.activeTab = 'loads';
    this.loadConsoleView = 'readyToBill';
  }

  sendDirectMail(): void {
    const room = this.selectedRoom;
    const body = this.directMailMessage.trim();
    if (!room || !body) return;

    const target = room.contactEmail || this.selectedRoomContactRecord?.email || 'broker email pending';
    const entry: DirectMailEntry = {
      id: `mail-${Date.now()}`,
      author: 'You',
      text: body,
      direction: 'outbound',
      date: new Date().toISOString(),
      target,
    };
    this.directMailThreads = {
      ...this.directMailThreads,
      [room.id]: [...(this.directMailThreads[room.id] ?? []), entry],
    };
    this.persistDirectMailThreads();
    this.directMailMessage = '';
    this.loadError = '';
    this.loadMessage = `Mail thread staged for ${target}. The live email connector can send this from the same panel later.`;
  }

  handleDirectMailComposerKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    this.sendDirectMail();
  }

  selectCompanyThread(threadId: string): void {
    this.selectedCompanyThreadId = threadId;
  }

  sendCompanyMessage(): void {
    const thread = this.selectedCompanyThread;
    const body = this.companyMessage.trim();
    if (!thread || !body) return;

    const entry: CompanyThreadMessage = {
      id: `company-${Date.now()}`,
      author: 'You',
      text: body,
      sender: 'me',
      date: new Date().toISOString(),
    };

    this.companyChatThreads = {
      ...this.companyChatThreads,
      [thread.id]: [...(this.companyChatThreads[thread.id] ?? []), entry],
    };
    this.persistCompanyChatThreads();
    this.companyMessage = '';
  }

  handleCompanyComposerKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    this.sendCompanyMessage();
  }

  handleSelectedLoadCancellation(waitingOnTonu: boolean): void {
    const room = this.selectedRoom;
    const load = this.selectedRoomLoad;
    if (!room || !load) {
      this.directCancelConfirmOpen = false;
      this.loadError = 'Move this booking into Loads Console before you cancel it.';
      return;
    }

    this.directCancelConfirmOpen = false;
    if (waitingOnTonu) {
      this.updateLoadBoardStatus(
        load._id,
        'library',
        'Waiting on TONU after broker cancellation.',
        () => {
          this.persistSelectedBookingWorkflow('cancelled', {
            cancellationMode: 'tonu',
            cancellationNote: 'Waiting on TONU after broker cancellation.',
          });
          this.appendBookingAssistantMessage('assistant', 'The load will stay in Library while you wait on TONU.');
        }
      );
      return;
    }

    this.loadError = '';
    this.loadMessage = '';
    this.loadActionPendingId = load._id;
    this.loadsApi.deleteLoad(load._id).pipe(finalize(() => (this.loadActionPendingId = ''))).subscribe({
      next: () => {
        this.loads = this.loads.filter((entry) => entry._id !== load._id);
        this.persistSelectedBookingWorkflow('cancelled', {
          cancellationMode: 'cancelled',
          cancellationNote: 'Canceled from Booking chat.',
        });
        this.loadMessage = `${load.reference} was canceled and removed from Loads Console.`;
        this.appendBookingAssistantMessage('assistant', `${load.reference} was canceled and removed from Loads Console.`);
      },
      error: (error) => {
        const backendMessage = Array.isArray(error?.error?.message) ? error.error.message.join(', ') : error?.error?.message;
        this.loadError = backendMessage || 'Prometheus could not remove that load.';
      },
    });
  }

  startNewDispatch(): void {
    const defaults = this.getStoredDispatchDefaults();
    this.dispatchMode = 'create';
    this.dispatchError = '';
    this.dispatchMessage = '';
    this.dispatchForm.reset({
      capacity: 'full',
      equipmentPreset: '',
      length: defaults.length ?? '',
      weight: defaults.weight ?? '',
      contact: defaults.contact ?? '',
      refNum: '',
      comment: '',
      rate: '',
      bookUrl: '',
      pickupDate: '',
      deliveryDate: '',
      startDate: '',
      endDate: '',
      tankerEndorsement: false,
      nonHazmat: false,
      team: false,
      nonTanker: false,
      origin: { city: '', state: '', lat: '', lng: '' },
      destination: { city: '', state: '', lat: '', lng: '' },
    });
  }

  loadSelectedPostIntoDispatch(): void {
    const post = this.selectedPost;
    if (!post) {
      this.dispatchError = 'Select a post from the live board before loading edit mode.';
      return;
    }
    const canEdit = this.isPostOwnedByCurrentUser(post);
    const brokerStops = Array.isArray(post['stops']) ? (post['stops'] as Array<Record<string, unknown>>) : [];
    const pickupStop = brokerStops[0] ?? null;
    const deliveryStop = brokerStops[brokerStops.length - 1] ?? null;
    this.dispatchMode = canEdit ? 'edit' : 'create';
    this.dispatchError = '';
    this.dispatchMessage = canEdit
      ? ''
      : 'Prometheus copied this team posting into the AI Transportation Center as a new draft. The original posting stays unchanged.';
    this.dispatchForm.patchValue({
      capacity: typeof post.capacity === 'string' ? post.capacity : 'full',
      equipmentPreset: this.findEquipmentPreset(post.equipment),
      length: this.asNumberOrNull(post.length) ?? '',
      weight: this.asNumberOrNull(post.weight) ?? '',
      contact: this.stringValue(post['contact']),
      refNum: this.stringValue(post['refNum']),
      comment: this.stringValue(post.comment),
      rate: this.asNumberOrNull(post.rate) ?? '',
      bookUrl: this.stringValue(post['bookUrl']),
      pickupDate: this.isoDateValue(this.dateValue(pickupStop?.['startDate']) ?? post.startDate ?? post.publishedAt),
      deliveryDate: this.isoDateValue(this.dateValue(deliveryStop?.['startDate']) ?? post.endDate ?? post.publishedAt),
      startDate: this.isoDateValue(post.startDate),
      endDate: this.isoDateValue(post.endDate),
      tankerEndorsement: Boolean(post['tankerEndorsement']),
      nonHazmat: Boolean(post['nonHazmat']),
      team: Boolean(post['team']),
      nonTanker: Boolean(post['nonTanker']),
      origin: this.extractPlaceFormValue(post.origin),
      destination: this.extractPlaceFormValue(post.destination),
    });
  }

  submitDispatch(): void {
    if (!this.user || this.dispatchSubmitting) return;
    this.dispatchError = '';
    this.dispatchMessage = '';
    this.dispatchForm.markAllAsTouched();
    if (this.dispatchForm.invalid) {
      this.dispatchError = 'Complete the required dispatch fields before submitting.';
      return;
    }
    const request$ = this.isBroker ? this.submitBrokerDispatch() : this.submitCarrierDispatch();
    if (!request$) return;
    this.dispatchSubmitting = true;
    request$.pipe(finalize(() => (this.dispatchSubmitting = false))).subscribe({
      next: (post) => {
        this.dispatchMessage = this.dispatchMode === 'edit'
          ? 'The selected post was updated. Prometheus is checking matches now.'
          : 'The new post was created. Prometheus is checking matches now.';
        this.saveDispatchDefaults();
        this.selectedPostId = post._id;
        this.refreshWorkspace();
      },
      error: (error) => {
        const backendMessage = Array.isArray(error?.error?.message) ? error.error.message.join(', ') : error?.error?.message;
        this.dispatchError = backendMessage || 'The dispatch post could not be saved.';
      },
    });
  }

  createRoomFromCandidate(candidate: WorkspacePost, sourcePost = this.selectedPost): void {
    const selectedPost = sourcePost;
    const candidateId = candidate._id;
    const otherUserId = this.stringValue(candidate.publisherId);
    if (!selectedPost || !candidateId || !otherUserId || this.roomCreatePendingId) return;
    this.roomCreateError = '';
    this.roomCreateMessage = '';
    this.roomCreatePendingId = candidateId;
    this.messagesApi.createRoom({
      myPostId: selectedPost._id,
      otherPostId: candidateId,
      otherUserId,
    }).pipe(finalize(() => (this.roomCreatePendingId = ''))).subscribe({
      next: (response) => {
        this.roomCreateMessage = response.created
          ? 'Prometheus started the broker-carrier booking conversation for this match.'
          : 'That booking conversation already existed. Prometheus loaded the existing room.';
        this.appendMatchingBubble('assistant', this.roomCreateMessage, 'Prometheus');
        this.activeTab = 'direct';
        this.activeDirectConsoleView = 'booking';
        this.loadRooms(selectedPost, candidateId);
      },
      error: () => {
        this.roomCreateError = 'The booking conversation could not be created from this match.';
        this.appendMatchingBubble('assistant', this.roomCreateError, 'Prometheus');
      },
    });
  }

  refreshSelectedPostMatches(): void {
    if (this.selectedPost) {
      this.loadMatchCandidates(this.selectedPost);
    }
  }

  createRoomFromMatchCandidate(candidate: MatchCandidate, sourcePost = this.selectedPost): void {
    const asWorkspacePost: WorkspacePost = {
      _id: candidate.matchPostId,
      publisherId: candidate.summary.publisherId,
      origin: { type: 'place', place: candidate.summary.lane.origin },
      destination: { type: 'place', place: candidate.summary.lane.destination },
      equipment: candidate.summary.equipment,
      weight: candidate.summary.weight,
      rate: candidate.summary.rate,
      publishedAt: candidate.summary.publishedAt,
      refNum: candidate.summary.reference,
    };
    this.createRoomFromCandidate(asWorkspacePost, sourcePost);
  }

  sendDirectMessage(): void {
    const message = this.directMessage.trim();
    const room = this.selectedBrokerRoom;
    if (!message || !room || !this.user) return;
    if (this.isPreviewRoom(room.id)) {
      this.appendLocalDirectMessage(room, message);
      return;
    }
    this.messagesApi.createMessage({ ...this.getPostPair(room), text: message, type: 'message', role: this.user.role }).subscribe({
      next: () => {
        const nextMessage: DirectMessage = { text: message, type: 'message', role: this.user?.role ?? '', date: new Date().toISOString() };
        this.updateRoomMessages(room.id, [...room.messages, nextMessage]);
        this.directMessage = '';
      },
      error: () => { this.workspaceError = 'The direct message could not be sent.'; },
    });
  }

  private appendLocalDirectMessage(room: DirectRoom, message: string): void {
    const nextMessage: DirectMessage = {
      text: message,
      type: 'message',
      role: this.user?.role ?? '',
      date: new Date().toISOString(),
    };
    this.updateRoomMessages(room.id, [...room.messages, nextMessage]);
    this.directMessage = '';
    this.workspaceError = '';
  }

  handleDirectComposerKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    this.sendDirectMessage();
  }

  sendChatbbMessage(promptText?: string): void {
    const prompt = String(promptText ?? this.chatbbPrompt ?? '').trim();
    const room = this.selectedRoom;
    if (!prompt || !room || this.chatbbLoading) return;
    if (this.activeTab === 'direct' && this.activeDirectConsoleView === 'booking' && this.handleBookingAssistantWorkflow(prompt)) {
      this.chatbbPrompt = '';
      return;
    }
    this.chatbbLoading = true;
    this.chatbbError = '';
    this.chatbbApi.createMessage({ ...this.getPostPair(room), prompt }).pipe(finalize(() => (this.chatbbLoading = false))).subscribe({
      next: (response) => {
        this.chatbbMessages = [...this.chatbbMessages, response.userMessage, response.assistantMessage].filter((message) => message.sender !== 'system');
        this.chatbbPrompt = '';
      },
      error: (error) => {
        this.chatbbError = this.backendErrorMessage(error) || 'Prometheus could not answer right now. Try again.';
      },
    });
  }

  handleChatbbAction(action: ChatbbAction): void {
    const type = String(action.type ?? '');
    if (type === 'draft_counter_offer' || type === 'draft_availability_check') {
      const latestAssistant = [...this.chatbbMessages].reverse().find((message) => message.sender === 'assistant');
      const draft = latestAssistant?.plan?.draftMessage ?? '';
      this.directMessage = draft;
      this.chatbbPrompt = '';
      this.chatbbError = '';
      this.appendMatchingBubble('assistant', 'I placed the draft in the message box. Press Send only after you review it.', 'Prometheus');
      return;
    }

    if (type === 'show_top_bids' || type === 'review_recent_options' || type === 'summarize_room') {
      this.chatbbPrompt = action.label;
      this.sendChatbbMessage(action.label);
      return;
    }

    this.chatbbError = 'Prometheus can draft this action, but it needs a mapped workflow before it can run.';
  }

  signOut(): void { this.session.signOut().subscribe(() => this.router.navigate(['/sign-in'])); }
  trackByPostId(_: number, post: WorkspacePost): string { return post._id; }
  trackByRoomId(_: number, room: DirectRoom): string { return room.id; }
  trackByCandidateId(_: number, candidate: MatchCandidate): string { return candidate.matchPostId; }
  trackByChatMessage(index: number, message: ChatbbThreadMessage): string { return `${message.createdAt}-${index}`; }
  trackByDirectMessage(index: number, message: DirectMessage): string { return `${message.date ?? 'pending'}-${index}`; }
  trackByContactId(_: number, contact: DirectContactRecord): string { return contact.id; }
  trackByMailEntryId(_: number, entry: DirectMailEntry): string { return entry.id; }
  trackByCompanyMessage(_: number, entry: CompanyThreadMessage): string { return entry.id; }
  trackByConsoleBubble(_: number, bubble: ConsoleBubble): string { return bubble.id; }
  trackByBrokerDeskEntry(_: number, entry: BrokerDeskEntry): string { return entry.id; }
  trackByCompanyThread(_: number, entry: CompanyThreadSummary): string { return entry.id; }
  trackByBookingAssistant(_: number, entry: BookingAssistantEntry): string { return entry.id; }
  bookingStatusLabel(room: DirectRoom | null | undefined): string {
    const status = room?.bookingStatus ?? 'negotiating';
    const labels: Record<string, string> = {
      negotiating: 'Approval pending',
      booked: 'Booked',
      cancelled: 'Cancelled',
      delivered: 'Delivered',
    };
    return labels[status] ?? 'Approval pending';
  }
  closeRouteIntelligencePanel(): void {
    this.routeIntelligencePanel = { ...this.routeIntelligencePanel, open: false };
  }
  formatRouteMiles(value: number | null): string {
    return typeof value === 'number' ? `${value.toLocaleString('en-US')} mi` : 'Not available';
  }
  formatRouteMoney(value: number | null): string {
    return typeof value === 'number' ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'Not available';
  }
  formatRouteRatePerMile(rate: number | null, miles: number | null = this.routeIntelligencePanel.loadedMiles): string {
    if (typeof rate !== 'number' || typeof miles !== 'number' || miles <= 0) return 'Not available';
    return `$${(rate / miles).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mi`;
  }
  routeTrackingLabel(): string {
    const panel = this.routeIntelligencePanel;
    if (panel.trackingStatus === 'live') {
      return panel.trackingProvider ? `Tracking connected via ${panel.trackingProvider}` : 'Tracking connected';
    }
    if (panel.trackingStatus === 'connected') {
      return panel.trackingProvider ? `${panel.trackingProvider} connected` : 'Tracking connected';
    }
    return 'Tracking not connected';
  }
  formatCurrency(value: number | null): string {
    return typeof value === 'number' ? `$${value.toLocaleString('en-US')}` : 'No rate yet';
  }
  formatMetric(post: WorkspacePost | null): string {
    if (!post) return 'No data';
    if (this.isBroker) {
      const rate = this.asNumberOrNull(post.rate);
      return rate !== null ? `$${rate.toLocaleString('en-US')}` : 'Rate not posted';
    }
    const weight = this.asNumberOrNull(post.weight);
    return weight !== null ? `${weight.toLocaleString('en-US')} lbs` : 'Weight not posted';
  }
  formatCounterpartMetric(post: WorkspacePost | null): string {
    if (!post) return 'No data';
    if (this.isBroker) {
      const weight = this.asNumberOrNull(post.weight);
      return weight !== null ? `${weight.toLocaleString('en-US')} lbs` : 'Weight not posted';
    }
    const rate = this.asNumberOrNull(post.rate);
    return rate !== null ? `$${rate.toLocaleString('en-US')}` : 'Rate not posted';
  }
  formatPostMoment(post: WorkspacePost | null): string {
    const value = post?.publishedAt ?? post?.startDate ?? post?.endDate ?? null;
    return value ? this.formatTimestamp(value) : 'No timing available';
  }
  roomUnreadCount(room: DirectRoom): number { return !this.user ? 0 : this.user.role === 'broker' ? room.seen.brokerCount : room.seen.carrierCount; }
  roomExistsForPost(postId: string): boolean { return this.rooms.some((room) => room.id === postId); }
  matchActionLabel(candidate: WorkspacePost): string {
    if (this.roomCreatePendingId === candidate._id) return 'Opening...';
    if (this.roomExistsForPost(candidate._id)) return candidate._id === this.selectedRoomId ? 'Open room' : 'Open existing';
    return 'Create room';
  }
  formatCounterpartyName(post: WorkspacePost): string {
    const contact = [post.userData?.firstName, post.userData?.lastName].filter(Boolean).join(' ').trim();
    return contact || this.stringValue(post.companyName) || 'Direct counterparty';
  }
  formatCounterpartyCompany(post: WorkspacePost): string {
    return this.stringValue(post.companyName)
      || this.stringValue(post.companyData?.name)
      || 'Unknown company';
  }
  formatLane(post: WorkspacePost | null): string { return !post ? 'Select a post' : `${this.formatLocation(post.origin)} -> ${this.formatLocation(post.destination)}`; }
  formatEquipment(post: WorkspacePost | null): string {
    if (!post) return 'No equipment';
    const equipment = Array.isArray(post.equipment) ? post.equipment.filter((item): item is string => typeof item === 'string' && !!item.trim()) : [];
    const label = equipment.length ? equipment.join(', ') : 'Unspecified equipment';
    const length = this.asNumberOrNull(post.length);
    return length !== null ? `${label} ${length}'` : label;
  }
  formatTimestamp(value: string | null | undefined): string {
    if (!value) return 'No activity yet';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'No activity yet';
    return parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  formatChatTime(value: string | Date | null | undefined): string {
    return formatChatTimeLabel(value);
  }
  bookingRoomTone(roomId: string | null | undefined): string {
    if (!roomId) return '';
    const index = this.directBookingRooms.findIndex((room) => room.id === roomId);
    if (index < 0) return '';
    return ['booking-tone--a', 'booking-tone--b', 'booking-tone--c'][index % 3];
  }
  bookingRoomMetaItems(room: DirectRoom | null | undefined): string[] {
    return this.getBookingRoomMetaItems(room);
  }
  bookingRoomRateLabel(room: DirectRoom | null | undefined): string {
    const bid = room?.maxBid;
    return typeof bid === 'number' ? `$${bid.toLocaleString('en-US')}` : '';
  }
  brokerDeskInitials(entry: BrokerDeskEntry | null | undefined): string {
    if (!entry?.contactName?.trim()) return '?';
    const parts = entry.contactName.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
  }
  brokerDeskStatusLabel(entry: BrokerDeskEntry): string {
    if (entry.archived) return 'Archived';
    if (entry.muted) return 'Muted';
    if (entry.status === 'pending') return 'Pending';
    if (entry.unread > 0) return `${entry.unread} new`;
    return 'Open';
  }
  companyThreadInitials(thread: CompanyThreadSummary | null | undefined): string {
    if (!thread?.name?.trim()) return '?';
    const parts = thread.name.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
  }
  companyThreadStatusLabel(thread: CompanyThreadSummary): string {
    if (thread.unread > 0) return `${thread.unread} new`;
    return 'Open';
  }
  driverStatusLabel(status: DriverRosterItem['status']): string {
    if (status === 'ready') return 'Ready';
    if (status === 'enRoute') return 'En route';
    return 'On break';
  }
  driverStatusTone(status: DriverRosterItem['status']): 'active' | 'warning' | 'muted' {
    if (status === 'ready') return 'active';
    if (status === 'enRoute') return 'warning';
    return 'muted';
  }

  openLoadBoardPost(postId: string): void {
    this.selectPost(postId);
  }

  openLoadBoardChat(postId: string): void {
    this.selectPost(postId);
    this.activeTab = 'direct';
  }

  selectLoadConsoleView(view: LoadConsoleView): void {
    this.loadConsoleView = this.loadConsoleView === view ? 'active' : view;
  }

  requestTeamLoadAccess(item: LoadBoardItem): void {
    if (!item.loadId || this.loadActionPendingId) return;

    this.loadError = '';
    this.loadMessage = '';
    this.accessRequestLoad = null;
    this.accessVerificationCode = '';

    if (item.isMine) {
      this.loadMessage = `${item.reference} is already assigned to your desk.`;
      return;
    }

    if (item.myPendingAccessRequest) {
      this.loadMessage = `Access request is already waiting for ${item.dispatcherName} on ${item.reference}.`;
      return;
    }

    this.loadActionPendingId = item.loadId;
    this.loadsApi.requestLoadAccess(item.loadId, {
      note: 'Requesting access from Loads Console.',
    }).pipe(finalize(() => (this.loadActionPendingId = ''))).subscribe({
      next: (load) => {
        this.replaceLoad(load);
        this.loadMessage = `Access request sent to ${this.loadDispatcherName(load)} for ${this.buildLoadReference(load)}.`;
      },
      error: (error) => {
        this.loadError = this.backendErrorMessage(error) || 'Prometheus could not request access to that load.';
      },
    });
  }

  cancelTeamLoadAccess(): void {
    this.accessRequestLoad = null;
    this.accessVerificationCode = '';
  }

  verifyTeamLoadAccess(): void {
    this.loadError = '';
    this.loadMessage = 'Load access now uses owner or manager approval from the Loads Console.';
    this.accessRequestLoad = null;
    this.accessVerificationCode = '';
  }

  decideTeamLoadAccess(item: LoadBoardItem, request: LoadAccessRequest, action: 'approve' | 'reject'): void {
    if (!item.loadId || !request?.id || this.loadActionPendingId) return;

    this.loadError = '';
    this.loadMessage = '';
    this.loadActionPendingId = item.loadId;
    this.loadsApi.decideLoadAccess(item.loadId, request.id, { action }).pipe(finalize(() => (this.loadActionPendingId = ''))).subscribe({
      next: (load) => {
        this.replaceLoad(load);
        const decisionLabel = action === 'approve' ? 'approved' : 'rejected';
        this.loadMessage = `Access ${decisionLabel} for ${request.requestedByName || 'coworker'} on ${this.buildLoadReference(load)}.`;
      },
      error: (error) => {
        this.loadError = this.backendErrorMessage(error) || 'Prometheus could not update that access request.';
      },
    });
  }

  stageTmsExport(item: LoadBoardItem): void {
    this.loadMessage = `${item.reference} is ready for the future TMS export connector.`;
    this.loadError = '';
  }

  finishReadyToBillLoad(item: LoadBoardItem): void {
    this.updateLoadBoardStatus(item.loadId, 'archived', undefined, () => {
      this.loadConsoleView = 'archived';
      this.stageTmsExport(item);
    });
  }

  createLoadFromSelectedRoom(stayInBookingChat = false): void {
    const room = this.selectedRoom;
    if (!room || this.loadCreatePending) return;
    if (room.bookingStatus !== 'booked') {
      this.loadError = 'Both sides must approve this booking conversation before Prometheus can create the load.';
      return;
    }
    const existingLoad = this.selectedRoomLoad;
    if (existingLoad) {
      this.loadError = '';
      this.loadMessage = `${existingLoad.reference} is already generated in Booking Chat.`;
      if (stayInBookingChat) {
        this.activeTab = 'direct';
        this.activeDirectConsoleView = 'booking';
      }
      return;
    }
    const workflow = this.ensureDirectRoomWorkflow(room.id);

    this.loadError = '';
    this.loadMessage = '';
    this.loadCreatePending = true;
    this.loadsApi.createFromRoom({
      brokerPostId: room.brokerPostId,
      carrierPostId: room.carrierPostId,
      driverName: workflow.driverName || undefined,
      truckLabel: workflow.truckLabel || undefined,
    }).pipe(finalize(() => (this.loadCreatePending = false))).subscribe({
      next: (load) => {
        this.loads = [load, ...this.loads.filter((entry) => entry._id !== load._id)];
        workflow.consoleOpened = true;
        this.persistDirectWorkflow();
        if (stayInBookingChat) {
          this.loadMessage = 'The load was generated in Booking Chat.';
          this.activeTab = 'direct';
          this.activeDirectConsoleView = 'booking';
          this.appendBookingAssistantMessage('assistant', `${load.reference} is now generated in Booking Chat. Continue setup, driver, tracking, and delivery from here.`);
          return;
        }
        this.loadMessage = 'This booked conversation is now tracked in Loads Console.';
        this.refreshWorkspace();
        this.activeTab = 'loads';
      },
      error: (error) => {
        const backendMessage = Array.isArray(error?.error?.message) ? error.error.message.join(', ') : error?.error?.message;
        this.loadError = backendMessage || 'Prometheus could not move this room into Loads Console.';
      },
    });
  }

  updateLoadBoardStatus(loadId: string, status: PrometheusLoadStatus, statusNote?: string, onSuccess?: (load: PrometheusLoad) => void): void {
    if (!loadId || this.loadActionPendingId) return;

    this.loadError = '';
    this.loadMessage = '';
    this.loadActionPendingId = loadId;
    this.loadsApi.updateLoad(loadId, { status, statusNote }).pipe(finalize(() => (this.loadActionPendingId = ''))).subscribe({
      next: (load) => {
        this.loads = this.loads.map((entry) => entry._id === load._id ? load : entry);
        this.loadMessage = `Load ${load.reference} moved to ${this.loadBoardStatusLabel(status)}.`;
        onSuccess?.(load);
      },
      error: (error) => {
        const backendMessage = Array.isArray(error?.error?.message) ? error.error.message.join(', ') : error?.error?.message;
        this.loadError = backendMessage || 'Prometheus could not update that load right now.';
      },
    });
  }

  private handleMatchingConsoleCommand(prompt: string): boolean {
    const normalized = prompt.toLowerCase();

    if (this.isCasualGreetingCommand(normalized)) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.answerCasualGreeting(normalized);
      return true;
    }

    if (this.isApproveImportCommand(normalized)) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.approvePendingDispatchImport();
      return true;
    }

    if (this.isCancelImportCommand(normalized)) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.cancelPendingDispatchImport();
      return true;
    }

    if (this.isReviewImportCommand(normalized)) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.reviewPendingDispatchImport();
      return true;
    }

    if (this.isBrainBookingApprovalCommand(normalized)) {
      return false;
    }

    if (this.isHazmatAssistantCommand(normalized)) {
      this.sendMatchingAssistantCommand(prompt);
      return true;
    }

    if (this.isPostedListCommand(normalized)) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.describePostedCapacity();
      return true;
    }

    if (this.isRouteIntelligenceCommand(normalized)) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.openMatchingRouteIntelligencePanel(this.parseRouteMatchIndex(normalized));
      return true;
    }

    if (this.isMatchInformationCommand(normalized)) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.describeMatchInformation(prompt);
      return true;
    }

    if (this.isMatchListCommand(normalized)) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.describeCurrentMatches();
      return true;
    }

    const matchCommandIndex = this.parseMatchSelectionCommand(normalized);
    if (matchCommandIndex !== null) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.openMatchCandidateByIndex(matchCommandIndex);
      return true;
    }

    if (normalized.includes('save') && normalized.includes('template')) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.saveSelectedPostAsTemplate();
      return true;
    }

    if ((normalized.includes('show') || normalized.includes('list')) && normalized.includes('template')) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.describeSavedTemplates();
      return true;
    }

    if ((normalized.includes('use') || normalized.includes('load')) && normalized.includes('template')) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.loadLatestTemplateIntoDispatch();
      return true;
    }

    if (normalized.includes('repost')) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.repostSelectedPost();
      return true;
    }

    if (normalized.includes('delete') && (normalized.includes('post') || normalized.includes('posting'))) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.deleteSelectedPost();
      return true;
    }

    if (normalized.includes('open') && (normalized.includes('direct') || normalized.includes('booking chat'))) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.activeTab = 'direct';
      this.appendMatchingBubble('assistant', 'Direct Chat Console is open. Select a room and continue the broker-carrier conversation there.', 'Prometheus');
      return true;
    }

    if (normalized.includes('help')) {
      this.appendMatchingBubble('user', prompt, 'You');
      this.appendMatchingBubble(
        'assistant',
        `Here is what I can help with from this center:\n- Show my posted ${this.dispatchRoleLabel}\n- Show matches for this posting\n- Book match 1\n- Import or paste a load/truck list\n- Save this as template\n- Show my templates\n- Use my latest template\n- Repost selected post\n- Delete selected post\n- Open booking chat`,
        'Prometheus'
      );
      return true;
    }

    return false;
  }

  private isCasualGreetingCommand(prompt: string): boolean {
    const normalized = prompt.replace(/[!?.,]+$/g, '').replace(/\s+/g, ' ').trim();
    if (!normalized || normalized.split(' ').length > 5) return false;
    if (/\b(load|loads|truck|trucks|route|match|matches|book|post|rate|rates|setup|tracking|hazmat|lane)\b/.test(normalized)) {
      return false;
    }
    return /^(good\s+(morning|mornin|afternoon|evening)|hello|hi|hey)(\s+(prometheus|there|team))?$/.test(normalized);
  }

  private isApproveImportCommand(prompt: string): boolean {
    return /\b(approve|post|send|create)\b/.test(prompt) && /\bimport\b/.test(prompt);
  }

  private isCancelImportCommand(prompt: string): boolean {
    return /\b(cancel|clear|discard|delete)\b/.test(prompt) && /\bimport\b/.test(prompt);
  }

  private isReviewImportCommand(prompt: string): boolean {
    return /\b(show|review|list)\b/.test(prompt) && /\bimport\b/.test(prompt);
  }

  private reviewPendingDispatchImport(): void {
    if (!this.pendingDispatchImport) {
      this.appendMatchingBubble('assistant', 'There is no import waiting for review right now. Upload CSV/text or paste a list and I will stage it here first.', 'Prometheus');
      return;
    }

    this.appendMatchingBubble('assistant', this.buildImportReviewMessage(this.pendingDispatchImport), 'Prometheus');
  }

  private cancelPendingDispatchImport(): void {
    if (!this.pendingDispatchImport) {
      this.appendMatchingBubble('assistant', 'There is no pending import to clear.', 'Prometheus');
      return;
    }

    this.pendingDispatchImport = null;
    this.appendMatchingBubble('assistant', 'No problem. I cleared the staged import and did not post anything.', 'Prometheus');
  }

  private approvePendingDispatchImport(): void {
    const pending = this.pendingDispatchImport;
    if (!pending?.drafts.length) {
      this.appendMatchingBubble('assistant', 'There is no import ready to approve yet. Paste rows or upload CSV/text and I will prepare drafts first.', 'Prometheus');
      return;
    }

    if (!this.user || this.dispatchSubmitting) return;

    this.chatbbLoading = true;
    this.dispatchSubmitting = true;
    this.chatbbError = '';

    const draftRequests = pending.drafts.map((draft) =>
      forkJoin({
        origin: this.resolveDispatchPlace(draft.origin),
        destination: draft.destination ? this.resolveDispatchPlace(draft.destination) : of(null),
      }).pipe(
        switchMap(({ origin, destination }) => forkJoin(this.buildNarrativeDispatchRequests(draft, origin, destination)))
      )
    );

    forkJoin(draftRequests)
      .pipe(finalize(() => {
        this.chatbbLoading = false;
        this.dispatchSubmitting = false;
      }))
      .subscribe({
        next: (createdGroups) => {
          const createdPosts = createdGroups.flat();
          const noun = this.isBroker ? 'load' : 'truck';
          const createdLines = createdPosts
            .slice(0, 6)
            .map((post, index) => `${index + 1}. ${this.formatLane(post)} | ${this.formatEquipment(post)} | ${this.formatMetric(post)}`)
            .join('\n');
          this.pendingDispatchImport = null;
          this.selectedPostId = createdPosts[0]?._id ?? this.selectedPostId;
          this.appendMatchingBubble(
            'assistant',
            [
              `I posted ${createdPosts.length} ${noun}${createdPosts.length === 1 ? '' : 's'} from the approved import.`,
              createdLines,
              `I am checking for matching hazmat ${this.isBroker ? 'trucks' : 'loads'} now and will keep this center updated as options line up.`,
            ].filter(Boolean).join('\n'),
            'Prometheus'
          );
          this.refreshWorkspace();
        },
        error: (error) => {
          const backendMessage = Array.isArray(error?.error?.message) ? error.error.message.join(', ') : error?.error?.message;
          this.chatbbError = backendMessage || 'I could not post the approved import yet. Check the draft rows and try again.';
          this.appendMatchingBubble('assistant', this.chatbbError, 'Prometheus');
        },
      });
  }

  private answerCasualGreeting(prompt: string): void {
    const greeting = prompt.includes('afternoon')
      ? 'Good afternoon'
      : prompt.includes('evening')
        ? 'Good evening'
        : prompt.includes('morning') || prompt.includes('mornin')
          ? 'Good morning'
          : 'Hello';
    const name = this.user?.firstName?.trim();
    const roleHint = this.isBroker
      ? 'We can post a load, find trucks, check rates/routes, stage setup, or start tracking.'
      : this.user?.role === 'carrier'
        ? 'We can post a truck, find loads, check rates/routes, stage setup, or start tracking.'
        : 'We can post, match, check rates/routes, stage setup, or start tracking.';

    this.appendMatchingBubble(
      'assistant',
      `${greeting}${name ? `, ${name}` : ''}. I am here with you. ${roleHint} You can also paste a list or import CSV/text, and I will turn it into drafts before anything goes live.`,
      'Prometheus'
    );
  }

  private sendBrainMatchingPrompt(prompt: string): void {
    const sourcePostId = this.selectedPostId || undefined;
    this.appendMatchingBubble('user', prompt, 'You');
    this.chatbbPrompt = '';
    this.chatbbLoading = true;
    this.chatbbError = '';

    this.brainApi.sendPrompt({
      prompt,
      source: 'matching',
      related: sourcePostId ? { sourcePostId } : undefined,
    }).pipe(
      catchError(() => {
        this.appendMatchingBubble('assistant', 'I lost the Brain connection for a moment. Try that again and I will pick it back up here.', 'Prometheus');
        return of(null);
      }),
      finalize(() => {
        this.chatbbLoading = false;
      })
    ).subscribe((response: PrometheusBrainPromptResponse | null) => {
      if (!response) return;
      this.appendMatchingBubble('assistant', response.answer, 'Prometheus');
      if (response.approval) {
        this.pendingBrainApprovals = [response.approval].concat(this.pendingBrainApprovals);
      }
    });
  }

  approveBrainRequest(approval: PrometheusBrainApproval): void {
    const approvalId = approval._id;
    if (!approvalId) return;

    this.brainApi.approve(approvalId).subscribe({
      next: (updated) => {
        this.pendingBrainApprovals = this.pendingBrainApprovals.map((entry) =>
          entry._id === approvalId ? updated : entry
        );
        const message = String(updated.result?.['message'] ?? 'Approved.');
        this.appendMatchingBubble('assistant', message, 'Prometheus');
      },
      error: () => {
        this.appendMatchingBubble('assistant', 'I could not approve that request yet. Please try again in a moment.', 'Prometheus');
      },
    });
  }

  rejectBrainRequest(approval: PrometheusBrainApproval): void {
    const approvalId = approval._id;
    if (!approvalId) return;

    this.brainApi.reject(approvalId).subscribe({
      next: (updated) => {
        this.pendingBrainApprovals = this.pendingBrainApprovals.map((entry) =>
          entry._id === approvalId ? updated : entry
        );
        this.appendMatchingBubble('assistant', 'Rejected. I will not take that action.', 'Prometheus');
      },
      error: () => {
        this.appendMatchingBubble('assistant', 'I could not reject that request yet. Please try again in a moment.', 'Prometheus');
      },
    });
  }

  private isPostedListCommand(prompt: string): boolean {
    return (prompt.includes('show') || prompt.includes('list'))
      && (prompt.includes('posted') || prompt.includes('post'))
      && (prompt.includes('load') || prompt.includes('truck') || prompt.includes('capacity'));
  }

  private isMatchListCommand(prompt: string): boolean {
    return prompt.includes('match') || (prompt.includes('show') && prompt.includes('option'));
  }

  private isMarketQuestion(prompt: string): boolean {
    const asksForMarket = [
      'anything',
      'available',
      'availability',
      'out of',
      'near',
      'around',
      'market',
      'rate',
      'rates',
      'rate per mile',
      'rpm',
      'ratio',
      'map',
      'alternative',
      'suggest',
    ].some((term) => prompt.includes(term));
    const asksForFreight = ['load', 'loads', 'truck', 'trucks', 'lane', 'rate', 'rates', 'city'].some((term) => prompt.includes(term));

    return asksForMarket && (asksForFreight || !!this.parseMarketLocation(prompt));
  }

  private isRouteIntelligenceCommand(prompt: string): boolean {
    if (this.isMarketMapQuestion(prompt)) return false;
    if (this.isMarketIntentBeforeRouteIntent(prompt)) return false;
    if (/\bopen\s+(booking|direct)\s+chat\b/i.test(prompt)) return false;
    if (prompt.includes('tracking') && prompt.includes('map')) return true;
    if (/\b(route intelligence|deadhead|loaded miles|total miles|trip miles)\b/i.test(prompt)) return true;
    return /\b(show|open|display|map)\b.*\b(route|lane|load|truck|trip|match)\b/i.test(prompt)
      || /\b(route|lane|load|truck|trip|match)\b.*\b(map|route|miles)\b/i.test(prompt);
  }

  private isMarketMapQuestion(prompt: string): boolean {
    return prompt.includes('map')
      && ['available', 'availability', 'market', 'ratio', 'near', 'around', 'out of'].some((term) => prompt.includes(term));
  }

  private isMarketIntentBeforeRouteIntent(prompt: string): boolean {
    if (!this.isMarketQuestion(prompt)) return false;
    const hasExplicitRouteIntent = /\b(route intelligence|deadhead|loaded miles|total miles|trip miles|tracking map)\b/i.test(prompt)
      || /\b(route|map)\s+for\s+match\s*\d+\b/i.test(prompt)
      || /\bmatch\s*\d+\b.*\b(route|map|miles)\b/i.test(prompt);
    if (hasExplicitRouteIntent) return false;
    return /\b(rate|rates|rpm|ratio|available|availability|anything|alternative|suggest)\b/i.test(prompt)
      || /\b(out of|near|around)\b/i.test(prompt);
  }

  private parseRouteMatchIndex(prompt: string): number | null {
    const match = prompt.match(/match\s*(\d+)/i);
    if (!match) return null;
    const index = Number(match[1]);
    return Number.isInteger(index) && index > 0 ? index - 1 : null;
  }

  private isMatchInformationCommand(prompt: string): boolean {
    return /\b(show|open|display|check)\b.*\b(info|information|details|detail)\b/.test(prompt)
      || /\b(info|information|details|detail)\b.*\b(match|option|lane|truck|load)\b/.test(prompt);
  }

  private describeMatchInformation(prompt: string): void {
    if (!this.matchCandidates.length) {
      this.appendMatchingBubble('assistant', 'No match options are loaded yet. Type "show matches" after selecting a live posting.', 'Prometheus');
      return;
    }

    const index = this.matchInformationIndex(prompt);
    if (index < 0 || !this.matchCandidates[index]) {
      this.appendMatchingBubble(
        'assistant',
        'I could not identify that option from the lane text. Type "show matches" and then ask by number, like "show information on match 4".',
        'Prometheus'
      );
      return;
    }

    const candidate = this.matchCandidates[index];
    const miles = this.asNumberOrNull(candidate.routeMetrics?.totalPracticalMiles)
      ?? this.asNumberOrNull(candidate.routeMetrics?.tripMiles);
    const milesLine = miles === null ? '' : `\nEstimated miles: ${miles.toLocaleString('en-US')}.`;
    this.appendMatchingBubble(
      'assistant',
      `Here is the matching option I found:\n${this.describeMatchCandidate(candidate, index)}${milesLine}\nType "book match ${index + 1}" when you want Prometheus to start the booking conversation.`,
      'Prometheus'
    );
  }

  private matchInformationIndex(prompt: string): number {
    const explicit = prompt.match(/\b(?:match|option)\s*(\d+)\b/i);
    if (explicit) {
      const index = Number(explicit[1]) - 1;
      return Number.isInteger(index) ? index : -1;
    }

    const tokens = this.matchInformationTokens(prompt);
    if (!tokens.length || !tokens.some((token) => token.length > 2)) return -1;

    const scored = this.matchCandidates.map((candidate, index) => {
      const searchable = this.normalizeSearchText([
        candidate.summary?.reference,
        candidate.summary?.lane?.origin,
        candidate.summary?.lane?.destination,
        ...(candidate.summary?.equipment ?? []),
      ].join(' '));
      const score = tokens.filter((token) => searchable.includes(token)).length;
      return { index, score };
    }).sort((left, right) => right.score - left.score);

    const best = scored[0];
    return best && best.score > 0 ? best.index : -1;
  }

  private matchInformationTokens(prompt: string): string[] {
    const stopWords = new Set([
      'show',
      'open',
      'display',
      'check',
      'information',
      'info',
      'details',
      'detail',
      'about',
      'for',
      'on',
      'the',
      'this',
      'please',
      'match',
      'option',
      'lane',
      'load',
      'loads',
      'truck',
      'trucks',
      'route',
      'from',
      'to',
    ]);
    return this.normalizeSearchText(prompt)
      .split(' ')
      .filter((token) => !!token && !stopWords.has(token));
  }

  private normalizeSearchText(value: string): string {
    return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private openMatchingRouteIntelligencePanel(matchIndex: number | null = null): void {
    const post = this.selectedPost;
    const candidate = matchIndex !== null ? this.matchCandidates[matchIndex] : this.matchCandidates[0] ?? null;
    if (matchIndex !== null && !candidate) {
      this.appendMatchingBubble('assistant', 'That match number is not available. Ask Prometheus to show matches for this posting first.', 'Prometheus');
      return;
    }
    if (!post && !candidate) {
      this.appendMatchingBubble('assistant', 'Select a live posting first so Prometheus knows which lane to map.', 'Prometheus');
      return;
    }

    const metrics = candidate?.routeMetrics ?? null;
    const routeUsesCandidateLane = candidate?.matchPostType === 'brokerPost';
    const sourceOriginLabel = this.formatLocation(post?.origin);
    const sourceDestinationLabel = this.formatLocation(post?.destination);
    const candidateOriginLabel = this.stringValue(candidate?.summary?.lane?.origin);
    const candidateDestinationLabel = this.stringValue(candidate?.summary?.lane?.destination);
    const originLabel = routeUsesCandidateLane ? candidateOriginLabel || sourceOriginLabel : sourceOriginLabel || candidateOriginLabel;
    const destinationLabel = routeUsesCandidateLane ? candidateDestinationLabel || sourceDestinationLabel : sourceDestinationLabel || candidateDestinationLabel;
    const deadheadMiles = this.sumRouteDeadheadMiles(metrics);
    const loadedMiles = this.asNumberOrNull(metrics?.tripMiles) ?? (routeUsesCandidateLane ? null : this.asNumberOrNull(post?.distance));
    const totalMiles = this.asNumberOrNull(metrics?.totalPracticalMiles)
      ?? this.sumNullableMiles(deadheadMiles, loadedMiles)
      ?? (routeUsesCandidateLane ? null : this.asNumberOrNull(post?.distance));
    const sourceRate = this.asNumberOrNull(post?.rate);
    const candidateRate = this.asNumberOrNull(candidate?.summary?.rate);
    const postedRate = routeUsesCandidateLane ? candidateRate : sourceRate;
    const suggestedRate = candidateRate ?? postedRate;
    const truckLocationLabel = this.matchingTruckLocationLabel(post, candidate);
    const preview = this.buildOfflineRoutePreview(truckLocationLabel, originLabel, destinationLabel, routeUsesCandidateLane ? [] : this.formatRouteStops(post?.stops));

    this.routeIntelligencePanel = {
      ...this.emptyRouteIntelligencePanel(),
      open: true,
      source: 'matching',
      laneLabel: `${originLabel} -> ${destinationLabel}`,
      originLabel,
      destinationLabel,
      truckLocationLabel,
      deadheadMiles,
      loadedMiles,
      totalMiles,
      postedRate,
      suggestedRate,
      routeProvider: this.routeProviderLabel(metrics?.provider),
      stops: routeUsesCandidateLane ? [] : this.formatRouteStops(post?.stops),
      hazmatNotes: this.matchingRouteHazmatNotes(candidate),
      ...preview,
    };
    this.appendMatchingBubble('assistant', `Route intelligence is open for ${this.routeIntelligencePanel.laneLabel}.`, 'Prometheus');
  }

  private openBookingRouteIntelligencePanel(): void {
    const room = this.selectedRoom;
    if (!room) return;
    const load = this.selectedRoomLoad;
    const workflow = this.ensureDirectRoomWorkflow(room.id);
    const originLabel = this.stringValue(load?.lane?.origin) || this.formatLocation(room.post?.origin);
    const destinationLabel = this.stringValue(load?.lane?.destination) || this.formatLocation(room.post?.destination);
    const loadedMiles = this.asNumberOrNull(room.post?.distance);
    const rate = this.asNumberOrNull(load?.rate) ?? this.asNumberOrNull(room.bookingRate) ?? this.asNumberOrNull(room.maxBid);
    const stops = this.formatRouteStops(room.post?.stops);
    const truckLocationLabel = this.bookingTruckLocationLabel(load, workflow);
    const preview = this.buildOfflineRoutePreview(truckLocationLabel, originLabel, destinationLabel, stops);

    this.routeIntelligencePanel = {
      ...this.emptyRouteIntelligencePanel(),
      open: true,
      source: 'booking',
      laneLabel: `${originLabel} -> ${destinationLabel}`,
      originLabel,
      destinationLabel,
      stops,
      truckLocationLabel,
      loadedMiles,
      totalMiles: loadedMiles,
      postedRate: rate,
      suggestedRate: rate,
      routeProvider: 'Estimated from booked load data',
      trackingProvider: workflow.trackingProvider,
      trackingStatus: workflow.trackingShared ? 'live' : workflow.trackingProvider ? 'connected' : 'notConnected',
      hazmatNotes: this.bookingRouteHazmatNotes(load, room),
      ...preview,
    };
  }

  private routeProviderLabel(provider: unknown): string {
    const label = this.stringValue(provider);
    return label ? `Estimated by ${label}; live route provider not connected yet.` : 'Estimated from posted lane data; live route provider not connected yet.';
  }

  private emptyRouteIntelligencePanel(): RouteIntelligencePanelState {
    return {
      open: false,
      source: 'matching',
      laneLabel: '',
      originLabel: '',
      destinationLabel: '',
      stops: [],
      truckLocationLabel: '',
      deadheadMiles: null,
      loadedMiles: null,
      totalMiles: null,
      postedRate: null,
      suggestedRate: null,
      fuelEstimate: null,
      tollEstimate: null,
      routeProvider: 'Estimated from posted lane data',
      trackingProvider: null,
      trackingStatus: 'notConnected',
      hazmatNotes: [
        'Hazmat route review is estimated until live routing provider data is connected.',
        'Dispatcher must confirm commodity restrictions, tunnel rules, and appointment windows.',
      ],
      previewMode: 'offline',
      previewPoints: [],
      previewSegments: [],
    };
  }

  routePreviewAriaLabel(): string {
    const panel = this.routeIntelligencePanel;
    return `Offline route preview for ${panel.laneLabel || 'selected lane'}`;
  }

  routePreviewShortLabel(point: RoutePreviewPoint): string {
    if (point.kind === 'truck') return 'TRK';
    if (point.kind === 'pickup') return 'PU';
    if (point.kind === 'delivery') return 'DEL';
    return 'STP';
  }

  routePreviewPointColor(point: RoutePreviewPoint): string {
    if (point.kind === 'truck') return '#52c9ff';
    if (point.kind === 'pickup') return '#8ee89e';
    if (point.kind === 'delivery') return '#ff8f70';
    return '#f4d06f';
  }

  routePreviewSegmentColor(segment: RoutePreviewSegment): string {
    return segment.kind === 'loaded' ? '#ffae4f' : '#52c9ff';
  }

  private buildOfflineRoutePreview(
    truckLocationLabel: string,
    originLabel: string,
    destinationLabel: string,
    stops: string[]
  ): Pick<RouteIntelligencePanelState, 'previewMode' | 'previewPoints' | 'previewSegments'> {
    const pickup = this.routePreviewPoint('pickup', originLabel || 'Pickup pending', 36, 43);
    const delivery = this.routePreviewPoint('delivery', destinationLabel || 'Delivery pending', 86, 34);
    const stopPoints = stops.map((stop, index) => {
      const x = stops.length === 1 ? 61 : 48 + Math.round(((index + 1) * 28) / (stops.length + 1));
      const y = index % 2 === 0 ? 28 : 48;
      return this.routePreviewPoint('stop', stop, x, y);
    });
    const truck = this.previewableTruckLabel(truckLocationLabel)
      ? this.routePreviewPoint('truck', truckLocationLabel, 15, 64)
      : null;
    const previewPoints = [truck, pickup, ...stopPoints, delivery].filter((point): point is RoutePreviewPoint => Boolean(point));
    const loadedPoints = [pickup, ...stopPoints, delivery];
    const previewSegments: RoutePreviewSegment[] = [];

    if (truck) {
      previewSegments.push({
        kind: 'deadhead',
        points: this.routePreviewPolyline([truck, pickup]),
      });
    }

    previewSegments.push({
      kind: 'loaded',
      points: this.routePreviewPolyline(loadedPoints),
    });

    return {
      previewMode: 'offline',
      previewPoints,
      previewSegments,
    };
  }

  private routePreviewPoint(kind: RoutePreviewPointKind, label: string, x: number, y: number): RoutePreviewPoint {
    return { kind, label, x, y };
  }

  private routePreviewPolyline(points: RoutePreviewPoint[]): string {
    return points.map((point) => `${point.x},${point.y}`).join(' ');
  }

  private previewableTruckLabel(label: string): boolean {
    const normalized = label.trim().toLowerCase();
    return Boolean(normalized) && normalized !== 'truck location pending' && normalized !== 'tracking not connected';
  }

  private sumRouteDeadheadMiles(metrics: MatchCandidate['routeMetrics'] | null): number | null {
    const originDeadhead = this.asNumberOrNull(metrics?.originDeadheadMiles);
    const destinationDeadhead = this.asNumberOrNull(metrics?.destinationDeadheadMiles);
    return this.sumNullableMiles(originDeadhead, destinationDeadhead);
  }

  private sumNullableMiles(...values: Array<number | null>): number | null {
    const numericValues = values.filter((value): value is number => typeof value === 'number');
    return numericValues.length ? numericValues.reduce((sum, value) => sum + value, 0) : null;
  }

  private formatRouteStops(stops: WorkspacePost['stops'] | undefined): string[] {
    if (!Array.isArray(stops)) return [];
    return stops.map((stop, index) => {
      const place = stop['place'];
      const placeCity = this.isRecord(place) ? this.stringValue(place['city']) : '';
      const placeState = this.isRecord(place) ? this.stringValue(place['state']) : '';
      const placeText = this.stringValue(place);
      const city = placeCity || this.stringValue(stop['city']) || this.stringValue(stop['location']) || placeText;
      const state = placeState || this.stringValue(stop['state']);
      const label = this.routePlaceLabel(city, state);
      return label || `Stop ${index + 1}`;
    });
  }

  private routePlaceLabel(cityOrPlace: string, state: string): string {
    if (!cityOrPlace) return '';
    if (state && !cityOrPlace.toLowerCase().includes(`, ${state.toLowerCase()}`)) {
      return `${cityOrPlace}, ${state}`;
    }
    return cityOrPlace;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private matchingTruckLocationLabel(post: WorkspacePost | null, candidate: MatchCandidate | null): string {
    if (this.isBroker) return this.stringValue(candidate?.summary?.lane?.origin) || 'Truck location pending';
    return post ? this.formatLocation(post.origin) : 'Truck location pending';
  }

  private bookingTruckLocationLabel(load: PrometheusLoad | null, workflow: DirectRoomWorkflowState): string {
    const driverName = workflow.driverName || this.stringValue(load?.driver?.name);
    const truckLabel = workflow.truckLabel || this.stringValue(load?.driver?.truckLabel);
    return [driverName, truckLabel].filter(Boolean).join(' / ') || 'Truck location pending';
  }

  private matchingRouteHazmatNotes(candidate: MatchCandidate | null): string[] {
    const notes = [
      'Hazmat route review is estimated until live routing provider data is connected.',
      'Fuel, toll, and restriction data are pending provider connections.',
    ];
    if (!candidate) return [...notes, 'Hazmat compatibility will follow the selected posting.'];
    if (candidate.hazmatCompatible === false) return [...notes, 'Hazmat permission or compatibility needs review before booking.'];
    return [...notes, 'Hazmat-compatible route context is ready for dispatch review.'];
  }

  private bookingRouteHazmatNotes(load: PrometheusLoad | null, room: DirectRoom): string[] {
    const equipment = this.stringValue(load?.equipmentLabel) || this.stringValue(room.equipmentLabel);
    return [
      'Hazmat route review is estimated until live routing provider data is connected.',
      'Fuel, toll, and restriction data are pending provider connections.',
      equipment ? `${equipment} route context is ready for dispatch review.` : 'Route context is ready for dispatch review.',
    ];
  }

  private isHazmatAssistantCommand(prompt: string): boolean {
    return /^show\s+matches\b/.test(prompt)
      || /^ask(?:\s+about)?\s+\d+\b/.test(prompt)
      || /^(?:accept|reject)\s+(?:option|match)\s+\d+\b/.test(prompt);
  }

  private isBrainBookingApprovalCommand(prompt: string): boolean {
    if (/\bopen\s+(?:booking|direct)\s+chat\b/.test(prompt)) return false;
    return /^book(?:\s+(?:option|match|room|lane))?\s+\d+\b/.test(prompt)
      || /\b(?:approve booking|confirm booking|secure load|book it|book this|lets book|let's book)\b/.test(prompt);
  }

  private sendMatchingAssistantCommand(prompt: string): void {
    this.appendMatchingBubble('user', prompt, 'You');
    this.chatbbPrompt = '';

    if (!this.selectedPostId) {
      this.appendMatchingBubble(
        'assistant',
        'Select a live posting first so Prometheus knows which lane to match.',
        'Prometheus'
      );
      return;
    }

    this.chatbbLoading = true;
    this.chatbbError = '';

    this.matchingApi.sendAssistantCommand({
      prompt,
      sourcePostId: this.selectedPostId || undefined,
    }).pipe(finalize(() => (this.chatbbLoading = false))).subscribe({
      next: (response) => this.handleMatchingAssistantCommandResponse(response),
      error: () => {
        this.appendMatchingBubble(
          'assistant',
          'Prometheus could not run that assistant command right now. Try again in a moment.',
          'Prometheus'
        );
      },
    });
  }

  private answerMarketQuestion(prompt: string): void {
    const normalized = prompt.toLowerCase();
    const location = this.parseMarketLocation(prompt);

    if (normalized.includes('rate') || normalized.includes('rpm')) {
      this.describeRateMarket(location);
      return;
    }

    if (normalized.includes('ratio') || normalized.includes('map')) {
      this.describeLocalRatio(location);
      return;
    }

    this.describeLocalAvailability(location);
  }

  private describeLocalAvailability(location: { label: string } | null): void {
    const counterpartMatches = this.matchCandidates.filter((candidate) => this.candidateMatchesMarketLocation(candidate, location));
    const ownPosts = this.allWorkspacePosts.filter((post) => this.postMatchesMarketLocation(post, location));
    const lines: string[] = [
      `I checked the Prometheus internal board${location ? ` for ${location.label}` : ''}.`,
    ];

    if (counterpartMatches.length) {
      lines.push(`${counterpartMatches.length} matching hazmat ${this.counterpartLabel.toLowerCase()} are loaded for this posting:`);
      lines.push(...counterpartMatches.slice(0, 5).map((candidate, index) => this.describeMatchCandidate(candidate, index)));
      lines.push('Tell me "book match 1" when you want me to start the booking conversation.');
    } else {
      const lane = this.selectedPost ? ` for ${this.formatLane(this.selectedPost)}` : '';
      lines.push(`No matching hazmat ${this.counterpartLabel.toLowerCase()} are loaded${lane} right now.`);
    }

    if (ownPosts.length) {
      lines.push(`Your company has ${ownPosts.length} posted ${this.dispatchRoleLabel} touching this market:`);
      lines.push(...ownPosts.slice(0, 4).map((post, index) => `${index + 1}. ${this.formatLane(post)} | ${this.formatEquipment(post)} | ${this.formatMetric(post)}`));
    }

    lines.push('I will keep watching new hazmat posts as they come in and call out better equipment, weight, rate, or timing options.');
    this.appendMatchingBubble('assistant', lines.join('\n'), 'Prometheus');
  }

  private describeRateMarket(location: { label: string } | null): void {
    const entries = [
      ...this.matchCandidates.map((candidate) => ({
        lane: `${candidate.summary.lane.origin || 'Origin open'} -> ${candidate.summary.lane.destination || 'Destination open'}`,
        rate: candidate.summary.rate,
        miles: candidate.routeMetrics?.totalPracticalMiles ?? candidate.routeMetrics?.tripMiles ?? null,
        matchesLocation: this.candidateMatchesMarketLocation(candidate, location),
      })),
      ...this.allWorkspacePosts.map((post) => ({
        lane: this.formatLane(post),
        rate: this.asNumberOrNull(post.rate),
        miles: this.asNumberOrNull(post.distance),
        matchesLocation: this.postMatchesMarketLocation(post, location),
      })),
    ].filter((entry) => entry.matchesLocation && typeof entry.rate === 'number' && typeof entry.miles === 'number' && entry.miles > 0);

    if (!entries.length) {
      this.appendMatchingBubble(
        'assistant',
        `I do not have enough posted rate and mileage data${location ? ` for ${location.label}` : ''} on the Prometheus internal board yet. Once broker rates or TMS feed rates are loaded, I can show rate-per-mile bands by lane and state.`,
        'Prometheus'
      );
      return;
    }

    const rpms = entries.map((entry) => Number(entry.rate) / Number(entry.miles));
    const average = rpms.reduce((sum, rpm) => sum + rpm, 0) / rpms.length;
    const best = entries
      .map((entry) => ({ ...entry, rpm: Number(entry.rate) / Number(entry.miles) }))
      .sort((left, right) => right.rpm - left.rpm)[0];

    this.appendMatchingBubble(
      'assistant',
      `Prometheus internal board rate read${location ? ` for ${location.label}` : ''}:\nAverage: $${average.toFixed(2)}/mi across ${entries.length} rated option${entries.length === 1 ? '' : 's'}.\nBest loaded option: ${best.lane} at $${best.rpm.toFixed(2)}/mi.\nThis will become stronger after live broker/TMS feeds add more hazmat rates.`,
      'Prometheus'
    );
  }

  private describeLocalRatio(location: { label: string } | null): void {
    const ownCount = this.allWorkspacePosts.filter((post) => this.postMatchesMarketLocation(post, location)).length;
    const counterpartCount = this.matchCandidates.filter((candidate) => this.candidateMatchesMarketLocation(candidate, location)).length;
    const loadCount = this.isBroker ? ownCount : counterpartCount;
    const truckCount = this.isBroker ? counterpartCount : ownCount;
    const ratio = truckCount ? (loadCount / truckCount).toFixed(1) : 'open';

    this.appendMatchingBubble(
      'assistant',
      `Prometheus internal board ratio${location ? ` for ${location.label}` : ''}:\nLoads: ${loadCount}\nTrucks: ${truckCount}\nLoad-to-truck ratio: ${ratio}${ratio === 'open' ? ' until a truck is loaded for this market' : ':1'}.\nA visual ratio map can use the same data once we add the map panel.`,
      'Prometheus'
    );
  }

  private parseMarketLocation(prompt: string): { label: string } | null {
    const cleaned = prompt.replace(/\s+/g, ' ').trim();
    const directMatch = cleaned.match(/\b(?:out of|from|near|around|in)\s+([a-z][a-z .'-]+?)(?:,\s*|\s+)([a-z]{2})\b/i);
    const fallbackMatch = directMatch ? null : cleaned.match(/\b([a-z][a-z .'-]+?),\s*([a-z]{2})\b/i);
    const match = directMatch ?? fallbackMatch;
    if (!match) return null;

    const city = this.titleCaseLocationPart(directMatch ? match[1] : this.extractTrailingLocationWords(match[1]));
    const state = match[2].toUpperCase();
    return { label: `${city}, ${state}` };
  }

  private extractTrailingLocationWords(value: string): string {
    const stopWords = new Set(['do', 'you', 'have', 'anything', 'available', 'out', 'of', 'from', 'near', 'around', 'in', 'for']);
    const words = value
      .trim()
      .split(/\s+/)
      .filter((word) => !!word && !stopWords.has(word.toLowerCase()));
    return words.slice(-3).join(' ');
  }

  private titleCaseLocationPart(value: string): string {
    return value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  private postMatchesMarketLocation(post: WorkspacePost, location: { label: string } | null): boolean {
    if (!location) return true;
    const target = location.label.toLowerCase();
    return this.formatLocation(post.origin).toLowerCase().includes(target)
      || this.formatLocation(post.destination).toLowerCase().includes(target);
  }

  private candidateMatchesMarketLocation(candidate: MatchCandidate, location: { label: string } | null): boolean {
    if (!location) return true;
    const target = location.label.toLowerCase();
    return String(candidate.summary.lane.origin ?? '').toLowerCase().includes(target)
      || String(candidate.summary.lane.destination ?? '').toLowerCase().includes(target);
  }

  private handleMatchingAssistantCommandResponse(response: MatchingAssistantEvent | AssistantRoomResponse): void {
    if (this.isAssistantRoomResponse(response)) {
      const roomId = this.preferredRoomIdFromAssistantRoom(response);
      this.appendMatchingBubble(
        'assistant',
        'The booking conversation is ready in Direct Chat.',
        'Prometheus'
      );
      this.activeTab = 'direct';
      this.activeDirectConsoleView = 'booking';
      this.selectedRoomId = roomId || this.selectedRoomId;
      if (this.selectedPost) {
        this.loadRooms(this.selectedPost, roomId);
      }
      return;
    }

    this.handleMatchingAssistantEvent(response);
  }

  private isAssistantRoomResponse(response: MatchingAssistantEvent | AssistantRoomResponse): response is AssistantRoomResponse {
    return Boolean((response as AssistantRoomResponse).room);
  }

  private preferredRoomIdFromAssistantRoom(response: AssistantRoomResponse): string {
    const room = response.room ?? {};
    const brokerPostId = this.stringValue(room.brokerPostId);
    const carrierPostId = this.stringValue(room.carrierPostId);
    const selectedPostId = this.selectedPostId;

    if (selectedPostId && selectedPostId === carrierPostId) return brokerPostId || selectedPostId;
    if (selectedPostId && selectedPostId === brokerPostId) return carrierPostId || selectedPostId;
    if (this.user?.role === 'carrier' && brokerPostId) return brokerPostId;
    if (this.user?.role === 'broker' && carrierPostId) return carrierPostId;

    return this.stringValue(room.post?._id) || this.stringValue(room.id) || this.stringValue(room._id);
  }

  private describePostedCapacity(): void {
    if (!this.posts.length) {
      this.appendMatchingBubble('assistant', `No ${this.dispatchRoleLabel} are posted on this account yet.`, 'Prometheus');
      return;
    }

    const lines = this.posts.map((post, index) => (
      `${index + 1}. ${this.formatLane(post)} | ${this.formatEquipment(post)} | ${this.formatMetric(post)}`
    ));
    this.appendMatchingBubble('assistant', `Here are your live posted ${this.dispatchRoleLabel}:\n${lines.join('\n')}`, 'Prometheus');
  }

  private describeCurrentMatches(): void {
    if (!this.selectedPost) {
      this.appendMatchingBubble('assistant', 'Select a live posting first so Prometheus knows which lane to match.', 'Prometheus');
      return;
    }

    if (this.matchesLoading) {
      this.appendMatchingBubble('assistant', 'Prometheus is still loading counterpart matches for the selected posting.', 'Prometheus');
      return;
    }

    if (!this.matchCandidates.length) {
      this.appendMatchingBubble('assistant', `No ${this.counterpartLabel.toLowerCase()} are available for ${this.formatLane(this.selectedPost)} yet.`, 'Prometheus');
      return;
    }

    const lines = this.matchCandidates.slice(0, 5).map((candidate, index) => this.describeMatchCandidate(candidate, index));
    this.appendMatchingBubble(
      'assistant',
      `Top hazmat ${this.counterpartLabel.toLowerCase()} for the selected posting:\n${lines.join('\n')}\nTell me "book match 1" when you want me to start the broker-carrier booking conversation.`,
      'Prometheus'
    );
  }

  private parseMatchSelectionCommand(prompt: string): number | null {
    const match = prompt.match(/(?:open|chat|message)\s+(?:match|room|lane)?\s*(\d+)/i);
    if (!match) return null;
    const index = Number(match[1]);
    return Number.isInteger(index) && index > 0 ? index - 1 : null;
  }

  private openMatchCandidateByIndex(index: number): void {
    if (this.matchesLoading) {
      this.appendMatchingBubble('assistant', 'Prometheus is still loading counterpart matches for the selected posting.', 'Prometheus');
      return;
    }

    const candidate = this.matchCandidates[index];
    if (!candidate) {
      this.appendMatchingBubble('assistant', 'That match number is not available. Ask Prometheus to show matches for this posting first.', 'Prometheus');
      return;
    }

    if (!candidate.summary.publisherId) {
      this.appendMatchingBubble('assistant', 'That match is missing contact data, so Prometheus cannot start the booking conversation yet.', 'Prometheus');
      return;
    }

    this.createRoomFromMatchCandidate(candidate);
  }

  private describeMatchCandidate(candidate: MatchCandidate, index: number): string {
    const lane = `${candidate.summary.lane.origin || 'Origin open'} -> ${candidate.summary.lane.destination || 'Destination open'}`;
    const equipment = candidate.summary.equipment.length ? candidate.summary.equipment.join(', ') : 'Equipment open';
    const score = Math.round((candidate.score ?? 0) * 100);
    const rate = typeof candidate.summary.rate === 'number' ? `$${candidate.summary.rate.toLocaleString('en-US')}` : 'No rate yet';
    return `${index + 1}. ${lane} | ${equipment} | ${rate} | ${score}% fit`;
  }

  private saveSelectedPostAsTemplate(): void {
    const post = this.selectedPost;
    if (!post) {
      this.appendMatchingBubble('assistant', 'Select a posting before saving a reusable template.', 'Prometheus');
      return;
    }

    const template: SavedDispatchTemplate = {
      id: `${Date.now()}-${post._id}`,
      label: this.formatLane(post),
      prompt: this.buildTemplatePrompt(post),
      role: this.isBroker ? 'broker' : 'carrier',
      createdAt: new Date().toISOString(),
    };

    this.savedTemplates = [template, ...this.savedTemplates.filter((entry) => entry.label !== template.label)].slice(0, 12);
    this.persistSavedTemplates();
    this.appendMatchingBubble('assistant', `Saved "${template.label}" as a reusable posting template.`, 'Prometheus');
  }

  private describeSavedTemplates(): void {
    const templates = this.visibleTemplates;
    if (!templates.length) {
      this.appendMatchingBubble('assistant', 'No templates are saved for this desk yet.', 'Prometheus');
      return;
    }

    const lines = templates.map((template, index) => `${index + 1}. ${template.label}`);
    this.appendMatchingBubble('assistant', `Saved templates:\n${lines.join('\n')}`, 'Prometheus');
  }

  private loadLatestTemplateIntoDispatch(): void {
    const template = this.visibleTemplates[0];
    if (!template) {
      this.appendMatchingBubble('assistant', 'There is no saved template to load yet.', 'Prometheus');
      return;
    }

    this.useSavedTemplate(template);
  }

  private repostSelectedPost(): void {
    const post = this.selectedPost;
    if (!post) {
      this.appendMatchingBubble('assistant', 'Select a posting first if you want to repost it from the AI Transportation Center.', 'Prometheus');
      return;
    }

    this.dispatchNarrative = this.buildTemplatePrompt(post);
    this.queueDispatchNarrativeResize();
    this.activeTab = 'matching';
    this.appendMatchingBubble('assistant', `Prometheus loaded "${this.formatLane(post)}" into the AI Transportation Center for reposting. Review the note and send it when ready.`, 'Prometheus');
  }

  private deleteSelectedPost(): void {
    const post = this.selectedPost;
    if (!post) {
      this.appendMatchingBubble('assistant', 'Select a posting before trying to delete it.', 'Prometheus');
      return;
    }
    if (!this.isPostOwnedByCurrentUser(post)) {
      this.appendMatchingBubble('assistant', 'Team-visible postings are read-only here. Ask the owner or an admin before deleting them.', 'Prometheus');
      return;
    }

    const request$ = this.isBroker
      ? this.postsApi.deleteBrokerPost(post._id)
      : this.postsApi.deleteCarrierPost(post._id);

    request$.subscribe({
      next: () => {
        this.appendMatchingBubble('assistant', `Deleted ${this.formatLane(post)} from your live postings.`, 'Prometheus');
        this.refreshWorkspace();
      },
      error: () => {
        this.appendMatchingBubble('assistant', 'Prometheus could not delete the selected posting right now.', 'Prometheus');
      },
    });
  }

  private loadWorkspaceData(user: AuthUser, preserveSelection = false): void {
    if (user.role === 'superadmin') {
      this.user = user;
      this.posts = [];
      this.companyPosts = [];
      this.loads = [];
      this.matchCandidates = [];
      this.rooms = [];
      this.previewDirectRooms = [];
      this.loading = false;
      return;
    }

    if (user.role === 'admin') {
      this.user = user;
      this.posts = [];
      this.companyPosts = [];
      this.loads = [];
      this.matchCandidates = [];
      this.rooms = [];
      this.previewDirectRooms = [];
      this.loading = false;
      return;
    }

    const posts$ = user.role === 'broker'
      ? this.postsApi.getBrokerPosts(user.id).pipe(catchError(() => of([] as WorkspacePost[])))
      : this.postsApi.getCarrierPosts(user.id).pipe(catchError(() => of([] as WorkspacePost[])));
    const companyPosts$ = user.role === 'broker'
      ? this.postsApi.getBrokerPosts(user.id, 'all').pipe(catchError(() => of([] as WorkspacePost[])))
      : this.postsApi.getCarrierPosts(user.id, 'all').pipe(catchError(() => of([] as WorkspacePost[])));
    const loads$ = this.loadsApi.getCompanyLoads().pipe(catchError(() => of([] as PrometheusLoad[])));
    const assistantEvents$ = this.matchingApi.listAssistantEvents().pipe(catchError(() => of([] as MatchingAssistantEvent[])));

    forkJoin({
      posts: posts$,
      companyPosts: companyPosts$,
      loads: loads$,
      inbox: this.messagesApi.getNewMessageDot().pipe(catchError(() => of([] as InboxDot[]))),
      runtime: this.chatbbApi.getRuntimeStatus().pipe(catchError(() => of(null))),
      assistantEvents: assistantEvents$,
    }).subscribe({
      next: ({ posts, companyPosts, loads, inbox, runtime, assistantEvents }) => {
        const previousPostId = preserveSelection ? this.selectedPostId : '';
        const previousRoomId = preserveSelection ? this.selectedRoomId : '';
        const ownPosts = posts ?? [];
        const allPosts = this.mergeWorkspacePosts(companyPosts ?? [], ownPosts);
        this.user = user;
        this.loadSavedTemplates();
        this.primeConsoleMessages();
        this.seedDispatchNarrative();
        this.posts = ownPosts;
        this.companyPosts = allPosts;
        this.loads = loads ?? [];
        this.runtimeStatus = runtime;
        this.inboxCount = Array.isArray(inbox) ? inbox.length : 0;
        (assistantEvents ?? []).forEach((event) => this.handleMatchingAssistantEvent(event));
        this.selectedPostId = previousPostId && allPosts.some((post) => post._id === previousPostId)
          ? previousPostId
          : ownPosts[0]?._id ?? allPosts[0]?._id ?? '';
        if (!this.selectedPostId) {
          this.matchCandidates = [];
          this.rooms = [];
          this.previewDirectRooms = [];
          this.selectedRoomId = '';
          this.resetChatbbState();
          this.loading = false;
          return;
        }
        const selectedPost = allPosts.find((post) => post._id === this.selectedPostId);
        if (!selectedPost) {
          this.matchCandidates = [];
          this.previewDirectRooms = [];
          this.loading = false;
          return;
        }
        this.loadMatchCandidates(selectedPost);
        this.loadRooms(selectedPost, previousRoomId);
      },
      error: () => {
        this.workspaceError = 'The Prometheus workspace could not load.';
        this.loading = false;
      },
    });
  }

  private seedDispatchNarrative(force = false): void {
    if (this.dispatchNarrative && !force) return;
    this.dispatchNarrative = '';
    this.queueDispatchNarrativeResize();
  }

  private queueDispatchNarrativeResize(): void {
    setTimeout(() => this.resizeDispatchNarrativeInput(), 0);
  }

  private resizeDispatchNarrativeInput(textarea = this.dispatchNarrativeInput?.nativeElement): void {
    if (!textarea) return;
    textarea.style.height = '0px';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 56), 180);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > nextHeight ? 'auto' : 'hidden';
  }

  private queueDispatchThreadScroll(): void {
    setTimeout(() => {
      const thread = this.dispatchThreadRef?.nativeElement;
      if (!thread) return;
      thread.scrollTop = thread.scrollHeight;
    }, 0);
  }

  private resolveDispatchPlace(place: { city: string; state: string }): Observable<GeocodeResult> {
    return this.locationApi.geocodePlace({
      city: place.city,
      state: place.state,
      country: 'USA',
    }).pipe(
      switchMap((result) => {
        if (!result?.found || !result.location) {
          throw new Error(`Prometheus could not resolve ${place.city}, ${place.state}.`);
        }
        return of(result);
      })
    );
  }

  private buildNarrativeDispatchRequests(
    draft: ParsedDispatchDraft,
    originResult: GeocodeResult,
    destinationResult: GeocodeResult | null
  ): Observable<WorkspacePost>[] {
    const origin = this.buildDispatchPlacePayload(draft.origin.city, draft.origin.state, originResult);
    const destination = draft.destination && destinationResult
      ? this.buildDispatchPlacePayload(draft.destination.city, draft.destination.state, destinationResult)
      : null;

    return Array.from({ length: draft.quantity }, (_, index) => {
      const comment = this.buildDispatchComment(draft, index);
      const contact = draft.contactHint || this.user?.email || '';

      if (this.isBroker) {
        if (!destination) {
          throw new Error('Broker load posts need a destination before they can be created.');
        }

        const rate = typeof draft.rate === 'number' ? draft.rate : undefined;
        const distance = this.estimateDistanceMiles(origin, destination);
        const payload: BrokerPostUpsertPayload = this.removeEmptyOptionalFields({
          length: draft.length,
          weight: draft.weight,
          capacity: draft.capacity,
          equipment: draft.equipmentCodes,
          contact,
          origin,
          destination,
          stops: [
            { type: 'pickUp', place: origin, startDate: draft.readyDate, endDate: draft.readyDate, comment: '' },
            { type: 'delivery', place: destination, startDate: draft.endDate, endDate: draft.endDate, comment: '' },
          ],
          distance,
          stopsDistances: [distance],
          comment,
          refNum: draft.quantity > 1 ? `P-${Date.now()}-${index + 1}` : undefined,
          rate,
          tankerEndorsement: draft.equipmentCodes.includes('C'),
          nonHazmat: !draft.hazmatRequested,
          team: draft.teamRequested,
        });
        return this.postsApi.createBrokerPost(payload);
      }

      const payload: CarrierPostUpsertPayload = this.removeEmptyOptionalFields({
        length: draft.length,
        weight: draft.weight,
        capacity: draft.capacity,
        equipment: draft.equipmentCodes,
        contact,
        startDate: draft.readyDate,
        endDate: draft.endDate,
        origin,
        destination: destination ?? undefined,
        comment,
        refNum: draft.quantity > 1 ? `T-${Date.now()}-${index + 1}` : undefined,
        distance: destination ? this.estimateDistanceMiles(origin, destination) : undefined,
        team: draft.teamRequested,
        nonTanker: !draft.equipmentCodes.includes('C'),
      });
      return this.postsApi.createCarrierPost(payload);
    });
  }

  private buildDispatchPlacePayload(city: string, state: string, result: GeocodeResult): ManualPlacePayload {
    return {
      type: 'place',
      place: { city, state },
      location: {
        type: 'Point',
        coordinates: {
          lat: Number(result.location?.lat ?? 0),
          lng: Number(result.location?.lng ?? 0),
        },
      },
    };
  }

  private buildDispatchComment(draft: ParsedDispatchDraft, index: number): string {
    if (draft.quantity === 1) {
      return draft.note;
    }

    return `${draft.note} | Unit ${index + 1} of ${draft.quantity}`;
  }

  private loadMatchCandidates(post: WorkspacePost): void {
    if (!this.user) return;
    const sourcePostType: MatchSourcePostType = this.user.role === 'broker' ? 'brokerPost' : 'carrierPost';
    this.matchesLoading = true;
    this.matchError = '';
    this.matchSnapshot = null;
    this.matchCandidates = [];

    this.matchingApi.createSnapshot({ sourcePostType, sourcePostId: post._id })
      .pipe(finalize(() => (this.matchesLoading = false)))
      .subscribe({
      next: (snapshot) => {
        this.matchSnapshot = snapshot;
        this.matchCandidates = snapshot?.candidates ?? [];
        this.announceMatchSnapshot(post, snapshot);
        if (!this.matchCandidates.length) {
          this.matchError = '';
        }
      },
      error: () => {
        this.matchSnapshot = null;
        this.matchCandidates = [];
        this.matchError = 'The matching agent could not rank this lane right now.';
      },
    });
  }

  private announceMatchSnapshot(post: WorkspacePost, snapshot: MatchSnapshot): void {
    const candidates = snapshot?.candidates ?? [];
    const candidateIds = candidates.slice(0, 5).map((candidate) => candidate.matchPostId).join('|');
    const key = `${post._id}:${candidates.length}:${candidateIds}`;
    if (this.announcedMatchKeys.has(key)) return;
    this.announcedMatchKeys.add(key);

    const counterpart = this.isBroker ? 'trucks' : 'loads';
    const message = candidates.length
      ? `${candidates.length} matching hazmat ${counterpart} found for ${this.formatLane(post)}. Type "show matches" to review them, or "book match 1" when you want me to start the booking conversation.`
      : `No matching hazmat ${counterpart} found yet for ${this.formatLane(post)}. Prometheus will keep checking as counterpart posts line up.`;
    this.appendMatchingBubble('assistant', message, 'Prometheus');
  }

  handleMatchingAssistantEvent(event: MatchingAssistantEvent): void {
    if (!event?.message) return;

    const key = event._id ?? `${event.createdAt ?? ''}:${event.role}:${event.message}`;
    if (this.matchingAssistantEventKeys.has(key)) return;
    this.matchingAssistantEventKeys.add(key);

    const commandText = (event.availableCommands ?? [])
      .map((command) => command.command)
      .filter(Boolean)
      .join(' | ');
    const text = commandText ? `${event.message}\nCommands: ${commandText}` : event.message;
    const sender = event.role === 'user' ? 'user' : event.role === 'system' ? 'system' : 'assistant';
    const label = sender === 'user' ? 'You' : sender === 'system' ? 'Prometheus system' : 'Prometheus';

    this.matchingConsoleMessages = [
      ...this.matchingConsoleMessages,
      {
        ...this.createConsoleBubble(sender, text, label, event.createdAt ?? null),
        id: event._id ?? key,
      },
    ];
    this.refreshSelectedPostMatchesForAssistantEvent(event);
  }

  private refreshSelectedPostMatchesForAssistantEvent(event: MatchingAssistantEvent): void {
    if (!event.sourcePostId || event.role === 'user') return;
    if (event.sourcePostId !== this.selectedPostId) return;

    const post = this.selectedPost;
    if (!post) return;
    this.loadMatchCandidates(post);
  }

  private connectAssistantSocket(): void {
    this.socket.connect();
    if (this.socketSubscription) return;

    this.socketSubscription = this.socket.notify$.subscribe((event: PrometheusSocketEvent) => {
      if (event.type === 'matchingAssistantEvent') {
        this.handleMatchingAssistantEvent(event.data as MatchingAssistantEvent);
        return;
      }
      if (event.type === 'bookingStatusUpdated') {
        this.handleBookingStatusUpdated(event.data as DirectRoomResponse);
        return;
      }
      if (event.type === 'bookingWorkflowUpdated') {
        this.applyUpdatedRoom(event.data as DirectRoomResponse);
      }
    });
  }

  private handleBookingStatusUpdated(updated: DirectRoomResponse): void {
    this.applyUpdatedRoom(updated);

    const room = this.directBookingRooms.find((entry) => (
      entry.brokerPostId === updated.brokerPostId
      && entry.carrierPostId === updated.carrierPostId
    ));
    if (!room || room.id !== this.selectedRoomId) return;

    if (updated.bookingStatus === 'cancelled') {
      if (this.bookingConfirmationWindow?.roomId === room.id) {
        this.closeBookingConfirmation();
      }
      this.loadError = '';
      this.loadMessage = 'The offer was rejected for this booking.';
      this.appendBookingAssistantMessage('assistant', 'Offer rejected. This booking will not move forward unless a new booking is opened.');
      return;
    }

    if (updated.bookingStatus === 'booked' && !this.selectedRoomLoad) {
      this.loadMessage = 'Both sides approved. Prometheus is generating the live load in Booking Chat.';
      this.appendBookingAssistantMessage('assistant', 'Both sides approved the booking. I am generating the live load in Booking Chat now.');
      this.createLoadFromSelectedRoom(true);
    }
  }

  private loadRooms(post: WorkspacePost, preferredRoomId = ''): void {
    this.roomsLoading = true;
    this.messagesApi.getRooms({ postId: post._id }).pipe(finalize(() => {
      this.roomsLoading = false;
      this.loading = false;
    })).subscribe({
      next: (rooms) => {
        this.rooms = this.sortRooms((rooms ?? []).map((room) => this.normalizeRoom(room)));
        this.previewDirectRooms = [];
        this.rooms.forEach((room) => this.syncDirectRoomWorkflowFromRoom(room));
        if (!this.rooms.length) {
          this.previewDirectRooms = this.createPreviewBookingRooms(post);
          this.previewDirectRooms.forEach((room) => this.syncDirectRoomWorkflowFromRoom(room));
          const previewRoom = this.previewDirectRooms.find((room) => room.id === preferredRoomId) ?? this.previewDirectRooms[0];
          if (previewRoom) {
            this.selectRoom(previewRoom.id, true);
          } else {
            this.selectedRoomId = '';
            this.resetChatbbState();
          }
          return;
        }
        const nextRoom = this.rooms.find((room) => room.id === preferredRoomId)
          ?? this.rooms.find((room) => this.roomUnreadCount(room) > 0)
          ?? this.rooms[0];
        this.selectRoom(nextRoom.id, true);
      },
      error: () => {
        this.rooms = [];
        this.previewDirectRooms = this.createPreviewBookingRooms(post);
        this.previewDirectRooms.forEach((room) => this.syncDirectRoomWorkflowFromRoom(room));
        const previewRoom = this.previewDirectRooms[0];
        if (previewRoom) {
          this.selectRoom(previewRoom.id, true);
        } else {
          this.selectedRoomId = '';
          this.resetChatbbState();
        }
      },
    });
  }

  private loadRoomMessages(room: DirectRoom): void {
    this.messagesApi.getMessages(this.getPostPair(room)).subscribe({
      next: (messages) => this.updateRoomMessages(room.id, messages ?? []),
    });
  }

  private loadChatbbThread(): void {
    const room = this.selectedRoom;
    if (!room) {
      this.resetChatbbState();
      return;
    }
    this.chatbbLoading = true;
    this.chatbbError = '';
    this.chatbbApi.getThread(room.carrierPostId, room.brokerPostId).pipe(finalize(() => (this.chatbbLoading = false))).subscribe({
      next: (response) => { this.chatbbMessages = (response.messages ?? []).filter((message) => message.sender !== 'system'); },
      error: () => {
        this.chatbbMessages = [];
        this.chatbbError = 'Prometheus could not load the AI thread for this lane.';
      },
    });
  }

  private createDispatchForm(): FormGroup {
    return this.fb.group({
      capacity: ['full', Validators.required],
      equipmentPreset: ['', Validators.required],
      length: ['', [Validators.required, Validators.min(1)]],
      weight: ['', [Validators.required, Validators.min(1)]],
      contact: ['', Validators.required],
      refNum: [''],
      comment: [''],
      rate: [''],
      bookUrl: [''],
      pickupDate: [''],
      deliveryDate: [''],
      startDate: [''],
      endDate: [''],
      tankerEndorsement: [false],
      nonHazmat: [false],
      team: [false],
      nonTanker: [false],
      origin: this.fb.group({
        city: ['', Validators.required],
        state: ['', Validators.required],
        lat: ['', Validators.required],
        lng: ['', Validators.required],
      }),
      destination: this.fb.group({
        city: [''],
        state: [''],
        lat: [''],
        lng: [''],
      }),
    });
  }

  private buildSearchPayload(post: WorkspacePost): PostSearchPayload | null {
    const length = this.asNumberOrNull(post.length);
    const weight = this.asNumberOrNull(post.weight);
    const capacity = this.optionalString(post.capacity);
    const capacitySearch = this.optionalString(post.capacitySearch) ?? capacity;
    const equipment = Array.isArray(post.equipment)
      ? post.equipment.filter((item): item is string => typeof item === 'string' && !!item.trim())
      : [];
    if (length === null || weight === null || !post.origin || !equipment.length) {
      this.matchError = 'The selected post is missing search fields needed to load counterpart matches.';
      return null;
    }
    return this.removeEmptyOptionalFields({
      length,
      weight,
      capacity,
      capacitySearch,
      equipment,
      origin: post.origin,
      destination: post.destination,
      startDate: this.dateValue(post.startDate) ?? undefined,
      endDate: this.dateValue(post.endDate) ?? undefined,
      dhoRadius: this.asNumberOrNull(post.dhoRadius) ?? undefined,
      dhdRadius: this.asNumberOrNull(post.dhdRadius) ?? undefined,
      stops: Array.isArray(post.stops) ? post.stops : undefined,
    }) as PostSearchPayload;
  }

  private submitBrokerDispatch(): Observable<WorkspacePost> | null {
    const payload = this.buildBrokerPayload();
    if (!payload) return null;
    return this.dispatchMode === 'edit' ? this.postsApi.updateBrokerPost(payload) : this.postsApi.createBrokerPost(payload);
  }

  private submitCarrierDispatch(): Observable<WorkspacePost> | null {
    const payload = this.buildCarrierPayload();
    if (!payload) return null;
    return this.dispatchMode === 'edit' ? this.postsApi.updateCarrierPost(payload) : this.postsApi.createCarrierPost(payload);
  }

  private buildBrokerPayload(): BrokerPostUpsertPayload | null {
    const raw = this.dispatchForm.getRawValue();
    const origin = this.buildPlacePayload('origin', true);
    const destination = this.buildPlacePayload('destination', true);
    const pickupDate = this.requiredDate(raw.pickupDate, 'Pickup date is required for broker posts.');
    const deliveryDate = this.requiredDate(raw.deliveryDate, 'Delivery date is required for broker posts.');
    const equipment = this.resolveEquipmentCodes(raw.equipmentPreset);
    if (!origin || !destination || !pickupDate || !deliveryDate || !equipment) return null;
    const distance = this.estimateDistanceMiles(origin, destination);
    return this.removeEmptyOptionalFields({
      _id: this.dispatchMode === 'edit' ? this.selectedPost?._id : undefined,
      length: Number(raw.length),
      weight: Number(raw.weight),
      capacity: String(raw.capacity),
      equipment,
      contact: String(raw.contact).trim(),
      origin,
      destination,
      stops: [
        { type: 'pickUp', place: origin, startDate: pickupDate, endDate: pickupDate, comment: '' },
        { type: 'delivery', place: destination, startDate: deliveryDate, endDate: deliveryDate, comment: '' },
      ],
      distance,
      stopsDistances: [distance],
      comment: this.optionalString(raw.comment),
      bookUrl: this.optionalString(raw.bookUrl),
      refNum: this.optionalString(raw.refNum),
      rate: this.asNumberOrNull(raw.rate) ?? undefined,
      tankerEndorsement: Boolean(raw.tankerEndorsement),
      nonHazmat: Boolean(raw.nonHazmat),
      team: Boolean(raw.team),
    });
  }

  private buildCarrierPayload(): CarrierPostUpsertPayload | null {
    const raw = this.dispatchForm.getRawValue();
    const origin = this.buildPlacePayload('origin', true);
    const destination = this.buildPlacePayload('destination', false);
    const startDate = this.requiredDate(raw.startDate, 'Start date is required for carrier posts.');
    const endDate = this.requiredDate(raw.endDate, 'End date is required for carrier posts.');
    const equipment = this.resolveEquipmentCodes(raw.equipmentPreset);
    if (!origin || !startDate || !endDate || !equipment) return null;
    return this.removeEmptyOptionalFields({
      _id: this.dispatchMode === 'edit' ? this.selectedPost?._id : undefined,
      length: Number(raw.length),
      weight: Number(raw.weight),
      capacity: String(raw.capacity),
      equipment,
      contact: String(raw.contact).trim(),
      startDate,
      endDate,
      origin,
      destination: destination ?? undefined,
      comment: this.optionalString(raw.comment),
      refNum: this.optionalString(raw.refNum),
      distance: destination ? this.estimateDistanceMiles(origin, destination) : undefined,
      team: Boolean(raw.team),
      nonTanker: Boolean(raw.nonTanker),
    });
  }

  private buildPlacePayload(groupName: 'origin' | 'destination', required: boolean): ManualPlacePayload | null {
    const group = this.dispatchForm.get(groupName) as FormGroup | null;
    if (!group) {
      this.dispatchError = 'The dispatch form is missing location fields.';
      return null;
    }
    const raw = group.getRawValue() as { city: string; state: string; lat: string | number; lng: string | number };
    const city = String(raw.city ?? '').trim();
    const state = String(raw.state ?? '').trim().toUpperCase();
    const lat = this.asNumberOrNull(raw.lat);
    const lng = this.asNumberOrNull(raw.lng);
    const hasAnyValue = Boolean(city || state || raw.lat || raw.lng);
    if (!required && !hasAnyValue) return null;
    if (!city || !state || lat === null || lng === null) {
      this.dispatchError = groupName === 'origin'
        ? 'Origin city, state, latitude, and longitude are required.'
        : 'Destination city, state, latitude, and longitude must all be filled together.';
      return null;
    }
    return {
      type: 'place',
      place: { city, state },
      location: { type: 'Point', coordinates: { lat, lng } },
    };
  }

  private requiredDate(value: unknown, message: string): string | null {
    const date = this.isoDateValue(value);
    if (!date) {
      this.dispatchError = message;
      return null;
    }
    return date;
  }

  private resolveEquipmentCodes(presetValue: unknown): string[] | null {
    const preset = this.equipmentPresets.find((option) => option.value === String(presetValue ?? ''));
    if (!preset) {
      this.dispatchError = 'Choose an equipment preset for this post.';
      return null;
    }
    return preset.codes;
  }

  private saveDispatchDefaults(): void {
    const raw = this.dispatchForm.getRawValue();
    localStorage.setItem(this.dispatchDefaultsKey, JSON.stringify({
      length: this.asNumberOrNull(raw.length),
      weight: this.asNumberOrNull(raw.weight),
      contact: this.optionalString(raw.contact),
    }));
  }

  private getStoredDispatchDefaults(): { length?: number; weight?: number; contact?: string } {
    try {
      const stored = localStorage.getItem(this.dispatchDefaultsKey);
      return stored ? (JSON.parse(stored) as { length?: number; weight?: number; contact?: string }) : {};
    } catch {
      return {};
    }
  }

  private loadSavedTemplates(): void {
    try {
      const stored = localStorage.getItem(this.dispatchTemplatesKey);
      this.savedTemplates = stored ? (JSON.parse(stored) as SavedDispatchTemplate[]) : [];
    } catch {
      this.savedTemplates = [];
    }
  }

  private persistSavedTemplates(): void {
    localStorage.setItem(this.dispatchTemplatesKey, JSON.stringify(this.savedTemplates));
  }

  private loadDirectConsoleState(): void {
    try {
      const storedWorkflow = localStorage.getItem(this.directWorkflowKey);
      this.directWorkflow = storedWorkflow ? JSON.parse(storedWorkflow) as Record<string, DirectRoomWorkflowState> : {};
    } catch {
      this.directWorkflow = {};
    }

    try {
      const storedContacts = localStorage.getItem(this.directContactsKey);
      const parsed = storedContacts ? JSON.parse(storedContacts) as DirectContactRecord[] : [];
      this.directContacts = parsed.map((contact) => ({
        ...contact,
        roomId: contact.roomId ?? null,
        status: contact.status ?? 'saved',
        muted: Boolean(contact.muted),
        archived: Boolean(contact.archived),
        deleted: Boolean(contact.deleted),
      }));
    } catch {
      this.directContacts = [];
    }

    try {
      const storedMail = localStorage.getItem(this.directMailKey);
      this.directMailThreads = storedMail ? JSON.parse(storedMail) as Record<string, DirectMailEntry[]> : {};
    } catch {
      this.directMailThreads = {};
    }

    try {
      const storedCompany = localStorage.getItem(this.companyChatKey);
      this.companyChatThreads = storedCompany ? JSON.parse(storedCompany) as Record<string, CompanyThreadMessage[]> : {};
    } catch {
      this.companyChatThreads = {};
    }

    if (!Object.keys(this.companyChatThreads).length) {
      this.companyChatThreads = {
        'company-ops': [
          {
            id: 'company-ops-seed-1',
            author: 'Operations desk',
            text: 'Need coverage on the Chicago outbound board after 5 PM. Post updates here before shift handoff.',
            sender: 'peer',
            date: new Date().toISOString(),
          },
          {
            id: 'company-ops-seed-2',
            author: 'You',
            text: 'Copy that. I will keep the live loads covered and update any broker delays here.',
            sender: 'me',
            date: new Date().toISOString(),
          },
        ],
        'company-billing': [
          {
            id: 'company-billing-seed-1',
            author: 'Billing desk',
            text: 'Send delivered loads here once the BOL is attached so billing can move them out fast.',
            sender: 'peer',
            date: new Date().toISOString(),
          },
        ],
        'company-safety': [
          {
            id: 'company-safety-seed-1',
            author: 'Safety team',
            text: 'Tracking alerts and ELD issues should be posted here before the broker escalates.',
            sender: 'peer',
            date: new Date().toISOString(),
          },
        ],
      };
      this.persistCompanyChatThreads();
    }

    this.selectedCompanyThreadId = this.companyThreadSummaries[0]?.id ?? '';
  }

  private persistDirectWorkflow(): void {
    localStorage.setItem(this.directWorkflowKey, JSON.stringify(this.directWorkflow));
  }

  private createDirectContactRecordFromEntry(entry: BrokerDeskEntry): DirectContactRecord {
    const existing = this.findDirectContactForEntry(entry);
    const now = new Date().toISOString();
    return {
      id: existing?.id ?? (entry.roomId ? `contact-${entry.roomId}` : `broker-${Date.now()}`),
      roomId: existing?.roomId ?? entry.roomId,
      companyName: entry.companyName,
      contactName: entry.contactName,
      email: entry.email,
      phone: entry.phone,
      savedAt: existing?.savedAt ?? now,
      updatedAt: now,
      status: entry.status === 'pending' ? 'pending' : 'saved',
      note: existing?.note ?? entry.note,
      muted: existing?.muted ?? entry.muted,
      archived: existing?.archived ?? entry.archived,
      deleted: false,
    };
  }

  private findDirectContactForEntry(entry: BrokerDeskEntry): DirectContactRecord | undefined {
    const email = this.normalizeDirectContactKeyValue(entry.email);
    return this.directContacts.find((contact) => (
      contact.id === entry.id
      || (!!entry.roomId && contact.roomId === entry.roomId)
      || (!!email && this.normalizeDirectContactKeyValue(contact.email) === email)
    ));
  }

  private upsertDirectContact(record: DirectContactRecord, limit: number): void {
    this.directContacts = [
      record,
      ...this.directContacts.filter((entry) => !this.isSameDirectContact(entry, record)),
    ].slice(0, limit);
  }

  private isSameDirectContact(left: DirectContactRecord, right: DirectContactRecord): boolean {
    const leftEmail = this.normalizeDirectContactKeyValue(left.email);
    const rightEmail = this.normalizeDirectContactKeyValue(right.email);
    return left.id === right.id
      || (!!left.roomId && !!right.roomId && left.roomId === right.roomId)
      || (!!leftEmail && !!rightEmail && leftEmail === rightEmail);
  }

  private primaryDirectContactKey(contact: DirectContactRecord): string {
    return this.directContactKeys(contact)[0] ?? `contact:${contact.id}`;
  }

  private primaryDirectRoomKey(room: DirectRoom): string {
    return this.directRoomContactKeys(room)[0] ?? `room:${room.id}`;
  }

  private directContactKeys(contact: DirectContactRecord): string[] {
    const keys: string[] = [];
    const email = this.normalizeDirectContactKeyValue(contact.email);
    if (email) keys.push(`contact:${email}`);
    if (contact.roomId) keys.push(`room:${contact.roomId}`);
    keys.push(`contact:${contact.id}`);
    return keys;
  }

  private directRoomContactKeys(room: DirectRoom): string[] {
    const keys: string[] = [];
    const email = this.normalizeDirectContactKeyValue(room.contactEmail);
    if (email) keys.push(`contact:${email}`);
    keys.push(`room:${room.id}`);
    return keys;
  }

  private brokerDeskSearchText(entry: BrokerDeskEntry): string {
    return [
      entry.contactName,
      entry.companyName,
      entry.email,
      entry.phone,
      entry.note,
    ].join(' ').toLowerCase();
  }

  private normalizeDirectContactKeyValue(value: string | null | undefined): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private persistDirectContacts(): void {
    localStorage.setItem(this.directContactsKey, JSON.stringify(this.directContacts));
  }

  private persistDirectMailThreads(): void {
    localStorage.setItem(this.directMailKey, JSON.stringify(this.directMailThreads));
  }

  private persistCompanyChatThreads(): void {
    localStorage.setItem(this.companyChatKey, JSON.stringify(this.companyChatThreads));
  }

  private isPreviewRoom(roomId: string): boolean {
    return roomId.startsWith('preview-room-');
  }

  private resolveRoomWorkflow(room: DirectRoom | null | undefined): DirectRoomWorkflowState | null {
    if (!room) return null;
    return this.directWorkflow[room.id] ?? this.getPreviewWorkflow(room.id) ?? null;
  }

  private getBookingRoomMetaItems(room: DirectRoom | null | undefined): string[] {
    if (!room) return [];

    const workflow = this.resolveRoomWorkflow(room);
    const load = this.selectedRoom?.id === room.id ? this.selectedRoomLoad : null;
    const driverLabel = workflow?.driverName
      ? workflow.truckLabel ? `${workflow.driverName} / ${workflow.truckLabel}` : workflow.driverName
      : load?.driver?.name
        ? load.driver.truckLabel ? `${load.driver.name} / ${load.driver.truckLabel}` : load.driver.name
        : '';

    return [
      this.stringValue(room.post?.refNum) || load?.reference || '',
      room.companyName || load?.broker?.companyName || '',
      driverLabel,
    ].filter((item): item is string => Boolean(item && item.trim()));
  }

  private previewCompanyThreadSummaries(): CompanyThreadSummary[] {
    return [
      {
        id: 'company-ops',
        name: 'Operations desk',
        roleLabel: 'Dispatch floor',
        snapshot: 'Live dispatcher coverage and load handoff notes.',
        unread: 2,
      },
      {
        id: 'company-billing',
        name: 'Billing desk',
        roleLabel: 'Ready to bill',
        snapshot: 'BOL follow-up, rate checks, and billing prep.',
        unread: 1,
      },
      {
        id: 'company-safety',
        name: 'Safety team',
        roleLabel: 'Tracking / issues',
        snapshot: 'Tracking problems, ELD questions, and service alerts.',
        unread: 3,
      },
    ];
  }

  private createPreviewBookingRooms(post: WorkspacePost | null): DirectRoom[] {
    const selectedLane = this.formatLane(post);
    const firstLane = selectedLane !== 'Select a post' ? selectedLane : 'Chicago, IL -> Philadelphia, PA';

    return [
      this.buildPreviewRoom({
        id: 'preview-room-1',
        refNum: 'LD-4721',
        lane: firstLane,
        equipmentLabel: "V 53' / 42,000 lbs",
        contactName: 'Brooke Broker',
        contactEmail: 'brooke@coyote.com',
        contactPhone: '(312) 555-0187',
        companyName: 'Coyote Logistics',
        companyMc: '102938',
        maxBid: 2500,
        unreadCount: 2,
        messages: [
          {
            text: 'Pickup is tonight at 8:00 PM in Chicago. Can your driver make it?',
            type: 'message',
            date: new Date().toISOString(),
            role: 'broker',
          },
          {
            text: 'Driver is ready in Chicago now. We can take it and move to setup.',
            type: 'message',
            date: new Date().toISOString(),
            role: 'carrier',
          },
        ],
      }),
      this.buildPreviewRoom({
        id: 'preview-room-2',
        refNum: 'LD-5810',
        lane: 'Joliet, IL -> Atlanta, GA',
        equipmentLabel: "R 53' / 38,000 lbs",
        contactName: 'Casey Booker',
        contactEmail: 'casey@nolantransport.com',
        contactPhone: '(773) 555-0110',
        companyName: 'Nolan Transport',
        companyMc: '287441',
        maxBid: 2100,
        unreadCount: 1,
        messages: [
          {
            text: 'Best rate to book this lane is $2100 if the truck can hold for the late pickup.',
            type: 'message',
            date: new Date().toISOString(),
            role: 'broker',
          },
        ],
      }),
      this.buildPreviewRoom({
        id: 'preview-room-3',
        refNum: 'LD-6624',
        lane: 'Gary, IN -> Charlotte, NC',
        equipmentLabel: "V 53' / 44,000 lbs",
        contactName: 'Dana Ops',
        contactEmail: 'dana@uberfreight.com',
        contactPhone: '(219) 555-0104',
        companyName: 'Uber Freight',
        companyMc: '558210',
        maxBid: 2950,
        unreadCount: 3,
        messages: [
          {
            text: 'We can book this as soon as setup and tracking are confirmed.',
            type: 'message',
            date: new Date().toISOString(),
            role: 'broker',
          },
        ],
      }),
    ];
  }

  private buildPreviewRoom(config: {
    id: string;
    refNum: string;
    lane: string;
    equipmentLabel: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    companyName: string;
    companyMc: string;
    maxBid: number;
    unreadCount?: number;
    messages: DirectMessage[];
  }): DirectRoom {
    const [origin, destination] = config.lane.split(' -> ');
    const [originCity, originState] = origin.split(', ');
    const [destinationCity, destinationState] = destination.split(', ');
    const previewPost: WorkspacePost = {
      _id: `${config.id}-post`,
      origin: this.createPreviewPlace(originCity, originState),
      destination: this.createPreviewPlace(destinationCity, destinationState),
      equipment: [config.equipmentLabel],
      refNum: config.refNum,
      rate: config.maxBid,
      contact: config.contactName,
      companyName: config.companyName,
      companyMc: config.companyMc,
      companyEmail: config.contactEmail,
      companyPhone: config.contactPhone,
      companyData: {
        name: config.companyName,
        mc: config.companyMc,
        email: config.contactEmail,
        phone: config.contactPhone,
      },
      userData: {
        firstName: config.contactName.split(' ')[0],
        lastName: config.contactName.split(' ').slice(1).join(' '),
        email: config.contactEmail,
        phone: config.contactPhone,
      },
    };

    return {
      id: config.id,
      lane: config.lane,
      equipmentLabel: config.equipmentLabel,
      contactName: config.contactName,
      contactEmail: config.contactEmail,
      contactPhone: config.contactPhone,
      companyName: config.companyName,
      companyMc: config.companyMc,
      post: previewPost,
      messages: config.messages,
      seen: { brokerCount: config.unreadCount ?? 0, carrierCount: config.unreadCount ?? 0 },
      maxBid: config.maxBid,
      lastMessageAt: new Date().toISOString(),
      brokerPostId: `${config.id}-broker`,
      carrierPostId: `${config.id}-carrier`,
      brokerId: `${config.id}-broker-user`,
      carrierId: `${config.id}-carrier-user`,
      sameId: false,
    };
  }

  private createPreviewPlace(city: string, state: string): PostLocation {
    return {
      type: 'place',
      place: { city, state },
    };
  }

  private getPreviewWorkflow(roomId: string): DirectRoomWorkflowState | null {
    if (roomId === 'preview-room-1') {
      return {
        brokerApproved: true,
        carrierApproved: true,
        consoleOpened: true,
        setupProvider: 'highway',
        driverId: 'drv-bob',
        driverName: 'Bob Carter',
        truckLabel: "Unit 401 / V 53'",
        trackingProvider: 'MacroPoint',
        trackingShared: false,
        contactSaved: false,
        delivered: false,
      };
    }
    if (roomId === 'preview-room-2') {
      return {
        brokerApproved: true,
        carrierApproved: false,
        consoleOpened: false,
        setupProvider: null,
        driverId: null,
        driverName: '',
        truckLabel: '',
        trackingProvider: null,
        trackingShared: false,
        contactSaved: false,
        delivered: false,
      };
    }
    if (roomId === 'preview-room-3') {
      return {
        brokerApproved: true,
        carrierApproved: true,
        consoleOpened: true,
        setupProvider: 'truckstop',
        driverId: 'drv-sam',
        driverName: 'Sam Patel',
        truckLabel: "Unit 330 / F 48'",
        trackingProvider: '4Kites',
        trackingShared: true,
        contactSaved: true,
        delivered: false,
      };
    }
    return null;
  }

  private ensureDirectRoomWorkflow(roomId: string): DirectRoomWorkflowState {
    const existing = this.directWorkflow[roomId];
    if (existing) {
      const normalized: DirectRoomWorkflowState = {
        brokerApproved: Boolean(existing.brokerApproved),
        carrierApproved: Boolean(existing.carrierApproved),
        consoleOpened: Boolean(existing.consoleOpened),
        setupProvider: existing.setupProvider ?? null,
        driverId: existing.driverId ?? null,
        driverName: existing.driverName ?? '',
        truckLabel: existing.truckLabel ?? '',
        trackingProvider: existing.trackingProvider ?? null,
        trackingShared: Boolean(existing.trackingShared),
        contactSaved: Boolean(existing.contactSaved),
        delivered: Boolean(existing.delivered),
      };
      this.directWorkflow = { ...this.directWorkflow, [roomId]: normalized };
      return normalized;
    }

    const created: DirectRoomWorkflowState = this.getPreviewWorkflow(roomId) ?? {
      brokerApproved: false,
      carrierApproved: false,
      consoleOpened: false,
      setupProvider: null,
      driverId: null,
      driverName: '',
      truckLabel: '',
      trackingProvider: null,
      trackingShared: false,
      contactSaved: false,
      delivered: false,
    };
    this.directWorkflow = { ...this.directWorkflow, [roomId]: created };
    this.persistDirectWorkflow();
    return created;
  }

  private syncDirectRoomWorkflowFromRoom(room: DirectRoom): DirectRoomWorkflowState {
    const workflow = this.ensureDirectRoomWorkflow(room.id);
    const remoteWorkflow = room.bookingWorkflow ?? null;
    const synced: DirectRoomWorkflowState = {
      ...workflow,
      brokerApproved: Boolean(room.brokerApprovedBooking),
      carrierApproved: Boolean(room.carrierApprovedBooking),
      consoleOpened: room.bookingStatus === 'booked'
        ? true
        : room.bookingStatus === 'cancelled'
          ? false
          : workflow.consoleOpened,
      setupProvider: remoteWorkflow?.setupProvider ?? workflow.setupProvider,
      driverId: remoteWorkflow?.driverId ?? workflow.driverId,
      driverName: remoteWorkflow?.driverName ?? workflow.driverName,
      truckLabel: remoteWorkflow?.truckLabel ?? workflow.truckLabel,
      trackingProvider: remoteWorkflow?.trackingProvider ?? workflow.trackingProvider,
      trackingShared: Boolean(remoteWorkflow?.trackingShared ?? workflow.trackingShared),
      contactSaved: Boolean(remoteWorkflow?.contactSaved ?? workflow.contactSaved),
      delivered: Boolean(remoteWorkflow?.delivered ?? workflow.delivered),
    };
    this.directWorkflow = { ...this.directWorkflow, [room.id]: synced };
    this.persistDirectWorkflow();
    return synced;
  }

  private persistSelectedBookingWorkflow(
    action: UpdateDirectRoomWorkflowPayload['action'],
    values: Partial<UpdateDirectRoomWorkflowPayload> = {}
  ): void {
    const room = this.selectedRoom;
    if (!room || this.isPreviewRoom(room.id)) return;
    const updateBookingWorkflow = this.messagesApi.updateBookingWorkflow?.bind(this.messagesApi);
    if (!updateBookingWorkflow) return;

    const payload = this.removeEmptyOptionalFields({
      ...this.getPostPair(room),
      action,
      ...values,
    }) as UpdateDirectRoomWorkflowPayload;

    updateBookingWorkflow(payload).pipe(
      catchError((error) => {
        console.warn('Booking Chat workflow sync failed; keeping local state until refresh.', error);
        return of(null);
      })
    ).subscribe((updated) => {
      if (updated?.brokerPostId && updated?.carrierPostId) {
        this.applyUpdatedRoom(updated);
      }
    });
  }

  private handleBookingAssistantWorkflow(prompt: string): boolean {
    const room = this.selectedRoom;
    if (!room) return false;

    const normalized = prompt.trim().toLowerCase();
    if (this.isRouteIntelligenceCommand(normalized)) {
      this.appendBookingAssistantMessage('user', prompt);
      this.openBookingRouteIntelligencePanel();
      return true;
    }

    if (!this.bookingAssistantAction) {
      if (this.canOpenBookingConfirmation(room)) {
        if (this.isBookingApprovalReply(normalized)) {
          this.appendBookingAssistantMessage('user', prompt);
          this.openBookingConfirmation('approve');
          return true;
        }
        if (this.isBookingRejectionReply(normalized)) {
          this.appendBookingAssistantMessage('user', prompt);
          this.openBookingConfirmation('reject');
          return true;
        }
      }
      return false;
    }

    this.appendBookingAssistantMessage('user', prompt);

    switch (this.bookingAssistantAction) {
      case 'setupProvider': {
        const connectedChoice = this.bookingSetupProviderActions.find((action) => (
          action.type === 'chooseSetupProvider'
          && (
            normalized.includes(action.label.toLowerCase())
            || (!!action.value && normalized.includes(action.value.toLowerCase()))
          )
        ));
        if (connectedChoice) {
          this.executeSetupProvider(connectedChoice.value || connectedChoice.label, connectedChoice.label, connectedChoice.integrationChoice);
          return true;
        }
        const provider = this.parseSetupProvider(normalized);
        if (!provider) {
          const options = this.bookingSetupProviderActions
            .filter((action) => action.type === 'chooseSetupProvider')
            .map((action) => action.label)
            .join(', ');
          this.appendBookingAssistantMessage('assistant', `Reply with ${options || 'a setup provider'} so I can stage the setup connection.`);
          return true;
        }
        this.executeSetupProvider(provider);
        return true;
      }
      case 'driverSelection': {
        const driver = this.findDriverFromPrompt(normalized);
        if (!driver) {
          this.appendBookingAssistantMessage('assistant', 'I could not match that driver. Reply with a listed driver name so I can assign the truck.');
          return true;
        }
        this.assignDriverToSelectedRoom(driver);
        return true;
      }
      case 'trackingConnect': {
        const connectedChoice = this.bookingTrackingProviderActions.find((action) => (
          action.type === 'chooseTrackingProvider'
          && (
            normalized.includes(action.label.toLowerCase())
            || (!!action.value && normalized.includes(action.value.toLowerCase()))
          )
        ));
        if (connectedChoice) {
          this.executeTrackingProvider(connectedChoice.value || connectedChoice.label, connectedChoice.label, connectedChoice.integrationChoice);
          return true;
        }
        if (normalized.includes('macro')) {
          this.executeTrackingProvider('macropoint', 'MacroPoint', { provider: 'macropoint', label: 'MacroPoint', category: 'tracking', source: 'broker' });
          return true;
        }
        if (
          normalized.includes('eld')
          || normalized.includes('api')
          || normalized.includes('connect')
          || normalized.includes('tracking')
        ) {
          this.bookingAssistantAction = 'trackingApi';
          this.appendBookingAssistantMessage('assistant', 'Paste the ELD or tracking API token now. Prometheus will stage the connector and then ask if you want to allow tracking.');
          return true;
        }
        if (this.isAffirmative(normalized)) {
          this.bookingAssistantAction = 'trackingApi';
          this.appendBookingAssistantMessage('assistant', 'Paste the ELD or tracking API token now. Prometheus will stage the connector and then ask if you want to allow tracking.');
          return true;
        }
        if (this.isNegative(normalized)) {
          this.bookingAssistantAction = null;
          this.appendBookingAssistantMessage('assistant', 'Okay. Tracking stays red until an ELD or broker tracking provider is connected.');
          return true;
        }
        this.appendBookingAssistantMessage('assistant', 'Reply yes to connect an ELD/tracking API now, or no to keep tracking disabled.');
        return true;
      }
      case 'trackingApi': {
        const workflow = this.ensureDirectRoomWorkflow(room.id);
        const providerLabel = normalized.includes('macro')
          ? 'MacroPoint'
          : normalized.includes('4k')
            ? '4Kites'
            : normalized.includes('four')
              ? 'FourKites'
              : 'ELD API';
        const tokenLabel = prompt.length > 4 ? ` ending in ${prompt.slice(-4)}` : '';
        workflow.trackingProvider = `${providerLabel}${tokenLabel}`;
        this.persistDirectWorkflow();
        this.bookingAssistantAction = 'trackingAllow';
        this.appendBookingAssistantMessage('assistant', `${providerLabel} is staged. Do you want to allow tracking for this truck now? Reply yes or no.`);
        return true;
      }
      case 'trackingAllow': {
        if (this.isAffirmative(normalized)) {
          this.handleTrackingAssist(true);
          return true;
        }
        if (this.isNegative(normalized)) {
          this.handleTrackingAssist(false);
          return true;
        }
        this.appendBookingAssistantMessage('assistant', 'Reply yes to turn tracking green for this booking, or no to keep it red.');
        return true;
      }
      case 'cancelTonu': {
        if (
          normalized.includes('tonu')
          || normalized.includes('accessorial')
          || normalized.includes('waiting')
          || normalized.includes('wait')
        ) {
          this.handleSelectedLoadCancellation(true);
          this.bookingAssistantAction = null;
          return true;
        }
        if (this.isAffirmative(normalized)) {
          this.handleSelectedLoadCancellation(true);
          this.bookingAssistantAction = null;
          return true;
        }
        if (this.isNegative(normalized)) {
          this.handleSelectedLoadCancellation(false);
          this.bookingAssistantAction = null;
          return true;
        }
        this.appendBookingAssistantMessage('assistant', 'Reply yes if the cancellation is waiting on TONU, or no if the load should be deleted now.');
        return true;
      }
      case 'deliverConfirm': {
        if (this.isAffirmative(normalized)) {
          this.confirmSelectedBookingDelivered();
          return true;
        }
        if (this.isNegative(normalized)) {
          this.bookingAssistantAction = null;
          this.appendBookingAssistantMessage('assistant', 'Delivered was canceled. The load stays active in Booking chat.');
          return true;
        }
        this.appendBookingAssistantMessage('assistant', 'Reply yes to mark this load delivered and move it to Ready to bill, or no to keep it active.');
        return true;
      }
      default:
        return false;
    }
  }

  private confirmSelectedBookingDelivered(): void {
    const room = this.selectedRoom;
    const load = this.selectedRoomLoad;
    if (!room || !load) {
      this.bookingAssistantAction = null;
      return;
    }
    this.bookingAssistantAction = null;
    this.updateLoadBoardStatus(
      load._id,
      'readyToBill',
      'Delivered from Booking chat. Ready for billing review.',
      () => {
        const workflow = this.ensureDirectRoomWorkflow(room.id);
        workflow.delivered = true;
        this.persistDirectWorkflow();
        this.persistSelectedBookingWorkflow('delivered', { delivered: true });
        this.appendBookingAssistantMessage('assistant', 'Delivered is confirmed. The load is moving to Ready to bill.');
      }
    );
  }

  private appendBookingAssistantMessage(sender: 'assistant' | 'user', text: string): void {
    this.chatbbMessages = [
      ...this.chatbbMessages,
      {
        sender,
        text,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  private parseSetupProvider(normalized: string): SetupProvider | null {
    if (normalized.includes('highway')) return 'highway';
    if (normalized.includes('carrier') || normalized.includes('packet')) return 'mycarrierpacket';
    if (normalized.includes('truckstop')) return 'truckstop';
    return null;
  }

  private setupProviderDisplayLabel(provider: string): string {
    if (provider === 'highway') return 'Highway';
    if (provider === 'mycarrierpacket') return 'MyCarrierPacket';
    if (provider === 'truckstop') return 'Truckstop';
    if (provider === 'manual') return 'Manual packet';
    return provider
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private defaultSetupProviderActions(): BookingAssistantAction[] {
    return [
      { type: 'chooseSetupProvider', label: 'Highway', value: 'highway' },
      { type: 'chooseSetupProvider', label: 'MyCarrierPacket', value: 'mycarrierpacket' },
      { type: 'chooseSetupProvider', label: 'Truckstop', value: 'truckstop' },
    ];
  }

  private defaultTrackingProviderActions(): BookingAssistantAction[] {
    return [
      { type: 'connectEld', label: 'Connect ELD' },
      { type: 'sendMacroPoint', label: 'Send MacroPoint' },
    ];
  }

  private activeRoomIntegrationChoices(choices: RoomIntegrationChoice[] | undefined): RoomIntegrationChoice[] {
    return (choices ?? [])
      .filter((choice) => Boolean(choice?.provider || choice?.label))
      .map((choice) => ({
        ...choice,
        provider: this.stringValue(choice.provider) || this.stringValue(choice.label),
        label: this.stringValue(choice.label) || this.stringValue(choice.provider),
      }))
      .filter((choice) => Boolean(choice.provider && choice.label));
  }

  private handleRoomIntegrationLookupError(error: unknown): Observable<null> {
    console.warn('Booking Chat room integration lookup failed; using manual provider choices.', error);
    return of(null);
  }

  private findDriverFromPrompt(normalized: string): DriverRosterItem | null {
    return this.driverRoster.find((driver) => (
      normalized.includes(driver.name.toLowerCase())
      || normalized.includes(driver.truckLabel.toLowerCase())
    )) ?? null;
  }

  private isAffirmative(value: string): boolean {
    return ['yes', 'y', 'confirm', 'approved', 'allow', 'share', 'go ahead'].some((token) => value.includes(token));
  }

  private isNegative(value: string): boolean {
    return ['no', 'n', 'stop', 'cancel', 'not now', 'keep red'].some((token) => value.includes(token));
  }

  private canOpenBookingConfirmation(room: DirectRoom): boolean {
    return !this.selectedRoomLoad
      && room.bookingStatus !== 'booked'
      && room.bookingStatus !== 'cancelled'
      && !this.currentUserApprovedBooking(room);
  }

  private isBookingApprovalReply(value: string): boolean {
    return this.isAffirmative(value)
      || ['book it', 'book this', 'lets book', "let's book", 'accept booking', 'approve booking', 'take it'].some((token) => value.includes(token));
  }

  private isBookingRejectionReply(value: string): boolean {
    return this.isNegative(value)
      || ['reject offer', 'reject booking', 'decline', 'deny'].some((token) => value.includes(token));
  }

  private primeConsoleMessages(): void {
    if (!this.dispatchConsoleMessages.length) {
      this.dispatchConsoleMessages = [
        this.createConsoleBubble(
          'assistant',
          `Please post your ${this.dispatchRoleLabel} manually, using Excel, PDF, or connect your TMS. Type the posting in the bar below and press Enter.`,
          'Dispatch bot'
        ),
      ];
    }

    if (!this.matchingConsoleMessages.length) {
      this.matchingConsoleMessages = [
        this.createConsoleBubble(
          'assistant',
          this.buildTransportationCenterGreeting(),
          'Prometheus'
        ),
      ];
    }
  }

  private buildTransportationCenterGreeting(now = new Date()): string {
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const name = this.user?.firstName ? `, ${this.user.firstName}` : '';
    return `${greeting}${name}. AI Transportation Center is awake.\nPost hazmat ${this.dispatchRoleLabel}, ask for matches, rates, route context, setup, tracking, or booking help in this one chat.\nI will also call out operational risks here: late drivers, missed pickup windows, tracking gaps, equipment conflicts, road closures, and loads that need attention.`;
  }

  private appendDispatchBubble(sender: 'assistant' | 'user', text: string, label = sender === 'assistant' ? 'Dispatch bot' : 'You'): void {
    this.dispatchConsoleMessages = [...this.dispatchConsoleMessages, this.createConsoleBubble(sender, text, label)];
    this.queueDispatchThreadScroll();
  }

  private appendMatchingBubble(sender: 'assistant' | 'user' | 'system', text: string, label = sender === 'assistant' ? 'Prometheus' : 'You'): void {
    this.matchingConsoleMessages = [...this.matchingConsoleMessages, this.createConsoleBubble(sender, text, label)];
  }

  private addSystemNotice(message: string): void {
    this.brainSettingsMessage = message;
  }

  private resetBrokerInviteForm(): void {
    this.brokerInviteForm = {
      contactName: '',
      companyName: '',
      email: '',
      phone: '',
    };
  }

  private createConsoleBubble(sender: 'assistant' | 'user' | 'system', text: string, label: string, createdAt: string | null = null): ConsoleBubble {
    return {
      id: `${sender}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      sender,
      text,
      label,
      createdAt,
    };
  }

  private buildTemplatePrompt(post: WorkspacePost): string {
    const comment = this.stringValue(post.comment).split('| Unit ')[0].trim();
    if (comment) return comment;

    const metric = this.formatMetric(post);
    return `${this.isBroker ? '1 load' : '1 truck'} from ${this.formatLocation(post.origin)} to ${this.formatLocation(post.destination)} ${this.formatEquipment(post)} ${metric}`;
  }

  private normalizeRoom(room: DirectRoomResponse): DirectRoom {
    const messages = this.normalizeMessages(room.messages ?? []);
    const post = room.post;
    return {
      id: post._id,
      lane: this.formatLane(post),
      equipmentLabel: this.formatEquipment(post),
      contactName: [room.user?.firstName, room.user?.lastName].filter(Boolean).join(' ') || 'Direct contact',
      contactEmail: room.user?.email ?? '',
      contactPhone: room.user?.phone ?? '',
      companyName: room.company?.name ?? 'Unknown company',
      companyMc: room.company?.mc ?? null,
      post,
      messages,
      seen: {
        brokerCount: Number(room.seen?.brokerCount ?? 0),
        carrierCount: Number(room.seen?.carrierCount ?? 0),
      },
      maxBid: this.extractLatestBid(messages),
      lastMessageAt: messages.length ? messages[messages.length - 1].date ?? null : null,
      brokerPostId: room.brokerPostId,
      carrierPostId: room.carrierPostId,
      brokerId: room.brokerId,
      carrierId: room.carrierId,
      sameId: room.carrierId === room.brokerId,
      bookingStatus: room.bookingStatus ?? 'negotiating',
      brokerApprovedBooking: Boolean(room.brokerApprovedBooking),
      carrierApprovedBooking: Boolean(room.carrierApprovedBooking),
      bookingConfirmedAt: room.bookingConfirmedAt ?? null,
      bookingConfirmedBy: room.bookingConfirmedBy ?? null,
      bookingRate: room.bookingRate ?? null,
      bookingNotes: room.bookingNotes ?? null,
      loadId: room.loadId ?? null,
      bookingCancelledAt: room.bookingCancelledAt ?? null,
      bookingStatusUpdatedAt: room.bookingStatusUpdatedAt ?? null,
      bookingStatusUpdatedBy: room.bookingStatusUpdatedBy ?? null,
      bookingWorkflow: room.bookingWorkflow ?? null,
    };
  }

  private applyUpdatedRoom(updated: DirectRoomResponse): void {
    const matchesPair = (room: DirectRoom) =>
      room.brokerPostId === updated.brokerPostId && room.carrierPostId === updated.carrierPostId;
    const mergeRoom = (room: DirectRoom) => {
      if (!matchesPair(room)) return room;
      return {
        ...room,
        bookingStatus: updated.bookingStatus ?? room.bookingStatus,
        brokerApprovedBooking: updated.brokerApprovedBooking ?? room.brokerApprovedBooking,
        carrierApprovedBooking: updated.carrierApprovedBooking ?? room.carrierApprovedBooking,
        bookingConfirmedAt: updated.bookingConfirmedAt ?? room.bookingConfirmedAt,
        bookingConfirmedBy: updated.bookingConfirmedBy ?? room.bookingConfirmedBy,
        bookingRate: updated.bookingRate ?? room.bookingRate,
        bookingNotes: updated.bookingNotes ?? room.bookingNotes,
        loadId: updated.loadId ?? room.loadId,
        bookingCancelledAt: updated.bookingCancelledAt ?? room.bookingCancelledAt,
        bookingStatusUpdatedAt: updated.bookingStatusUpdatedAt ?? room.bookingStatusUpdatedAt,
        bookingStatusUpdatedBy: updated.bookingStatusUpdatedBy ?? room.bookingStatusUpdatedBy,
        ...(updated.bookingWorkflow !== undefined ? { bookingWorkflow: updated.bookingWorkflow ?? null } : {}),
      };
    };
    this.rooms = this.rooms.map(mergeRoom);
    this.previewDirectRooms = this.previewDirectRooms.map(mergeRoom);
    const room = this.rooms.find(matchesPair) ?? this.previewDirectRooms.find(matchesPair);
    if (room) this.syncDirectRoomWorkflowFromRoom(room);
  }

  private normalizeMessages(messages: DirectMessage[]): DirectMessage[] {
    return messages.map((message) => ({
      ...message,
      bid: this.asNumberOrNull(message.bid ?? null),
      date: this.normalizeDate(message.date ?? null),
    })).sort((left, right) => {
      const leftValue = left.date ? new Date(left.date).getTime() : 0;
      const rightValue = right.date ? new Date(right.date).getTime() : 0;
      return leftValue - rightValue;
    });
  }

  private updateRoomMessages(roomId: string, messages: DirectMessage[]): void {
    const normalized = this.normalizeMessages(messages);
    const mergeRoom = (room: DirectRoom): DirectRoom => room.id === roomId ? {
      ...room,
      messages: normalized,
      maxBid: this.extractLatestBid(normalized),
      lastMessageAt: normalized.length ? normalized[normalized.length - 1].date ?? null : null,
    } : room;
    this.rooms = this.sortRooms(this.rooms.map(mergeRoom));
    this.previewDirectRooms = this.previewDirectRooms.map(mergeRoom);
  }

  private updateSeenCounts(roomId: string, count: number): void {
    if (!this.user) return;
    this.rooms = this.rooms.map((room) => room.id !== roomId ? room : {
      ...room,
      seen: this.user?.role === 'broker' ? { ...room.seen, brokerCount: count } : { ...room.seen, carrierCount: count },
    });
  }

  private getPostPair(room: DirectRoom): { carrierPostId: string; brokerPostId: string } {
    return { carrierPostId: room.carrierPostId, brokerPostId: room.brokerPostId };
  }

  private sortRooms(rooms: DirectRoom[]): DirectRoom[] {
    return [...rooms].sort((left, right) => {
      const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
      const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return left.contactName.localeCompare(right.contactName);
    });
  }

  private extractLatestBid(messages: DirectMessage[]): number | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const bid = this.asNumberOrNull(messages[index].bid ?? null);
      if (bid !== null) return bid;
    }
    return null;
  }

  private mergeWorkspacePosts(...collections: WorkspacePost[][]): WorkspacePost[] {
    const merged = new Map<string, WorkspacePost>();
    collections.flat().forEach((post) => {
      if (post?._id) merged.set(post._id, post);
    });

    return [...merged.values()].sort((left, right) => {
      const leftTime = new Date(left.publishedAt ?? left.startDate ?? left.endDate ?? 0).getTime() || 0;
      const rightTime = new Date(right.publishedAt ?? right.startDate ?? right.endDate ?? 0).getTime() || 0;
      return rightTime - leftTime;
    });
  }

  private buildLoadBoardItem(load: PrometheusLoad): LoadBoardItem {
    const status = this.normalizeLoadStatus(load.status);
    const pendingAccessRequests = this.pendingLoadAccessRequests(load);
    return {
      loadId: load._id,
      ownPostId: this.loadOwnPostId(load),
      reference: this.buildLoadReference(load),
      origin: this.loadOrigin(load),
      destination: this.loadDestination(load),
      lane: this.formatLoadLane(load),
      brokerName: this.loadBrokerName(load),
      counterpartyName: this.loadCounterpartyName(load),
      driverName: this.loadDriverName(load),
      truckLabel: this.loadTruckLabel(load),
      rateLabel: this.loadRateLabel(load),
      dispatcherName: this.loadDispatcherName(load),
      summary: this.buildLoadBoardSummary(load),
      lastActivity: this.formatTimestamp(load.updatedAt ?? load.createdAt),
      status,
      statusLabel: this.loadBoardStatusLabel(status),
      statusTone: this.loadBoardStatusTone(status),
      isMine: this.isLoadOwnedByCurrentUser(load),
      pendingAccessRequests,
      myPendingAccessRequest: this.myPendingLoadAccessRequest(load, pendingAccessRequests),
      canApproveAccess: this.canApproveLoadAccess(load),
      load,
    };
  }

  private loadOwnPostId(load: PrometheusLoad): string {
    return this.user?.role === 'broker' ? load.source?.brokerPostId : load.source?.carrierPostId;
  }

  private buildLoadReference(load: PrometheusLoad): string {
    return this.stringValue(load.reference)
      || this.stringValue(load.loadNumber)
      || `LOAD-${load._id.slice(-6).toUpperCase()}`;
  }

  private formatLoadLane(load: PrometheusLoad): string {
    return `${this.loadOrigin(load)} -> ${this.loadDestination(load)}`;
  }

  private loadOrigin(load: PrometheusLoad): string {
    return this.stringValue(load.lane?.origin) || 'Unknown pickup';
  }

  private loadDestination(load: PrometheusLoad): string {
    return this.stringValue(load.lane?.destination) || 'Unknown delivery';
  }

  private loadBrokerName(load: PrometheusLoad): string {
    return this.stringValue(load.broker?.companyName)
      || this.stringValue(load.broker?.contactName)
      || 'Broker pending';
  }

  private loadCounterpartyName(load: PrometheusLoad): string {
    if (this.user?.role === 'broker') {
      return this.stringValue(load.carrier?.companyName)
        || this.stringValue(load.carrier?.contactName)
        || 'Carrier';
    }

    return this.stringValue(load.broker?.companyName)
      || this.stringValue(load.broker?.contactName)
      || 'Broker';
  }

  private loadDriverName(load: PrometheusLoad): string {
    return this.stringValue(load.driver?.name)
      || this.stringValue(load.carrier?.contactName)
      || 'Driver pending';
  }

  private loadTruckLabel(load: PrometheusLoad): string {
    return this.stringValue(load.driver?.truckLabel)
      || this.stringValue(load.equipmentLabel)
      || 'Truck pending';
  }

  private loadRateLabel(load: PrometheusLoad): string {
    const rate = this.asNumberOrNull(load.rate);
    return rate === null ? 'Rate pending' : `$${rate.toLocaleString('en-US')}`;
  }

  private loadDispatcherName(load: PrometheusLoad): string {
    return this.stringValue(load.dispatch?.assignedDispatcherName) || 'Unassigned dispatcher';
  }

  private buildLoadBoardSummary(load: PrometheusLoad): string {
    const summary = this.stringValue(load.summary);
    if (summary) return summary;
    return this.loadTruckLabel(load);
  }

  private normalizeLoadStatus(status: PrometheusLoadStatus | string | undefined): PrometheusLoadStatus {
    if (status === 'library' || status === 'waiting') return 'library';
    if (status === 'readyToBill' || status === 'finished') return 'readyToBill';
    if (status === 'archived') return 'archived';
    return 'active';
  }

  private loadBoardStatusLabel(status: PrometheusLoadStatus): string {
    if (status === 'library') return 'Library';
    if (status === 'readyToBill') return 'Ready to bill';
    if (status === 'archived') return 'Finished';
    return 'Active';
  }

  private loadBoardStatusTone(status: PrometheusLoadStatus): 'active' | 'warning' | 'billing' | 'muted' {
    if (status === 'library') return 'warning';
    if (status === 'readyToBill') return 'billing';
    if (status === 'archived') return 'muted';
    return 'active';
  }

  private isLoadOwnedByCurrentUser(load: PrometheusLoad): boolean {
    if (!this.user) return false;
    const dispatcherId = this.stringValue(load.dispatch?.assignedDispatcherId);
    const ownerId = dispatcherId || this.stringValue(load.createdBy);
    return ownerId === String(this.user.id);
  }

  private pendingLoadAccessRequests(load: PrometheusLoad): LoadAccessRequest[] {
    return (load.accessRequests ?? []).filter((request) => request.status === 'pending');
  }

  private myPendingLoadAccessRequest(
    load: PrometheusLoad,
    pendingAccessRequests = this.pendingLoadAccessRequests(load)
  ): LoadAccessRequest | null {
    if (!this.user) return null;
    const userId = String(this.user.id);
    return pendingAccessRequests.find((request) => String(request.requestedById) === userId) ?? null;
  }

  private canApproveLoadAccess(load: PrometheusLoad): boolean {
    if (!this.user) return false;
    const role = String(this.user.role ?? '');
    if (role === 'admin' || role === 'manager' || role === 'supervisor') return true;
    return this.isLoadOwnedByCurrentUser(load);
  }

  private replaceLoad(load: PrometheusLoad): void {
    const replaced = this.loads.some((entry) => entry._id === load._id);
    this.loads = replaced
      ? this.loads.map((entry) => entry._id === load._id ? load : entry)
      : [load, ...this.loads];
  }

  private isPostOwnedByCurrentUser(post: WorkspacePost): boolean {
    if (!this.user) return false;
    return String(post.publisherId ?? post.createdBy ?? '') === String(this.user.id);
  }

  private formatLocation(location: PostLocation | undefined): string {
    if (!location) return 'Unknown';
    if (location.type === 'place' && location.place) {
      if (typeof location.place === 'string') return location.place;
      return `${location.place.city ?? 'Unknown city'}, ${location.place.state ?? 'Unknown state'}`;
    }
    if (location.type === 'states' && Array.isArray(location.states) && location.states.length) return location.states.join(', ');
    if (location.type === 'zones' && Array.isArray(location.zones) && location.zones.length) {
      return location.zones.map((zone) => zone.zone).filter((value): value is string => !!value).join(', ');
    }
    return 'Unknown';
  }

  private extractPlaceFormValue(location: PostLocation | undefined): { city: string; state: string; lat: number | string; lng: number | string } {
    const place = location?.place;
    const coordinates = location?.location?.coordinates;
    const placeText = typeof place === 'string' ? place : '';
    const [cityFromString = '', stateFromString = ''] = placeText.split(',').map((value) => value.trim());
    return {
      city: typeof place === 'string' ? cityFromString : place?.city ?? '',
      state: typeof place === 'string' ? stateFromString : place?.state ?? '',
      lat: this.coordinateValue(coordinates?.lat),
      lng: this.coordinateValue(coordinates?.lng),
    };
  }

  private coordinateValue(value: unknown): number | string {
    const number = this.asNumberOrNull(value);
    return number ?? '';
  }

  private findEquipmentPreset(equipment: unknown): string {
    if (!Array.isArray(equipment)) return '';
    const normalized = equipment.filter((item): item is string => typeof item === 'string').map((item) => item.toUpperCase()).sort().join('|');
    return this.equipmentPresets.find((option) => [...option.codes].sort().join('|') === normalized)?.value ?? '';
  }

  private estimateDistanceMiles(origin: ManualPlacePayload, destination: ManualPlacePayload): number {
    const lat1 = origin.location.coordinates.lat;
    const lon1 = origin.location.coordinates.lng;
    const lat2 = destination.location.coordinates.lat;
    const lon2 = destination.location.coordinates.lng;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const earthRadiusMiles = 3958.8;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLon = toRadians(lon2 - lon1);
    const a = Math.sin(deltaLat / 2) ** 2
      + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(1, Math.round(earthRadiusMiles * c));
  }

  private normalizeDate(value: string | null): string | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private isoDateValue(value: unknown): string {
    if (!value) return '';
    const parsed = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  }

  private dateValue(value: unknown): string | null {
    if (typeof value === 'string') return value;
    return value instanceof Date ? value.toISOString() : null;
  }

  private asNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private optionalString(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : undefined;
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private backendErrorMessage(error: unknown): string {
    const message = (error as { error?: { message?: unknown } } | null)?.error?.message;
    if (Array.isArray(message)) return message.join(', ');
    return typeof message === 'string' ? message : '';
  }

  private removeEmptyOptionalFields<T extends Record<string, unknown>>(payload: T): T {
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== '')
    ) as T;
  }

  private resetChatbbState(): void {
    this.chatbbMessages = [];
    this.chatbbPrompt = '';
    this.chatbbError = '';
    this.chatbbLoading = false;
  }
}
