export enum FamilyStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed'
}

export enum Relation {
  HUSBAND = 'husband',
  WIFE = 'wife',
  SON = 'son',
  DAUGHTER = 'daughter',
  OTHER = 'other'
}

export enum EducationLevel {
  NONE = 'none',
  PRIMARY = 'primary',
  PREPARATORY = 'preparatory',
  SECONDARY = 'secondary',
  UNIVERSITY = 'university'
}

export enum VisitStatus {
  COMPLETED = 'completed',
  SCHEDULED = 'scheduled',
  CANCELED = 'canceled'
}

export enum VisitType {
  FIELD = 'field_visit',
  OFFICE = 'office',
  PHONE = 'phone',
  ASSESSMENT = 'assessment'
}

export enum DonorType {
  INDIVIDUAL = 'individual',
  ORGANIZATION = 'organization'
}

export enum AssistanceType {
  CASH = 'cash',
  FOOD = 'food',
  MEDICAL = 'medical',
  SEASONAL = 'seasonal',
  SERVICE = 'service'
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export enum HealthStatus {
  HEALTHY = 'healthy',
  CHRONIC_ILLNESS = 'chronic_illness',
  TEMPORARY_ILLNESS = 'temporary_illness',
  DISABILITY = 'disability'
}

export interface StoreItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  cost: number;
  provider?: string;
  minQuantity: number;
  location?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HistorySnapshot {
  id?: string;
  timestamp: string;
  source: 'visit' | 'technical_update' | 'manual';
  sourceId?: string; // e.g., visitId
  category: 'income' | 'housing' | 'social' | 'technical' | 'full';
  data: any;
  previousData?: any;
  changeSummary?: string;
}

export interface Family {
  id: string;
  fileNumber: string;
  name: string;
  phone?: string;
  address: string;
  governorate?: string;
  city?: string;
  neighborhood?: string;
  detailedAddress?: string;
  nationality?: string;
  socialStatus?: string; // Married, Divorced, Widow, etc.
  numberOfDependents?: number;
  housingStatus?: string; // Owned, Rented, etc.
  contactPersonName?: string;
  contactPersonPhone?: string;
  contactPersonRole?: string;
  housingCondition?: {
    type: 'brick' | 'adobe' | 'wood' | 'other';
    rooms: number;
    hasWater: boolean;
    hasElectricity: boolean;
    hasFurniture: boolean;
    notes: string;
  };
  expenses?: {
    housing: number;
    food: number;
    health: number;
    education: number;
    other: number;
    total: number;
  };
  socialSolidarity?: {
    supportNetworks: string;
    communityContributions: string;
    socialSecurityBenefits: string;
  };
  socialResearch?: {
    caseSummary: string;
    incomeSource: string;
    totalExpenses: number;
    priorityReason: string;
  };
  status: FamilyStatus;
  priority: Priority;
  monthlyIncome: number;
  itemizedIncome?: { source: string, amount: number }[];
  itemizedExpenses?: { category: string, amount: number }[];
  notes?: string;
  createdAt: any;
  updatedAt: any;
  ownerId: string;
  order?: number;
  isDeleted?: boolean;
}

export interface DeliveryTask {
  id: string;
  aidRequestId: string;
  memberId: string;
  idNumber: number; // Installment number (1, 2, 3...)
  status: 'pending' | 'preparing' | 'delivering' | 'delivered' | 'canceled';
  scheduledDate: string;
  deliveryDate?: string;
  deliveryCode?: string;
  notes?: string;
  updates?: { date: string, text: string, user: string }[];
}

export interface PrescriptionItem {
  itemId: string;
  itemName: string;
  requestedQuantity: number;
  dispensedQuantity: number;
  availableStock?: number;
}

export interface AidRequest {
  id: string;
  committeeCode?: string;
  type: string; // e.g., "Medical: Medicine X", "Education: Uniform"
  quantity: number;
  unitCost: number;
  totalCost: number;
  prescriptionItems?: PrescriptionItem[];
  addToCampaign?: boolean;
  campaignId?: string;
  campaignNotes?: string;
  campaignGoal?: number;
  campaignRaised?: number;
  campaignDetails?: string;
  status: 'requested' | 'visit_scheduled' | 'visit_confirmed' | 'committee_review' | 'approved' | 'preparing' | 'delivering' | 'delivered' | 'rejected' | 'canceled';
  requestDate: string;
  durationMonths?: number;
  startDate?: string;
  endDate?: string;
  processedDate?: string;
  deliveryDate?: string;
  deliveryMethod?: 'pickup' | 'delivery' | 'office' | 'hospital' | 'other';
  deliveryDetails?: string; 
  deliveryDestination?: string;
  deliveryQuantity?: number;
  actualCost?: number;
  createMedicalClaim?: boolean;
  dueDate?: string;
  followUpLog?: {
    date: string;
    comment: string;
    processedBy: string;
    type: 'comment' | 'status_change' | 'visit' | 'delivery' | 'other';
  }[];
  recipientSignatureName?: string;
  deliveredBy?: string;
  receiptUrl?: string;
  isDiseaseConfirmed?: boolean;
  rejectionReason?: string;
  illnessDetails?: string;
  needDetails?: string;
  notes?: string;
  deliverySchedule?: DeliveryTask[];
  deliveryLocationId?: string; // Link to a delivery location lookup item
}

export interface MemberAttachment {
  name: string;
  url: string;
  type: string; // pdf, image, etc.
  category: 'social' | 'medical' | 'identity';
  uploadedAt: string;
  issueDate?: string;
  expiryDate?: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  nationalId?: string;
  birthDate: string;
  gender: 'male' | 'female';
  relation: Relation;
  nationality?: string;
  educationLevel?: EducationLevel;
  educationDetails?: string; // e.g., "3rd year, Engineering"
  employmentStatus?: string;
  employmentDetails?: string; // e.g., "Works as a driver"
  healthCondition?: HealthStatus; // Using enum
  healthNotes?: string;
  disease?: string; // Disease name
  diseaseDetails?: string;
  monthlyIncome?: number;
  maritalStatus?: string; // e.g., "Single", "Married"
  isHealthy: boolean;
  isServiceRecipient: boolean; // Whether they receive aid
  memberCode?: string; // Auto-indexing member code
  familyId: string;
  aidRequests?: AidRequest[];
  attachments?: MemberAttachment[];
}

export interface LookupItem {
  id: string;
  name: string;
  parentId?: string; // For neighborhoods belonging to governorates
  type: 'governorate' | 'neighborhood' | 'disease' | 'role' | 'assistance_type' | 'nationality' | 'job_title' | 'education_level' | 'home_content' | 'delivery_location' | 'financial_category' | 'medical_provider' | 'store_category' | 'hospital';
  subType?: 'income' | 'expense' | string; // For financial categories or others
  // Metadata for delivery_location and others
  address?: string;
  contactPhone?: string;
  serviceIds?: string[]; // Linked system services
  locationUrl?: string;
  order?: number;
  createdAt?: string;
}

export interface Assistance {
  id: string;
  assistanceCode?: string;
  deliveryCode?: string;
  familyId: string;
  targetFamilyId?: string; // Specific family link
  targetMemberId?: string; // Specific member link
  assignedToMemberId?: string;
  assignedBy?: string;
  processedBy?: string; // Staff member who finalized the delivery
  deliveryHandler?: string; // Staff member who processed the delivery
  amount: number;
  type: AssistanceType | string;
  unit: string; // e.g., "EGP", "Box", "Session"
  distributionDate: string;
  isDelivered: boolean;
  deliveryDate?: string;
  deliveryDetails?: string;
  deliveryMethod?: string;
  deliveryDestination?: string;
  deliveryQuantity?: number;
  actualCost?: number;
  recipientName?: string;
  receiptUrl?: string; 
  notes?: string;
  claimId?: string; // Link to a medical claim if applicable
  emergencyCaseId?: string; // Link to an emergency case if applicable
  followUpLog?: {
    date: string;
    comment: string;
    processedBy: string;
    type: 'comment' | 'delivery_attempt' | 'final_delivery';
  }[];
}

export interface Donor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  type: DonorType;
  totalDonated?: number;
  lastDonationDate?: string;
  registrationSource?: 'call_center' | 'campaign' | 'social_media' | 'website' | 'other';
}

export interface Donation {
  id: string;
  donorId: string;
  donorName?: string; // Cache donor name
  donorPhone?: string; // Cache donor phone
  amount: number;
  currency: 'EGP' | 'USD' | 'SAR';
  date: string;
  type: 'cash' | 'kind' | 'other';
  targetType: 'general' | 'family' | 'campaign';
  targetId?: string; // Link to a specific family or campaign
  targetName?: string; // Cache name for display
  notes?: string;
  purpose?: string;
}

export interface Visit {
  id: string;
  visitCode?: string;
  familyId: string;
  memberId?: string; // Optional link to a specific member
  visitDate: string;
  type: VisitType;
  status: VisitStatus;
  findings?: string[];
  recommendations?: string[];
  visitorName: string;
  generalDescription?: string;
  itemizedIncome?: { source: string, amount: number }[];
  itemizedExpenses?: { category: string, amount: number }[];
  housingDetails?: {
    type?: 'brick' | 'adobe' | 'wood' | 'other';
    roomsCount: number;
    hasWater: boolean;
    hasElectricity: boolean;
    hasFurniture: boolean;
    contents?: string; // House contents
    appliances?: string; // House appliances
    conditionDescription: string;
  };
  socialSolidarity?: {
    supportNetworks: string;
    communityContributions: string;
    socialSecurityBenefits: string;
  };
  socialResearch?: {
    caseSummary: string;
    incomeSource: string;
    priorityReason: string;
  };
  attachments?: {
    name: string;
    url: string;
    type: string;
    uploadedAt: string;
  }[];
  reasonForCancellation?: string;
}

export interface DocumentRecord {
  id: string;
  familyId: string;
  title: string;
  category: 'identity' | 'housing' | 'financial' | 'medical' | 'legal';
  fileUrl: string;
  expiryDate?: string;
  verified: boolean;
  createdAt: any;
}

export interface Campaign {
  id: string;
  title: string;
  slug: string;
  description: string;
  goalAmount: number;
  collectedAmount: number;
  status: 'active' | 'completed' | 'draft';
  imageUrl?: string;
}

export interface SystemService {
  id: string;
  name: string;
  category: AssistanceType | string;
  executionMethod: 'pickup' | 'delivery' | 'office' | 'hospital' | 'other';
  description?: string;
  defaultUnit?: string;
  defaultUnitCost?: number;
  isActive: boolean;
  iconName?: string;
}

export interface EmergencyCase {
  id: string;
  caseCode: string;
  familyId: string;
  familyName?: string;
  memberId?: string;
  memberName?: string;
  serviceId?: string;
  serviceName?: string;
  providerName?: string;
  diseaseName?: string;
  hospitalEntryDate?: string;
  hospitalExitDate?: string;
  title: string;
  description: string;
  priority: Priority;
  status: 'open' | 'medical_review' | 'visit_pending' | 'decision_pending' | 'claim_pending' | 'closed' | 'resolved' | 'resolved_with_claim';
  medicalReviewNotes?: string;
  medicalReviewResult?: 'approved' | 'rejected';
  diseaseType?: string;
  diagnosis?: string;
  medicalReason?: string;
  locationDetails?: string;
  prescribedService?: string;
  serviceStartDate?: string;
  serviceEndDate?: string;
  serviceDays?: number;
  visitResult?: string;
  decisionResult?: string;
  comments?: { user: string, text: string, date: any }[];
  createdAt: any;
  updatedAt: any;
  claimId?: string;
}

export interface MedicalClaimAttachment {
  name: string;
  url: string;
  type: 'image' | 'pdf' | 'other';
  uploadedAt: string;
}

export interface MedicalClaim {
  id: string;
  claimCode: string;
  familyId: string;
  memberId?: string;
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  serviceCategory?: string; // Standard category: Surgery, Lab, etc.
  icd10Code?: string; // ICD-10 diagnosis code
  cptCode?: string; // CPT procedure code
  status: 'pending' | 'approved' | 'partially_paid' | 'paid' | 'rejected';
  amount: number;
  approvedAmount?: number;
  discountAmount?: number;
  discountPercent?: number;
  discountReason?: string;
  diseaseName?: string;
  attachmentUrl?: string;
  attachments?: MedicalClaimAttachment[];
  date: string;
  invoiceDate?: string;
  providerId?: string; // Link to médical_provider lookup
  providerName: string; // Hospital/Clinic name
  providerAddress?: string;
  emergencyCaseId?: string;
  isCoPay?: boolean;
  coPayAmount?: number;
  notes?: string;
  adjudicationNotes?: string;
  createdAt: any;
  statusHistory?: {
    status: 'pending' | 'approved' | 'partially_paid' | 'paid' | 'rejected';
    date: any;
    updatedBy?: string;
    comment?: string;
  }[];
}

export interface ModulePermission {
  moduleId: string;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove?: boolean;
  canConfirmVisit?: boolean;
  canConfirmDecision?: boolean;
  canProcessDelivery?: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'volunteer';
  departmentId?: string;
  permissions: ModulePermission[];
  isActive: boolean;
  createdAt: any;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  defaultPermissions?: ModulePermission[];
}

export interface AppModule {
  id: string;
  name: string; // The customizable name
  originalName: string; // The original system name for reference
  icon: string;
  order: number;
  isActive: boolean;
  path: string;
  subModules?: {
    id: string;
    name: string;
    order: number;
  }[];
}

export interface SystemConfig {
  id: string;
  modules: AppModule[];
  departments: Department[];
  updatedAt: any;
}

export interface SystemSettings {
  jobTitles: string[];
  educationLevels: string[];
  homeContents: string[];
  diseases: string[];
  medicalProviders: string[];
  storeCategories: string[];
  services?: SystemService[];
  lastUpdated: any;
}
