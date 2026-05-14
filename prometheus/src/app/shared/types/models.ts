export interface AuthUser {
  id: string;
  role: string;
  email: string;
  firstName: string;
  lastName: string;
  companyId?: string | null;
  isLogged?: string;
}

export interface StateOption {
  code: string;
  country: string;
}

export interface CompanyDraft {
  _id?: string;
  key?: string;
  clientId?: string;
  status?: string;
  requestedSeats?: number;
  onboarding?: CompanyOnboardingState;
  name: string;
  dba?: string;
  email: string;
  phone: string;
  dot: string;
  mc: string;
  type: string;
  address: {
    country: string;
    city: string;
    street: string;
    zip: string;
    state: string;
  };
  contactPerson: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email: string;
    phone: string;
    verificationPhone: string;
    role: string;
  };
  filesNames?: Record<string, { name: string; ext: string }>;
}

export type OnboardingDocumentType = 'mc' | 'insurance' | 'hazmat';
export type OnboardingQueueGroup = 'pending' | 'blocked' | 'waitingSetup' | 'active' | 'inactive';
export type OnboardingDocumentStatus = 'missing' | 'pending' | 'verified' | 'rejected' | 'expired';
export type OnboardingVerificationSource = 'manual' | 'highway' | 'mycarrierpacket' | 'truckstop' | 'other';

export interface CompanyOnboardingDocument {
  fileType?: OnboardingDocumentType;
  displayName?: string;
  fileName?: string;
  ext?: string;
  source?: OnboardingVerificationSource;
  status?: OnboardingDocumentStatus;
  expirationDate?: string | Date;
  verifiedAt?: string | Date;
  verifiedBy?: string;
  rejectedAt?: string | Date;
  rejectedBy?: string;
  rejectionReason?: string;
  notes?: string;
}

export interface CompanyOnboardingState {
  status?: string;
  submittedAt?: string | Date;
  approvedAt?: string | Date;
  approvedBy?: string;
  correctionRequestedAt?: string | Date;
  correctionRequestedBy?: string;
  setupEmailSentAt?: string | Date;
  requestedSeats?: number;
  previousStatus?: string;
  blockedAt?: string | Date;
  blockedReasons?: string[];
  blockedSource?: string;
  unblockedAt?: string | Date;
  unblockedBy?: string;
  verificationOverride?: boolean;
  documents?: Partial<Record<OnboardingDocumentType, CompanyOnboardingDocument>>;
  verificationSummary?: {
    source?: OnboardingVerificationSource;
    status?: string;
    checkedAt?: string | Date;
    checkedBy?: string;
  };
}

export interface CompanyOnboardingRecord extends CompanyDraft {
  createdAt?: string | Date;
  updatedAt?: string | Date;
  deletedAt?: string | Date | null;
  deletedBy?: string | null;
  activeUsers?: number;
  isWaiting?: boolean;
  deactivationReason?: string;
  subscription?: {
    customer?: string;
    quantity?: number;
    amount_due?: number;
    endPeriod?: string | Date | number | null;
    lastPayment?: string | Date;
    decreasedUsers?: boolean | null;
  };
  notes?: Array<{
    text?: string;
    type?: string;
    date?: string | Date;
    name?: string;
    lastName?: string;
  }>;
}

export interface CompanySetupStatus {
  status: string;
  requestedSeats: number;
  paidSeats: number;
  activeUsers: number;
  canLocalActivate: boolean;
  company: CompanyOnboardingRecord;
}

export type CompanyIntegrationCategory = 'setup' | 'tracking' | 'eld';
export type CompanyIntegrationStatus = 'not_connected' | 'connected' | 'needs_attention' | 'disabled';
export type ProviderCatalogCategory = 'platform' | 'setup' | 'tracking' | 'eld' | 'loadboard' | 'tms' | 'storage';
export type ProviderCatalogStatus = 'ready' | 'needs_credentials' | 'requires_credentials' | 'requires_contract' | 'manual';
export type ProviderCatalogFreeTier = 'free' | 'paid' | 'contract' | 'local';

export interface CompanyIntegrationRecord {
  _id?: string;
  id?: string;
  companyId?: string;
  category: CompanyIntegrationCategory;
  provider: string;
  label: string;
  status: CompanyIntegrationStatus;
  enabled: boolean;
  setupUrl?: string | null;
  credentialRef?: string | null;
  notes?: string | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface UpsertCompanyIntegrationPayload {
  category: CompanyIntegrationCategory;
  provider: string;
  label: string;
  enabled?: boolean;
  status?: CompanyIntegrationStatus;
  setupUrl?: string;
  credentialRef?: string;
  notes?: string;
}

export interface ProviderCatalogItem {
  category: ProviderCatalogCategory;
  provider: string;
  label: string;
  status: ProviderCatalogStatus;
  freeTier: ProviderCatalogFreeTier;
  environmentKeys?: string[];
  requestFrom?: string;
  notes: string;
}

export interface ProviderCatalog {
  platform: ProviderCatalogItem[];
  company: ProviderCatalogItem[];
}

export interface CompanyUser {
  _id?: string;
  id?: string;
  companyId?: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive?: boolean;
  subscriptionEmail?: boolean;
}

export interface CreateCompanyUserPayload {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: 'broker' | 'carrier' | 'manager';
  contactEmail?: string;
}

export interface StripeProductOption {
  id: string;
  name: string;
  default_price?: {
    id?: string;
    unit_amount?: number;
  };
}

export interface PostPlace {
  city?: string;
  state?: string;
}

export interface PostZone {
  zone?: string;
}

export interface PostLocation {
  type?: 'place' | 'states' | 'zones' | string;
  place?: PostPlace | string;
  location?: {
    type?: string;
    coordinates?: {
      lat?: number;
      lng?: number;
    };
  };
  states?: string[];
  zones?: PostZone[];
}

export interface WorkspacePost {
  _id: string;
  publisherId?: string;
  origin?: PostLocation;
  destination?: PostLocation;
  equipment?: string[];
  length?: number | string | null;
  capacity?: string | null;
  capacitySearch?: string | null;
  weight?: number | string | null;
  rate?: number | string | null;
  distance?: number | string | null;
  dhoRadius?: number | string | null;
  dhdRadius?: number | string | null;
  publishedAt?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  contact?: string | null;
  comment?: string | null;
  refNum?: string | null;
  bookUrl?: string | null;
  stops?: Array<Record<string, unknown>>;
  userData?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  companyData?: {
    name?: string;
    mc?: string;
    email?: string;
    phone?: string;
  };
  companyName?: string | null;
  companyMc?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  createdBy?: string;
  [key: string]: unknown;
}

export interface PostSearchPayload {
  length: number;
  weight: number;
  capacity?: string;
  capacitySearch?: string;
  equipment: string[];
  origin: PostLocation;
  destination?: PostLocation;
  startDate?: string;
  endDate?: string;
  dhoRadius?: number;
  dhdRadius?: number;
  stops?: Array<Record<string, unknown>>;
}

export type MatchSourcePostType = 'carrierPost' | 'brokerPost';

export type PrometheusBrainSource = 'matching' | 'booking' | 'direct' | 'company' | 'loads' | 'admin';

export type PrometheusBrainApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'executed'
  | 'failed';

export interface PrometheusBrainApproval {
  _id?: string;
  companyId: string;
  requestedBy: string;
  decidedBy?: string;
  role: string;
  actionType: string;
  label: string;
  summary: string;
  riskNote: string;
  payload: Record<string, unknown>;
  status: PrometheusBrainApprovalStatus;
  expiresAt?: string | Date;
  decisionAt?: string | Date;
  result?: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface PrometheusBrainEvent {
  _id?: string;
  companyId: string;
  userId: string;
  role: string;
  source: PrometheusBrainSource;
  type: string;
  prompt?: string;
  message?: string;
  intent?: string;
  tool?: string;
  related?: Record<string, string>;
  payload?: Record<string, unknown>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface PrometheusBrainPromptRequest {
  prompt: string;
  source: PrometheusBrainSource;
  related?: {
    sourcePostId?: string;
    sourcePostType?: MatchSourcePostType;
    roomId?: string;
    loadId?: string;
    companyId?: string;
  };
}

export interface PrometheusBrainPromptResponse {
  answer: string;
  handled: boolean;
  intent: string;
  eventId?: string;
  approval?: PrometheusBrainApproval;
  metadata?: Record<string, unknown>;
}

export interface UpdateBrainSettingsPayload {
  memoryMode?: 'off' | 'companyManaged' | 'prometheusManaged';
  auditRetentionDays?: number;
  allowProviderTools?: boolean;
}

export type MatchOpportunityTier =
  | 'strictHazmat'
  | 'hazmatNearMatch'
  | 'hazmatPermission'
  | 'hazmatMarketAlternative'
  | 'nonHazmatFallback';

export type EquipmentCompatibility = 'exact' | 'compatible' | 'requiresPermission' | 'incompatible';

export type PermissionStatus = 'notNeeded' | 'notAsked' | 'asked' | 'accepted' | 'rejected' | 'expired';

export interface MatchingAssistantCommand {
  command: string;
  label: string;
  opportunityId?: string;
}

export interface MatchingAssistantEvent {
  _id?: string;
  companyId: string;
  userId?: string;
  targetRole?: string;
  dedupeKey?: string;
  role: 'assistant' | 'user' | 'system';
  message: string;
  relatedOpportunityId?: string;
  sourcePostId?: string;
  availableCommands: MatchingAssistantCommand[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OpportunityActionPayload {
  action: 'ask' | 'accept' | 'reject' | 'book';
}

export interface MatchScoreBreakdown {
  laneFit: number;
  equipmentFit: number;
  weightFit: number;
  freshnessFit: number;
  rateFit: number;
}

export interface MatchRouteMetrics {
  originDeadheadMiles: number | null;
  destinationDeadheadMiles: number | null;
  tripMiles: number | null;
  totalPracticalMiles: number | null;
  estimatedDriveMinutes: number | null;
  provider: string | null;
}

export interface MatchCandidateSummary {
  companyId: string;
  publisherId?: string;
  lane: {
    origin: string;
    destination: string;
  };
  equipment: string[];
  weight: number | null;
  rate: number | null;
  publishedAt: string | null;
  reference: string;
}

export interface MatchCandidate {
  matchPostId: string;
  matchPostType: MatchSourcePostType;
  score: number;
  scoreBreakdown: MatchScoreBreakdown;
  summary: MatchCandidateSummary;
  routeMetrics: MatchRouteMetrics;
  tier?: MatchOpportunityTier;
  hazmatCompatible?: boolean;
  equipmentCompatibility?: EquipmentCompatibility;
  permissionStatus?: PermissionStatus;
  permissionQuestion?: string;
  reasonCodes?: string[];
}

export interface MatchSnapshot {
  _id?: string;
  companyId: string;
  sourcePostId: string;
  sourcePostType: MatchSourcePostType;
  generatedByUserId: string;
  provider: string;
  status: 'ready';
  candidateCount: number;
  sourceSummary: MatchCandidateSummary & {
    availabilityStart?: string | null;
    availabilityEnd?: string | null;
    dhoRadius?: number | null;
    dhdRadius?: number | null;
  };
  candidates: MatchCandidate[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateMatchSnapshotPayload {
  sourcePostType: MatchSourcePostType;
  sourcePostId: string;
}

export interface ManualPlacePayload {
  type: 'place';
  place: {
    city: string;
    state: string;
  };
  location: {
    type: 'Point';
    coordinates: {
      lat: number;
      lng: number;
    };
  };
}

export interface BrokerStopPayload {
  type: 'pickUp' | 'delivery' | string;
  place: ManualPlacePayload;
  startDate: string;
  endDate: string;
  comment?: string;
}

export interface BrokerPostUpsertPayload {
  _id?: string;
  length: number;
  weight: number;
  capacity: string;
  equipment: string[];
  contact: string;
  origin: ManualPlacePayload;
  destination: ManualPlacePayload;
  stops: BrokerStopPayload[];
  distance: number;
  stopsDistances: number[];
  comment?: string;
  bookUrl?: string;
  refNum?: string;
  rate?: number;
  tankerEndorsement?: boolean;
  nonHazmat?: boolean;
  team?: boolean;
}

export interface CarrierPostUpsertPayload {
  _id?: string;
  length: number;
  weight: number;
  capacity: string;
  equipment: string[];
  contact: string;
  startDate: string;
  endDate: string;
  origin: ManualPlacePayload;
  destination?: ManualPlacePayload;
  comment?: string;
  refNum?: string;
  distance?: number;
  team?: boolean;
  nonTanker?: boolean;
}

export type DirectRoomBookingStatus = 'negotiating' | 'booked' | 'cancelled' | 'delivered';

export interface DirectRoomSeen {
  brokerCount: number;
  carrierCount: number;
}

export interface DirectMessage {
  text?: string | null;
  bid?: number | null;
  type?: 'message' | 'bid' | string;
  date?: string | null;
  role?: 'broker' | 'carrier' | string;
}

export interface DirectRoomResponse {
  post: WorkspacePost;
  user: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  company: {
    name?: string;
    mc?: string;
  };
  seen: Partial<DirectRoomSeen>;
  messages: DirectMessage[];
  createdBy?: string;
  brokerPostId: string;
  carrierPostId: string;
  brokerId: string;
  carrierId: string;
  bookingStatus?: DirectRoomBookingStatus;
  brokerApprovedBooking?: boolean;
  carrierApprovedBooking?: boolean;
  bookingConfirmedAt?: string | null;
  bookingConfirmedBy?: string | null;
  bookingRate?: number | null;
  bookingNotes?: string | null;
  loadId?: string | null;
  bookingCancelledAt?: string | null;
  bookingStatusUpdatedAt?: string | null;
  bookingStatusUpdatedBy?: string | null;
  bookingWorkflow?: DirectRoomWorkflow | null;
}

export interface DirectRoom {
  id: string;
  lane: string;
  equipmentLabel: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  companyName: string;
  companyMc: string | null;
  post: WorkspacePost;
  messages: DirectMessage[];
  seen: DirectRoomSeen;
  maxBid: number | null;
  lastMessageAt: string | null;
  brokerPostId: string;
  carrierPostId: string;
  brokerId: string;
  carrierId: string;
  sameId: boolean;
  bookingStatus?: DirectRoomBookingStatus;
  brokerApprovedBooking?: boolean;
  carrierApprovedBooking?: boolean;
  bookingConfirmedAt?: string | null;
  bookingConfirmedBy?: string | null;
  bookingRate?: number | null;
  bookingNotes?: string | null;
  loadId?: string | null;
  bookingCancelledAt?: string | null;
  bookingStatusUpdatedAt?: string | null;
  bookingStatusUpdatedBy?: string | null;
  bookingWorkflow?: DirectRoomWorkflow | null;
}

export interface CreateDirectRoomResponse {
  created: boolean;
  room: DirectRoomResponse;
}

export interface AssistantRoomResponse {
  created: boolean;
  room: Partial<DirectRoomResponse> & {
    _id?: string;
    id?: string;
    brokerPostId?: string;
    carrierPostId?: string;
    brokerId?: string;
    carrierId?: string;
    bookingStatus?: DirectRoomBookingStatus;
    brokerApprovedBooking?: boolean;
    carrierApprovedBooking?: boolean;
    bookingConfirmedAt?: string | null;
    bookingConfirmedBy?: string | null;
    bookingRate?: number | null;
    bookingNotes?: string | null;
  };
}

export interface UpdateDirectRoomBookingPayload {
  brokerPostId: string;
  carrierPostId: string;
  action: 'approve' | 'cancel';
  note?: string;
}

export interface DirectRoomWorkflow {
  setupProvider?: string | null;
  setupLabel?: string | null;
  setupSource?: string | null;
  setupUpdatedAt?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  truckLabel?: string | null;
  driverUpdatedAt?: string | null;
  contactSaved?: boolean | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactUpdatedAt?: string | null;
  trackingProvider?: string | null;
  trackingSource?: string | null;
  trackingShared?: boolean | null;
  trackingUpdatedAt?: string | null;
  delivered?: boolean | null;
  deliveredAt?: string | null;
  cancelled?: boolean | null;
  cancellationMode?: string | null;
  cancellationNote?: string | null;
  cancellationAt?: string | null;
  readyToBill?: boolean | null;
  readyToBillAt?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface UpdateDirectRoomWorkflowPayload {
  brokerPostId: string;
  carrierPostId: string;
  action: 'setup' | 'driver' | 'contact' | 'tracking' | 'delivered' | 'cancelled' | 'readyToBill';
  setupProvider?: string;
  setupLabel?: string;
  setupSource?: string;
  driverId?: string;
  driverName?: string;
  truckLabel?: string;
  contactSaved?: boolean;
  contactName?: string;
  contactEmail?: string;
  trackingProvider?: string;
  trackingSource?: string;
  trackingShared?: boolean;
  delivered?: boolean;
  cancellationMode?: string;
  cancellationNote?: string;
  readyToBill?: boolean;
}

export type RoomIntegrationChoiceCategory = 'setup' | 'tracking' | 'eld' | string;
export type RoomIntegrationChoiceSource = 'broker' | 'carrier' | 'company' | 'manual' | string;

export interface RoomIntegrationChoice {
  provider: string;
  label: string;
  category?: RoomIntegrationChoiceCategory;
  source?: RoomIntegrationChoiceSource;
  setupUrl?: string;
}

export interface RoomIntegrationChoicesResponse {
  setup: RoomIntegrationChoice[];
  tracking: RoomIntegrationChoice[];
}

export interface ExecuteRoomIntegrationPayload {
  brokerPostId: string;
  carrierPostId: string;
  category: RoomIntegrationChoiceCategory;
  provider: string;
  label?: string;
  source?: RoomIntegrationChoiceSource;
}

export interface RoomIntegrationExecutionResponse {
  status: 'staged' | 'unavailable' | string;
  mode: 'configured' | 'placeholder' | 'manual' | string;
  provider: string;
  label: string;
  category: RoomIntegrationChoiceCategory;
  source: RoomIntegrationChoiceSource;
  message: string;
  setupUrl?: string;
}

export type PrometheusLoadStatus = 'active' | 'library' | 'readyToBill' | 'archived';

export interface PrometheusLoad {
  _id: string;
  companyId: string;
  createdBy: string;
  creatorRole: string;
  loadNumber: string;
  reference: string;
  status: PrometheusLoadStatus;
  statusNote?: string | null;
  summary?: string | null;
  lane: {
    origin: string;
    destination: string;
  };
  source: {
    brokerPostId: string;
    carrierPostId: string;
  };
  broker: {
    companyName?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  carrier: {
    companyName?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  driver: {
    name?: string;
    truckLabel?: string;
  };
  dispatch: {
    assignedDispatcherId: string;
    assignedDispatcherName: string;
    assignedDispatcherEmail: string;
  };
  equipmentLabel?: string | null;
  rate?: number | null;
  weight?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreatePrometheusLoadFromRoomPayload {
  brokerPostId: string;
  carrierPostId: string;
  loadNumber?: string;
  driverName?: string;
  truckLabel?: string;
  summary?: string;
}

export interface UpdatePrometheusLoadPayload {
  status?: PrometheusLoadStatus;
  statusNote?: string;
  loadNumber?: string;
  driverName?: string;
  truckLabel?: string;
  summary?: string;
}

export interface InboxDot {
  _id?: string;
  carrierPostId?: string;
  brokerPostId?: string;
  seen?: Partial<DirectRoomSeen>;
}

export interface ChatbbAction {
  type: string;
  label: string;
  reason: string;
  requiresApproval: boolean;
}

export interface ChatbbTopBid {
  otherPostId: string;
  latestBid: number | null;
  bidCount: number;
  lane: string;
  equipment: string;
  lastMessageAt: string | null;
}

export interface ChatbbRecentOption {
  postId: string;
  lane: string;
  rate: number | null;
  equipment: string;
  weight: number | null;
  publishedAt: string | null;
}

export interface ChatbbPlan {
  summary: string;
  draftMessage: string;
  recommendedActions: ChatbbAction[];
  riskNotes: string[];
  contextGaps: string[];
  topBids: ChatbbTopBid[];
  recentOptions: ChatbbRecentOption[];
  disclaimer: string;
}

export interface ChatbbThreadMessage {
  sender: 'system' | 'user' | 'assistant';
  text: string;
  createdAt: string;
  plan?: ChatbbPlan;
}

export interface ChatbbThreadResponse {
  threadId: string;
  carrierPostId: string;
  brokerPostId: string;
  status: string;
  messages: ChatbbThreadMessage[];
}

export interface ChatbbMessageResponse {
  threadId: string;
  userMessage: ChatbbThreadMessage;
  assistantMessage: ChatbbThreadMessage;
  plan: ChatbbPlan;
  context: unknown;
}

export interface ChatbbRuntimeStatus {
  enabled: boolean;
  mode: 'openai' | 'local' | 'fallback' | string;
  provider: string;
  model: string | null;
  baseURL: string | null;
  usesLocalServer: boolean;
  usesCloudApi: boolean;
}
