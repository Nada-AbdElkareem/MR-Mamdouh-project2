import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, addDoc, serverTimestamp, updateDoc, deleteDoc, orderBy, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { Family, FamilyMember, Assistance, Visit, Relation, EducationLevel, VisitStatus, LookupItem, AssistanceType, AidRequest, HealthStatus, SystemService, EmergencyCase, Priority, StoreItem, PrescriptionItem, VisitType, MemberAttachment, HistorySnapshot, AppUser, AppModule } from '../types';
import { ArrowLeft, UserPlus, Users, User, Receipt, Phone, MapPin, Calendar, Heart, Trash2, Edit2, Plus, Info, Map as MapIcon, ClipboardCheck, Home, Globe, Search, CheckCircle2, Clock, Search as SearchIcon, Gavel, AlertCircle, Stethoscope, Truck, ArrowUpRight, XCircle, Package, Minus, Paperclip, FileText, ExternalLink, ShieldCheck, Loader2, Timer, FileQuestion } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { cn, generateSystemCode } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface FamilyDetailsProps {
  familyId: string;
  onBack: () => void;
  userProfile: AppUser | null;
  modules: AppModule[];
}

export function FamilyDetails({ familyId, onBack, userProfile, modules }: FamilyDetailsProps) {
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [assistances, setAssistances] = useState<Assistance[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [lookups, setLookups] = useState<LookupItem[]>([]);
  const [services, setServices] = useState<SystemService[]>([]);
  const [emergencyCases, setEmergencyCases] = useState<EmergencyCase[]>([]);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'assistance' | 'visits' | 'technical' | 'committee' | 'delivery' | 'planned_aid' | 'social'>('members');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isAddingAssistance, setIsAddingAssistance] = useState(false);
  const [isAddingVisit, setIsAddingVisit] = useState(false);
  const [isEditingTechnical, setIsEditingTechnical] = useState(false);
  const [isEditingFamily, setIsEditingFamily] = useState(false);
  const [editingFamily, setEditingFamily] = useState<Family | null>(null);
  const [editingAssistance, setEditingAssistance] = useState<Assistance | null>(null);
  const [managingMemberAid, setManagingMemberAid] = useState<FamilyMember | null>(null);
  const [managingMemberAttachments, setManagingMemberAttachments] = useState<FamilyMember | null>(null);
  const [isAddingMemberAttachment, setIsAddingMemberAttachment] = useState(false);
  const [newMemberAttachment, setNewMemberAttachment] = useState({
    name: '',
    type: 'pdf' as 'pdf' | 'image' | 'other',
    category: 'social' as 'social' | 'medical' | 'identity',
    url: '',
    issueDate: '',
    expiryDate: '',
    file: null as File | null
  });
  const [isUploading, setIsUploading] = useState(false);
  const [attachmentSearch, setAttachmentSearch] = useState('');
  const [attachmentSort, setAttachmentSort] = useState<'date_desc' | 'date_asc' | 'name_asc'>('date_desc');
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [memberFilterId, setMemberFilterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingAidRequest, setViewingAidRequest] = useState<{ memberId: string, aid: AidRequest } | null>(null);
  const [commentingOnTask, setCommentingOnTask] = useState<{ memberId: string, aidId: string, taskId: string } | null>(null);
  const [taskComment, setTaskComment] = useState('');
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [deliveryAidDialog, setDeliveryAidDialog] = useState<{ memberId: string, aidId: string, type: string } | null>(null);
  const [deliveryDetails, setDeliveryDetails] = useState({ 
    date: new Date().toISOString().split('T')[0], 
    details: '',
    deliveryDestination: '',
    deliveryMethod: 'pickup' as any,
    deliveryQuantity: 1,
    actualCost: 0,
    recipientSignatureName: '',
    deliveredBy: '',
    receiptUrl: '',
    isDiseaseConfirmed: false,
    prescriptionItems: [] as PrescriptionItem[]
  });

  // New member state
  const [newMember, setNewMember] = useState({
    name: '',
    nationalId: '',
    memberCode: '',
    relation: Relation.OTHER,
    birthDate: '',
    gender: 'male' as 'male' | 'female',
    nationality: 'مصري',
    educationLevel: EducationLevel.NONE,
    educationDetails: '',
    employmentStatus: 'unemployed',
    employmentDetails: '',
    healthCondition: HealthStatus.HEALTHY,
    healthNotes: '',
    disease: '',
    diseaseDetails: '',
    monthlyIncome: 0,
    maritalStatus: 'أعزب',
    isHealthy: true,
    isServiceRecipient: true
  });

  // Technical study state (Social Research)
  const [technicalStudy, setTechnicalStudy] = useState({
    socialStatus: '',
    numberOfDependents: 0,
    expenses: {
      housing: 0,
      food: 0,
      health: 0,
      education: 0,
      other: 0,
      total: 0
    },
    housingCondition: {
      type: 'brick' as 'brick' | 'adobe' | 'wood' | 'other',
      rooms: 1,
      hasWater: true,
      hasElectricity: true,
      hasFurniture: true,
      notes: ''
    },
    socialResearch: {
      caseSummary: '',
      incomeSource: '',
      totalExpenses: 0,
      priorityReason: ''
    }
  });

  useEffect(() => {
    if (family) {
      setTechnicalStudy({
        socialStatus: family.socialStatus || '',
        numberOfDependents: family.numberOfDependents || 0,
        expenses: family.expenses || { housing: 0, food: 0, health: 0, education: 0, other: 0, total: 0 },
        housingCondition: family.housingCondition || technicalStudy.housingCondition,
        socialResearch: family.socialResearch || technicalStudy.socialResearch
      });
    }
  }, [family]);

  // Auto-index member code
  useEffect(() => {
    if (isAddingMember && members.length >= 0) {
      const nextCode = generateSystemCode('MEM', family?.fileNumber, (members.length + 1).toString().padStart(2, '0'));
      setNewMember(prev => ({ ...prev, memberCode: nextCode }));
    }
  }, [isAddingMember, members, family]);

  // New assistance state
  const [newAssistance, setNewAssistance] = useState({
    amount: 0,
    type: AssistanceType.CASH,
    unit: 'ج.م',
    distributionDate: new Date().toISOString().split('T')[0],
    isDelivered: true,
    deliveryDate: new Date().toISOString().split('T')[0],
    deliveryDestination: '',
    deliveryQuantity: 1,
    targetMemberId: '',
    assignedToMemberId: '',
    processedBy: '',
    assignedBy: '',
    receiptUrl: '',
    notes: '',
    createMedicalClaim: false
  });

  // New visit state
  const [newVisit, setNewVisit] = useState({ 
    visitDate: new Date().toISOString().split('T')[0], 
    type: 'field_visit' as VisitType, 
    status: VisitStatus.SCHEDULED, 
    memberId: '',
    notes: '', 
    findings: [] as string[],
    recommendations: [] as string[],
    visitorName: '',
    generalDescription: '',
    itemizedIncome: [] as { source: string, amount: number }[],
    itemizedExpenses: [] as { category: string, amount: number }[],
    housingDetails: {
      type: 'brick' as 'brick' | 'adobe' | 'wood' | 'other',
      roomsCount: 1,
      hasWater: true,
      hasElectricity: true,
      hasFurniture: true,
      contents: '',
      appliances: '',
      conditionDescription: ''
    },
    socialSolidarity: {
      supportNetworks: '',
      communityContributions: '',
      socialSecurityBenefits: ''
    },
    socialResearch: {
      caseSummary: '',
      incomeSource: '',
      priorityReason: ''
    },
    location: {
      latitude: 0,
      longitude: 0,
      address: ''
    }
  });

  const [newAidRequest, setNewAidRequest] = useState({
    type: '',
    quantity: 1,
    unitCost: 0,
    durationMonths: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    illnessDetails: '',
    needDetails: '',
    notes: '',
    deliveryLocationId: '',
    dueDate: '',
    prescriptionItems: [] as PrescriptionItem[]
  });

  // Auto-calculate end date based on duration
  useEffect(() => {
    if (newAidRequest.startDate && newAidRequest.durationMonths > 0) {
      const start = new Date(newAidRequest.startDate);
      const end = new Date(start);
      end.setMonth(start.getMonth() + Number(newAidRequest.durationMonths));
      setNewAidRequest(prev => ({ ...prev, endDate: end.toISOString().split('T')[0] }));
    }
  }, [newAidRequest.startDate, newAidRequest.durationMonths]);

  useEffect(() => {
    const familyRef = doc(db, 'families', familyId);
    const familyUnsub = onSnapshot(familyRef, (doc) => {
      if (doc.exists()) {
        setFamily({ id: doc.id, ...doc.data() } as Family);
      }
      setLoading(false);
    }, err => {
      handleFirestoreError(err, OperationType.GET, `families/${familyId}`);
      setLoading(false);
    });

    const membersRef = collection(db, `families/${familyId}/members`);
    const membersUnsub = onSnapshot(membersRef, (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as FamilyMember)));
    }, err => handleFirestoreError(err, OperationType.LIST, `families/${familyId}/members`));

    const visitsRef = collection(db, `families/${familyId}/visits`);
    const visitsUnsub = onSnapshot(visitsRef, (snap) => {
      setVisits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Visit)));
    }, err => handleFirestoreError(err, OperationType.LIST, `families/${familyId}/visits`));

    const assistanceQuery = query(collection(db, 'assistances'), where('familyId', '==', familyId));
    const assistanceUnsub = onSnapshot(assistanceQuery, (snap) => {
      setAssistances(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assistance)));
    }, err => handleFirestoreError(err, OperationType.LIST, `assistances?familyId=${familyId}`));

    const lookupsQuery = query(collection(db, 'lookups'));
    const lookupsUnsub = onSnapshot(lookupsQuery, (snap) => {
      setLookups(snap.docs.map(d => ({ id: d.id, ...d.data() } as LookupItem)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'lookups'));

    const servicesQuery = query(collection(db, 'services'));
    const servicesUnsub = onSnapshot(servicesQuery, (snap) => {
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemService)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'services'));

    const emergenciesQuery = query(collection(db, 'emergency_cases'), where('familyId', '==', familyId));
    const emergenciesUnsub = onSnapshot(emergenciesQuery, (snap) => {
      setEmergencyCases(snap.docs.map(d => ({ id: d.id, ...d.data() } as EmergencyCase)));
    }, err => handleFirestoreError(err, OperationType.LIST, `emergency_cases?familyId=${familyId}`));

    const storeQuery = query(collection(db, 'store_items'), orderBy('name', 'asc'));
    const storeUnsub = onSnapshot(storeQuery, (snap) => {
      setStoreItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreItem)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'store_items'));

    const historyRef = query(collection(db, `families/${familyId}/history`), orderBy('timestamp', 'desc'));
    const historyUnsub = onSnapshot(historyRef, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as HistorySnapshot)));
    }, err => handleFirestoreError(err, OperationType.LIST, `families/${familyId}/history`));

    return () => {
      familyUnsub();
      membersUnsub();
      assistanceUnsub();
      visitsUnsub();
      lookupsUnsub();
      servicesUnsub();
      emergenciesUnsub();
      storeUnsub();
      historyUnsub();
    };
  }, [familyId]);

  const jobTitles = lookups.filter(l => l.type === 'job_title');
  const educationLevels = lookups.filter(l => l.type === 'education_level');
  const homeContents = lookups.filter(l => l.type === 'home_content');
  const diseases = lookups.filter(l => l.type === 'disease');

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const memCode = generateSystemCode('MEM', family?.fileNumber, (members.length + 1).toString().padStart(2, '0'));
      
      await addDoc(collection(db, `families/${familyId}/members`), {
        ...newMember,
        memberCode: memCode,
        familyId
      });
      setIsAddingMember(false);
      setNewMember({ 
        name: '', 
        nationalId: '',
        memberCode: '',
        relation: Relation.OTHER, 
        birthDate: '', 
        gender: 'male',
        nationality: 'مصري',
        educationLevel: EducationLevel.NONE,
        educationDetails: '',
        employmentStatus: 'unemployed',
        employmentDetails: '',
        healthCondition: HealthStatus.HEALTHY,
        healthNotes: '',
        disease: '',
        diseaseDetails: '',
        monthlyIncome: 0,
        maritalStatus: 'أعزب',
        isHealthy: true,
        isServiceRecipient: true
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `families/${familyId}/members`);
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    try {
      await updateDoc(doc(db, `families/${familyId}/members`, editingMember.id), {
        ...editingMember,
        updatedAt: serverTimestamp()
      });
      setEditingMember(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}/members/${editingMember.id}`);
    }
  };

  const handleUpdateFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFamily) return;
    try {
      await updateDoc(doc(db, 'families', familyId), {
        ...editingFamily,
        updatedAt: serverTimestamp()
      });
      setIsEditingFamily(false);
      setEditingFamily(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}`);
    }
  };

  const handleSaveTechnical = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cleanData = JSON.parse(JSON.stringify(technicalStudy));
      await updateDoc(doc(db, 'families', familyId), {
        ...cleanData,
        updatedAt: serverTimestamp()
      });
      setIsEditingTechnical(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}`);
    }
  };

  const handleAddVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const vCode = generateSystemCode('VST', family?.fileNumber, (visits.length + 1).toString().padStart(3, '0'));
      
      await addDoc(collection(db, `families/${familyId}/visits`), {
        ...newVisit,
        visitCode: vCode,
        familyId
      });
      setIsAddingVisit(false);
      setNewVisit({ 
        visitDate: new Date().toISOString().split('T')[0], 
        type: 'field_visit' as VisitType,
        status: VisitStatus.SCHEDULED, 
        memberId: '',
        notes: '', 
        findings: [],
        recommendations: [],
        visitorName: '',
        generalDescription: '',
        itemizedIncome: [],
        itemizedExpenses: [],
        housingDetails: {
          type: 'brick' as 'brick' | 'adobe' | 'wood' | 'other',
          roomsCount: 1,
          hasWater: true,
          hasElectricity: true,
          hasFurniture: true,
          contents: '',
          appliances: '',
          conditionDescription: ''
        },
        socialSolidarity: {
          supportNetworks: '',
          communityContributions: '',
          socialSecurityBenefits: ''
        },
        socialResearch: {
          caseSummary: '',
          incomeSource: '',
          priorityReason: ''
        },
        location: {
          latitude: 0,
          longitude: 0,
          address: ''
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `families/${familyId}/visits`);
    }
  };

  const handleAddAssistance = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Emergency check
    const isEmergency = newAssistance.type.includes('طوارئ') || newAssistance.type.toLowerCase().includes('emergency');
    if (isEmergency) {
      const hasCase = emergencyCases.some(c => c.status === 'open');
      if (!hasCase) {
        alert('خطأ: يجب تسجيل حالة طوارئ مفتوحة لهذه العائلة أولاً قبل تسجيل مساعدة طارئة.');
        return;
      }
    }

    try {
      const astCode = generateSystemCode('AST', family?.fileNumber, (newAssistance.targetMemberId || 'FAM').slice(-4), (assistances.length + 1).toString().padStart(3, '0'));
      
      const { createMedicalClaim, ...assistanceData } = newAssistance;

      const docRef = await addDoc(collection(db, 'assistances'), {
        ...assistanceData,
        assistanceCode: astCode,
        familyId,
        targetFamilyId: familyId,
        createdAt: new Date().toISOString()
      });

      if (createMedicalClaim) {
        const service = services.find(s => s.name === newAssistance.type);
        const claimDoc = await addDoc(collection(db, 'medical_claims'), {
          familyId: familyId,
          memberId: newAssistance.targetMemberId || null,
          serviceId: service?.id || 'manual',
          serviceName: newAssistance.type,
          serviceCode: astCode,
          claimCode: `CLM-${Date.now().toString().slice(-6)}`,
          status: 'pending',
          amount: newAssistance.amount,
          date: newAssistance.distributionDate,
          providerName: newAssistance.deliveryDestination || 'غير محدد',
          notes: `مطالبة تلقائية من مساعدة يدوية (ملف الأسرة): ${newAssistance.notes || ''}`,
          createdAt: serverTimestamp()
        });

        await updateDoc(doc(db, 'assistances', docRef.id), {
          claimId: claimDoc.id
        });
      }

      // Also update family's updatedAt timestamp
      await updateDoc(doc(db, 'families', familyId), { updatedAt: serverTimestamp() });
      setIsAddingAssistance(false);
      setNewAssistance({ 
        amount: 0, 
        type: AssistanceType.CASH, 
        unit: 'ج.م',
        distributionDate: new Date().toISOString().split('T')[0], 
        isDelivered: true,
        deliveryDate: new Date().toISOString().split('T')[0],
        deliveryDestination: '',
        deliveryQuantity: 1,
        targetMemberId: '',
        assignedToMemberId: '',
        processedBy: '',
        assignedBy: '',
        receiptUrl: '',
        notes: '',
        createMedicalClaim: false
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'assistances');
    }
  };

  const handleAddMemberAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingMemberAttachments) return;

    try {
      setIsUploading(true);
      let fileUrl = newMemberAttachment.url;

      if (newMemberAttachment.file) {
        const fileRef = ref(storage, `members/${managingMemberAttachments.id}/attachments/${Date.now()}_${newMemberAttachment.file.name}`);
        const uploadResult = await uploadBytes(fileRef, newMemberAttachment.file);
        fileUrl = await getDownloadURL(uploadResult.ref);
      }

      if (!fileUrl) {
        alert('برجاء اختيار ملف للرفع أو إدخال رابط');
        setIsUploading(false);
        return;
      }

      const attachment: MemberAttachment = {
        name: newMemberAttachment.name,
        type: newMemberAttachment.type,
        category: newMemberAttachment.category,
        url: fileUrl,
        uploadedAt: new Date().toISOString(),
        issueDate: newMemberAttachment.issueDate || undefined,
        expiryDate: newMemberAttachment.expiryDate || undefined
      };

      const updatedAttachments = [...(managingMemberAttachments.attachments || []), attachment];
      
      await updateDoc(doc(db, `families/${familyId}/members`, managingMemberAttachments.id), {
        attachments: updatedAttachments
      });

      setManagingMemberAttachments(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
      setIsAddingMemberAttachment(false);
      setNewMemberAttachment({
        name: '',
        type: 'pdf',
        category: 'social',
        url: '',
        issueDate: '',
        expiryDate: '',
        file: null
      });
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}/members/${managingMemberAttachments.id}`);
    } finally {
      setIsUploading(false);
    }
  };

  const removeMemberAttachment = async (index: number) => {
    if (!managingMemberAttachments || !window.confirm('هل أنت متأكد من حذف هذا المرفق؟')) return;

    try {
      const updatedAttachments = managingMemberAttachments.attachments?.filter((_, i) => i !== index) || [];
      
      await updateDoc(doc(db, `families/${familyId}/members`, managingMemberAttachments.id), {
        attachments: updatedAttachments
      });

      setManagingMemberAttachments(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}/members/${managingMemberAttachments.id}`);
    }
  };

  const handleRemoveMemberAttachment = async (idx: number) => {
    if (!managingMemberAttachments || !managingMemberAttachments.attachments) return;
    if (!confirm('هل أنت متأكد من حذف هذا المرفق؟')) return;

    try {
      const updatedAttachments = managingMemberAttachments.attachments.filter((_, i) => i !== idx);
      
      await updateDoc(doc(db, `families/${familyId}/members`, managingMemberAttachments.id), {
        attachments: updatedAttachments
      });

      setManagingMemberAttachments(prev => prev ? { ...prev, attachments: updatedAttachments } : null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}/members/${managingMemberAttachments.id}`);
    }
  };

  const handleAddAidRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingMemberAid) return;

    // Emergency check
    const isEmergency = newAidRequest.type.includes('طوارئ') || newAidRequest.type.toLowerCase().includes('emergency');
    if (isEmergency) {
      const hasCase = emergencyCases.some(c => c.status === 'open');
      if (!hasCase) {
        alert('خطأ: يجب تسجيل حالة طوارئ مفتوحة لهذه العائلة أولاً قبل تسجيل طلب خدمة طارئة.');
        return;
      }
    }
    
    try {
      const aidRequest: AidRequest = {
        id: crypto.randomUUID(),
        ...newAidRequest,
        totalCost: newAidRequest.quantity * newAidRequest.unitCost * (newAidRequest.durationMonths || 1),
        status: 'requested' as const,
        requestDate: new Date().toISOString().split('T')[0],
        followUpLog: [{
          date: new Date().toISOString(),
          comment: 'تم إنشاء طلب الخدمة.',
          processedBy: 'النظام',
          type: 'comment'
        }]
      };
      
      const updatedRequests = [...(managingMemberAid.aidRequests || []), aidRequest];
      const cleanRequests = JSON.parse(JSON.stringify(updatedRequests));

      await updateDoc(doc(db, `families/${familyId}/members`, managingMemberAid.id), {
        aidRequests: cleanRequests
      });
      
      setManagingMemberAid(prev => prev ? { ...prev, aidRequests: cleanRequests } : null);
      setNewAidRequest({ 
        type: '', 
        quantity: 1, 
        unitCost: 0, 
        durationMonths: 1,
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        illnessDetails: '', 
        needDetails: '', 
        notes: '',
        deliveryLocationId: '',
        dueDate: '',
        prescriptionItems: []
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}/members/${managingMemberAid.id}`);
    }
  };

  const saveAidEdits = async (memberId: string, aidId: string) => {
    try {
      const member = members.find(m => m.id === memberId);
      if (!member || !member.aidRequests) return;
      
      const updatedRequests = member.aidRequests.map(req => {
        if (req.id === aidId) {
          const totalCost = (req.quantity || 1) * (req.unitCost || 0) * (req.durationMonths || 1);
          return { ...req, totalCost };
        }
        return req;
      });

      const cleanRequests = JSON.parse(JSON.stringify(updatedRequests));

      await updateDoc(doc(db, `families/${familyId}/members`, memberId), {
        aidRequests: cleanRequests
      });
      
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}/members/${memberId}`);
    }
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    requested: true,
    confirmed: true,
    preparing: true,
    in_progress: true,
    delivered: false,
    rejected: false
  });

  const toggleGroup = (status: string) => {
    setExpandedGroups(prev => ({ ...prev, [status]: !prev[status] }));
  };

  const updateAidStatus = async (memberId: string, aidId: string, status: string, data?: string | any) => {
    try {
      const member = members.find(m => m.id === memberId);
      if (!member || !member.aidRequests) return;
      
      let finalData = data;
      if (status === 'rejected' && !finalData) {
        const reason = prompt('برجاء إدخال سبب الرفض:');
        if (reason === null) return;
        finalData = reason;
      }

      const updatedRequests = member.aidRequests.map(req => {
        if (req.id === aidId) {
          let baseUpdate: any = { 
            ...req, 
            status, 
            processedDate: status === 'approved' ? new Date().toISOString().split('T')[0] : (req.processedDate || null),
            deliveryDate: status === 'delivered' ? (finalData?.date || new Date().toISOString().split('T')[0]) : (req.deliveryDate || null),
            rejectionReason: status === 'rejected' ? (typeof finalData === 'string' ? finalData : finalData?.reason || null) : (req.rejectionReason || null)
          };

          // If delivered, update inventory for prescription items
          if (status === 'delivered') {
            const member = members.find(m => m.id === memberId);
            const aid = member?.aidRequests?.find(r => r.id === aidId);
            
            // If we have updated prescription items from the dialog, use them
            if (finalData?.prescriptionItems) {
               baseUpdate.prescriptionItems = finalData.prescriptionItems;
            }

            const itemsToProcess = baseUpdate.prescriptionItems || aid?.prescriptionItems;

            if (itemsToProcess) {
              itemsToProcess.forEach(async (item: PrescriptionItem) => {
                if (item.itemId && (item.dispensedQuantity || item.requestedQuantity) > 0) {
                  const qtyToSubtract = item.dispensedQuantity || item.requestedQuantity;
                  await updateDoc(doc(db, 'store_items', item.itemId), {
                    quantity: increment(-qtyToSubtract)
                  });
                }
              });
            }
          }

          // Add log entry
          const logEntry = {
            date: new Date().toISOString(),
            comment: status === 'delivered' ? `تم التسليم النهائي للخدمة. التفاصيل: ${finalData?.details || 'تم الاستلام بنجاح'}` : `تغيرت حالة الطلب إلى: ${status === 'requested' ? 'مطلوب' : status === 'visit_confirmed' ? 'مؤكد ميدانياً' : status === 'approved' ? 'معتمد' : status === 'delivered' ? 'تم التسليم' : status === 'rejected' ? 'مرفوض' : status}${finalData && typeof finalData === 'string' ? ` - السبب: ${finalData}` : ''}`,
            processedBy: 'النظام',
            type: status === 'delivered' ? 'delivery' : 'status_change' as const
          };
          baseUpdate.followUpLog = [...(req.followUpLog || []), logEntry];

          // If updating duration or start date during transitions
          if (finalData && typeof finalData === 'object' && (finalData.durationMonths || finalData.startDate)) {
            baseUpdate = {
              ...baseUpdate,
              durationMonths: data.durationMonths || req.durationMonths,
              startDate: data.startDate || req.startDate,
              totalCost: (data.durationMonths || req.durationMonths || 1) * (data.unitCost || req.unitCost || 0) * (data.quantity || req.quantity || 1)
            };
            
            // Calculate end date
            if (baseUpdate.startDate && baseUpdate.durationMonths) {
               const sd = new Date(baseUpdate.startDate);
               sd.setMonth(sd.getMonth() + baseUpdate.durationMonths);
               baseUpdate.endDate = sd.toISOString().split('T')[0];
            }
          }

          // If Approved, generate the temporal division (delivery schedule)
          if (status === 'approved') {
            // Generate committeeCode if not present
            if (!baseUpdate.committeeCode) {
              baseUpdate.committeeCode = generateSystemCode('COM', family?.fileNumber, memberId.slice(-4), Math.floor(Math.random() * 1000).toString().padStart(3, '0'));
            }

            if (!req.deliverySchedule) {
              const schedule: any[] = [];
              const duration = baseUpdate.durationMonths || 1;
              const startStr = baseUpdate.startDate || new Date().toISOString().split('T')[0];
              
              for (let i = 0; i < duration; i++) {
                const d = new Date(startStr);
                d.setMonth(d.getMonth() + i);
                schedule.push({
                  id: Math.random().toString(36).substr(2, 9),
                  aidRequestId: req.id,
                  memberId: member.id,
                  idNumber: i + 1,
                  status: 'pending',
                  scheduledDate: d.toISOString().split('T')[0],
                  deliveryCode: generateSystemCode('DEL', family?.fileNumber, memberId.slice(-4), (i + 1).toString()),
                  updates: []
                });
              }
              baseUpdate.deliverySchedule = schedule;
            }
          }

          // Generate visit code if transitioning to visit_confirmed
          if (status === 'visit_confirmed') {
            const vCode = generateSystemCode('VST', family?.fileNumber, memberId.slice(-4), Math.floor(Math.random() * 1000).toString().padStart(3, '0'));
            // Create a physical visit record
            addDoc(collection(db, `families/${familyId}/visits`), {
              visitCode: vCode,
              familyId,
              memberId,
              visitDate: new Date().toISOString().split('T')[0],
              type: 'assessment',
              status: 'completed',
              findings: 'تمت الزيارة الميدانية وتأكيد الحالة من قبل الباحث.',
              visitorName: 'الباحث الميداني',
              createdAt: serverTimestamp()
            }).catch(err => console.error("Error adding visit:", err));
          }


          if (status === 'delivered' && typeof data === 'object') {
            return {
              ...baseUpdate,
              deliveryDetails: data.details || null,
              deliveryDestination: data.deliveryDestination || null,
              deliveryMethod: data.deliveryMethod || 'pickup',
              deliveryQuantity: Number(data.deliveryQuantity) || req.quantity,
              actualCost: Number(data.actualCost) || req.totalCost,
              recipientSignatureName: data.recipientSignatureName || null,
              deliveredBy: data.deliveredBy || null,
              receiptUrl: data.receiptUrl || null,
              isDiseaseConfirmed: !!data.isDiseaseConfirmed
            };
          }

          if (status === 'delivered' && typeof data === 'string') {
            return { ...baseUpdate, deliveryDetails: data };
          }

          return baseUpdate;
        }
        return req;
      });

      const cleanRequests = JSON.parse(JSON.stringify(updatedRequests));
      
      await updateDoc(doc(db, `families/${familyId}/members`, memberId), {
        aidRequests: cleanRequests
      });

      // Create assistance record when delivered
      if (status === 'delivered' && typeof data === 'object') {
        const memberInfo = members.find(m => m.id === memberId);
        const astCode = generateSystemCode('AST', family?.fileNumber, memberId.slice(-4), Math.floor(Math.random() * 1000).toString().padStart(3, '0'));
        
        const assistanceDocData: any = {
           assistanceCode: astCode,
           familyId,
           targetMemberId: memberId,
           assignedToMemberId: memberId,
           amount: Number(data.actualCost) || 0,
           unit: 'ج.م',
           distributionDate: data.date || new Date().toISOString().split('T')[0],
           type: memberInfo?.aidRequests?.find(r => r.id === aidId)?.type || 'غير محدد',
           notes: data.notes || '',
           processedBy: data.deliveredBy || '',
           receiptUrl: data.receiptUrl || '',
           deliveryDestination: data.deliveryDestination || '',
           deliveryQuantity: Number(data.deliveryQuantity) || 1,
           isDelivered: true,
           deliveryDate: data.date || new Date().toISOString().split('T')[0],
           createdAt: serverTimestamp()
        };

        const astDocRef = await addDoc(collection(db, 'assistances'), assistanceDocData);

        // Auto-create medical claim if type is medical
        const isMedical = (assistanceDocData.type || '').toLowerCase().includes('medical') || (assistanceDocData.type || '').includes('طبي');
        if (isMedical) {
          const service = services.find(s => s.name === assistanceDocData.type);
          const claimDoc = await addDoc(collection(db, 'medical_claims'), {
            familyId: familyId,
            memberId: memberId || null,
            serviceId: service?.id || 'manual',
            serviceName: assistanceDocData.type,
            serviceCode: astCode,
            claimCode: `CLM-${Date.now().toString().slice(-6)}`,
            status: 'pending',
            amount: assistanceDocData.amount,
            date: assistanceDocData.distributionDate,
            providerName: assistanceDocData.deliveryDestination || 'غير محدد',
            notes: `مطالبة تلقائية من تسليم طلب خدمة للأسرة: ${assistanceDocData.notes || ''}`,
            createdAt: serverTimestamp()
          });

          await updateDoc(doc(db, 'assistances', astDocRef.id), {
            claimId: claimDoc.id
          });
        }
      }

      if (managingMemberAid?.id === memberId) {
        setManagingMemberAid({ ...managingMemberAid, aidRequests: cleanRequests });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}/members/${memberId}`);
    }
  };

  const handleUpdateAssistance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssistance) return;
    try {
      const original = assistances.find(a => a.id === editingAssistance.id);
      let updateData = { ...editingAssistance };

      if (editingAssistance.isDelivered && !original?.isDelivered) {
        if (!editingAssistance.deliveryDate) {
          updateData.deliveryDate = new Date().toISOString().split('T')[0];
        }
        updateData.followUpLog = [
          ...(editingAssistance.followUpLog || []),
          {
            date: new Date().toISOString(),
            comment: 'تم تحديث حالة المساعدة إلى: تم التسليم.',
            processedBy: 'النظام',
            type: 'final_delivery'
          }
        ];
      }

      await updateDoc(doc(db, 'assistances', editingAssistance.id), {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      setEditingAssistance(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `assistances/${editingAssistance.id}`);
    }
  };

  const handleCreateClaimFromAid = async (aid: any) => {
    try {
      const service = services.find(s => s.name === aid.type);
      await addDoc(collection(db, 'medical_claims'), {
        familyId: familyId,
        memberId: aid.memberId || null,
        serviceId: service?.id || 'manual',
        serviceName: aid.type,
        serviceCode: `SRV-${aid.id.slice(-4)}`,
        claimCode: `CLM-${Date.now().toString().slice(-6)}`,
        status: 'pending',
        amount: aid.unitCost || 0,
        date: new Date().toISOString().split('T')[0],
        providerName: 'غير محدد (من الطلب المعتمد)',
        notes: `مطالبة تلقائية من طلب خدمة معتمدة للأسرة: ${family?.name || ''}`,
        createdAt: serverTimestamp()
      });
      alert('تم تحويل طلب الخدمة إلى مطالبة طبية بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'medical_claims');
    }
  };

  const handleCreateClaimFromAssistance = async (log: any) => {
    try {
      const service = services.find(s => s.name === log.type);
      const claimDoc = await addDoc(collection(db, 'medical_claims'), {
        familyId: log.familyId,
        memberId: log.targetMemberId || null,
        serviceId: service?.id || 'manual',
        serviceName: log.type,
        serviceCode: log.assistanceCode || `SRV-${log.id.slice(-4)}`,
        claimCode: `CLM-${Date.now().toString().slice(-6)}`,
        status: 'pending',
        amount: log.amount,
        date: log.distributionDate,
        providerName: log.deliveryDestination || 'غير محدد',
        notes: `مطالبة يدوية محولة من مساعدة للأسرة (${log.assistanceCode || log.id}): ${log.notes || ''}`,
        createdAt: serverTimestamp()
      });
      
      // Mark assistance as claimed
      await updateDoc(doc(db, 'assistances', log.id), {
        claimId: claimDoc.id
      });
      
      alert('تم تحويل المساعدة إلى مطالبة طبية بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'medical_claims');
    }
  };

  const updateDeliveryTask = async (memberId: string, aidId: string, taskId: string, updates: any, newLog?: string) => {
    try {
      const member = members.find(m => m.id === memberId);
      if (!member || !member.aidRequests) return;
      
      let finalizedAssistanceData: any = null;

      const updatedRequests = member.aidRequests.map(req => {
        if (req.id === aidId && req.deliverySchedule) {
          const updatedSchedule = req.deliverySchedule.map(task => {
            if (task.id === taskId) {
              const newUpdates = [...(task.updates || [])];
              if (newLog) {
                newUpdates.push({
                  date: new Date().toISOString(),
                  text: newLog,
                  user: "مسؤول المتابعة"
                });
              }
              const updatedTask = { ...task, ...updates, updates: newUpdates };
              if (updates.status === 'delivered') {
                updatedTask.deliveryDate = new Date().toISOString().split('T')[0];
                
                // Prepare data for Assistance Log
                const astCode = generateSystemCode('AST', family?.fileNumber, memberId.slice(-4), task.idNumber.toString());
                const delCode = generateSystemCode('DEL', family?.fileNumber, memberId.slice(-4), `${task.idNumber}-${task.id.slice(-2)}`);

                finalizedAssistanceData = {
                  assistanceCode: astCode,
                  deliveryCode: delCode,
                  familyId,
                  targetMemberId: memberId,
                  assignedToMemberId: memberId,
                  amount: req.unitCost || 0,
                  unit: 'ج.م',
                  distributionDate: updatedTask.deliveryDate,
                  type: req.type,
                  notes: `تم تسليم القسط رقم ${task.idNumber} من طلب المساعدة: ${req.type}. \n${newLog || ''}`,
                  processedBy: "مسؤول التوزيع",
                  deliveryDestination: req.deliveryDestination || '',
                  deliveryQuantity: 1,
                  isDelivered: true,
                  deliveryDate: updatedTask.deliveryDate,
                  followUpLog: newUpdates.map(u => ({
                    date: u.date,
                    comment: u.text,
                    processedBy: u.user,
                    type: 'comment'
                  })),
                  createdAt: serverTimestamp()
                };
              }
              return updatedTask;
            }
            return task;
          });

          const allDelivered = updatedSchedule.every(t => t.status === 'delivered');

          return { 
            ...req, 
            deliverySchedule: updatedSchedule,
            status: (updates.status === 'delivered' && allDelivered) ? 'delivered' : req.status,
            deliveryDate: (updates.status === 'delivered' && allDelivered) ? new Date().toISOString().split('T')[0] : req.deliveryDate
          };
        }
        return req;
      });

      const cleanRequests = JSON.parse(JSON.stringify(updatedRequests));
      await updateDoc(doc(db, `families/${familyId}/members`, memberId), {
        aidRequests: cleanRequests
      });

      // If a task was marked as delivered, create an entry in the assistances collection
      if (finalizedAssistanceData) {
        await addDoc(collection(db, 'assistances'), finalizedAssistanceData);
      }

      if (managingMemberAid?.id === memberId) {
        setManagingMemberAid({ ...managingMemberAid, aidRequests: cleanRequests });
      }
      
      // Update viewing state if open
      if (viewingAidRequest && viewingAidRequest.aid.id === aidId) {
        const updatedAid = cleanRequests.find((r: any) => r.id === aidId);
        if (updatedAid) setViewingAidRequest({ ...viewingAidRequest, aid: updatedAid });
      }

      setCommentingOnTask(null);
      setTaskComment('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}/members/${memberId}`);
    }
  };

  const markVisitCompleted = async (visitId: string) => {
    try {
      const visit = visits.find(v => v.id === visitId);
      if (visit) {
        // 1. Visit code auto-generation (if missing)
        const visitCode = visit.visitCode || generateSystemCode('VST', family?.fileNumber, (visits.length).toString().padStart(3, '0'));

        // 2. Family Member creation for visitor
        const alreadyMember = members.some(m => m.name === visit.visitorName);
        if (!alreadyMember && visit.visitorName) {
          const nextCode = generateSystemCode('MEM', family?.fileNumber, (members.length + 1).toString().padStart(2, '0'));
          await addDoc(collection(db, `families/${familyId}/members`), {
            name: visit.visitorName,
            memberCode: nextCode,
            relation: Relation.OTHER,
            birthDate: visit.visitDate,
            gender: 'male' as const,
            nationality: 'مصري',
            educationLevel: EducationLevel.NONE,
            employmentStatus: 'باحث ميداني',
            employmentDetails: 'تمت الإضافة تلقائياً عند اكتمال الزيارة',
            isHealthy: true,
            isServiceRecipient: false,
            familyId,
            createdAt: serverTimestamp()
          });
        }

        // 3. Status logic: field_visit -> assessment
        const newType = visit.type === 'field_visit' ? 'assessment' : visit.type;

        // 4. Update visit
        await updateDoc(doc(db, `families/${familyId}/visits`, visitId), {
          status: VisitStatus.COMPLETED,
          type: newType,
          visitCode,
          updatedAt: serverTimestamp()
        });

        // sync Technical Study to Family (Linking visits to tech study)
        const familyUpdates: any = {
           updatedAt: serverTimestamp()
        };
        const historySnapshots: any[] = [];
        
        // 5a. Housing Condition Tracking
        if (visit.housingDetails) {
          const housingData = {
            type: visit.housingDetails.type || 'brick',
            rooms: visit.housingDetails.roomsCount || 1,
            hasWater: visit.housingDetails.hasWater ?? true,
            hasElectricity: visit.housingDetails.hasElectricity ?? true,
            hasFurniture: visit.housingDetails.hasFurniture ?? true,
            notes: visit.housingDetails.conditionDescription || ''
          };
          familyUpdates.housingCondition = housingData;
          
          // Also update a flat level for quick access if needed
          if (visit.housingDetails.conditionDescription) {
            familyUpdates.housingStatus = visit.housingDetails.conditionDescription; // Partial mapping
          }

          historySnapshots.push({
            timestamp: new Date().toISOString(),
            source: 'visit',
            sourceId: visitId,
            category: 'housing',
            data: housingData,
            changeSummary: `تم تحديث بيانات السكن (عدد الغرف: ${housingData.rooms}، نوع البناء: ${housingData.type}) بناءً على الزيارة الميدانية رقم ${visitCode}`
          });
        }

        // 5b. Social & Dependents Tracking
        if (members && members.length > 0) {
          familyUpdates.numberOfDependents = members.length;
          historySnapshots.push({
            timestamp: new Date().toISOString(),
            source: 'visit',
            sourceId: visitId,
            category: 'social',
            data: { numberOfDependents: members.length },
            changeSummary: `تحديث إحصائي لعدد أفراد الأسرة إلى (${members.length}) بناءً على نتائج الزيارة الميدانية`
          });
        }

        if (visit.itemizedIncome && visit.itemizedIncome.length > 0) {
          const totalIncome = visit.itemizedIncome.reduce((sum, inc) => sum + inc.amount, 0);
          familyUpdates.monthlyIncome = totalIncome;
          historySnapshots.push({
            timestamp: new Date().toISOString(),
            source: 'visit',
            sourceId: visitId,
            category: 'income',
            data: { monthlyIncome: totalIncome, items: visit.itemizedIncome },
            changeSummary: `تعديل الدخل الشهري للأسرة ليصبح ${totalIncome} ج.م بناءً على جرد الدخل خلال الزيارة`
          });
        }

        if (visit.itemizedExpenses && visit.itemizedExpenses.length > 0) {
          const totalExp = visit.itemizedExpenses.reduce((sum, e) => sum + e.amount, 0);
          const exp: any = { 
            housing: 0, food: 0, health: 0, education: 0, other: 0, 
            total: totalExp
          };
          visit.itemizedExpenses.forEach(e => {
            exp.other += e.amount;
          });
          familyUpdates.expenses = exp;
        }

        if (visit.socialResearch) {
          familyUpdates.socialResearch = visit.socialResearch;
          historySnapshots.push({
            timestamp: new Date().toISOString(),
            source: 'visit',
            sourceId: visitId,
            category: 'social',
            data: visit.socialResearch,
            changeSummary: `تحديث ملخص البحث الاجتماعي وتوصيات الباحث الميداني (${visit.visitorName})`
          });
        }

        if (visit.socialSolidarity) {
          familyUpdates.socialSolidarity = visit.socialSolidarity;
        }

        await updateDoc(doc(db, 'families', familyId), familyUpdates);

        // Save history snapshots
        for (const snap of historySnapshots) {
          await addDoc(collection(db, `families/${familyId}/history`), {
            ...snap,
            createdAt: serverTimestamp()
          });
        }
        // 6. Emergency Case Integration
        if (visit.visitorName) {
           const openCase = emergencyCases.find(c => c.familyId === familyId && c.status === 'open');
           if (openCase) {
             const newComment = {
               user: 'النظام',
               text: `تم اكتمال الزيارة الميدانية بواسطة ${visit.visitorName}.`,
               date: new Date().toISOString()
             };
             await updateDoc(doc(db, 'emergency_cases', openCase.id), {
               comments: [...(openCase.comments || []), newComment],
               updatedAt: serverTimestamp()
             });
           } else {
             await addDoc(collection(db, 'emergency_cases'), {
               caseCode: generateSystemCode('EMG', family?.fileNumber, 'VST', visitId.slice(-4)),
               familyId,
               familyName: family?.name,
               title: 'Visit Follow-up',
               description: `زيارة متابعة بواسطة ${visit.visitorName}. النتائج: ${Array.isArray(visit.findings) ? visit.findings.join(', ') : visit.findings || 'لا يوجد'}`,
               priority: Priority.MEDIUM,
               status: 'open',
               comments: [],
               createdAt: serverTimestamp(),
               updatedAt: serverTimestamp()
             });
           }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}/visits/${visitId}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-20 bg-white rounded-[40px] border border-gray-100 shadow-sm space-y-6">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-indigo-100 rounded-[32px] rotate-45" />
          <div className="w-20 h-20 border-4 border-indigo-600 border-t-transparent rounded-[32px] animate-spin absolute top-0 left-0 rotate-45" />
          <Users className="w-8 h-8 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-gray-900 tracking-tight">جاري مراجعة الملف</p>
          <p className="text-sm text-gray-400 font-bold mt-1 animate-pulse tracking-widest uppercase text-[10px]">نحن نوقظ البيانات من أجلك...</p>
        </div>
      </div>
    );
  }

  if (!family) {
    return (
      <div className="text-center py-20 bg-white rounded-[40px] border border-gray-100 shadow-sm">
        <div className="w-20 h-20 bg-rose-50 rounded-[32px] flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-10 h-10 text-rose-500" />
        </div>
        <h3 className="text-2xl font-black text-gray-900 mb-2">الملف غير موجود</h3>
        <p className="text-gray-400 font-bold mb-8">عذراً، لم نتمكن من العثور على بيانات هذه العائلة.</p>
        <button onClick={onBack} className="bg-gray-100 text-gray-600 px-8 py-3 rounded-2xl font-black transition-colors hover:bg-gray-200">العودة للسجل</button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* Header & Back Action */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-3 bg-white border border-gray-100 rounded-2xl hover:bg-gray-50 transition-all shadow-sm"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-gray-900">{family.name}</h2>
            <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100">
              #{family.fileNumber}
            </span>
          </div>
          <p className="text-gray-400 flex items-center gap-2 mt-1">
            <MapPin className="w-4 h-4" /> {family.address}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Info Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold mb-6 border-b border-gray-50 pb-4">معلومات الملف</h3>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-emerald-50 rounded-xl">
                  <Phone className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">رقم الهاتف</p>
                  <p className="font-bold text-gray-900 mt-0.5">{family.phone || 'غير مسجل'}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-50 rounded-xl">
                  <Receipt className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">الدخل الشهري</p>
                  <p className="font-bold text-gray-900 mt-0.5">{family.monthlyIncome} ج.م</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-50 rounded-xl">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">تاريخ الإنشاء</p>
                  <p className="font-bold text-gray-900 mt-0.5">{family.createdAt?.toDate().toLocaleDateString('ar-EG')}</p>
                </div>
              </div>

              <div className="mt-8 p-4 bg-blue-50/30 rounded-2xl border border-blue-100 space-y-4">
                <p className="text-xs text-blue-900 font-black flex items-center gap-2">
                   <User className="w-4 h-4" /> شخص التواصل للطوارئ
                </p>
                <div className="space-y-3">
                   <div>
                      <p className="text-[10px] text-blue-400 font-bold uppercase">الاسم</p>
                      <p className="text-sm font-black text-gray-900">{family.contactPersonName || 'غير مسجل'}</p>
                   </div>
                   <div className="flex justify-between">
                      <div>
                         <p className="text-[10px] text-blue-400 font-bold uppercase">الهاتف</p>
                         <p className="text-sm font-black text-gray-900">{family.contactPersonPhone || 'غير مسجل'}</p>
                      </div>
                      <div className="text-left">
                         <p className="text-[10px] text-blue-400 font-bold uppercase">الدور</p>
                         <p className="text-sm font-black text-gray-900">{family.contactPersonRole || '--'}</p>
                      </div>
                   </div>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-gray-100 space-y-4">
                 <p className="text-xs font-black text-gray-900 flex items-center gap-2 uppercase tracking-widest">
                    <MapPin className="w-4 h-4 text-rose-500" /> معلومات العنوان والموقع
                 </p>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <p className="text-[10px] text-gray-400 font-bold uppercase">المحافظة</p>
                     <p className="text-sm font-black text-gray-900">{lookups.find(l => l.id === family.governorate)?.name || family.governorate || 'غير مسجل'}</p>
                   </div>
                   <div>
                     <p className="text-[10px] text-gray-400 font-bold uppercase">المدينة</p>
                     <p className="text-sm font-black text-gray-900">{family.city || 'غير مسجل'}</p>
                   </div>
                   <div>
                     <p className="text-[10px] text-gray-400 font-bold uppercase">الحي / المنطقة</p>
                     <p className="text-sm font-black text-gray-900">{lookups.find(l => l.id === family.neighborhood)?.name || family.neighborhood || 'غير مسجل'}</p>
                   </div>
                   <div>
                     <p className="text-[10px] text-gray-400 font-bold uppercase">عدد المعالين</p>
                     <p className="text-sm font-black text-gray-900">{family.numberOfDependents || '0'}</p>
                   </div>
                   <div className="col-span-2">
                     <p className="text-[10px] text-gray-400 font-bold uppercase">العنوان التفصيلي</p>
                     <p className="text-sm font-black text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100 italic">
                        {family.detailedAddress || family.address}
                     </p>
                   </div>
                 </div>
              </div>

              <div className="mt-8 pt-8 border-t border-gray-100 space-y-4">
                 <p className="text-xs font-black text-gray-900 flex items-center gap-2 uppercase tracking-widest">
                    <Home className="w-4 h-4 text-emerald-500" /> الحالة الاجتماعية والسكنية
                     <button 
                       onClick={() => setIsEditingTechnical(true)}
                       className="mr-2 p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                       title="تعديل"
                     >
                       <Edit2 className="w-3 h-3 inline" />
                     </button>
                 </p>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <p className="text-[10px] text-gray-400 font-bold uppercase">الحالة الاجتماعية</p>
                     <p className="text-sm font-black text-gray-900">{family.socialStatus || 'غير مسجل'}</p>
                   </div>
                   <div>
                     <p className="text-[10px] text-gray-400 font-bold uppercase">حالة السكن</p>
                     <p className="text-sm font-black text-gray-900">{family.housingStatus || 'غير مسجل'}</p>
                   </div>
                   <div>
                     <p className="text-[10px] text-gray-400 font-bold uppercase">نوع البناء</p>
                     <p className="text-sm font-black text-gray-900">{family.housingCondition?.type || '--'}</p>
                   </div>
                   <div>
                     <p className="text-[10px] text-gray-400 font-bold uppercase">عدد الغرف</p>
                     <p className="text-sm font-black text-gray-900">{family.housingCondition?.rooms || '0'}</p>
                   </div>
                 </div>
                 <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className={cn("px-2 py-1.5 rounded-lg text-[9px] font-black text-center border transition-all", family.housingCondition?.hasWater ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-50 border-gray-100 text-gray-400")}>
                        مياه متصلة
                    </div>
                    <div className={cn("px-2 py-1.5 rounded-lg text-[9px] font-black text-center border transition-all", family.housingCondition?.hasElectricity ? "bg-yellow-50 border-yellow-200 text-yellow-700" : "bg-gray-50 border-gray-100 text-gray-400")}>
                        كهرباء
                    </div>
                    <div className={cn("px-2 py-1.5 rounded-lg text-[9px] font-black text-center border transition-all", family.housingCondition?.hasFurniture ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-100 text-gray-400")}>
                        أثاث كافٍ
                    </div>
                 </div>
                 {family.housingCondition?.notes && (
                   <div className="pt-2">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">ملاحظات سكنية</p>
                      <p className="text-xs font-bold text-gray-600 italic bg-gray-50 p-2 rounded-lg">{family.housingCondition.notes}</p>
                   </div>
                 )}
              </div>

              {family.notes && (
                <div className="mt-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">ملاحظات إضافية</p>
                  <p className="text-sm text-gray-600 leading-relaxed italic">{family.notes}</p>
                </div>
              )}
              
              <div className="space-y-3 mt-4">
                <div className="mt-8 pt-8 border-t border-gray-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-gray-900 flex items-center gap-2 uppercase tracking-widest">
                       <Receipt className="w-4 h-4 text-blue-500" /> ملخص المصروفات الشهرية
                    </p>
                    <button 
                      onClick={() => setIsEditingTechnical(true)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="تعديل المصروفات"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-y-2 text-[10px] font-bold">
                     <div className="text-gray-400">سكن:</div> <div className="text-left text-gray-900">{family.expenses?.housing || 0} ج.م</div>
                     <div className="text-gray-400">طعام:</div> <div className="text-left text-gray-900">{family.expenses?.food || 0} ج.م</div>
                     <div className="text-gray-400">صحة:</div> <div className="text-left text-gray-900">{family.expenses?.health || 0} ج.م</div>
                     <div className="text-gray-400">تعليم:</div> <div className="text-left text-gray-900">{family.expenses?.education || 0} ج.م</div>
                     <div className="col-span-2 border-t border-blue-50 pt-2 flex justify-between text-blue-700 font-black">
                        <span>الإجمالي:</span>
                        <span>{family.expenses?.total || 0} ج.م</span>
                     </div>
                  </div>
               </div>

                <button 
                  onClick={() => { setEditingFamily(family); setIsEditingFamily(true); }}
                  className="w-full flex items-center justify-center gap-2 py-3.5 border border-emerald-100 text-emerald-700 bg-emerald-50/30 rounded-2xl hover:bg-emerald-50 transition-all font-bold"
                >
                  <Edit2 className="w-4 h-4" />
                  تعديل بيانات الملف
                </button>
                
                <button 
                  onClick={() => window.print()}
                  className="w-full flex items-center justify-center gap-2 py-3.5 border border-gray-100 text-gray-600 bg-gray-50/30 rounded-2xl hover:bg-gray-50 transition-all font-bold"
                >
                  <Edit2 className="w-4 h-4" />
                  طباعة التقرير
                </button>
              </div>
              
              <button 
                onClick={() => window.print()}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-900 text-white rounded-2xl hover:bg-black transition-all font-bold"
              >
                <ClipboardCheck className="w-4 h-4" />
                طباعة تقرير العائلة
              </button>
            </div>
          </div>
        </div>

        {/* Tabbed Content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex p-1.5 bg-white rounded-2xl border border-gray-100 shadow-sm w-fit">
            <button 
              onClick={() => setActiveTab('members')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'members' ? "bg-emerald-600 text-white shadow-md shadow-emerald-100" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Users className="w-4 h-4" />
              أفراد العائلة ({members.length})
            </button>
            <button 
              onClick={() => setActiveTab('assistance')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'assistance' ? "bg-emerald-600 text-white shadow-md shadow-emerald-100" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Heart className="w-4 h-4" />
              سجل المساعدات ({assistances.length})
            </button>
            <button 
              onClick={() => setActiveTab('visits')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'visits' ? "bg-emerald-600 text-white shadow-md shadow-emerald-100" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <MapIcon className="w-4 h-4" />
              الزيارات ({visits.length})
            </button>
            <button 
              onClick={() => setActiveTab('planned_aid')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 text-center",
                activeTab === 'planned_aid' ? "bg-amber-600 text-white shadow-md shadow-amber-100" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Info className="w-4 h-4" />
              تأكيد الزيارة
            </button>
            <button 
              onClick={() => setActiveTab('committee')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 text-center",
                activeTab === 'committee' ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <ClipboardCheck className="w-4 h-4" />
              لجنة القرارات
            </button>
            <button 
              onClick={() => setActiveTab('delivery')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 text-center",
                activeTab === 'delivery' ? "bg-emerald-600 text-white shadow-md shadow-emerald-100" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Truck className="w-4 h-4" />
              جدول التسليمات
            </button>
            <button 
              onClick={() => setActiveTab('social')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 text-center",
                activeTab === 'social' ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Globe className="w-4 h-4" />
              التكافل الاجتماعي
            </button>
            <button 
              onClick={() => setActiveTab('technical')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'technical' ? "bg-emerald-600 text-white shadow-md shadow-emerald-100" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <ClipboardCheck className="w-4 h-4" />
              الدراسة الفنية
            </button>
          </div>

          <div 
            onClick={() => setExpandedMemberId(null)}
            className="bg-white rounded-3xl p-6 md:p-8 border border-gray-100 shadow-sm min-h-[400px]"
          >
            {memberFilterId && (
              <div className="mb-6 flex items-center justify-between bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest leading-none mb-1">عرض بيانات الفرد</p>
                    <p className="text-lg font-black text-gray-900 leading-none">{members.find(m => m.id === memberFilterId)?.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setMemberFilterId(null)}
                  className="px-4 py-2 bg-white text-gray-400 hover:text-red-500 font-bold text-sm rounded-xl border border-gray-100 transition-all flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4 rotate-180" />
                  كل العائلة
                </button>
              </div>
            )}
            {activeTab === 'members' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-gray-900 leading-none">الأفراد المسجلين</h4>
                  <button 
                    onClick={() => setIsAddingMember(true)}
                    className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-bold text-sm bg-emerald-50 px-4 py-2 rounded-xl transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    إضافة فرد لديه تفاصيل
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {members.map(member => {
                    const isExpanded = expandedMemberId === member.id;
                    const memberAssistances = assistances.filter(a => a.targetMemberId === member.id || a.assignedToMemberId === member.id);
                    const memberAidRequests = member.aidRequests || [];
                    
                    return (
                      <div 
                        key={member.id} 
                        className={cn(
                          "bg-gray-50 border border-gray-100 rounded-[32px] transition-all overflow-hidden flex flex-col",
                          isExpanded ? "ring-2 ring-indigo-600 bg-white shadow-xl shadow-indigo-50" : "hover:bg-gray-100 cursor-pointer"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedMemberId(isExpanded ? null : member.id);
                        }}
                      >
                        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 group">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center">
                              <div className="w-14 h-14 bg-white rounded-2xl border border-gray-100 flex items-center justify-center text-gray-400 shadow-sm mb-1">
                                <User className="w-8 h-8" />
                              </div>
                              <span className="text-[9px] font-black text-white bg-indigo-600 px-1.5 py-0.5 rounded border border-indigo-700 font-mono shadow-sm">
                                 {member.memberCode}
                              </span>
                            </div>
                            <div>
                              <p className="font-black text-lg text-gray-900 leading-none mb-1">{member.name}</p>
                              <p className="text-[10px] font-bold text-gray-400 mb-2 truncate max-w-[150px]">الرقم القومي: {member.nationalId || 'غير مسجل'}</p>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 font-bold">
                                <span className="bg-white px-2 py-0.5 rounded border border-gray-100 uppercase tracking-tighter">
                                  {member.relation === Relation.HUSBAND ? 'زوج' : 
                                   member.relation === Relation.WIFE ? 'زوجة' : 
                                   member.relation === Relation.SON ? 'ابن' : 
                                   member.relation === Relation.DAUGHTER ? 'ابنة' : 'أخرى'}
                                </span>
                                <span className="w-1 h-1 bg-gray-200 rounded-full" />
                                <span>{new Date().getFullYear() - new Date(member.birthDate).getFullYear()} سنة</span>
                                <span className="w-1 h-1 bg-gray-200 rounded-full" />
                                <span>{member.educationLevel || EducationLevel.NONE}</span>
                                <span className="w-1 h-1 bg-gray-200 rounded-full" />
                                <span className="text-blue-600">{member.employmentStatus === 'unemployed' ? 'عاطل' : member.employmentStatus}</span>
                                <span className="w-1 h-1 bg-gray-200 rounded-full" />
                                <span className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase", member.isServiceRecipient ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400")}>
                                  {member.isServiceRecipient ? 'مستفيد' : 'غير مستفيد'}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                            <div className="flex flex-wrap gap-2 items-center">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setEditingMember(member); }}
                                className="p-2.5 bg-white border border-indigo-100 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all shadow-sm flex items-center gap-2"
                              >
                                <Edit2 className="w-4 h-4" />
                                <span className="text-[10px] font-bold">الملف</span>
                              </button>
                              <button 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setMemberFilterId(member.id);
                                  setActiveTab('assistance');
                                }}
                                className="p-2.5 bg-white border border-pink-100 text-pink-600 hover:bg-pink-50 rounded-xl transition-all shadow-sm flex items-center gap-2"
                                title="عرض طلبات المساعدات لهذا الفرد"
                              >
                                <Heart className="w-4 h-4" />
                                <span className="text-[10px] font-bold">الطلبات</span>
                              </button>
                              <button 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  setMemberFilterId(member.id);
                                  setActiveTab('visits');
                                }}
                                className="p-2.5 bg-white border border-emerald-100 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all shadow-sm flex items-center gap-2"
                                title="عرض زيارات هذا الفرد"
                              >
                                <MapIcon className="w-4 h-4" />
                                <span className="text-[10px] font-bold">الزيارات</span>
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setManagingMemberAttachments(member); }}
                                className="p-2.5 bg-white border border-indigo-100 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all shadow-sm flex items-center gap-2"
                              >
                                <Paperclip className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setManagingMemberAid(member); }}
                                className="p-2.5 bg-white border border-blue-100 text-blue-600 hover:bg-blue-50 rounded-xl transition-all shadow-sm flex items-center gap-2"
                              >
                                <Plus className="w-4 h-4" />
                                <span className="text-[10px] font-bold">طلب مساعدات</span>
                              </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); /* handle delete if implemented */ }}
                              className="p-2.5 bg-white border border-gray-100 text-gray-300 hover:text-red-500 rounded-xl transition-all shadow-sm"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-indigo-50 bg-indigo-50/20"
                            >
                              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                   <div>
                                      <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                         <Info className="w-4 h-4" /> بيانات الفرد الأساسية
                                      </h5>
                                      <div className="grid grid-cols-2 gap-4">
                                         <div className="bg-white p-4 rounded-2xl border border-indigo-100/50 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 mb-1">الرغبة في العمل / الحالة</p>
                                            <p className="text-xs font-bold text-gray-700">{member.employmentDetails || 'لم تذكر تفاصيل'}</p>
                                         </div>
                                         <div className="bg-white p-4 rounded-2xl border border-indigo-100/50 shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 mb-1">المستوى التعليمي التفصيلي</p>
                                            <p className="text-xs font-bold text-gray-700">{member.educationDetails || 'لا توجد تفاصيل'}</p>
                                         </div>
                                         <div className="bg-white p-4 rounded-2xl border border-indigo-100/50 shadow-sm col-span-2">
                                            <p className="text-[9px] font-black text-gray-400 mb-1">الحالة الصحية الشاملة</p>
                                            <div className="flex items-center gap-2 mt-1">
                                               <span className={cn(
                                                  "px-2 py-0.5 rounded text-[9px] font-black uppercase",
                                                  member.healthCondition === HealthStatus.HEALTHY ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                                               )}>
                                                  {member.healthCondition}
                                               </span>
                                               <span className="text-xs font-bold text-gray-600">{member.healthNotes}</span>
                                            </div>
                                         </div>
                                      </div>
                                   </div>

                                   <div>
                                      <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                                         <Heart className="w-4 h-4" /> ملخص المساعدات التاريخية
                                      </h5>
                                      <div className="flex flex-wrap gap-2">
                                         <div className="px-4 py-3 bg-white rounded-2xl border border-indigo-100/50 flex-1 min-w-[120px] shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 mb-1">إجمالي طلبات المساعدة</p>
                                            <p className="text-lg font-black text-indigo-600">{memberAidRequests.length}</p>
                                         </div>
                                         <div className="px-4 py-3 bg-white rounded-2xl border border-indigo-100/50 flex-1 min-w-[120px] shadow-sm">
                                            <p className="text-[9px] font-black text-gray-400 mb-1">مساعدات تم تنفيذها</p>
                                            <p className="text-lg font-black text-emerald-600">{memberAssistances.length}</p>
                                         </div>
                                      </div>
                                   </div>
                                </div>

                                <div className="space-y-4">
                                   <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                                      <Receipt className="w-4 h-4" /> حصر المساعدات التفصيلي
                                   </h5>
                                   <div className="bg-white rounded-3xl border border-indigo-100/50 overflow-hidden shadow-sm">
                                      <div className="max-h-[300px] overflow-y-auto">
                                         {memberAssistances.length > 0 || memberAidRequests.length > 0 ? (
                                            <table className="w-full text-right border-collapse">
                                               <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                                                  <tr>
                                                     <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase">النوع / البيان</th>
                                                     <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase">الحالة</th>
                                                     <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase text-center">القيمة/الكمية</th>
                                                  </tr>
                                               </thead>
                                               <tbody className="divide-y divide-gray-50">
                                                  {/* Show recorded assistances first */}
                                                  {memberAssistances.map(ast => (
                                                     <tr key={ast.id} className="hover:bg-indigo-50/30 transition-colors">
                                                        <td className="px-4 py-3">
                                                           <p className="text-xs font-black text-gray-900">{ast.type}</p>
                                                           <p className="text-[9px] text-gray-400">{ast.distributionDate}</p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                           <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-[4px] text-[8px] font-black">تم التسليم</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                           <p className="text-xs font-black text-indigo-600">{ast.amount} {ast.unit}</p>
                                                        </td>
                                                     </tr>
                                                  ))}
                                                  {/* Show pending aid requests */}
                                                  {memberAidRequests.filter(req => req.status !== 'delivered').map(req => (
                                                     <tr key={req.id} className="hover:bg-amber-50/30 transition-colors opacity-80">
                                                        <td className="px-4 py-3">
                                                           <p className="text-xs font-bold text-gray-600">{req.type}</p>
                                                           <p className="text-[9px] text-gray-400">طلب: {req.requestDate}</p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                           <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-[4px] text-[8px] font-black">
                                                              {req.status === 'requested' ? 'قيد الطلب' : 
                                                               req.status === 'approved' ? 'تم الموافقة' : 
                                                               req.status === 'preparing' ? 'تجهيز' : 'جاري التنفيذ'}
                                                           </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                           <p className="text-xs font-bold text-gray-500">{req.quantity}</p>
                                                        </td>
                                                     </tr>
                                                  ))}
                                               </tbody>
                                            </table>
                                         ) : (
                                            <div className="p-8 text-center">
                                               <Heart className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                               <p className="text-xs font-bold text-gray-400">لا توجد سجلات مساعدات لهذا الفرد</p>
                                            </div>
                                         )}
                                      </div>
                                   </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                  {members.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-400 border-2 border-dashed border-gray-50 rounded-3xl">
                      لا يوجد أفراد مسجلين لهذه العائلة
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === 'social' ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm space-y-12">
                   <div className="flex items-center gap-4 border-b border-gray-50 pb-6">
                      <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                         <Globe className="w-6 h-6" />
                      </div>
                      <div>
                         <h3 className="text-xl font-black text-gray-900 leading-none">دراسة الحالة الاجتماعية والتكافلية</h3>
                         <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">تحليل شبكات الدعم والمشاركة المجتمعية</p>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div className="space-y-4">
                         <h4 className="text-xs font-black text-gray-900 flex items-center gap-2 uppercase tracking-widest">
                            <Users className="w-4 h-4 text-emerald-500" /> شبكات الدعم العائلي
                         </h4>
                         <div className="bg-gray-50 p-6 rounded-3xl min-h-[120px] text-sm text-gray-600 font-bold leading-relaxed border border-gray-100">
                            {family.socialSolidarity?.supportNetworks || 'لم يتم تسجيل بيانات عن شبكات الدعم العائلي'}
                         </div>
                      </div>

                      <div className="space-y-4">
                         <h4 className="text-xs font-black text-gray-900 flex items-center gap-2 uppercase tracking-widest">
                            <Heart className="w-4 h-4 text-rose-500" /> المساهمات في المبادرات المجتمعية
                         </h4>
                         <div className="bg-gray-50 p-6 rounded-3xl min-h-[120px] text-sm text-gray-600 font-bold leading-relaxed border border-gray-100">
                            {family.socialSolidarity?.communityContributions || 'لا توجد مساهمات مجتمعية مسجلة'}
                         </div>
                      </div>

                      <div className="md:col-span-2 space-y-4">
                         <h4 className="text-xs font-black text-gray-900 flex items-center gap-2 uppercase tracking-widest">
                            <Info className="w-4 h-4 text-blue-500" /> فوائد الضمان الاجتماعي الرسمية
                         </h4>
                         <div className="bg-blue-50/30 p-8 rounded-[32px] border border-blue-100">
                            <p className="text-sm text-blue-900 font-bold leading-relaxed">
                               {family.socialSolidarity?.socialSecurityBenefits || 'لا يتقاضى حالياً أي مبالغ من الضمان الاجتماعي أو التكافل والكرامة'}
                            </p>
                         </div>
                      </div>
                   </div>

                   <div className="pt-8 flex justify-center">
                      <button 
                         onClick={() => { setEditingFamily(family); setIsEditingFamily(true); }}
                         className="px-10 py-4 bg-gray-900 text-white rounded-2xl font-black text-sm hover:bg-black transition-all flex items-center gap-3"
                      >
                         <Edit2 className="w-4 h-4" />
                         تعديل بيانات التكافل
                      </button>
                   </div>
                </div>

                <div className="bg-amber-50 p-8 rounded-[40px] border border-amber-100 flex gap-6 items-center">
                   <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 shrink-0">
                      <AlertCircle className="w-7 h-7" />
                   </div>
                   <div>
                      <h4 className="text-amber-900 font-black">ملاحظة الخبير الاجتماعي</h4>
                      <p className="text-amber-700/70 text-sm font-bold mt-1">يتم تحديث هذه البيانات بشكل فصلي لضمان عدالة التوزيع وتحديث الحالة المادية للأسرة بناءً على تغير المتغيرات الاجتماعية المحيطة.</p>
                   </div>
                </div>
              </motion.div>
            ) : activeTab === 'committee' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-gray-900 leading-none">لجنة القرارات (القرار النهائي)</h4>
                  <div className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-100">
                    مراجعة الطلبات المؤكدة ميدانياً
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {members.flatMap(m => (m.aidRequests || []).filter(r => r.status === 'visit_confirmed' && (!memberFilterId || m.id === memberFilterId)).map(aid => ({...aid, memberName: m.name, memberId: m.id})) as (AidRequest & { memberName: string, memberId: string })[]).length === 0 ? (
                    <div className="py-20 text-center text-gray-300 font-bold bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                      لا توجد طلبات بانتظار قرار اللجنة حالياً (تأكد من "تأكيد الباحث" أولاً)
                    </div>
                  ) : (
                    (members.flatMap(m => (m.aidRequests || []).filter(r => r.status === 'visit_confirmed').map(aid => ({...aid, memberName: m.name, memberId: m.id})) as (AidRequest & { memberName: string, memberId: string })[])).map(aid => (
                      <div key={aid.id} className="p-8 bg-blue-50/20 border border-blue-100 rounded-[32px] space-y-6">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
                              <ClipboardCheck className="w-6 h-6" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-white bg-blue-600 px-2 py-0.5 rounded uppercase tracking-widest font-mono">
                                  {aid.committeeCode || 'COM-PENDING'}
                                </span>
                                <input 
                                  className="font-black text-xl text-gray-900 bg-transparent border-b-2 border-transparent focus:border-blue-600 outline-none"
                                  defaultValue={aid.type}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setMembers(prev => prev.map(m => m.id === aid.memberId ? {
                                      ...m, aidRequests: m.aidRequests?.map(r => r.id === aid.id ? {...r, type: val} : r)
                                    } : m));
                                  }}
                                />
                              </div>
                              <p className="text-sm text-blue-600 font-bold">المستفيد: {aid.memberName}</p>
                            </div>
                          </div>
                          <div className="text-left">
                             <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-2">
                                   <input 
                                     type="number"
                                     className="w-24 text-right text-lg font-black bg-white rounded-lg px-2 py-1 outline-none border border-blue-100 focus:ring-2 focus:ring-blue-500"
                                     defaultValue={aid.unitCost}
                                     onChange={(e) => {
                                       const val = Number(e.target.value);
                                       setMembers(prev => prev.map(m => m.id === aid.memberId ? {
                                         ...m, aidRequests: m.aidRequests?.map(r => r.id === aid.id ? {
                                           ...r, 
                                           unitCost: val,
                                           totalCost: (r.quantity || 1) * val * (r.durationMonths || 1)
                                         } : r)
                                       } : m));
                                     }}
                                   />
                                   <span className="text-xs text-gray-400">ج.م (قسط)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                   <input 
                                     type="number"
                                     className="w-16 text-right text-sm font-black bg-white rounded-lg px-2 py-1 outline-none border border-blue-100 focus:ring-2 focus:ring-blue-500"
                                     defaultValue={aid.quantity}
                                     onChange={(e) => {
                                       const val = Number(e.target.value);
                                       setMembers(prev => prev.map(m => m.id === aid.memberId ? {
                                         ...m, aidRequests: m.aidRequests?.map(r => r.id === aid.id ? {
                                           ...r, 
                                           quantity: val,
                                           totalCost: val * (r.unitCost || 0) * (r.durationMonths || 1)
                                         } : r)
                                       } : m));
                                     }}
                                   />
                                   <span className="text-[10px] text-gray-400 uppercase tracking-widest">كمية | {aid.durationMonths || 1} شهور</span>
                                </div>
                                <p className="text-2xl font-black text-blue-900 mt-2">{(aid.durationMonths || 1) * aid.quantity * aid.unitCost} ج.م</p>
                             </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="md:col-span-2 grid grid-cols-2 gap-4">
                              <div className="bg-white p-4 rounded-2xl border border-blue-50">
                                 <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">المدة المقررة (أشهر)</label>
                                 <input 
                                   type="number"
                                   className="w-full bg-transparent outline-none font-bold text-lg"
                                   defaultValue={aid.durationMonths || 1}
                                   onChange={(e) => {
                                      const val = Number(e.target.value);
                                      const mId = aid.memberId;
                                      const aId = aid.id;
                                      setMembers(prev => prev.map(m => m.id === mId ? {
                                        ...m, 
                                        aidRequests: m.aidRequests?.map(r => r.id === aId ? {...r, durationMonths: val} : r)
                                      } : m));
                                   }}
                                 />
                              </div>
                              <div className="bg-white p-4 rounded-2xl border border-blue-50">
                                 <label className="text-[10px] font-black text-gray-400 uppercase block mb-1">تاريخ بدء الخدمة</label>
                                 <input 
                                   type="date"
                                   className="w-full bg-transparent outline-none font-bold"
                                   defaultValue={aid.startDate}
                                   onChange={(e) => {
                                      const val = e.target.value;
                                      const mId = aid.memberId;
                                      const aId = aid.id;
                                      setMembers(prev => prev.map(m => m.id === mId ? {
                                        ...m, 
                                        aidRequests: m.aidRequests?.map(r => r.id === aId ? {...r, startDate: val} : r)
                                      } : m));
                                   }}
                                 />
                              </div>
                              <div className="col-span-2 bg-white p-4 rounded-2xl border border-blue-50">
                                 <p className="text-[10px] font-black text-gray-400 mb-2 uppercase">ملاحظات القرار والاعتماد</p>
                                 <textarea 
                                   className="w-full bg-transparent outline-none text-sm font-bold min-h-[60px]"
                                   placeholder="توصيات اللجنة وتفاصيل القرار..."
                                   defaultValue={aid.notes}
                                   onChange={(e) => {
                                      const val = e.target.value;
                                      const mId = aid.memberId;
                                      const aId = aid.id;
                                      setMembers(prev => prev.map(m => m.id === mId ? {
                                        ...m, 
                                        aidRequests: m.aidRequests?.map(r => r.id === aId ? {...r, notes: val} : r)
                                      } : m));
                                   }}
                                 />
                              </div>
                           </div>
                           <div className="bg-gray-50 p-5 rounded-2xl space-y-4">
                              <p className="text-[10px] font-black text-gray-400 uppercase">بيانات البحث السابق</p>
                              <div className="space-y-2">
                                 <div className="p-3 bg-white rounded-xl border border-gray-200">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">تفاصيل الاحتياج</p>
                                    <p className="text-xs font-bold text-gray-700">{aid.needDetails || 'لا يوجد'}</p>
                                 </div>
                                 <div className="p-3 bg-white rounded-xl border border-gray-200">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">تفاصيل المرض</p>
                                    <p className="text-xs font-bold text-gray-700">{aid.illnessDetails || 'لا يوجد'}</p>
                                 </div>
                              </div>
                           </div>
                        </div>

                        <div className="flex gap-4">
                          <button 
                            onClick={() => updateAidStatus(aid.memberId, aid.id, 'approved')}
                            className="flex-[2] bg-blue-600 text-white font-black py-4 rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-3"
                          >
                            <Heart className="w-5 h-5 text-blue-200" />
                            تأكيد الخدمة المقررة وإسقاطها للتسليم
                          </button>
                          {aid.type.includes('طبي') && (
                            <button 
                              onClick={() => handleCreateClaimFromAid(aid)}
                              className="flex-1 bg-white border border-blue-200 text-blue-600 font-black py-4 rounded-2xl hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                              title="تحويل لمطالبة طبية"
                            >
                              <Receipt className="w-5 h-5" />
                              إنشاء مطالبة
                            </button>
                          )}
                          <button 
                            onClick={() => {
                              const reason = prompt('سبب رفض اللجنة؟');
                              if(reason) updateAidStatus(aid.memberId, aid.id, 'rejected', reason);
                            }}
                            className="bg-red-50 text-red-600 font-black px-10 py-4 rounded-2xl hover:bg-red-100 transition-all text-sm"
                          >
                            رفض الطلب
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : activeTab === 'delivery' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-gray-900 leading-none">متابعة جدول التسليمات (مرحلة الموظف)</h4>
                  <div className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-100">
                    التحكم في المواعيد والتعليقات
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8">
                  {(() => {
                    const allAid = members.flatMap(m => 
                      (m.aidRequests || []).filter(r => (r.status === 'approved' || (r.deliverySchedule && r.deliverySchedule.length > 0)) && (!memberFilterId || m.id === memberFilterId))
                        .map(r => ({ ...r, memberName: m.name, memberId: m.id }))
                    );

                    if (allAid.length === 0) {
                      return (
                        <div className="py-20 text-center text-gray-300 font-bold bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                          لا توجد خدمات معتمدة بانتظار التسليم حالياً
                        </div>
                      );
                    }

                    return allAid.map(aid => (
                      <div key={aid.id} className="space-y-4">
                         <div className="p-6 bg-white border border-gray-100 rounded-[32px] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-5">
                               <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 border border-emerald-100">
                                  <Globe className="w-8 h-8" />
                               </div>
                               <div>
                                  <h5 className="font-black text-xl text-gray-900">{aid.type}</h5>
                                  <div className="flex items-center gap-3 mt-1">
                                     <span className="text-xs font-bold text-emerald-600">المبلغ المقرر قسطاً: {aid.unitCost} ج.م</span>
                                     <span className="text-[10px] text-gray-400 font-black uppercase">المستفيد: {aid.memberName}</span>
                                  </div>
                               </div>
                            </div>
                            {(() => {
                               const latest = (aid.deliverySchedule || []).flatMap(t => t.updates || []).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
                               return latest ? (
                                 <div className="hidden lg:block flex-1 max-w-sm p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 mx-4">
                                    <p className="text-[8px] font-black text-indigo-600 uppercase mb-1 flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> آخر مستجدات المتابعة</p>
                                    <div className="flex justify-between items-start gap-2">
                                       <p className="text-[10px] font-bold text-gray-700 line-clamp-1">{latest.text}</p>
                                       <span className="text-[8px] font-black text-gray-400 tabular-nums">{new Date(latest.date).toLocaleDateString('ar-EG')}</span>
                                    </div>
                                 </div>
                               ) : null;
                            })()}
                            <div className="flex items-center gap-4">
                               <button 
                                 onClick={() => setViewingAidRequest({ memberId: aid.memberId, aid })}
                                 className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-100 transition-all shadow-sm flex items-center gap-2 group/btn"
                               >
                                  <SearchIcon className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                                  <span className="text-[10px] font-black uppercase">تفاصيل الطلب</span>
                               </button>
                               <div className="w-px h-10 bg-gray-100 mx-1" />
                               <div className="text-right">
                                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">حالة الطلب العامة</p>
                                  <select 
                                    className={cn(
                                      "text-[11px] font-black px-4 py-2 rounded-xl border appearance-none text-center cursor-pointer transition-all",
                                      aid.status === 'delivered' ? "bg-emerald-50 border-emerald-100 text-emerald-700" :
                                      aid.status === 'delivering' ? "bg-amber-50 border-amber-100 text-amber-700" :
                                      aid.status === 'preparing' ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-gray-50 border-gray-100 text-gray-400"
                                    )}
                                    value={aid.status}
                                    onChange={(e) => updateAidStatus(aid.memberId, aid.id, e.target.value)}
                                  >
                                    <option value="approved">معتمد</option>
                                    <option value="preparing">قيد التجهيز</option>
                                    <option value="delivering">قيد المعالجة (التسليم)</option>
                                    <option value="delivered">تم التسليم النهائي</option>
                                  </select>
                               </div>
                               <div className="w-px h-10 bg-gray-100 mx-2" />
                               <div className="text-left">
                                  <p className="text-lg font-black text-gray-900">{aid.durationMonths} شهور</p>
                                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">فترة الدعم</p>
                               </div>
                            </div>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pl-4 md:pl-12 pb-8">
                            {(aid.deliverySchedule || []).map((task) => (
                              <div key={task.id} className={cn(
                                "p-6 rounded-[32px] border transition-all space-y-5 relative overflow-hidden group/task shadow-sm hover:shadow-xl",
                                task.status === 'delivered' ? "bg-emerald-50/50 border-emerald-100" : 
                                task.status === 'delivering' ? "bg-amber-50/50 border-amber-100" : "bg-white border-gray-100"
                              )}>
                                <div className="flex justify-between items-start">
                                   <div>
                                      <div className="flex items-center gap-2 mb-1">
                                        <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-[8px] font-black text-indigo-600 shadow-sm font-mono overflow-hidden">
                                           {task.deliveryCode?.slice(-4) || `#${task.idNumber}`}
                                        </div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-1">
                                           <Plus className="w-2.5 h-2.5" /> الاستحقاق الشهري #{task.idNumber} {task.deliveryCode && <span className="font-mono text-indigo-400 ml-1">({task.deliveryCode})</span>}
                                        </p>
                                      </div>
                                      <p className="text-sm font-black text-gray-900 flex items-center gap-2">
                                         <Calendar className="w-4 h-4 text-indigo-400" />
                                         {task.scheduledDate}
                                      </p>
                                   </div>
                                   <div className={cn(
                                     "px-3 py-1.5 rounded-2xl text-[9px] font-black uppercase shadow-sm border",
                                     task.status === 'delivered' ? "bg-emerald-50 border-emerald-100 text-emerald-700" : 
                                     task.status === 'delivering' ? "bg-amber-50 border-amber-100 text-amber-700" : "bg-gray-50 border-gray-100 text-gray-400"
                                   )}>
                                     {task.status === 'delivered' ? 'تم التنفيذ' : 
                                      task.status === 'delivering' ? 'تحت المتابعة' : 'مجدولة'}
                                   </div>
                                </div>

                                <div className="space-y-3">
                                   <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                         <ClipboardCheck className="w-3.5 h-3.5 text-indigo-500" /> سجل المتابعة والتنفيذ
                                      </p>
                                      {task.status !== 'delivered' && (
                                         <div className="relative group/sel">
                                            <select 
                                              className="text-[9px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg pl-6 pr-2 py-1 outline-none appearance-none cursor-pointer hover:bg-indigo-100 transition-colors"
                                              value={task.status}
                                              onChange={(e) => updateDeliveryTask(aid.memberId, aid.id, task.id, {status: e.target.value}, `تعديل الحالة إلى: ${e.target.value}`)}
                                            >
                                              <option value="pending">مجدول</option>
                                              <option value="preparing">تجهيز</option>
                                              <option value="delivering">تنفيذ</option>
                                              <option value="delivered">تسليم</option>
                                            </select>
                                            <ArrowLeft className="w-2.5 h-2.5 absolute left-1.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none -rotate-90" />
                                         </div>
                                      )}
                                   </div>
                                   <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                      {task.updates && task.updates.length > 0 ? [...task.updates].reverse().map((upd: any, idx: number) => (
                                        <div key={idx} className="bg-white p-3 rounded-2xl text-[10px] font-bold border border-gray-100 shadow-sm relative group/upd border-r-4 border-r-indigo-400 transition-all hover:border-r-indigo-600">
                                           <div className="flex justify-between items-center text-[8px] font-black text-indigo-500 mb-1.5 bg-indigo-50/50 px-2 py-0.5 rounded-md">
                                              <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" /> {upd.user}</span>
                                              <span className="tabular-nums flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {new Date(upd.date).toLocaleString('ar-EG', {month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', year: '2-digit'})}</span>
                                           </div>
                                           <p className="text-gray-800 leading-relaxed px-1">{upd.text}</p>
                                        </div>
                                      )) : (
                                        <div className="py-8 text-center bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                           <Info className="w-5 h-5 text-gray-300 mx-auto mb-1.5" />
                                           <p className="text-[10px] text-gray-400 font-bold">لا توجد سجلات متابعة حالياً</p>
                                        </div>
                                      )}
                                   </div>
                                </div>

                                <div className="grid grid-cols-5 gap-3 pt-2">
                                   <button 
                                      onClick={() => {
                                         setCommentingOnTask({ memberId: aid.memberId, aidId: aid.id, taskId: task.id });
                                      }}
                                      className="col-span-2 py-3 bg-white border border-gray-200 text-gray-600 rounded-2xl hover:bg-gray-100 transition-all text-xs font-black shadow-sm flex items-center justify-center gap-2"
                                   >
                                      <Plus className="w-3 h-3" /> تعليق
                                   </button>
                                   
                                   {task.status !== 'delivered' && (
                                      <button 
                                        onClick={() => {
                                          if(task.status === 'pending' || task.status === 'preparing') {
                                             updateDeliveryTask(aid.memberId, aid.id, task.id, {status: 'delivering'}, "بدء التواصل لعملية التسليم");
                                          } else {
                                             updateDeliveryTask(aid.memberId, aid.id, task.id, {status: 'delivered'}, "تم تأكيد الاستلام النهائي من المستفيد");
                                          }
                                        }}
                                        className={cn(
                                          "col-span-3 py-3 text-white rounded-2xl transition-all text-xs font-black shadow-md flex items-center justify-center gap-2",
                                          task.status !== 'delivering' ? "bg-amber-600 hover:bg-amber-700 shadow-amber-100" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100"
                                        )}
                                      >
                                        {task.status !== 'delivering' ? <Clock className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                        {task.status !== 'delivering' ? 'بدء التنفيذ' : 'إتمام التسليم'}
                                      </button>
                                   )}
                                </div>
                              </div>
                            ))}
                         </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            ) : activeTab === 'planned_aid' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-gray-900 leading-none">تأكيد الباحث لطلبات المساعدة (مرحلة الزيارات)</h4>
                  <div className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold border border-amber-100">
                    أرشفة وتأكيد الزيارة الميدانية
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {members.flatMap(m => (m.aidRequests || []).filter(r => r.status === 'requested' && (!memberFilterId || m.id === memberFilterId)).map(aid => ({...aid, memberName: m.name, memberId: m.id}))).length === 0 ? (
                    <div className="py-20 text-center text-gray-300 font-bold bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                      لا توجد طلبات مساعدة بانتظار تأكيد الباحث حالياً (سجل طلب جديد أولاً)
                    </div>
                  ) : (
                    members.flatMap(m => (m.aidRequests || []).filter(r => r.status === 'requested' && (!memberFilterId || m.id === memberFilterId)).map(aid => ({...aid, memberName: m.name, memberId: m.id}))).map(aid => (
                      <div key={aid.id} className="p-8 bg-white border border-gray-100 rounded-[32px] shadow-sm hover:shadow-xl hover:border-amber-200 transition-all group">
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-100 group-hover:scale-110 transition-transform">
                              <Search className="w-7 h-7" />
                            </div>
                            <div className="flex flex-col gap-2">
                              <input 
                                className="font-black text-xl text-gray-900 bg-transparent border-b-2 border-transparent focus:border-amber-600 outline-none"
                                defaultValue={aid.type}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setMembers(prev => prev.map(m => m.id === aid.memberId ? {
                                    ...m, aidRequests: m.aidRequests?.map(r => r.id === aid.id ? {...r, type: val} : r)
                                  } : m));
                                }}
                              />
                              <div className="flex items-center gap-2">
                                <span className="bg-gray-100 text-gray-500 text-[10px] font-black px-2 py-0.5 rounded uppercase">طلب مبدئي</span>
                                <span className="text-gray-400 text-xs font-bold">للمستفيد: {aid.memberName}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-left font-black">
                             <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-2">
                                   <input 
                                     type="number"
                                     className="w-20 text-right text-lg font-black bg-gray-50 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-amber-500"
                                     defaultValue={aid.unitCost}
                                     placeholder="التكلفة"
                                     onChange={(e) => {
                                       const val = Number(e.target.value);
                                       setMembers(prev => prev.map(m => m.id === aid.memberId ? {
                                         ...m, aidRequests: m.aidRequests?.map(r => r.id === aid.id ? {
                                           ...r, 
                                           unitCost: val,
                                           totalCost: (r.quantity || 1) * val * (r.durationMonths || 1)
                                         } : r)
                                       } : m));
                                     }}
                                   />
                                   <span className="text-xs text-gray-400">ج.م / و</span>
                                </div>
                                <div className="flex items-center gap-2">
                                   <input 
                                     type="number"
                                     className="w-16 text-right text-sm font-black bg-gray-50 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-amber-500"
                                     defaultValue={aid.quantity}
                                     onChange={(e) => {
                                       const val = Number(e.target.value);
                                       setMembers(prev => prev.map(m => m.id === aid.memberId ? {
                                         ...m, aidRequests: m.aidRequests?.map(r => r.id === aid.id ? {
                                           ...r, 
                                           quantity: val,
                                           totalCost: val * (r.unitCost || 0) * (r.durationMonths || 1)
                                         } : r)
                                       } : m));
                                     }}
                                   />
                                   <span className="text-[10px] text-gray-400 uppercase tracking-widest">كمية | {aid.durationMonths || 1} شهور</span>
                                </div>
                                <p className="text-xl text-amber-600 mt-2">{(aid.durationMonths || 1) * aid.quantity * aid.unitCost} ج.م</p>
                             </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-8 overflow-x-auto pb-4 gap-4 scrollbar-hide">
                            {[
                               { id: 'requested', label: 'طلب جديد', icon: Clock, color: 'blue' },
                               { id: 'visit_confirmed', label: 'تأكيد المعاينة', icon: SearchIcon, color: 'amber' },
                               { id: 'approved', label: 'موافقة اللجنة', icon: Gavel, color: 'emerald' },
                               { id: 'delivered', label: 'تم التسليم', icon: CheckCircle2, color: 'indigo' }
                            ].map((s, idx, arr) => {
                               const statuses = ['requested', 'visit_confirmed', 'approved', 'delivered'];
                               const isActive = aid.status === s.id;
                               const isPast = statuses.indexOf(aid.status as any) >= statuses.indexOf(s.id as any);
                               const Icon = s.icon;
                               
                               return (
                                  <React.Fragment key={idx}>
                                     <div className="flex flex-col items-center gap-2 min-w-[80px]">
                                        <div className={cn(
                                           "w-12 h-12 rounded-2xl flex items-center justify-center transition-all border-2 shadow-sm",
                                           isActive ? `bg-${s.color}-600 border-${s.color}-600 text-white scale-110 shadow-lg` :
                                           isPast ? `bg-${s.color}-50 border-${s.color}-200 text-${s.color}-600` : "bg-gray-50 border-gray-100 text-gray-300 grayscale"
                                        )}>
                                           <Icon className="w-5 h-5" />
                                        </div>
                                        <span className={cn("text-[9px] font-black uppercase tracking-tighter", isActive ? `text-${s.color}-700` : isPast ? "text-gray-900" : "text-gray-300")}>{s.label}</span>
                                     </div>
                                     {idx < arr.length - 1 && (
                                        <div className={cn("flex-1 h-0.5 min-w-[20px] max-w-[40px] mt-6", isPast ? `bg-${s.color}-200` : "bg-gray-100")} />
                                     )}
                                  </React.Fragment>
                               );
                            })}
                         </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                           <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">تاريخ البداية المقرر</label>
                                    <input 
                                       type="date" 
                                       className="w-full bg-gray-50 border-2 border-transparent focus:border-amber-600/20 rounded-xl px-4 py-3 text-sm font-bold transition-all"
                                       defaultValue={aid.startDate}
                                       onChange={(e) => {
                                          const val = e.target.value;
                                          const mId = aid.memberId;
                                          const aId = aid.id;
                                          
                                          // Calculate end date
                                          const dur = aid.durationMonths || 1;
                                          const start = new Date(val);
                                          const end = new Date(start);
                                          end.setMonth(start.getMonth() + dur);
                                          const endDateStr = end.toISOString().split('T')[0];

                                          setMembers(prev => prev.map(m => m.id === mId ? {
                                            ...m, aidRequests: m.aidRequests?.map(r => r.id === aId ? {
                                              ...r, 
                                              startDate: val, 
                                              endDate: endDateStr,
                                              totalCost: (r.quantity || 1) * (r.unitCost || 0) * (r.durationMonths || 1)
                                            } : r)
                                          } : m));
                                       }}
                                    />
                                 </div>
                                 <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">المدة (أشهر)</label>
                                    <input 
                                       type="number" 
                                       className="w-full bg-gray-50 border-2 border-transparent focus:border-amber-600/20 rounded-xl px-4 py-3 text-sm font-bold transition-all"
                                       defaultValue={aid.durationMonths || 1}
                                       onChange={(e) => {
                                          const val = Number(e.target.value);
                                          const mId = aid.memberId;
                                          const aId = aid.id;
                                          
                                          // Calculate end date
                                          const start = new Date(aid.startDate || new Date());
                                          const end = new Date(start);
                                          end.setMonth(start.getMonth() + val);
                                          const endDateStr = end.toISOString().split('T')[0];

                                          setMembers(prev => prev.map(m => m.id === mId ? {
                                            ...m, aidRequests: m.aidRequests?.map(r => r.id === aId ? {
                                              ...r, 
                                              durationMonths: val, 
                                              endDate: endDateStr,
                                              totalCost: (r.quantity || 1) * (r.unitCost || 0) * val
                                            } : r)
                                          } : m));
                                       }}
                                    />
                                 </div>
                                 <div className="space-y-1.5 col-span-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase">تاريخ الانتهاء التلقائي (بناءً على المدة)</label>
                                    <div className="w-full bg-amber-50/50 border-2 border-amber-100/50 rounded-xl px-4 py-3 text-sm font-black text-amber-800">
                                       {aid.endDate || '---'}
                                    </div>
                                 </div>
                              </div>
                              <textarea 
                                placeholder="ملاحظات الباحث والتأكيد الميداني لنوع الحالة والاحتياج..."
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-amber-600/20 rounded-2xl px-4 py-3 text-sm font-bold min-h-[100px] transition-all"
                                defaultValue={aid.notes}
                                onChange={(e) => {
                                   const val = e.target.value;
                                   const mId = aid.memberId;
                                   const aId = aid.id;
                                   setMembers(prev => prev.map(m => m.id === mId ? {
                                     ...m, aidRequests: m.aidRequests?.map(r => r.id === aId ? {...r, notes: val} : r)
                                    } : m));
                                }}
                              />
                           </div>
                           <div className="bg-amber-50/20 border border-dashed border-amber-100 p-6 rounded-[24px] space-y-4">
                              <div className="flex items-center gap-3 text-amber-700">
                                 <Info className="w-5 h-5" />
                                 <span className="font-bold text-sm">بيانات طلب المساعدة</span>
                              </div>
                              <div className="space-y-3">
                                 <div className="bg-white p-3 rounded-xl border border-amber-100">
                                    <p className="text-[9px] font-black text-gray-400 uppercase mb-1">تفاصيل المرض</p>
                                    <p className="text-xs font-bold text-gray-700">{aid.illnessDetails || "غير مسجل"}</p>
                                 </div>
                                 <div className="bg-white p-3 rounded-xl border border-amber-100">
                                    <p className="text-[9px] font-black text-gray-400 uppercase mb-1">تفاصيل الاحتياج</p>
                                    <p className="text-xs font-bold text-gray-700">{aid.needDetails || "غير مسجل"}</p>
                                 </div>
                              </div>
                           </div>
                        </div>

                        <div className="flex gap-4">
                            <button 
                              onClick={() => saveAidEdits(aid.memberId, aid.id)}
                              className="bg-gray-100 text-gray-600 font-black px-6 py-4 rounded-2xl hover:bg-gray-200 transition-all text-sm flex items-center gap-2"
                            >
                              <Edit2 className="w-4 h-4" />
                              حفظ التعديلات فقط
                            </button>
                            <button 
                              onClick={() => updateAidStatus(aid.memberId, aid.id, "visit_confirmed")}
                              className="flex-1 bg-amber-600 text-white font-black py-4 rounded-2xl hover:bg-amber-700 transition-all shadow-xl shadow-amber-100 flex items-center justify-center gap-3"
                            >
                              <CheckCircle2 className="w-5 h-5" />
                              تأكيد الباحث ورفعها للجنة القرارات
                            </button>
                            <button 
                              onClick={() => {
                                const reason = prompt("سبب اعتذار الباحث؟");
                                if(reason) updateAidStatus(aid.memberId, aid.id, "rejected", reason);
                              }}
                              className="bg-red-50 text-red-600 font-black px-10 py-4 rounded-2xl hover:bg-red-100 transition-all text-sm"
                            >رفض ميداني</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : activeTab === 'technical' ? (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-gray-900 leading-none">الدراسة الاجتماعية والفنية للمنزل</h4>
                  {!isEditingTechnical && (
                    <button 
                      onClick={() => setIsEditingTechnical(true)}
                      className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-bold text-sm bg-emerald-50 px-4 py-2 rounded-xl transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                      تعديل الدراسة
                    </button>
                  )}
                </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                       <h5 className="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest border-b border-gray-100 pb-2">الحالة العامة</h5>
                       <div className="space-y-4">
                          <div className="flex justify-between items-center text-sm">
                             <span className="text-gray-400 font-bold">الحالة الاجتماعية</span>
                             <span className="font-black text-gray-900">{technicalStudy.socialStatus || 'غير محدد'}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                             <span className="text-gray-400 font-bold">عدد الأفراد المُعالين</span>
                             <span className="font-black text-gray-900">{technicalStudy.numberOfDependents} أفراد</span>
                          </div>
                       </div>
                    </div>

                    <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100">
                       <h5 className="text-[10px] font-black text-emerald-700 uppercase mb-4 tracking-widest border-b border-emerald-100 pb-2 flex items-center gap-2">
                         <Home className="w-4 h-4" /> حالة المسكن
                       </h5>
                       <div className="space-y-4">
                          <div className="flex justify-between items-center text-sm">
                             <span className="text-gray-400 font-bold">نوع البناء</span>
                             <span className="font-black text-gray-900">{technicalStudy.housingCondition.type === 'brick' ? 'طوب أحمر' : 'أخرى'}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                             <span className="text-gray-400 font-bold">عدد الغرف</span>
                             <span className="font-black text-gray-900">{technicalStudy.housingCondition.rooms} غرف</span>
                          </div>
                       </div>
                    </div>

                    <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                       <h5 className="text-[10px] font-black text-blue-700 uppercase mb-4 tracking-widest border-b border-blue-100 pb-2 flex items-center gap-2">
                         <Receipt className="w-4 h-4" /> المصاريف التفصيلية
                       </h5>
                       <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-bold"><span>سكن:</span> <span className="text-gray-900">{technicalStudy.expenses.housing} ج.م</span></div>
                          <div className="flex justify-between text-[10px] font-bold"><span>طعام:</span> <span className="text-gray-900">{technicalStudy.expenses.food} ج.م</span></div>
                          <div className="flex justify-between text-[10px] font-bold"><span>صحة:</span> <span className="text-gray-900">{technicalStudy.expenses.health} ج.م</span></div>
                          <div className="flex justify-between text-[10px] font-bold"><span>تعليم:</span> <span className="text-gray-900">{technicalStudy.expenses.education} ج.م</span></div>
                          <div className="flex justify-between text-[10px] font-bold"><span>أخرى:</span> <span className="text-gray-900">{technicalStudy.expenses.other} ج.م</span></div>
                          <div className="flex justify-between text-[10px] font-bold border-t border-blue-100 pt-1 mt-1"><span>الإجمالي:</span> <span className="text-blue-700 font-black">{technicalStudy.expenses.total} ج.م</span></div>
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                    <div className="space-y-6">
                       <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                          <h5 className="text-sm font-black text-emerald-700 uppercase mb-4 tracking-widest border-b border-emerald-100 pb-2 flex items-center gap-2">
                            <Info className="w-4 h-4" /> مرافق المسكن
                          </h5>
                          <div className="space-y-4">
                             <div className="grid grid-cols-3 gap-2">
                                <div className={cn("px-2 py-2 rounded-xl text-[10px] font-black text-center border transition-all", technicalStudy.housingCondition.hasWater ? "bg-blue-50 border-blue-100 text-blue-600" : "bg-gray-100 text-gray-400")}>المياه</div>
                                <div className={cn("px-2 py-2 rounded-xl text-[10px] font-black text-center border transition-all", technicalStudy.housingCondition.hasElectricity ? "bg-amber-50 border-amber-100 text-amber-600" : "bg-gray-100 text-gray-400")}>الكهرباء</div>
                                <div className={cn("px-2 py-2 rounded-xl text-[10px] font-black text-center border transition-all", technicalStudy.housingCondition.hasFurniture ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400")}>الأثاث</div>
                             </div>
                             <div className="pt-4 mt-4 border-t border-gray-100 italic text-xs text-gray-500 font-bold">
                               {technicalStudy.housingCondition.notes || 'لا توجد ملاحظات سكنية إضافية'}
                             </div>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-6">
                       <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                          <h5 className="text-sm font-black text-blue-700 uppercase mb-4 tracking-widest border-b border-blue-100 pb-2 flex items-center gap-2">
                            <Receipt className="w-4 h-4" /> الدراسة المالية
                          </h5>
                          <div className="space-y-4">
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-400 font-bold">مصدر الدخل التقريبي</span>
                                <span className="font-black text-gray-900 truncate max-w-[120px]">{technicalStudy.socialResearch.incomeSource || 'غير محدد'}</span>
                             </div>
                             <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-400 font-bold">إجمالي المصروفات</span>
                                <span className="font-black text-red-600">{technicalStudy.socialResearch.totalExpenses} ج.م</span>
                             </div>
                          </div>
                       </div>
                    </div>

                    <div className="col-span-full bg-emerald-50/30 p-6 rounded-3xl border border-emerald-100">
                       <h5 className="text-sm font-black text-emerald-900 uppercase mb-3 tracking-widest">ملخص الحالة والبحث الميداني</h5>
                       <p className="text-gray-700 text-sm font-medium leading-relaxed italic">
                         {technicalStudy.socialResearch.caseSummary || 'لم يتم تسجيل ملخص للبحث بعد'}
                       </p>
                       {technicalStudy.socialResearch.priorityReason && (
                         <div className="mt-4 p-3 bg-white/50 rounded-xl border border-emerald-100">
                           <p className="text-[10px] font-black text-emerald-600 uppercase mb-1">سبب تحديد الأولوية</p>
                           <p className="text-xs text-gray-600 font-bold">{technicalStudy.socialResearch.priorityReason}</p>
                         </div>
                       )}
                    </div>
                 </div>

                  {/* Variable Tracking & History Section */}
                  <div className="mt-12 pt-8 border-t border-gray-100">
                     <div className="flex items-center justify-between mb-8">
                       <div>
                         <h4 className="text-xl font-black text-gray-900">سجل المتغيرات والمقارنة الفنية</h4>
                         <p className="text-sm text-gray-400 font-bold mt-1">تتبع التغيرات في دخل الأسرة، المصروفات، وحالة السكن عبر الزيارات</p>
                       </div>
                       <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-xl">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-xs font-black text-gray-600">إجمالي التحديثات: {history.length}</span>
                       </div>
                     </div>

                     {history.length === 0 ? (
                       <div className="bg-gray-50/50 rounded-[32px] p-12 text-center border-2 border-dashed border-gray-100">
                          <Clock className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                          <p className="text-gray-400 font-black">لا يوجد سجل متغيرات بعد. يتم تسجيل المتغيرات تلقائياً عند إتمام الزيارات.</p>
                       </div>
                     ) : (
                       <div className="space-y-6">
                         {history.slice(0, 5).map((snap) => (
                           <div key={snap.id} className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden group hover:border-emerald-200 transition-all">
                              <div className="p-6 flex items-center justify-between bg-gray-50/30">
                                 <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm text-emerald-600">
                                       <Clock className="w-6 h-6" />
                                    </div>
                                    <div>
                                       <p className="text-sm font-black text-gray-900">{snap.changeSummary}</p>
                                       <p className="text-[10px] font-bold text-gray-400 mt-0.5">{snap.timestamp ? new Date(snap.timestamp).toLocaleString('ar-EG') : 'تاريخ غير متاح'}</p>
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-black uppercase">
                                      {snap.category === 'full' ? 'تحديث شامل' : snap.category}
                                    </span>
                                 </div>
                              </div>
                              
                              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                                 {/* Income Comparison */}
                                 {snap.data.monthlyIncome !== undefined && (
                                   <div className="space-y-3">
                                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">تغير الدخل الشهري</p>
                                      <div className="flex items-center gap-4">
                                         <div className="flex-1">
                                            <p className="text-xs font-bold text-gray-400">قبل</p>
                                            <p className="text-lg font-black text-gray-400">{snap.previousData?.monthlyIncome || 0} ج.م</p>
                                         </div>
                                         <div className="p-2 bg-gray-50 rounded-full">
                                            <ArrowUpRight className={cn(
                                              "w-4 h-4",
                                              (snap.data.monthlyIncome || 0) > (snap.previousData?.monthlyIncome || 0) ? "text-emerald-500" : (snap.data.monthlyIncome || 0) < (snap.previousData?.monthlyIncome || 0) ? "text-rose-500 rotate-90" : "text-gray-400 rotate-45"
                                            )} />
                                         </div>
                                         <div className="flex-1">
                                            <p className="text-xs font-bold text-emerald-600">بعد</p>
                                            <p className="text-xl font-black text-emerald-700">{snap.data.monthlyIncome} ج.م</p>
                                         </div>
                                      </div>
                                   </div>
                                 )}

                                 {/* Expenses Comparison */}
                                 {snap.data.expenses?.total !== undefined && (
                                   <div className="space-y-3">
                                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">تغير المصروفات</p>
                                      <div className="flex items-center gap-4">
                                         <div className="flex-1">
                                            <p className="text-xs font-bold text-gray-400">قبل</p>
                                            <p className="text-lg font-black text-gray-400">{snap.previousData?.expenses?.total || 0} ج.م</p>
                                         </div>
                                         <div className="p-2 bg-gray-50 rounded-full">
                                            <ArrowUpRight className={cn(
                                              "w-4 h-4",
                                              (snap.data.expenses.total || 0) > (snap.previousData?.expenses?.total || 0) ? "text-rose-500" : (snap.data.expenses.total || 0) < (snap.previousData?.expenses?.total || 0) ? "text-emerald-500 rotate-90" : "text-gray-400 rotate-45"
                                            )} />
                                         </div>
                                         <div className="flex-1">
                                            <p className="text-xs font-bold text-blue-600">بعد</p>
                                            <p className="text-xl font-black text-blue-700">{snap.data.expenses.total} ج.م</p>
                                         </div>
                                      </div>
                                   </div>
                                 )}

                                 {/* Housing Change */}
                                 {snap.data.housingCondition && (
                                   <div className="space-y-3">
                                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">ملاحظات السكن</p>
                                      <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100/50">
                                         <p className="text-xs font-bold text-amber-900 line-clamp-2 italic">
                                           "{snap.data.housingCondition.notes || 'تم تحديث حالة المسكن بدون ملاحظات نصية'}"
                                         </p>
                                      </div>
                                   </div>
                                 )}
                              </div>
                           </div>
                         ))}
                         {history.length > 5 && (
                           <button className="w-full py-4 text-sm font-black text-gray-400 hover:text-emerald-600 transition-colors uppercase tracking-[0.2em]">
                             عرض كافة المتغيرات ({history.length})
                           </button>
                         )}
                       </div>
                     )}
                  </div>
               </div>
            ) : activeTab === 'visits' ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-gray-900 leading-none">زيارات المتابعة الميدانية</h4>
                  <button 
                    onClick={() => setIsAddingVisit(true)}
                    className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-bold text-sm bg-emerald-50 px-4 py-2 rounded-xl transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    تسجيل زيارة
                  </button>
                </div>

                {/* Visit Report Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">إجمالي الزيارات</p>
                    <h5 className="text-2xl font-black text-gray-900">{visits.length}</h5>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">الزيارات المكتملة</p>
                    <h5 className="text-2xl font-black text-emerald-600">{visits.filter(v => v.status === VisitStatus.COMPLETED).length}</h5>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">نسبة الإنجاز</p>
                    <h5 className="text-2xl font-black text-blue-600">
                      {visits.length > 0 ? Math.round((visits.filter(v => v.status === VisitStatus.COMPLETED).length / visits.length) * 100) : 0}%
                    </h5>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100 h-fit">
                    <div className="flex items-center justify-between mb-6">
                      <h5 className="font-black text-emerald-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5" /> أجندة الزيارات الميدانية
                      </h5>
                      <div className="flex items-center gap-2">
                         <span className="text-[10px] font-black text-emerald-600 bg-white px-3 py-1 rounded-full border border-emerald-100">
                          {new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map(day => (
                        <div key={day} className="text-center text-[10px] font-black text-gray-400 py-2 uppercase opacity-50">{day}</div>
                      ))}
                      {(() => {
                        const now = new Date();
                        const year = now.getFullYear();
                        const month = now.getMonth();
                        const firstDay = new Date(year, month, 1).getDay();
                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                        
                        return Array.from({ length: 42 }).map((_, i) => {
                          const dayNumber = i - firstDay + 1;
                          const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth;
                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
                          const dayVisits = visits.filter(v => v.visitDate === dateStr);
                          const hasVisit = dayVisits.length > 0;
                          
                          if (!isValidDay) return <div key={i} className="aspect-square" />;
                          
                          return (
                            <button 
                              key={i} 
                              onClick={() => {
                                if (hasVisit) {
                                  const visitEl = document.getElementById(`visit-${dayVisits[0].id}`);
                                  visitEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }}
                              className={cn(
                                "aspect-square rounded-xl flex items-center justify-center text-xs font-bold transition-all relative group shadow-sm",
                                hasVisit ? (
                                  dayVisits.some(v => v.status === VisitStatus.COMPLETED)
                                  ? "bg-emerald-600 text-white shadow-emerald-100" 
                                  : "bg-white border-2 border-emerald-500 text-emerald-700"
                                ) : "bg-white text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                              )}
                            >
                              {dayNumber}
                              {hasVisit && (
                                <div className="absolute top-1 right-1">
                                   <div className="w-1.5 h-1.5 rounded-full bg-red-400 ring-2 ring-white" />
                                </div>
                              )}
                            </button>
                          );
                        });
                      })()}
                    </div>
                    <div className="mt-8 space-y-2">
                       <div className="flex items-center gap-3 text-[10px] font-bold text-gray-500">
                          <div className="w-3 h-3 rounded bg-emerald-600 shadow-sm" /> زيارة مكتملة
                       </div>
                       <div className="flex items-center gap-3 text-[10px] font-bold text-gray-500">
                          <div className="w-3 h-3 rounded bg-white border-2 border-emerald-500" /> زيارة مجدولة
                       </div>
                    </div>
                  </div>

                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {visits
                      .filter(v => !memberFilterId || v.memberId === memberFilterId)
                      .sort((a, b) => b.visitDate.localeCompare(a.visitDate))
                      .map(visit => (
                      <div key={visit.id} id={`visit-${visit.id}`} className="p-6 bg-white border border-gray-100 rounded-3xl space-y-4 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="bg-white p-3 rounded-2xl border border-gray-100 text-emerald-600">
                               <Calendar className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-black text-gray-900">{visit.visitDate}</p>
                                {visit.visitCode && (
                                  <span className="text-[10px] font-black text-white bg-emerald-600 px-1.5 py-0.5 rounded font-mono">
                                    {visit.visitCode}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">نوع الزيارة: {visit.type === 'field_visit' ? 'ميدانية' : 'مكالمة هاتفة'}</p>
                            </div>
                          </div>
                          <span className={cn(
                            "px-4 py-1.5 rounded-full text-[10px] font-black border uppercase tracking-widest",
                            visit.status === VisitStatus.COMPLETED ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                            visit.status === VisitStatus.SCHEDULED ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-red-100 text-red-700 border-red-200"
                          )}>
                            {visit.status === VisitStatus.SCHEDULED ? 'مجدولة' : 
                             visit.status === VisitStatus.COMPLETED ? 'مكتملة' : 'ملغاة'}
                          </span>
                          {visit.status === VisitStatus.SCHEDULED && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); markVisitCompleted(visit.id); }}
                              className="bg-emerald-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black hover:bg-emerald-700 transition-all shadow-sm"
                            >
                               تحديث كمكتملة
                            </button>
                          )}
                        </div>
                        
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 pb-2 border-l-4 border-emerald-500/20">
                            <div className="space-y-1">
                               <p className="text-[10px] font-black text-emerald-600 uppercase">نتائج الزيارة</p>
                               <div className="flex flex-wrap gap-2">
                                 {Array.isArray(visit.findings) ? visit.findings.map((f, i) => (
                                   <span key={i} className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg font-bold border border-emerald-100">{f}</span>
                                 )) : <p className="text-sm text-gray-600 font-bold leading-relaxed">{visit.findings || 'لا توجد نتائج مسجلة'}</p>}
                               </div>
                            </div>
                            <div className="space-y-1">
                               <p className="text-[10px] font-black text-blue-600 uppercase">التوصيات</p>
                               <div className="flex flex-wrap gap-2">
                                 {Array.isArray(visit.recommendations) ? visit.recommendations.map((r, i) => (
                                   <span key={i} className="text-xs bg-blue-50 text-blue-700 px-3 py-1 rounded-lg font-bold border border-blue-100">{r}</span>
                                 )) : <p className="text-sm text-gray-600 font-bold leading-relaxed">{visit.recommendations || 'لا توجد توصيات مسجلة'}</p>}
                               </div>
                            </div>
                         </div>

                        {visit.generalDescription && (
                          <div className="px-4 py-3 bg-gray-50 rounded-2xl border border-gray-100">
                             <p className="text-[10px] font-black text-gray-400 uppercase mb-1">وصف الحالة العام</p>
                             <p className="text-xs text-gray-700 italic leading-relaxed">{visit.generalDescription}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4">
                           {visit.itemizedIncome && visit.itemizedIncome.length > 0 && (
                             <div className="bg-blue-50/30 p-3 rounded-2xl border border-blue-100">
                               <p className="text-[10px] font-black text-blue-600 uppercase mb-2">الدخل المفصل</p>
                               <div className="space-y-1">
                                 {visit.itemizedIncome.map((inc, i) => (
                                   <div key={i} className="flex justify-between text-[10px] font-bold">
                                     <span>{inc.source}:</span>
                                     <span className="text-blue-900">{inc.amount} ج.م</span>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           )}
                           {visit.itemizedExpenses && visit.itemizedExpenses.length > 0 && (
                             <div className="bg-red-50/30 p-3 rounded-2xl border border-red-100">
                               <p className="text-[10px] font-black text-red-600 uppercase mb-2">المصروفات المفصلة</p>
                               <div className="space-y-1">
                                 {visit.itemizedExpenses.map((exp, i) => (
                                   <div key={i} className="flex justify-between text-[10px] font-bold">
                                     <span>{exp.category}:</span>
                                     <span className="text-red-900">{exp.amount} ج.م</span>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           )}
                           {visit.housingDetails && (
                             <div className="bg-emerald-50/30 p-3 rounded-2xl border border-emerald-100">
                               <p className="text-[10px] font-black text-emerald-600 uppercase mb-2">محتويات السكن</p>
                               <p className="text-[10px] text-gray-600 font-bold leading-tight">
                                 {visit.housingDetails.contents}
                                 {visit.housingDetails.appliances && ` | أجهزة: ${visit.housingDetails.appliances}`}
                               </p>
                             </div>
                           )}
                        </div>

                        <div className="pt-4 border-t border-gray-100 flex justify-between items-center text-[10px] font-black text-gray-400">
                           <span>المسؤول: {visit.visitorName}</span>
                           <div className="flex gap-2">
                             <button className="p-2 hover:bg-white rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                             <button className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                           </div>
                        </div>
                      </div>
                    ))}
                    {visits.length === 0 && (
                      <div className="py-20 text-center text-gray-300">لم يتم تسجيل أي زيارات ميدانية لهذه العائلة</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-bold text-gray-900 leading-none">تاريخ المساعدات المسلمة</h4>
                  <button 
                    onClick={() => setIsAddingAssistance(true)}
                    className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-bold text-sm bg-emerald-50 px-4 py-2 rounded-xl transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    تسجيل مساعدة
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {assistances
                    .filter(a => !memberFilterId || a.targetMemberId === memberFilterId || a.assignedToMemberId === memberFilterId)
                    .map(aid => (
                    <motion.div 
                      key={aid.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group bg-white rounded-[32px] border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl hover:shadow-emerald-100/50 transition-all duration-500 flex flex-col"
                    >
                      <div className="p-6 space-y-4 flex-1">
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full border border-emerald-100 tracking-widest uppercase inline-block w-fit">
                              {aid.assistanceCode || 'بدون كود'}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1">
                               <Calendar className="w-3.5 h-3.5 text-gray-400" />
                               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{aid.distributionDate}</span>
                            </div>
                          </div>
                          <div className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg",
                            (aid.type || '').includes('طبي') ? "bg-rose-500 shadow-rose-100" :
                            (aid.type || '').includes('غذائي') ? "bg-amber-500 shadow-amber-100" :
                            "bg-emerald-500 shadow-emerald-100"
                          )}>
                            <Receipt className="w-5 h-5" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <h4 className="font-black text-lg text-gray-900 group-hover:text-emerald-600 transition-colors leading-tight">{aid.type}</h4>
                          <p className="text-[11px] font-bold text-gray-400 line-clamp-2 min-h-[2.5rem]">
                            {aid.notes || 'لا توجد ملاحظات إضافية'}
                          </p>
                        </div>

                        <div className="pt-4 border-t border-gray-50 flex justify-between items-end">
                           <div className="flex flex-col">
                             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">القيمة المسلمة</span>
                             <div className="flex items-baseline gap-1">
                               <span className="text-2xl font-black text-emerald-600 tabular-nums">{(aid.amount || 0).toLocaleString()}</span>
                               <span className="text-[10px] font-black text-emerald-400 uppercase">{aid.unit || 'ج.م'}</span>
                             </div>
                           </div>
                           <div className="flex flex-col items-end">
                             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">كود التسليم</span>
                             <span className="text-xs font-black text-gray-900 font-mono tracking-tighter">{aid.deliveryCode || '--'}</span>
                           </div>
                        </div>
                      </div>

                      <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <div className="w-6 h-6 bg-white rounded-full border border-gray-100 flex items-center justify-center">
                             <User className="w-3 h-3 text-gray-400" />
                           </div>
                           <span className="text-[10px] font-black text-gray-500">{lookups.find(l => l.id === aid.targetMemberId)?.name || members.find(m => m.id === aid.targetMemberId)?.name || 'أحد أفراد العائلة'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={async () => {
                              const newStatus = !aid.isDelivered;
                              const update: any = { isDelivered: newStatus };
                              if (newStatus) {
                                update.deliveryDate = aid.deliveryDate || new Date().toISOString().split('T')[0];
                                update.followUpLog = [...(aid.followUpLog || []), {
                                  date: new Date().toISOString(),
                                  comment: 'تم العلم بالتسليم من خلال القائمة السريعة.',
                                  processedBy: 'النظام',
                                  type: 'delivery' as const
                                }];
                              }
                              await updateDoc(doc(db, 'assistances', aid.id), update);
                            }}
                            className={cn(
                              "p-2 rounded-xl transition-all shadow-sm group/btn border",
                              aid.isDelivered ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-300 border-gray-100 hover:text-emerald-600"
                            )}
                            title={aid.isDelivered ? "تم التسليم" : "تحديد كمستلم"}
                          >
                            <CheckCircle2 className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                          </button>
                          {((aid.type || '').includes('طبي') || (aid.type || '').toLowerCase().includes('medical')) && !aid.claimId && (
                            <button 
                              onClick={() => handleCreateClaimFromAssistance(aid)}
                              className="p-2 bg-white text-rose-500 hover:text-rose-700 border border-gray-100 rounded-xl transition-all shadow-sm group/btn"
                              title="تحويل لمطالبة طبية"
                            >
                              <Receipt className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                            </button>
                          )}
                          <button 
                             onClick={() => setEditingAssistance(aid)}
                             className="p-2 bg-white text-gray-300 hover:text-emerald-600 border border-gray-100 rounded-xl transition-all shadow-sm group/btn"
                             title="تعديل المساعدة"
                           >
                             <Edit2 className="w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                           </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {assistances.length === 0 && (
                    <div className="col-span-full py-20 text-center text-gray-300 font-bold border-2 border-dashed border-gray-50 rounded-[48px]">
                      لم يتم تسليم أي شكل من أشكال المساعدات بعد لهذه العائلة
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {isEditingFamily && editingFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsEditingFamily(false)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[40px] w-full max-w-4xl relative z-10 p-10 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black flex items-center gap-3 text-emerald-700">
                <Edit2 className="w-8 h-8" />
                تعديل بيانات العائلة الأساسية
              </h3>
              <button 
                onClick={() => setIsEditingFamily(false)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >إغلاق</button>
            </div>

            <form onSubmit={handleUpdateFamily} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <h4 className="font-black text-gray-900 border-b pb-2">البيانات العامة</h4>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2">اسم العائلة</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                        value={editingFamily.name}
                        onChange={e => setEditingFamily({ ...editingFamily, name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2">رقم الملف</label>
                        <input 
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                          value={editingFamily.fileNumber}
                          onChange={e => setEditingFamily({ ...editingFamily, fileNumber: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2">رقم الهاتف</label>
                        <input 
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                          value={editingFamily.phone || ''}
                          onChange={e => setEditingFamily({ ...editingFamily, phone: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="font-black text-gray-900 border-b pb-2">شخص التواصل</h4>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2">الاسم</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                        value={editingFamily.contactPersonName || ''}
                        onChange={e => setEditingFamily({ ...editingFamily, contactPersonName: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2">الهاتف</label>
                        <input 
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                          value={editingFamily.contactPersonPhone || ''}
                          onChange={e => setEditingFamily({ ...editingFamily, contactPersonPhone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2">الدور / صلة القرابة</label>
                        <input 
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                          value={editingFamily.contactPersonRole || ''}
                          onChange={e => setEditingFamily({ ...editingFamily, contactPersonRole: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                 <div className="md:col-span-2 space-y-6">
                   <h4 className="font-black text-gray-900 border-b pb-2">العنوان والبيانات المالية والاجتماعية</h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 mr-2">المحافظة</label>
                       <select 
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                         value={editingFamily.governorate || ''}
                         onChange={e => setEditingFamily({ ...editingFamily, governorate: e.target.value })}
                       >
                         <option value="">اختر المحافظة...</option>
                         {lookups.filter(l => l.type === 'governorate').map(gov => (
                           <option key={gov.id} value={gov.id}>{gov.name}</option>
                         ))}
                       </select>
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 mr-2">المدينة / المركز</label>
                       <input 
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                         value={editingFamily.city || ''}
                         onChange={e => setEditingFamily({ ...editingFamily, city: e.target.value })}
                       />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 mr-2">المنطقة / الحي</label>
                       <select 
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                         value={editingFamily.neighborhood || ''}
                         onChange={e => setEditingFamily({ ...editingFamily, neighborhood: e.target.value })}
                       >
                         <option value="">اختر المنطقة...</option>
                         {lookups.filter(l => l.type === 'neighborhood' && (editingFamily.governorate ? l.parentId === editingFamily.governorate : true)).map(nb => (
                           <option key={nb.id} value={nb.id}>{nb.name}</option>
                         ))}
                       </select>
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 mr-2">الدخل الشهري</label>
                       <input 
                         type="number"
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                         value={editingFamily.monthlyIncome || 0}
                         onChange={e => setEditingFamily({ ...editingFamily, monthlyIncome: Number(e.target.value) })}
                       />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 mr-2">الجنسية</label>
                       <input 
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                         value={editingFamily.nationality || ''}
                         onChange={e => setEditingFamily({ ...editingFamily, nationality: e.target.value })}
                       />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 mr-2">عدد المعالين</label>
                       <input 
                         type="number"
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                         value={editingFamily.numberOfDependents || 0}
                         onChange={e => setEditingFamily({ ...editingFamily, numberOfDependents: Number(e.target.value) })}
                       />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2">الحالة الاجتماعية</label>
                        <input 
                          placeholder="أرملة، مطلقة..."
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                          value={editingFamily.socialStatus || ''}
                          onChange={e => setEditingFamily({ ...editingFamily, socialStatus: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2">حالة السكن</label>
                        <input 
                          placeholder="إيجار، تمليك، استضافة..."
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                          value={editingFamily.housingStatus || ''}
                          onChange={e => setEditingFamily({ ...editingFamily, housingStatus: e.target.value })}
                        />
                      </div>
                     <div className="md:col-span-2 space-y-1.5">
                       <label className="text-[10px] font-black text-gray-400 mr-2">العنوان بالتفصيل</label>
                       <textarea 
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                         rows={2}
                         value={editingFamily.detailedAddress || editingFamily.address || ''}
                         onChange={e => setEditingFamily({ ...editingFamily, detailedAddress: e.target.value, address: e.target.value })}
                       />
                     </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-6 bg-indigo-50/30 p-8 rounded-[40px] border border-indigo-100">
                    <h4 className="font-black text-indigo-900 border-b border-indigo-100 pb-2 flex items-center gap-2">
                       <Globe className="w-5 h-5" /> بيانات التكافل الاجتماعي
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-indigo-400 mr-2 uppercase tracking-widest">شبكات الدعم العائلي</label>
                        <textarea 
                          className="w-full bg-white border border-indigo-100 rounded-2xl px-5 py-3 outline-none font-bold min-h-[100px]"
                          placeholder="هل يوجد أقارب يساعدون الأسرة؟"
                          value={editingFamily.socialSolidarity?.supportNetworks || ''}
                          onChange={e => setEditingFamily({ 
                            ...editingFamily, 
                            socialSolidarity: { ...(editingFamily.socialSolidarity || { communityContributions: '', socialSecurityBenefits: '', supportNetworks: '' }), supportNetworks: e.target.value } 
                          })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-indigo-400 mr-2 uppercase tracking-widest">المساهمات المجتمعية</label>
                        <textarea 
                          className="w-full bg-white border border-indigo-100 rounded-2xl px-5 py-3 outline-none font-bold min-h-[100px]"
                          placeholder="هل تشارك الأسرة في مبادرات محلية؟"
                          value={editingFamily.socialSolidarity?.communityContributions || ''}
                          onChange={e => setEditingFamily({ 
                            ...editingFamily, 
                            socialSolidarity: { ...(editingFamily.socialSolidarity || { communityContributions: '', socialSecurityBenefits: '', supportNetworks: '' }), communityContributions: e.target.value } 
                          })}
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1.5">
                        <label className="text-[10px] font-black text-indigo-400 mr-2 uppercase tracking-widest">فوائد الضمان الاجتماعي / مبالغ التكافل وكرامة</label>
                        <input 
                          className="w-full bg-white border border-indigo-100 rounded-2xl px-5 py-3 outline-none font-bold"
                          placeholder="القيمة السنوية أو التفاصيل الرسمية..."
                          value={editingFamily.socialSolidarity?.socialSecurityBenefits || ''}
                          onChange={e => setEditingFamily({ 
                            ...editingFamily, 
                            socialSolidarity: { ...(editingFamily.socialSolidarity || { communityContributions: '', socialSecurityBenefits: '', supportNetworks: '' }), socialSecurityBenefits: e.target.value } 
                          })}
                        />
                      </div>
                    </div>
                  </div>
               </div>

              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => setIsEditingFamily(false)}
                  className="flex-1 py-4 font-black text-gray-400 hover:bg-gray-100 rounded-2xl transition-all"
                >إلغاء</button>
                <button 
                  type="submit"
                  className="flex-[2] bg-emerald-600 text-white font-black py-5 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100"
                >حفظ التغييرات</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {editingAssistance && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setEditingAssistance(null)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[40px] w-full max-w-lg relative z-[130] p-10 shadow-2xl overflow-y-auto"
          >
             <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-gray-900 leading-none">تعديل المساعدة</h3>
                <button onClick={() => setEditingAssistance(null)} className="text-gray-400 hover:text-gray-900 transition-colors"><XCircle className="w-6 h-6" /></button>
             </div>
             
             <form onSubmit={handleUpdateAssistance} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">التاريخ</label>
                      <input 
                        type="date"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-6 py-3 outline-none font-bold text-sm"
                        value={editingAssistance.distributionDate}
                        onChange={e => setEditingAssistance({...editingAssistance, distributionDate: e.target.value})}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">النوع</label>
                      <input 
                        type="text"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-6 py-3 outline-none font-bold text-sm"
                        value={editingAssistance.type}
                        onChange={e => setEditingAssistance({...editingAssistance, type: e.target.value})}
                      />
                   </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">القيمة</label>
                      <input 
                         type="number"
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-6 py-3 outline-none font-bold text-sm tabular-nums"
                         value={editingAssistance.amount}
                         onChange={e => setEditingAssistance({...editingAssistance, amount: Number(e.target.value)})}
                      />
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">جهة التسليم</label>
                      <input 
                         type="text"
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-6 py-3 outline-none font-bold text-sm"
                         value={editingAssistance.deliveryDestination || ''}
                         onChange={e => setEditingAssistance({...editingAssistance, deliveryDestination: e.target.value})}
                      />
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5 flex items-center gap-3 mt-6">
                      <input 
                        type="checkbox"
                        id="editIsDelivered"
                        className="w-5 h-5 accent-emerald-600 cursor-pointer"
                        checked={editingAssistance.isDelivered}
                        onChange={e => setEditingAssistance({...editingAssistance, isDelivered: e.target.checked})}
                      />
                      <label htmlFor="editIsDelivered" className="text-xs font-black text-gray-700 cursor-pointer">تم التسليم النهائي</label>
                   </div>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">ملاحظات المسجل</label>
                      <textarea 
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-6 py-3 outline-none font-bold text-sm min-h-[120px] resize-none"
                         value={editingAssistance.notes || ''}
                         onChange={e => setEditingAssistance({...editingAssistance, notes: e.target.value})}
                      />
                   </div>
                </div>

                {((editingAssistance.type || '').includes('طبي') || (editingAssistance.type || '').toLowerCase().includes('medical')) && !editingAssistance.claimId && (
                  <div className="p-6 bg-rose-50 rounded-[32px] border border-rose-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white rounded-2xl shadow-sm">
                        <Receipt className="w-6 h-6 text-rose-500" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-rose-900 leading-none">لم يتم تسجيل مطالبة طبية</p>
                        <p className="text-[10px] font-bold text-rose-600 mt-1">هذه مساعدة طبية، هل تريد تسجيلها كمطالبة؟</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        handleCreateClaimFromAssistance(editingAssistance);
                        setEditingAssistance(null);
                      }}
                      className="px-6 py-3 bg-white text-rose-600 rounded-xl font-black text-xs border border-rose-100 hover:bg-rose-100 transition-all shadow-sm"
                    >تحويل لمطالبة</button>
                  </div>
                )}

                <div className="flex gap-4 pt-6 border-t border-gray-100">
                   <button type="submit" className="flex-1 bg-emerald-600 text-white font-black py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100">حفظ التغييرات</button>
                   <button type="button" onClick={() => setEditingAssistance(null)} className="px-10 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 transition-all">إلغاء</button>
                </div>
             </form>
          </motion.div>
        </div>
      )}

      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setEditingMember(null)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[40px] w-full max-w-4xl relative z-10 p-10 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black flex items-center gap-3 text-indigo-700">
                <User className="w-8 h-8" />
                تحديث ملف: {editingMember.name}
              </h3>
              <button 
                onClick={() => setEditingMember(null)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >إغلاق</button>
            </div>

            <form onSubmit={handleUpdateMember} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Personal & Social */}
                <div className="space-y-6">
                  <h4 className="font-black text-gray-900 border-b pb-2 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" /> البيانات الشخصية والاجتماعية
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">الاسم الكامل</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                        value={editingMember.name}
                        onChange={e => setEditingMember({ ...editingMember, name: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">الحالة الاجتماعية</label>
                        <input 
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                          placeholder="أعزب، متزوج، أرمل..."
                          value={editingMember.maritalStatus || ''}
                          onChange={e => setEditingMember({ ...editingMember, maritalStatus: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">تلقي الخدمات</label>
                        <select 
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                          value={editingMember.isServiceRecipient ? 'true' : 'false'}
                          onChange={e => setEditingMember({ ...editingMember, isServiceRecipient: e.target.value === 'true' })}
                        >
                          <option value="true">حالة مستلمة للخدمات</option>
                          <option value="false">غير مستلم للخدمات</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Education & Work */}
                <div className="space-y-6">
                  <h4 className="font-black text-gray-900 border-b pb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-600" /> التعليم والعمل
                  </h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">المستوى التعليمي</label>
                        <select 
                          className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-5 py-3 outline-none font-bold"
                          value={editingMember.educationLevel}
                          onChange={e => setEditingMember({ ...editingMember, educationLevel: e.target.value as EducationLevel })}
                        >
                          <option value={EducationLevel.NONE}>بدون تعليم</option>
                          <option value={EducationLevel.PRIMARY}>ابتدائي</option>
                          <option value={EducationLevel.PREPARATORY}>إعدادي</option>
                          <option value={EducationLevel.SECONDARY}>ثانوي</option>
                          <option value={EducationLevel.UNIVERSITY}>جامعي</option>
                          {educationLevels.map(lvl => (
                            <option key={lvl.id} value={lvl.name}>{lvl.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">تفاصيل التعليم</label>
                        <input 
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                          placeholder="السنة الدراسية، الجامعة..."
                          value={editingMember.educationDetails || ''}
                          onChange={e => setEditingMember({ ...editingMember, educationDetails: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">الوظيفة / المهنة</label>
                        <select 
                          className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-5 py-3 outline-none font-bold"
                          value={editingMember.employmentStatus || ''}
                          onChange={e => setEditingMember({ ...editingMember, employmentStatus: e.target.value })}
                        >
                          <option value="unemployed">عاطل (بدون عمل)</option>
                          <option value="student">طالب</option>
                          <option value="retired">معاش</option>
                          {jobTitles.map(job => (
                            <option key={job.id} value={job.name}>{job.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">تفاصيل العمل</label>
                        <input 
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-5 py-3 outline-none font-bold"
                          placeholder="مكان العمل، طبيعة الدوام..."
                          value={editingMember.employmentDetails || ''}
                          onChange={e => setEditingMember({ ...editingMember, employmentDetails: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Medical Data */}
                <div className="md:col-span-2 space-y-6 bg-gray-50 p-6 rounded-3xl border border-gray-100">
                  <h4 className="font-black text-gray-900 border-b pb-2 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-rose-600" /> الحالة الصحية والطبية
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">الحالة الصحية العامة</label>
                      <select 
                        className="w-full bg-white border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold shadow-sm"
                        value={editingMember.healthCondition}
                        onChange={e => setEditingMember({ ...editingMember, healthCondition: e.target.value as HealthStatus })}
                      >
                        <option value={HealthStatus.HEALTHY}>سليم (لا يوجد أمراض)</option>
                        <option value={HealthStatus.CHRONIC_ILLNESS}>مرض مزمن</option>
                        <option value={HealthStatus.TEMPORARY_ILLNESS}>مرض عارض (مؤقت)</option>
                        <option value={HealthStatus.DISABILITY}>إعاقة (جسدية / ذهنية)</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">اسم المرض</label>
                      <input 
                        className="w-full bg-white border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold shadow-sm"
                        placeholder="اسم المرض أو الإعاقة..."
                        value={editingMember.disease || ''}
                        onChange={e => setEditingMember({ ...editingMember, disease: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">دخل الفرد الشخصي</label>
                      <input 
                        type="number"
                        className="w-full bg-white border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold shadow-sm"
                        value={editingMember.monthlyIncome || 0}
                        onChange={e => setEditingMember({ ...editingMember, monthlyIncome: Number(e.target.value) })}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">ملاحظات طبية وتفصيلية</label>
                      <textarea 
                        className="w-full bg-white border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold shadow-sm"
                        rows={2}
                        placeholder="اكتب هنا تفاصيل الوضع الصحي والعلاجات المستمرة..."
                        value={editingMember.healthNotes || ''}
                        onChange={e => setEditingMember({ ...editingMember, healthNotes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="flex-1 py-4 font-black text-gray-400 hover:bg-gray-100 rounded-2xl transition-all"
                >إلغاء التعديلات</button>
                <button 
                  type="submit"
                  className="flex-[2] bg-indigo-600 text-white font-black py-5 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                >حفظ الملف الفردي</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Comment Modal */}
      {commentingOnTask && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-indigo-50/30">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <h3 className="font-black text-gray-900">إضافة تعليق متابعة</h3>
               </div>
               <button onClick={() => setCommentingOnTask(null)} className="p-2 bg-white rounded-xl shadow-sm text-gray-400 hover:text-gray-900 transition-all">
                 <Trash2 className="w-4 h-4" />
               </button>
            </div>
            <div className="p-6 space-y-4">
               <textarea 
                 value={taskComment}
                 onChange={e => setTaskComment(e.target.value)}
                 className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 outline-none text-sm font-bold min-h-[120px] focus:bg-white focus:border-indigo-200 transition-all resize-none"
                 placeholder="اكتب تعليقك هنا حول حالة التسليم أو المتابعة..."
                 autoFocus
               />
               <div className="flex gap-3">
                  <button 
                    onClick={() => updateDeliveryTask(commentingOnTask.memberId, commentingOnTask.aidId, commentingOnTask.taskId, {}, taskComment)}
                    disabled={!taskComment.trim()}
                    className="flex-1 bg-indigo-600 text-white font-black py-3 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                  >حفظ التعليق</button>
                  <button 
                    onClick={() => setCommentingOnTask(null)}
                    className="px-6 bg-gray-50 text-gray-400 font-bold py-3 rounded-2xl hover:bg-gray-100 transition-all"
                  >إلغاء</button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Aid Request Details Modal */}
      {viewingAidRequest && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-8">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-indigo-50/20">
               <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-3xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-100">
                    <Heart className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-gray-900">{viewingAidRequest.aid.type}</h3>
                    <p className="text-xs font-bold text-gray-400 mt-0.5 flex items-center gap-2">
                       <User className="w-3.5 h-3.5" /> المستفيد: {members.find(m => m.id === viewingAidRequest.memberId)?.name}
                    </p>
                  </div>
               </div>
               <button onClick={() => setViewingAidRequest(null)} className="p-4 bg-white text-gray-400 rounded-3xl shadow-sm hover:text-gray-900 transition-all">
                 <ArrowLeft className="w-6 h-6" />
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                     <div className="bg-gray-50 rounded-[32px] p-6 border border-gray-100 space-y-4">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2">بيانات الطلب المالية والزمنية</h4>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="bg-white p-4 rounded-2xl shadow-sm">
                              <p className="text-[8px] font-black text-emerald-600 uppercase mb-1">تكلفة الوحدة</p>
                              <p className="text-lg font-black text-gray-900 tabular-nums">{viewingAidRequest.aid.unitCost.toLocaleString()} ج.م</p>
                           </div>
                           <div className="bg-white p-4 rounded-2xl shadow-sm">
                              <p className="text-[8px] font-black text-indigo-600 uppercase mb-1">الكمية المقررة</p>
                              <p className="text-lg font-black text-gray-900 tabular-nums">{viewingAidRequest.aid.quantity}</p>
                           </div>
                           <div className="bg-white p-4 rounded-2xl shadow-sm">
                              <p className="text-[8px] font-black text-amber-600 uppercase mb-1">مدة الدعم</p>
                              <p className="text-lg font-black text-gray-900 tabular-nums">{viewingAidRequest.aid.durationMonths} شهور</p>
                           </div>
                           <div className="bg-white p-4 rounded-2xl shadow-sm">
                              <p className="text-[8px] font-black text-rose-600 uppercase mb-1">إجمالي الميزانية</p>
                              <p className="text-lg font-black text-gray-900 tabular-nums">{(viewingAidRequest.aid.totalCost || 0).toLocaleString()} ج.م</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-4 pt-2">
                           <div className="flex-1">
                              <p className="text-[8px] font-black text-gray-400 uppercase mb-1">تاريخ البدء</p>
                              <p className="text-sm font-bold text-gray-700 leading-none">{viewingAidRequest.aid.startDate}</p>
                           </div>
                           <div className="w-px h-6 bg-gray-200" />
                           <div className="flex-1">
                              <p className="text-[8px] font-black text-gray-400 uppercase mb-1">تاريخ الانتهاء</p>
                              <p className="text-sm font-bold text-gray-700 leading-none">{viewingAidRequest.aid.endDate || '--'}</p>
                           </div>
                        </div>
                        {viewingAidRequest.aid.dueDate && (
                          <div className="pt-4 mt-4 border-t border-gray-100">
                             <p className="text-[8px] font-black text-rose-600 uppercase mb-1">الموعد النهائي المتوقع (Due Date)</p>
                             <div className="flex items-center gap-2">
                               <Clock className="w-3.5 h-3.5 text-rose-400" />
                               <p className="text-sm font-black text-rose-700">{viewingAidRequest.aid.dueDate}</p>
                             </div>
                          </div>
                        )}
                     </div>
                     
                     <div className="bg-white rounded-[32px] p-6 border border-gray-100 shadow-sm space-y-4">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">سجل المتابعة والنشاط</h4>
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                           {(viewingAidRequest.aid.followUpLog || []).slice().reverse().map((log: any, idx) => (
                             <div key={idx} className="flex gap-4 relative">
                               {idx < (viewingAidRequest.aid.followUpLog || []).length - 1 && (
                                 <div className="absolute top-8 bottom-0 right-4 w-px bg-gray-100" />
                               )}
                               <div className={cn(
                                 "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                                 log.type === 'status_change' ? "bg-blue-50 text-blue-600" :
                                 log.type === 'delivery' ? "bg-emerald-50 text-emerald-600" :
                                 "bg-gray-50 text-gray-400"
                               )}>
                                 {log.type === 'status_change' ? <Clock className="w-4 h-4" /> : 
                                  log.type === 'delivery' ? <CheckCircle2 className="w-4 h-4" /> :
                                  <Info className="w-4 h-4" />}
                               </div>
                               <div className="flex-1 pb-4">
                                 <div className="flex justify-between items-center mb-1">
                                   <span className="text-[10px] font-black text-gray-900">{log.processedBy}</span>
                                   <span className="text-[9px] font-bold text-gray-400 tabular-nums">{new Date(log.date).toLocaleString('ar-EG')}</span>
                                 </div>
                                 <p className="text-xs font-bold text-gray-600 leading-relaxed">{log.comment}</p>
                               </div>
                             </div>
                           ))}
                           {(!viewingAidRequest.aid.followUpLog || viewingAidRequest.aid.followUpLog.length === 0) && (
                             <p className="text-xs font-bold text-gray-300 text-center py-4 italic">لا يوجد سجل متابعة بعد</p>
                           )}
                        </div>
                     </div>
                     
                     <div className="bg-white rounded-[32px] p-6 border border-gray-100 shadow-sm space-y-4">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">تفاصيل الحالة والاحتياج</h4>
                        <div className="space-y-4 text-xs font-bold leading-relaxed text-gray-600">
                           <p className="bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100/50">
                              <span className="text-indigo-600 block mb-1">وصف الاحتياج:</span>
                              {viewingAidRequest.aid.needDetails || 'لا يوجد وصف مفصل مسجل لهذا الطلب.'}
                           </p>
                           {viewingAidRequest.aid.illnessDetails && (
                              <p className="bg-rose-50/30 p-4 rounded-2xl border border-rose-100/50">
                                 <span className="text-rose-600 block mb-1">تفاصيل المرض/الحالة الطبية:</span>
                                 {viewingAidRequest.aid.illnessDetails}
                              </p>
                           )}
                           {viewingAidRequest.aid.notes && (
                              <p className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                 <span className="text-gray-400 block mb-1">ملاحظات إضافية:</span>
                                 {viewingAidRequest.aid.notes}
                              </p>
                           )}
                        </div>
                     </div>
                  </div>

                  <div className="space-y-6">
                     <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                        <span>سجل التسليمات والدفعات المجدولة</span>
                        <span className="tabular-nums">{(viewingAidRequest.aid.deliverySchedule || []).length} دفعات</span>
                     </h4>
                     <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {(viewingAidRequest.aid.deliverySchedule || []).map((task) => (
                           <div key={task.id} className={cn(
                              "p-5 rounded-3xl border transition-all space-y-4 relative",
                              task.status === 'delivered' ? "bg-emerald-50/30 border-emerald-100" : "bg-gray-50 border-gray-100"
                           )}>
                              <div className="flex justify-between items-center">
                                 <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-[11px] font-black text-gray-600">
                                       #{task.idNumber}
                                    </div>
                                    <p className="text-sm font-black text-gray-900">{task.scheduledDate}</p>
                                 </div>
                                 <div className={cn(
                                    "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                                    task.status === 'delivered' ? "bg-emerald-600 text-white" : 
                                    task.status === 'delivering' ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-500"
                                 )}>
                                    {task.status === 'delivered' ? 'تم' : task.status === 'delivering' ? 'جارٍ' : 'مجدول'}
                                 </div>
                              </div>
                              
                              {task.updates && task.updates.length > 0 && (
                                 <div className="space-y-2 border-t border-gray-100/50 pt-3">
                                    {task.updates.map((upd, idx) => (
                                       <div key={idx} className="bg-white/60 p-2.5 rounded-xl border border-white/80 shadow-sm flex gap-3">
                                          <div className="w-px h-auto bg-indigo-200 flex-shrink-0" />
                                          <div className="flex-1">
                                             <div className="flex justify-between text-[8px] font-black text-indigo-400 mb-1">
                                                <span>{upd.user}</span>
                                                <span className="tabular-nums">{new Date(upd.date).toLocaleDateString('ar-EG')}</span>
                                             </div>
                                             <p className="text-[10px] font-bold text-gray-700 leading-relaxed">{upd.text}</p>
                                          </div>
                                       </div>
                                    ))}
                                 </div>
                              )}
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {deliveryAidDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setDeliveryAidDialog(null)} />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[40px] w-full max-w-xl relative z-10 p-10 shadow-2xl animate-in fade-in zoom-in duration-200"
          >
            <h3 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-3">
              <ClipboardCheck className="w-8 h-8 text-emerald-600" />
              تأكيد تسليم الخدمة والبيانات النهائية
            </h3>
            {deliveryAidDialog && (() => {
              const member = members.find(m => m.id === deliveryAidDialog.memberId);
              const aid = member?.aidRequests?.find(r => r.id === deliveryAidDialog.aidId);
              const isMedical = (aid?.type || '').includes('طبي') || (aid?.type || '').toLowerCase().includes('medical');

              return (
                <>
                  <div className="bg-emerald-50 rounded-2xl p-4 mb-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-black text-emerald-800 opacity-60 uppercase mb-1">الخدمة / المساعدة</p>
                        <p className="font-black text-emerald-900">{deliveryAidDialog.type}</p>
                      </div>
                      {aid?.dueDate && (
                        <div className="text-left bg-white px-3 py-1 rounded-xl border border-emerald-100">
                          <p className="text-[10px] font-black text-emerald-600 uppercase mb-0.5">الموعد النهائي</p>
                          <p className="text-xs font-black text-gray-900">{aid.dueDate}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {isMedical && (aid?.prescriptionItems || []).length > 0 && (
                    <div className="bg-amber-50 rounded-2xl p-6 mb-6">
                      <h4 className="text-xs font-black text-amber-800 uppercase mb-4 flex items-center gap-2">
                        <Package className="w-4 h-4" /> تفريغ الروشتة والأصناف المصروفة
                      </h4>
                      <div className="space-y-4">
                        {(aid?.prescriptionItems || []).map((pItem, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white/50 p-3 rounded-xl border border-amber-100">
                            <div>
                              <p className="text-xs font-bold text-gray-900">{pItem.itemName}</p>
                              <p className="text-[10px] text-gray-400">المطلوب: {pItem.requestedQuantity} | المتاح بالمخزن: {storeItems.find(s => s.id === pItem.itemId)?.quantity ?? pItem.availableStock ?? 0}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                type="button"
                                onClick={() => {
                                  const currentItems = deliveryDetails.prescriptionItems.length > 0 ? deliveryDetails.prescriptionItems : [...(aid?.prescriptionItems || [])];
                                  const newItems = [...currentItems];
                                  newItems[idx] = { ...newItems[idx], dispensedQuantity: Math.max(0, (newItems[idx].dispensedQuantity || 0) - 1) };
                                  setDeliveryDetails({ ...deliveryDetails, prescriptionItems: newItems });
                                }}
                                className="p-1 hover:bg-amber-100 rounded text-amber-600"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input 
                                type="number"
                                className="w-12 text-center bg-white border border-amber-200 rounded py-1 text-xs font-black"
                                value={deliveryDetails.prescriptionItems?.[idx]?.dispensedQuantity ?? pItem.dispensedQuantity}
                                onChange={e => {
                                  const val = Number(e.target.value);
                                  const currentItems = deliveryDetails.prescriptionItems.length > 0 ? deliveryDetails.prescriptionItems : [...(aid?.prescriptionItems || [])];
                                  const newItems = [...currentItems];
                                  newItems[idx] = { ...newItems[idx], dispensedQuantity: val };
                                  setDeliveryDetails({ ...deliveryDetails, prescriptionItems: newItems });
                                }}
                              />
                              <button 
                                type="button"
                                onClick={() => {
                                  const currentItems = deliveryDetails.prescriptionItems.length > 0 ? deliveryDetails.prescriptionItems : [...(aid?.prescriptionItems || [])];
                                  const newItems = [...currentItems];
                                  newItems[idx] = { ...newItems[idx], dispensedQuantity: (newItems[idx].dispensedQuantity || 0) + 1 };
                                  setDeliveryDetails({ ...deliveryDetails, prescriptionItems: newItems });
                                }}
                                className="p-1 hover:bg-amber-100 rounded text-amber-600"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button 
                          type="button"
                          onClick={() => {
                             const emptiedItems = (aid?.prescriptionItems || []).map(p => ({ ...p, dispensedQuantity: 0 }));
                             setDeliveryDetails({ ...deliveryDetails, prescriptionItems: emptiedItems });
                          }}
                          className="w-full text-center text-[10px] font-black text-rose-600 hover:text-rose-700 mt-2 flex items-center justify-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> تفريغ الروشتة (تصفير الكميات)
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 font-bold flex items-center gap-2 mt-6">
                  <input 
                    type="checkbox"
                    id="diseaseConfirmed"
                    className="w-5 h-5 accent-emerald-600"
                    checked={deliveryDetails.isDiseaseConfirmed}
                    onChange={e => setDeliveryDetails({ ...deliveryDetails, isDiseaseConfirmed: e.target.checked })}
                  />
                  <label htmlFor="diseaseConfirmed" className="text-xs text-gray-700 cursor-pointer">تأكيد الحالة المرضية</label>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 mr-2">تاريخ التسليم</label>
                  <input 
                    type="date"
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                    value={deliveryDetails.date}
                    onChange={e => setDeliveryDetails({ ...deliveryDetails, date: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 mr-2">طريقة التسليم</label>
                  <select 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                    value={deliveryDetails.deliveryMethod}
                    onChange={e => setDeliveryDetails({ ...deliveryDetails, deliveryMethod: e.target.value as any })}
                  >
                    <option value="pickup">استلام من الفرع</option>
                    <option value="delivery">شحن للمنزل</option>
                    <option value="office">بمقر الجمعية</option>
                    <option value="hospital">بالمستشفى</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 mr-2">جهة التسليم</label>
                  <input 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                    placeholder="مقر الجمعية، المنزل..."
                    value={deliveryDetails.deliveryDestination}
                    onChange={e => setDeliveryDetails({ ...deliveryDetails, deliveryDestination: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 mr-2">مسلم الخدمة</label>
                  <input 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                    placeholder="اسم المندوب"
                    value={deliveryDetails.deliveredBy}
                    onChange={e => setDeliveryDetails({ ...deliveryDetails, deliveredBy: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 mr-2">مستلم الخدمة</label>
                  <input 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                    placeholder="اسم المستلم"
                    value={deliveryDetails.recipientSignatureName}
                    onChange={e => setDeliveryDetails({ ...deliveryDetails, recipientSignatureName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 mr-2">عدد التسليمات / الوحدات</label>
                  <input 
                    type="number"
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                    value={deliveryDetails.deliveryQuantity}
                    onChange={e => setDeliveryDetails({ ...deliveryDetails, deliveryQuantity: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 mr-2">التكلفة الفعلية</label>
                  <input 
                    type="number"
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                    value={deliveryDetails.actualCost}
                    onChange={e => setDeliveryDetails({ ...deliveryDetails, actualCost: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 mr-2">مستند استلام (رابط)</label>
                  <input 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold placeholder:text-[10px]"
                    placeholder="رابط الصورة أو الرقم"
                    value={deliveryDetails.receiptUrl}
                    onChange={e => setDeliveryDetails({ ...deliveryDetails, receiptUrl: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 mr-2">ملاحظات إضافية</label>
                <textarea 
                  className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                  rows={2}
                  placeholder="أي ملاحظات تخص عملية التسليم"
                  value={deliveryDetails.details}
                  onChange={e => setDeliveryDetails({ ...deliveryDetails, details: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                 <button 
                   onClick={() => {
                     updateAidStatus(deliveryAidDialog.memberId, deliveryAidDialog.aidId, 'delivered', deliveryDetails);
                     setDeliveryAidDialog(null);
                   }}
                  className="flex-1 bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all font-sans"
                 >إتمام التسليم النهائي</button>
                 <button 
                   onClick={() => setDeliveryAidDialog(null)}
                   className="px-6 py-4 rounded-2xl font-black text-gray-400 hover:bg-gray-100 transition-all"
                 >إلغاء</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {isAddingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsAddingMember(false)} />
          <div className="bg-white rounded-[40px] w-full max-w-2xl relative z-10 p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-black mb-8 flex items-center gap-3">
              <UserPlus className="w-8 h-8 text-emerald-600" />
              إضافة فرد جديد للملف
            </h3>
            <form onSubmit={handleAddMember} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">كود العضو (تلقائي)</label>
                  <input 
                    disabled
                    className="w-full bg-gray-100 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-black text-emerald-600"
                    value={newMember.memberCode}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الرقم القومي (١٤ رقم)</label>
                  <input 
                    placeholder="29901010..." required maxLength={14}
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all font-bold"
                    value={newMember.nationalId}
                    onChange={e => setNewMember({...newMember, nationalId: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <input 
                  placeholder="الاسم الكامل للفرد" required
                  className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all font-bold"
                  value={newMember.name}
                  onChange={e => setNewMember({...newMember, name: e.target.value})}
                />
                <div className="flex bg-gray-50 p-1 rounded-2xl border-2 border-transparent">
                  <button
                    type="button"
                    onClick={() => setNewMember({ ...newMember, gender: 'male' })}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-bold transition-all",
                      newMember.gender === 'male' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400"
                    )}
                  >ذكر</button>
                  <button
                    type="button"
                    onClick={() => setNewMember({ ...newMember, gender: 'female' })}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-bold transition-all",
                      newMember.gender === 'female' ? "bg-white text-pink-600 shadow-sm" : "text-gray-400"
                    )}
                  >أنثى</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">صلة القرابة</label>
                   <select 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newMember.relation}
                    onChange={e => setNewMember({...newMember, relation: e.target.value as Relation})}
                  >
                    <option value={Relation.HUSBAND}>زوج / أب</option>
                    <option value={Relation.WIFE}>زوجة / أم</option>
                    <option value={Relation.SON}>ابن</option>
                    <option value={Relation.DAUGHTER}>ابنة</option>
                    <option value={Relation.OTHER}>أخر</option>
                  </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ الميلاد</label>
                   <input 
                    type="date" required
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold text-gray-500"
                    value={newMember.birthDate}
                    onChange={e => setNewMember({...newMember, birthDate: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الجنسية</label>
                   <select 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newMember.nationality}
                    onChange={e => setNewMember({...newMember, nationality: e.target.value})}
                  >
                    <option value="مصري">مصري</option>
                    {lookups.filter(l => l.type === 'nationality').map(n => <option key={n.id} value={n.name}>{n.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المستوى التعليمي</label>
                   <select 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newMember.educationLevel}
                    onChange={e => setNewMember({...newMember, educationLevel: e.target.value as EducationLevel})}
                  >
                    <option value={EducationLevel.NONE}>بدون تعليم</option>
                    <option value={EducationLevel.PRIMARY}>ابتدائي</option>
                    <option value={EducationLevel.PREPARATORY}>إعدادي</option>
                    <option value={EducationLevel.SECONDARY}>ثانوي</option>
                    <option value={EducationLevel.UNIVERSITY}>جامعي</option>
                    {educationLevels.map(lvl => (
                      <option key={lvl.id} value={lvl.name}>{lvl.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الوظيفة / المهنة</label>
                   <select 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newMember.employmentStatus}
                    onChange={e => setNewMember({...newMember, employmentStatus: e.target.value})}
                  >
                    <option value="unemployed">عاطل (بدون عمل)</option>
                    <option value="student">طالب</option>
                    <option value="retired">معاش</option>
                    {jobTitles.map(job => (
                      <option key={job.id} value={job.name}>{job.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الدخل الشخصي (إن وجد)</label>
                   <input 
                    type="number"
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newMember.monthlyIncome}
                    onChange={e => setNewMember({...newMember, monthlyIncome: Number(e.target.value)})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الحالة الصحية العامة</label>
                   <select 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newMember.healthCondition}
                    onChange={e => setNewMember({...newMember, healthCondition: e.target.value as HealthStatus, isHealthy: e.target.value === HealthStatus.HEALTHY})}
                  >
                    <option value={HealthStatus.HEALTHY}>سليم (لا يوجد أمراض)</option>
                    <option value={HealthStatus.CHRONIC_ILLNESS}>مرض مزمن</option>
                    <option value={HealthStatus.TEMPORARY_ILLNESS}>مرض عارض (مؤقت)</option>
                    <option value={HealthStatus.DISABILITY}>إعاقة (جسدية / ذهنية)</option>
                  </select>
                </div>
                {newMember.healthCondition !== HealthStatus.HEALTHY && (
                  <div className="space-y-2 animate-in slide-in-from-top-4">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">نوع المرض / الإعاقة</label>
                    <select 
                      className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                      value={newMember.disease}
                      onChange={e => setNewMember({...newMember, disease: e.target.value})}
                    >
                      <option value="">اختر المرض...</option>
                      {lookups.filter(l => l.type === 'disease').map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                      <option value="other">أخرى</option>
                    </select>
                  </div>
                )}
              </div>

              {newMember.healthCondition !== HealthStatus.HEALTHY && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تفاصيل إضافية عن المرض</label>
                    <textarea 
                      placeholder="اكتب تفاصيل المرض أو العلاج المتكرر..."
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-6 py-4 outline-none font-bold"
                      rows={2}
                      value={newMember.diseaseDetails}
                      onChange={e => setNewMember({...newMember, diseaseDetails: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">ملاحظات الحالة الصحية</label>
                    <textarea 
                      placeholder="ملاحظات الباحث عن الحالة الصحية..."
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-6 py-4 outline-none font-bold"
                      rows={2}
                      value={newMember.healthNotes}
                      onChange={e => setNewMember({...newMember, healthNotes: e.target.value})}
                    />
                  </div>
                </div>
              )}

              <button className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200">
                تسجيل العضو في الملف
              </button>
            </form>
          </div>
        </div>
      )}

      {isEditingTechnical && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsEditingTechnical(false)} />
          <div className="bg-white rounded-[40px] w-full max-w-4xl relative z-10 p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-black mb-8 flex items-center gap-3 text-emerald-700">
              <ClipboardCheck className="w-8 h-8" />
              تحديث بيانات البحث الاجتماعي
            </h3>
            <form onSubmit={handleSaveTechnical} className="space-y-8">
              {/* General Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">الحالة الاجتماعية</label>
                  <input 
                    placeholder="مثل: أرملة، مطلقة، عائل مريض..."
                    className="w-full bg-white border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold shadow-sm"
                    value={technicalStudy.socialStatus}
                    onChange={e => setTechnicalStudy({...technicalStudy, socialStatus: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">عدد الأفراد المُعالين</label>
                  <input 
                    type="number"
                    className="w-full bg-white border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold shadow-sm"
                    value={technicalStudy.numberOfDependents}
                    onChange={e => setTechnicalStudy({...technicalStudy, numberOfDependents: Number(e.target.value)})}
                  />
                </div>
              </div>

              {/* Detailed Expenses */}
              <div className="bg-blue-50/30 p-6 rounded-3xl border border-blue-100 space-y-4">
                <h4 className="font-black text-blue-900 border-b border-blue-100 pb-2 flex items-center gap-2">
                  <Receipt className="w-5 h-5" /> المصاريف الشهرية التفصيلية
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { key: 'housing', label: 'سكن' },
                    { key: 'food', label: 'طعام' },
                    { key: 'health', label: 'صحة' },
                    { key: 'education', label: 'تعليم' },
                    { key: 'other', label: 'أخرى' }
                  ].map(expense => (
                    <div key={expense.key} className="space-y-2">
                      <label className="text-[10px] font-black text-blue-400 uppercase">{expense.label}</label>
                      <input 
                        type="number"
                        className="w-full bg-white border border-blue-100 rounded-xl px-4 py-2 outline-none font-bold text-sm"
                        value={(technicalStudy.expenses as any)[expense.key]}
                        onChange={e => {
                          const newVal = Number(e.target.value);
                          const newExpenses = { ...technicalStudy.expenses, [expense.key]: newVal };
                          const total = newExpenses.housing + newExpenses.food + newExpenses.health + newExpenses.education + newExpenses.other;
                          setTechnicalStudy({
                            ...technicalStudy,
                            expenses: { ...newExpenses, total },
                            socialResearch: { ...technicalStudy.socialResearch, totalExpenses: total }
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-blue-100 flex justify-between items-center">
                   <span className="text-sm font-black text-blue-900 tracking-widest uppercase">إجمالي المصروفات:</span>
                   <span className="text-xl font-black text-blue-600">{technicalStudy.expenses.total} ج.م</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Housing Condition */}
                <div className="space-y-6">
                  <h4 className="font-black text-gray-900 border-b pb-2">بيانات السكن</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase">نوع البناء</label>
                       <select 
                        className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                        value={technicalStudy.housingCondition.type}
                        onChange={e => setTechnicalStudy({
                          ...technicalStudy, 
                          housingCondition: {...technicalStudy.housingCondition, type: e.target.value as any}
                        })}
                      >
                        <option value="brick">طوب أحمر</option>
                        <option value="adobe">طوب لبن</option>
                        <option value="wood">خشب / صفيح</option>
                        <option value="other">أخرى</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase">عدد الغرف</label>
                       <input 
                        type="number"
                        className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                        value={technicalStudy.housingCondition.rooms}
                        onChange={e => setTechnicalStudy({
                          ...technicalStudy, 
                          housingCondition: {...technicalStudy.housingCondition, rooms: Number(e.target.value)}
                        })}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { key: 'hasWater', label: 'وصلة مياه' },
                      { key: 'hasElectricity', label: 'كهرباء' },
                      { key: 'hasFurniture', label: 'أساسيات أثاث' }
                    ].map(item => (
                      <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="checkbox"
                          className="w-5 h-5 rounded-lg border-2 border-emerald-200 text-emerald-600 focus:ring-emerald-500"
                          checked={(technicalStudy.housingCondition as any)[item.key]}
                          onChange={e => setTechnicalStudy({
                            ...technicalStudy, 
                            housingCondition: {...technicalStudy.housingCondition, [item.key]: e.target.checked}
                          })}
                        />
                        <span className="text-sm font-bold text-gray-600">{item.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-gray-400 uppercase">ملاحظات إضافية عن السكن</label>
                    <textarea 
                      placeholder="تحتاج سقف، محارة، توصيل مياه..."
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none font-bold"
                      value={technicalStudy.housingCondition.notes}
                      onChange={e => setTechnicalStudy({
                        ...technicalStudy, 
                        housingCondition: {...technicalStudy.housingCondition, notes: e.target.value}
                      })}
                    />
                  </div>
                </div>

                {/* Economic Study */}
                <div className="space-y-6">
                  <h4 className="font-black text-gray-900 border-b pb-2">الدراسة الاقتصادية</h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase">مصدر الدخل</label>
                       <input 
                        placeholder="عمالة يومية، معاش، الخ..."
                        className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold"
                        value={technicalStudy.socialResearch.incomeSource}
                        onChange={e => setTechnicalStudy({
                          ...technicalStudy, 
                          socialResearch: {...technicalStudy.socialResearch, incomeSource: e.target.value}
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase">إجمالي المصروفات الشهرية</label>
                       <input 
                        type="number"
                        className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-4 py-3 outline-none font-bold text-red-600"
                        value={technicalStudy.socialResearch.totalExpenses}
                        onChange={e => setTechnicalStudy({
                          ...technicalStudy, 
                          socialResearch: {...technicalStudy.socialResearch, totalExpenses: Number(e.target.value)}
                        })}
                      />
                    </div>
                  </div>
                </div>

                {/* Case Summary */}
                <div className="col-span-full space-y-4">
                  <h4 className="font-black text-gray-900 border-b pb-2">تفاصيل البحث الميداني</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase">ملخص الحالة (تقرير الباحث)</label>
                      <textarea 
                        rows={4}
                        placeholder="اشرح بالتفصيل وضع الأسرة وما تم رصده..."
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none font-bold"
                        value={technicalStudy.socialResearch.caseSummary}
                        onChange={e => setTechnicalStudy({
                          ...technicalStudy, 
                          socialResearch: {...technicalStudy.socialResearch, caseSummary: e.target.value}
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase">سبب الأولوية / التدخل</label>
                      <textarea 
                        rows={4}
                        placeholder="لماذا تحتاج هذه الأسرة لمساعدة عاجلة؟"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none font-bold"
                        value={technicalStudy.socialResearch.priorityReason}
                        onChange={e => setTechnicalStudy({
                          ...technicalStudy, 
                          socialResearch: {...technicalStudy.socialResearch, priorityReason: e.target.value}
                        })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  type="button" 
                  onClick={() => setIsEditingTechnical(false)}
                  className="flex-1 py-4 text-gray-400 font-bold hover:bg-gray-50 rounded-2xl transition-all"
                >
                  إلغاء التعديل
                </button>
                <button 
                  type="submit"
                  className="flex-[2] bg-emerald-600 text-white font-black py-5 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200"
                >
                  حفظ سجل الدراسة الفنية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddingVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsAddingVisit(false)} />
          <div className="bg-white rounded-[40px] w-full max-w-3xl relative z-10 p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-black mb-8 flex items-center gap-3">
              <ClipboardCheck className="w-8 h-8 text-emerald-600" />
              تقرير زيارة ميدانية جديدة
            </h3>
            <form onSubmit={handleAddVisit} className="space-y-6">
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ الزيارة</label>
                   <input 
                    type="date" required
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newVisit.visitDate}
                    onChange={e => setNewVisit({...newVisit, visitDate: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">نوع الزيارة</label>
                   <select 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newVisit.type}
                    onChange={e => setNewVisit({...newVisit, type: e.target.value as any})}
                  >
                    <option value="field_visit">ميدانية</option>
                    <option value="office">مقابلة مكتبية</option>
                    <option value="phone">مكالمة هاتفية</option>
                  </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الحالة</label>
                   <select 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newVisit.status}
                    onChange={e => setNewVisit({...newVisit, status: e.target.value as VisitStatus})}
                  >
                    <option value={VisitStatus.SCHEDULED}>مجدولة</option>
                    <option value={VisitStatus.COMPLETED}>مكتملة</option>
                    <option value={VisitStatus.CANCELED}>ملغاة</option>
                  </select>
                </div>
              </div>
              
              <input 
                placeholder="اسم الزائر / الفريق المناوب" required
                className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all font-bold"
                value={newVisit.visitorName}
                onChange={e => setNewVisit({...newVisit, visitorName: e.target.value})}
              />

              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">وصف عام ومطول للحالة</label>
                <textarea 
                  placeholder="وصف شامل لوضع الأسرة، العلاقات الاجتماعية، والظروف المعيشية ملاحظات الباحث..." required rows={3}
                  className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all font-bold"
                  value={newVisit.generalDescription}
                  onChange={e => setNewVisit({...newVisit, generalDescription: e.target.value})}
                />
              </div>

              {/* itemized finances */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-blue-50/20 p-6 rounded-3xl border border-blue-100">
                <div className="space-y-4">
                  <h4 className="text-sm font-black text-blue-900 flex items-center gap-2">
                    <Receipt className="w-4 h-4" /> بنود الدخل الشهرية
                  </h4>
                  <div className="space-y-3">
                    {newVisit.itemizedIncome.map((item, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input 
                          placeholder="المصدر" 
                          className="flex-1 bg-white border border-blue-100 rounded-xl px-3 py-2 text-xs font-bold"
                          value={item.source}
                          onChange={e => {
                            const updated = [...newVisit.itemizedIncome];
                            updated[idx].source = e.target.value;
                            setNewVisit({ ...newVisit, itemizedIncome: updated });
                          }}
                        />
                        <input 
                          type="number" placeholder="المبلغ"
                          className="w-24 bg-white border border-blue-100 rounded-xl px-3 py-2 text-xs font-bold"
                          value={item.amount}
                          onChange={e => {
                            const updated = [...newVisit.itemizedIncome];
                            updated[idx].amount = Number(e.target.value);
                            setNewVisit({ ...newVisit, itemizedIncome: updated });
                          }}
                        />
                      </div>
                    ))}
                    <button 
                      type="button"
                      onClick={() => setNewVisit({ ...newVisit, itemizedIncome: [...newVisit.itemizedIncome, { source: '', amount: 0 }] })}
                      className="text-[10px] font-black text-blue-600 bg-white border border-blue-100 px-3 py-1.5 rounded-lg"
                    >+ إضافة بند دخل</button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-black text-red-900 flex items-center gap-2">
                    <Receipt className="w-4 h-4" /> بنود الصرف الشهرية
                  </h4>
                  <div className="space-y-3">
                    {newVisit.itemizedExpenses.map((item, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input 
                          placeholder="البند" 
                          className="flex-1 bg-white border border-red-100 rounded-xl px-3 py-2 text-xs font-bold"
                          value={item.category}
                          onChange={e => {
                            const updated = [...newVisit.itemizedExpenses];
                            updated[idx].category = e.target.value;
                            setNewVisit({ ...newVisit, itemizedExpenses: updated });
                          }}
                        />
                        <input 
                          type="number" placeholder="المبلغ"
                          className="w-24 bg-white border border-red-100 rounded-xl px-3 py-2 text-xs font-bold"
                          value={item.amount}
                          onChange={e => {
                            const updated = [...newVisit.itemizedExpenses];
                            updated[idx].amount = Number(e.target.value);
                            setNewVisit({ ...newVisit, itemizedExpenses: updated });
                          }}
                        />
                      </div>
                    ))}
                    <button 
                      type="button"
                      onClick={() => setNewVisit({ ...newVisit, itemizedExpenses: [...newVisit.itemizedExpenses, { category: '', amount: 0 }] })}
                      className="text-[10px] font-black text-red-600 bg-white border border-red-100 px-3 py-1.5 rounded-lg"
                    >+ إضافة بند صرف</button>
                  </div>
                </div>
              </div>

              {/* housing detail */}
              <div className="bg-emerald-50/20 p-6 rounded-3xl border border-emerald-100 space-y-6">
                <div className="flex items-center justify-between">
                   <h4 className="text-sm font-black text-emerald-900 flex items-center gap-2">
                     <Home className="w-4 h-4" /> بيانات السكن والدراسة الفنية
                   </h4>
                   <div className="flex gap-2">
                      {['brick', 'adobe', 'wood', 'other'].map(t => (
                        <button 
                          key={t} type="button"
                          onClick={() => setNewVisit({ ...newVisit, housingDetails: { ...newVisit.housingDetails, type: t as any } })}
                          className={cn(
                            "px-3 py-1 rounded-lg text-[9px] font-black transition-all border",
                            newVisit.housingDetails.type === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-400 border-gray-100"
                          )}
                        >
                          {t === 'brick' ? 'طوب' : t === 'adobe' ? 'لبن' : t === 'wood' ? 'خشب' : 'أخرى'}
                        </button>
                      ))}
                   </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                   <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase">عدد الغرف</label>
                      <input 
                        type="number"
                        className="w-full bg-white border border-emerald-100 rounded-xl px-3 py-2 text-xs font-bold"
                        value={newVisit.housingDetails.roomsCount}
                        onChange={e => setNewVisit({ ...newVisit, housingDetails: { ...newVisit.housingDetails, roomsCount: Number(e.target.value) } })}
                      />
                   </div>
                   {([
                     { key: 'hasWater', label: 'مياه' },
                     { key: 'hasElectricity', label: 'كهرباء' },
                     { key: 'hasFurniture', label: 'أثاث' }
                   ] as const).map(f => (
                     <button 
                       key={f.key} type="button"
                       onClick={() => setNewVisit({ ...newVisit, housingDetails: { ...newVisit.housingDetails, [f.key]: !newVisit.housingDetails[f.key] } })}
                       className={cn(
                         "flex items-center justify-center gap-2 rounded-xl border-2 transition-all py-2",
                         newVisit.housingDetails[f.key] ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-50 text-gray-300"
                       )}
                     >
                       <CheckCircle2 className="w-3 h-3" />
                       <span className="text-[10px] font-black">{f.label}</span>
                     </button>
                   ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-emerald-600 uppercase">محتويات المنزل (أثاث، فرش...)</label>
                    <textarea 
                      rows={2}
                      className="w-full bg-white border border-emerald-100 rounded-2xl px-4 py-3 text-xs font-bold"
                      value={newVisit.housingDetails.contents}
                      onChange={e => setNewVisit({ ...newVisit, housingDetails: { ...newVisit.housingDetails, contents: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-emerald-600 uppercase">الأجهزة الكهربائية</label>
                    <textarea 
                      rows={2}
                      className="w-full bg-white border border-emerald-100 rounded-2xl px-4 py-3 text-xs font-bold"
                      value={newVisit.housingDetails.appliances}
                      onChange={e => setNewVisit({ ...newVisit, housingDetails: { ...newVisit.housingDetails, appliances: e.target.value } })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-emerald-100 pt-6">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-emerald-600 uppercase">شبكات الدعم</label>
                      <input 
                        className="w-full bg-white border border-emerald-100 rounded-xl px-4 py-2 text-xs font-bold"
                        placeholder="أقارب، جيران..."
                        value={newVisit.socialSolidarity?.supportNetworks}
                        onChange={e => setNewVisit({ ...newVisit, socialSolidarity: { ...newVisit.socialSolidarity!, supportNetworks: e.target.value } })}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-emerald-600 uppercase">المساعدات المجتمعية</label>
                      <input 
                        className="w-full bg-white border border-emerald-100 rounded-xl px-4 py-2 text-xs font-bold"
                        placeholder="جمعيات، أهل خير..."
                        value={newVisit.socialSolidarity?.communityContributions}
                        onChange={e => setNewVisit({ ...newVisit, socialSolidarity: { ...newVisit.socialSolidarity!, communityContributions: e.target.value } })}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-emerald-600 uppercase">تأمين/معاش اجتماعي</label>
                      <input 
                        className="w-full bg-white border border-emerald-100 rounded-xl px-4 py-2 text-xs font-bold"
                        placeholder="تكافل وكرامة، معاش..."
                        value={newVisit.socialSolidarity?.socialSecurityBenefits}
                        onChange={e => setNewVisit({ ...newVisit, socialSolidarity: { ...newVisit.socialSolidarity!, socialSecurityBenefits: e.target.value } })}
                      />
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black text-emerald-600 uppercase">ملخص البحث الاجتماعي الفني</label>
                   <textarea 
                     rows={2}
                     className="w-full bg-white border border-emerald-100 rounded-2xl px-4 py-3 text-xs font-bold"
                     placeholder="رؤية الباحث للوضع المعيشي والاجتماعي الشامل..."
                     value={newVisit.socialResearch?.caseSummary}
                     onChange={e => setNewVisit({ ...newVisit, socialResearch: { ...newVisit.socialResearch!, caseSummary: e.target.value } })}
                   />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المشاهدات والنتائج الفنية</label>
                  <div className="space-y-2">
                    {newVisit.findings.map((f, i) => (
                      <div key={i} className="flex gap-2">
                        <input 
                          placeholder="اكتب نتيجة واحدة..." 
                          className="flex-1 bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-xl px-4 py-3 text-sm font-bold"
                          value={f}
                          onChange={e => {
                            const updated = [...newVisit.findings];
                            updated[i] = e.target.value;
                            setNewVisit({ ...newVisit, findings: updated });
                          }}
                        />
                        <button type="button" onClick={() => setNewVisit({ ...newVisit, findings: newVisit.findings.filter((_, idx) => idx !== i) })} className="text-red-500 p-2"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setNewVisit({ ...newVisit, findings: [...newVisit.findings, ''] })} className="text-[10px] font-black text-emerald-600 flex items-center gap-1 border border-emerald-100 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-all">+ إضافة نتيجة</button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest mr-2">توصيات المندوب</label>
                  <div className="space-y-2">
                    {newVisit.recommendations.map((r, i) => (
                      <div key={i} className="flex gap-2">
                        <input 
                          placeholder="اكتب توصية واحدة..." 
                          className="flex-1 bg-gray-50 border-2 border-transparent focus:border-blue-600/20 focus:bg-white rounded-xl px-4 py-3 text-sm font-bold"
                          value={r}
                          onChange={e => {
                            const updated = [...newVisit.recommendations];
                            updated[i] = e.target.value;
                            setNewVisit({ ...newVisit, recommendations: updated });
                          }}
                        />
                        <button type="button" onClick={() => setNewVisit({ ...newVisit, recommendations: newVisit.recommendations.filter((_, idx) => idx !== i) })} className="text-red-500 p-2"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setNewVisit({ ...newVisit, recommendations: [...newVisit.recommendations, ''] })} className="text-[10px] font-black text-blue-600 flex items-center gap-1 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-all">+ إضافة توصية</button>
                  </div>
                </div>
              </div>

              <button className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200">
                تسجيل تقرير الزيارة
              </button>
            </form>
          </div>
        </div>
      )}

      {isAddingAssistance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsAddingAssistance(false)} />
          <div className="bg-white rounded-[40px] w-full max-w-xl relative z-10 p-10 shadow-2xl overflow-hidden">
            <h3 className="text-2xl font-black mb-8 flex items-center gap-3">
              <Heart className="w-8 h-8 text-emerald-600" />
              تسجيل مساعدة جديدة
            </h3>
            <form onSubmit={handleAddAssistance} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">القيمة (ج.م)</label>
                   <input 
                    type="number" placeholder="0" required
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all font-bold"
                    value={newAssistance.amount}
                    onChange={e => setNewAssistance({...newAssistance, amount: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">نوع المساعدة</label>
                    <select 
                     className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                     value={newAssistance.type}
                     onChange={e => setNewAssistance({...newAssistance, type: e.target.value as any})}
                   >
                     <option value={AssistanceType.CASH}>عملية نقدية (راتب/مساعدة)</option>
                     <option value={AssistanceType.FOOD}>كرتونة مواد غذائية</option>
                     <option value={AssistanceType.MEDICAL}>علاج وأدوية</option>
                     <option value={AssistanceType.SEASONAL}>مساعدة موسمية (شنطة رمضان)</option>
                     {lookups.filter(l => l.type === 'assistance_type').map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                     <option value="other">أخرى</option>
                   </select>
                </div>
              </div>
               <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المستفيد الأساسي (فرد محدد)</label>
                   <select 
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newAssistance.targetMemberId}
                    onChange={e => setNewAssistance({...newAssistance, targetMemberId: e.target.value, assignedToMemberId: e.target.value})}
                  >
                    <option value="">كافة أفراد العائلة</option>
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.memberCode})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المسؤول عن التسليم</label>
                   <input 
                    placeholder="اسم الباحث أو المسؤول السلم"
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all font-bold"
                    value={newAssistance.assignedBy}
                    onChange={e => setNewAssistance({...newAssistance, assignedBy: e.target.value})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ التوزيع</label>
                   <input 
                    type="date" required
                    className="w-full bg-gray-50 border-2 border-transparent rounded-2xl px-6 py-4 outline-none font-bold"
                    value={newAssistance.distributionDate}
                    onChange={e => setNewAssistance({...newAssistance, distributionDate: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الوحدة</label>
                   <input 
                    placeholder="مثال: ج.م، كرتونة، جلسة"
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all font-bold"
                    value={newAssistance.unit}
                    onChange={e => setNewAssistance({...newAssistance, unit: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 p-4 bg-gray-50 rounded-3xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <input 
                    type="checkbox"
                    id="isDelivered"
                    className="w-5 h-5 rounded-lg border-2 border-emerald-200 text-emerald-600 focus:ring-emerald-500"
                    checked={newAssistance.isDelivered}
                    onChange={e => setNewAssistance({...newAssistance, isDelivered: e.target.checked})}
                  />
                  <label htmlFor="isDelivered" className="text-sm font-black text-gray-700 cursor-pointer">تم التسليم النهائي</label>
                </div>
                {newAssistance.isDelivered && (
                  <>
                    <div className="space-y-2 animate-in fade-in slide-in-from-right-2">
                      <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mr-2">تاريخ التسليم</label>
                      <input 
                        type="date" required
                        className="w-full bg-white border border-emerald-100 rounded-xl px-4 py-2 outline-none font-bold text-xs"
                        value={newAssistance.deliveryDate}
                        onChange={e => setNewAssistance({...newAssistance, deliveryDate: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2 mt-2">
                       <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mr-2">جهة التسليم</label>
                       <input 
                        placeholder="مكان التسليم"
                        className="w-full bg-white border border-emerald-100 rounded-xl px-4 py-2 outline-none font-bold text-xs"
                        value={newAssistance.deliveryDestination}
                        onChange={e => setNewAssistance({...newAssistance, deliveryDestination: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2 mt-2">
                       <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mr-2">الكمية المسلمة</label>
                       <input 
                        type="number"
                        className="w-full bg-white border border-emerald-100 rounded-xl px-4 py-2 outline-none font-bold text-xs"
                        value={newAssistance.deliveryQuantity}
                        onChange={e => setNewAssistance({...newAssistance, deliveryQuantity: Number(e.target.value)})}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">رابط إيصال الاستلام (اختياري)</label>
                 <input 
                  placeholder="رابط صورة الإيصال أو السند المالي"
                  className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all font-bold"
                  value={newAssistance.receiptUrl || ''}
                  onChange={e => setNewAssistance({...newAssistance, receiptUrl: e.target.value})}
                />
              </div>
              <textarea 
                placeholder="ملاحظات وتفاصيل إضافية عن المساعدة..." rows={3}
                className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all font-bold"
                value={newAssistance.notes}
                onChange={e => setNewAssistance({...newAssistance, notes: e.target.value})}
              />

              {(newAssistance.type === AssistanceType.MEDICAL || newAssistance.type.includes('طبي') || newAssistance.type.toLowerCase().includes('medical')) && (
                <div className="flex items-center gap-3 p-5 bg-rose-50/50 rounded-2xl border border-rose-100">
                  <input 
                    type="checkbox" 
                    id="createClaim" 
                    checked={newAssistance.createMedicalClaim}
                    onChange={e => setNewAssistance({...newAssistance, createMedicalClaim: e.target.checked})}
                    className="w-5 h-5 accent-rose-600 rounded cursor-pointer"
                  />
                  <label htmlFor="createClaim" className="text-xs font-black text-rose-700 cursor-pointer flex items-center gap-2">
                    <Stethoscope className="w-4 h-4" />
                    تحويل هذه المساعدة تلقائياً إلى مطالبة طبية في نظام المطالبات
                  </label>
                </div>
              )}

              <button className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100">
                إتمام تسجيل المساعدة
              </button>
            </form>
          </div>
        </div>
      )}
      {managingMemberAttachments && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setManagingMemberAttachments(null)} />
          <div className="bg-white rounded-[40px] w-full max-w-4xl relative z-10 p-10 shadow-2xl max-h-[90vh] overflow-y-auto ring-1 ring-black/5">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-black flex items-center gap-3 text-indigo-600">
                    <Paperclip className="w-8 h-8" />
                    الأوراق والمرفقات: {managingMemberAttachments.name}
                  </h3>
                  <p className="text-gray-400 font-bold mt-1">تفريغ وتحويل الأوراق الاجتماعية والطبية للأفراد</p>
                </div>
                <button 
                  onClick={() => setManagingMemberAttachments(null)}
                  className="text-gray-400 hover:text-gray-600 font-black p-2 hover:bg-gray-100 rounded-xl transition-all"
                >إغلاق</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Add New Attachment Form */}
                <div className="md:col-span-1 space-y-6">
                  <div className="bg-indigo-50/50 p-6 rounded-[32px] border border-indigo-100/50">
                    <h4 className="text-xs font-black text-indigo-900 mb-4 flex items-center gap-2 uppercase tracking-widest leading-none">
                      <Plus className="w-4 h-4" /> إضافة مستند جديد
                    </h4>
                    <form onSubmit={handleAddMemberAttachment} className="space-y-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-gray-400 uppercase mr-2.5">تصنيف الورقة / المستند</label>
                         <div className="grid grid-cols-3 gap-2">
                            <button 
                              type="button"
                              onClick={() => setNewMemberAttachment({ ...newMemberAttachment, category: 'social' })}
                              className={cn(
                                "py-3 rounded-xl text-[10px] font-black transition-all border",
                                newMemberAttachment.category === 'social' 
                                  ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" 
                                  : "bg-white text-gray-400 border-gray-100 hover:border-indigo-200"
                              )}
                            >أوراق اجتماعية</button>
                            <button 
                              type="button"
                              onClick={() => setNewMemberAttachment({ ...newMemberAttachment, category: 'medical' })}
                              className={cn(
                                "py-3 rounded-xl text-[10px] font-black transition-all border",
                                newMemberAttachment.category === 'medical' 
                                  ? "bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-100" 
                                  : "bg-white text-gray-400 border-gray-100 hover:border-rose-200"
                              )}
                            >أوراق طبية</button>
                            <button 
                              type="button"
                              onClick={() => setNewMemberAttachment({ ...newMemberAttachment, category: 'identity' })}
                              className={cn(
                                "py-3 rounded-xl text-[10px] font-black transition-all border",
                                newMemberAttachment.category === 'identity' 
                                  ? "bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-100" 
                                  : "bg-white text-gray-400 border-gray-100 hover:border-amber-200"
                              )}
                            >أوراق هوية</button>
                         </div>
                      </div>

                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-gray-400 uppercase mr-2.5">اسم المستند</label>
                         <input 
                           required
                           placeholder="مثال: فاتورة كهرباء، روشتة علاج..."
                           className="w-full bg-white border-2 border-transparent focus:border-indigo-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                           value={newMemberAttachment.name}
                           onChange={e => setNewMemberAttachment({ ...newMemberAttachment, name: e.target.value })}
                         />
                      </div>

                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-gray-400 uppercase mr-2.5">نوع الملف</label>
                         <select 
                           className="w-full bg-white border-2 border-transparent focus:border-indigo-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                           value={newMemberAttachment.type}
                           onChange={e => setNewMemberAttachment({ ...newMemberAttachment, type: e.target.value as any })}
                         >
                           <option value="pdf">PDF (مستند)</option>
                           <option value="image">Image (صورة)</option>
                           <option value="other">Other (أخرى)</option>
                         </select>
                      </div>

                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-gray-400 uppercase mr-2.5">اختيار الملف (رفع مباشر)</label>
                         <input 
                           type="file"
                           className="w-full bg-white border-2 border-dashed border-gray-200 hover:border-indigo-600/20 rounded-xl px-4 py-3 text-xs font-bold transition-all"
                           onChange={e => {
                             const file = e.target.files?.[0];
                             if (file) {
                               setNewMemberAttachment({ ...newMemberAttachment, file, name: newMemberAttachment.name || file.name.split('.')[0] });
                             }
                           }}
                         />
                      </div>

                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-gray-400 uppercase mr-2.5">رابط الملف (اختياري لو تم الرفع)</label>
                         <input 
                           placeholder="https://example.com/file.pdf"
                           className="w-full bg-white border-2 border-transparent focus:border-indigo-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                           value={newMemberAttachment.url}
                           onChange={e => setNewMemberAttachment({ ...newMemberAttachment, url: e.target.value })}
                         />
                      </div>

                      {newMemberAttachment.category === 'identity' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase mr-2.5">تاريخ الإصدار</label>
                            <input 
                              type="date"
                              className="w-full bg-white border-2 border-transparent focus:border-indigo-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                              value={newMemberAttachment.issueDate}
                              onChange={e => setNewMemberAttachment({ ...newMemberAttachment, issueDate: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase mr-2.5">تاريخ الانتهاء</label>
                            <input 
                              type="date"
                              className="w-full bg-white border-2 border-transparent focus:border-indigo-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                              value={newMemberAttachment.expiryDate}
                              onChange={e => setNewMemberAttachment({ ...newMemberAttachment, expiryDate: e.target.value })}
                            />
                          </div>
                        </div>
                      )}

                      <button 
                        type="submit"
                        disabled={isUploading || !newMemberAttachment.name || (!newMemberAttachment.url && !newMemberAttachment.file)}
                        className={cn(
                          "w-full font-black py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2",
                          isUploading ? "bg-gray-400 cursor-not-allowed" :
                          newMemberAttachment.category === 'social' 
                            ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100" 
                            : newMemberAttachment.category === 'medical'
                            ? "bg-rose-600 text-white hover:bg-rose-700 shadow-rose-100"
                            : "bg-amber-600 text-white hover:bg-amber-700 shadow-amber-100"
                        )}
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            جاري الرفع...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            إضافة للأرشيف الفردي
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Attachments List */}
                <div className="md:col-span-2 space-y-8">
                  {/* Filter and Sort UI */}
                  <div className="flex flex-col sm:flex-row gap-4 bg-gray-50 p-6 rounded-[32px] border border-gray-100">
                    <div className="relative flex-1">
                      <SearchIcon className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input 
                        className="w-full bg-white border border-gray-200 rounded-xl pr-10 pl-4 py-3 text-sm font-bold outline-none focus:border-indigo-600/20 transition-all"
                        placeholder="بحث في المرفقات..."
                        value={attachmentSearch}
                        onChange={e => setAttachmentSearch(e.target.value)}
                      />
                    </div>
                    <select 
                      className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-xs font-black outline-none focus:border-indigo-600/20 transition-all"
                      value={attachmentSort}
                      onChange={e => setAttachmentSort(e.target.value as any)}
                    >
                      <option value="date_desc">الأحدث أولاً</option>
                      <option value="date_asc">الأقدم أولاً</option>
                      <option value="name_asc">الاسم (أ-ي)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {(() => {
                      const getProcessed = (cat: string) => {
                        return (managingMemberAttachments.attachments || [])
                          .filter(a => a.category === cat)
                          .filter(a => a.name.toLowerCase().includes(attachmentSearch.toLowerCase()))
                          .sort((a, b) => {
                            if (attachmentSort === 'name_asc') return a.name.localeCompare(b.name);
                            const dateA = new Date(a.uploadedAt).getTime();
                            const dateB = new Date(b.uploadedAt).getTime();
                            return attachmentSort === 'date_asc' ? dateA - dateB : dateB - dateA;
                          });
                      };

                      const identityAttachments = getProcessed('identity');
                      const socialAttachments = getProcessed('social');
                      const medicalAttachments = getProcessed('medical');

                      return (
                        <>
                          {/* Identity Category */}
                          <div className="md:col-span-2 space-y-4">
                            <h4 className="text-[10px] font-black text-amber-900 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                              <ShieldCheck className="w-4 h-4" /> الأرشيف الثبوتي وأوراق الهوية ({identityAttachments.length})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {identityAttachments.length === 0 && (
                                <div className="md:col-span-2 bg-gray-50/50 rounded-2xl p-6 text-center text-[10px] font-bold text-gray-400 italic border-2 border-dashed border-gray-100">
                                  لا توجد أوراق هوية تطابق البحث.
                                </div>
                              )}
                              {identityAttachments.map((at) => (
                                <motion.div 
                                  key={at.url}
                                  layout
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  className="bg-white p-5 rounded-[32px] border border-amber-100/50 shadow-sm transition-all group hover:bg-amber-50/30 ring-1 ring-amber-50/50"
                                >
                                  <div className="flex items-start justify-between mb-4">
                                     <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 bg-amber-100/50 rounded-2xl flex items-center justify-center text-amber-600 shadow-sm border border-amber-200/20">
                                          {at.type === 'pdf' ? <FileText className="w-7 h-7" /> : <ShieldCheck className="w-7 h-7" />}
                                        </div>
                                        <div>
                                           <p className="text-sm font-black text-gray-900 leading-tight mb-1">{at.name}</p>
                                           <div className="flex items-center gap-2">
                                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-full uppercase">{at.type}</span>
                                              <span className="text-[10px] font-bold text-gray-400">{new Date(at.uploadedAt).toLocaleDateString('ar-EG')}</span>
                                           </div>
                                        </div>
                                     </div>
                                     <div className="flex items-center gap-2">
                                       <a 
                                         href={at.url} 
                                         target="_blank" 
                                         rel="noopener noreferrer"
                                         className="w-10 h-10 flex items-center justify-center text-amber-600 bg-amber-50 hover:bg-white rounded-xl shadow-sm transition-all active:scale-95"
                                         title="عرض"
                                       >
                                         <ExternalLink className="w-4 h-4" />
                                       </a>
                                       <button 
                                         onClick={() => handleRemoveMemberAttachment(managingMemberAttachments.attachments!.findIndex(a => a === at))}
                                         className="w-10 h-10 flex items-center justify-center text-rose-500 bg-rose-50/50 hover:bg-white rounded-xl shadow-sm transition-all active:scale-95"
                                         title="حذف"
                                       >
                                         <Trash2 className="w-4 h-4" />
                                       </button>
                                     </div>
                                  </div>
                                  {(at.issueDate || at.expiryDate) && (
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-amber-100/50 bg-gray-50/30 -mx-5 -mb-5 px-5 py-4 rounded-b-[32px]">
                                       {at.issueDate && (
                                         <div className="flex items-center gap-2">
                                            <Calendar className="w-3 h-3 text-gray-300" />
                                            <div>
                                               <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">الإصدار</p>
                                               <p className="text-[10px] font-bold text-gray-700 tabular-nums">{new Date(at.issueDate).toLocaleDateString('ar-EG')}</p>
                                            </div>
                                         </div>
                                       )}
                                       {at.expiryDate && (
                                         <div className="flex items-center gap-2">
                                            <Timer className="w-3 h-3 text-gray-300" />
                                            <div>
                                               <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">الانتهاء</p>
                                               <p className={cn(
                                                 "text-[10px] font-bold tabular-nums",
                                                 new Date(at.expiryDate) < new Date() ? "text-rose-600" : "text-emerald-600"
                                               )}>{new Date(at.expiryDate).toLocaleDateString('ar-EG')}</p>
                                            </div>
                                         </div>
                                       )}
                                    </div>
                                  )}
                                </motion.div>
                              ))}
                            </div>
                          </div>

                          {/* Social Category */}
                          <div className="space-y-6">
                            <h4 className="text-[10px] font-black text-indigo-900 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                              <Globe className="w-4 h-4" /> الأرشيف الاجتماعي ({socialAttachments.length})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <AnimatePresence>
                                {socialAttachments.length === 0 && (
                                  <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="md:col-span-2 bg-gray-50/50 rounded-[32px] p-8 text-center border-2 border-dashed border-gray-100"
                                  >
                                    <p className="text-xs font-black text-gray-400">لا توجد أوراق اجتماعية تطابق البحث.</p>
                                  </motion.div>
                                )}
                                {socialAttachments.map((at) => (
                                  <motion.div 
                                    key={at.url}
                                    layout
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="bg-white p-4 rounded-3xl border border-gray-100/80 shadow-sm flex items-center justify-between group hover:border-indigo-200 transition-all hover:shadow-md"
                                  >
                                    <div className="flex items-center gap-4">
                                       <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm font-cairo">
                                         {at.type === 'pdf' ? <FileText className="w-6 h-6" /> : <Paperclip className="w-6 h-6" />}
                                       </div>
                                       <div>
                                          <p className="text-xs font-black text-gray-900 leading-tight mb-1">{at.name}</p>
                                          <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[8px] font-black rounded-md uppercase">{at.type}</span>
                                            <span className="text-[10px] font-bold text-gray-400 tabular-nums">{new Date(at.uploadedAt).toLocaleDateString('ar-EG')}</span>
                                          </div>
                                       </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                       <a 
                                         href={at.url} 
                                         target="_blank" 
                                         rel="noopener noreferrer"
                                         className="w-9 h-9 flex items-center justify-center text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                                       >
                                         <ExternalLink className="w-4 h-4" />
                                       </a>
                                       <button 
                                         onClick={() => handleRemoveMemberAttachment(managingMemberAttachments.attachments!.findIndex(a => a === at))}
                                         className="w-9 h-9 flex items-center justify-center text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                                       >
                                         <Trash2 className="w-4 h-4" />
                                       </button>
                                    </div>
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                            </div>
                          </div>

                          {/* Medical Category */}
                          <div className="space-y-6">
                            <h4 className="text-[10px] font-black text-rose-900 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                              <Stethoscope className="w-4 h-4" /> الأرشيف الطبي ({medicalAttachments.length})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <AnimatePresence>
                                {medicalAttachments.length === 0 && (
                                  <motion.div 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="md:col-span-2 bg-gray-50/50 rounded-[32px] p-8 text-center border-2 border-dashed border-gray-100"
                                  >
                                    <p className="text-xs font-black text-gray-400">لا توجد أوراق طبية تطابق البحث.</p>
                                  </motion.div>
                                )}
                                {medicalAttachments.map((at) => (
                                  <motion.div 
                                    key={at.url}
                                    layout
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="bg-white p-4 rounded-3xl border border-gray-100/80 shadow-sm flex items-center justify-between group hover:border-rose-200 transition-all hover:shadow-md"
                                  >
                                    <div className="flex items-center gap-4">
                                       <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 shadow-sm font-cairo">
                                         {at.type === 'pdf' ? <FileText className="w-6 h-6" /> : <Paperclip className="w-6 h-6" />}
                                       </div>
                                       <div>
                                          <p className="text-xs font-black text-gray-900 leading-tight mb-1">{at.name}</p>
                                          <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 bg-rose-50 text-rose-700 text-[8px] font-black rounded-md uppercase">{at.type}</span>
                                            <span className="text-[10px] font-bold text-gray-400 tabular-nums">{new Date(at.uploadedAt).toLocaleDateString('ar-EG')}</span>
                                          </div>
                                       </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                       <a 
                                         href={at.url} 
                                         target="_blank" 
                                         rel="noopener noreferrer"
                                         className="w-9 h-9 flex items-center justify-center text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                                       >
                                         <ExternalLink className="w-4 h-4" />
                                       </a>
                                       <button 
                                         onClick={() => handleRemoveMemberAttachment(managingMemberAttachments.attachments!.findIndex(a => a === at))}
                                         className="w-9 h-9 flex items-center justify-center text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                                       >
                                         <Trash2 className="w-4 h-4" />
                                       </button>
                                    </div>
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
          </div>
        </div>
      )}

      {managingMemberAid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setManagingMemberAid(null)} />
          <div className="bg-white rounded-[40px] w-full max-w-4xl relative z-10 p-10 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black flex items-center gap-3 text-blue-600">
                <Heart className="w-8 h-8" />
                إدارة طلبات المساعدة: {managingMemberAid.name}
              </h3>
              <button 
                onClick={() => setManagingMemberAid(null)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >إغلاق</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* New Request Form */}
              <div className="md:col-span-1 space-y-6">
                <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                  <h4 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-600" /> طلب مساعدة جديد
                  </h4>
                  <form onSubmit={handleAddAidRequest} className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase">جهة التسليم / الفرع المفضل</label>
                       <select 
                         className="w-full bg-white border-2 border-transparent focus:border-emerald-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                         value={newAidRequest.deliveryLocationId}
                         onChange={e => setNewAidRequest({ ...newAidRequest, deliveryLocationId: e.target.value, type: '' })}
                       >
                         <option value="">كل الفروع (عام)</option>
                         {lookups.filter(l => l.type === 'delivery_location').map(loc => (
                           <option key={loc.id} value={loc.id}>{loc.name}</option>
                         ))}
                       </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase">الخدمة المطلوبة</label>
                      <select 
                        required
                        className="w-full bg-white border-2 border-transparent focus:border-emerald-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                        value={newAidRequest.type}
                        onChange={e => {
                          const s = services.find(sv => sv.name === e.target.value);
                          setNewAidRequest({ 
                            ...newAidRequest, 
                            type: e.target.value,
                            unitCost: s?.defaultUnitCost || 0
                          });
                        }}
                      >
                        <option value="">اختر الخدمة...</option>
                        {services
                          .filter(s => {
                            if (!newAidRequest.deliveryLocationId) return true;
                            const loc = lookups.find(l => l.id === newAidRequest.deliveryLocationId);
                            if (!loc?.serviceIds || loc.serviceIds.length === 0) return true;
                            return loc.serviceIds.includes(s.id);
                          })
                          .map(s => (
                            <option key={s.id} value={s.name}>{s.name} ({s.category})</option>
                          ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase">الموعد النهائي المتوقع (Due Date)</label>
                        <input 
                          type="date"
                          className="w-full bg-white border-2 border-transparent focus:border-emerald-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                          value={newAidRequest.dueDate}
                          onChange={e => setNewAidRequest({ ...newAidRequest, dueDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase">تاريخ البداية (المقرر)</label>
                        <input 
                          type="date" required
                          className="w-full bg-white border-2 border-transparent focus:border-emerald-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                          value={newAidRequest.startDate}
                          onChange={e => setNewAidRequest({ ...newAidRequest, startDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase">المدة (بالشهور)</label>
                        <input 
                          type="number" min="1" required
                          className="w-full bg-white border-2 border-transparent focus:border-emerald-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                          value={newAidRequest.durationMonths}
                          onChange={e => setNewAidRequest({ ...newAidRequest, durationMonths: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase flex justify-between">
                          تاريخ الانتهاء التلقائي 
                          <span className="text-emerald-600 text-[8px] font-black">يحسب بناءً على المدة</span>
                        </label>
                        <input 
                          type="date" readOnly
                          className="w-full bg-emerald-50/50 border-2 border-emerald-100/50 rounded-xl px-4 py-3 text-sm font-black text-emerald-800"
                          value={newAidRequest.endDate}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase">الكمية</label>
                        <input 
                          type="number" min="1" required
                          className="w-full bg-white border-2 border-transparent focus:border-emerald-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                          value={newAidRequest.quantity}
                          onChange={e => setNewAidRequest({ ...newAidRequest, quantity: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase">سعر الوحدة</label>
                        <input 
                          type="number" min="0" required
                          className="w-full bg-white border-2 border-transparent focus:border-emerald-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                          value={newAidRequest.unitCost}
                          onChange={e => setNewAidRequest({ ...newAidRequest, unitCost: Number(e.target.value) })}
                        />
                      </div>
                    </div>

                    {(newAidRequest.type.includes('طبي') || newAidRequest.type.toLowerCase().includes('medical')) && (
                      <div className="mt-6 p-6 bg-blue-50/50 rounded-3xl border border-blue-100/50 space-y-4">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                            <Receipt className="w-4 h-4" /> تفاصيل الروشتة / الأصناف
                          </h5>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <select 
                              className="flex-1 bg-white border border-blue-100 rounded-xl px-3 py-2 text-xs font-bold shadow-sm"
                              onChange={(e) => {
                                const item = storeItems.find(i => i.id === e.target.value);
                                if (item) {
                                  const exists = newAidRequest.prescriptionItems.find(p => p.itemId === item.id);
                                  if (!exists) {
                                    setNewAidRequest({
                                      ...newAidRequest,
                                      prescriptionItems: [
                                        ...newAidRequest.prescriptionItems,
                                        { itemId: item.id, itemName: item.name, requestedQuantity: 1, dispensedQuantity: 0, availableStock: item.quantity }
                                      ]
                                    });
                                  }
                                }
                                e.target.value = "";
                              }}
                            >
                              <option value="">إضافة صنف من المخزن...</option>
                              {storeItems.filter(i => i.category === 'medical' || i.category === 'أدوية' || i.category === 'مستلزمات طبية').map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.name} (المتاح: {item.quantity} {item.unit})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2">
                            {newAidRequest.prescriptionItems.map((pItem, idx) => (
                              <div key={idx} className="bg-white p-3 rounded-2xl border border-blue-50 flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                                    <Package className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-black text-gray-900">{pItem.itemName}</p>
                                    <p className="text-[9px] font-bold text-gray-400">متاح بالمخزن: {storeItems.find(s => s.id === pItem.itemId)?.quantity ?? pItem.availableStock ?? 0}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center bg-gray-50 rounded-xl px-2 py-1">
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        const items = [...newAidRequest.prescriptionItems];
                                        items[idx].requestedQuantity = Math.max(1, items[idx].requestedQuantity - 1);
                                        setNewAidRequest({ ...newAidRequest, prescriptionItems: items });
                                      }}
                                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <input 
                                      type="number"
                                      className="w-10 bg-transparent border-none text-center text-xs font-black focus:ring-0"
                                      value={pItem.requestedQuantity}
                                      onChange={(e) => {
                                        const items = [...newAidRequest.prescriptionItems];
                                        items[idx].requestedQuantity = Number(e.target.value);
                                        setNewAidRequest({ ...newAidRequest, prescriptionItems: items });
                                      }}
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        const items = [...newAidRequest.prescriptionItems];
                                        items[idx].requestedQuantity += 1;
                                        setNewAidRequest({ ...newAidRequest, prescriptionItems: items });
                                      }}
                                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      const items = newAidRequest.prescriptionItems.filter((_, i) => i !== idx);
                                      setNewAidRequest({ ...newAidRequest, prescriptionItems: items });
                                    }}
                                    className="p-2 text-gray-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase">بيانات المرض (إن وجد)</label>
                       <input 
                         placeholder="مثل: فشل كلوي، شلل..."
                         className="w-full bg-white border-2 border-transparent focus:border-emerald-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                         value={newAidRequest.illnessDetails}
                         onChange={e => setNewAidRequest({ ...newAidRequest, illnessDetails: e.target.value })}
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase">تفاصيل الاحتياج</label>
                       <textarea 
                         placeholder="مثل: احتياج لجهاز تنفس، كرسي متحرك..."
                         rows={2}
                         className="w-full bg-white border-2 border-transparent focus:border-emerald-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                         value={newAidRequest.needDetails}
                         onChange={e => setNewAidRequest({ ...newAidRequest, needDetails: e.target.value })}
                       />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase">ملاحظات إضافية</label>
                      <textarea 
                        rows={2}
                        className="w-full bg-white border-2 border-transparent focus:border-emerald-600/20 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
                        value={newAidRequest.notes}
                        onChange={e => setNewAidRequest({ ...newAidRequest, notes: e.target.value })}
                      />
                    </div>
                    <button className="w-full bg-emerald-600 text-white font-black py-4 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
                      إضافة الطلب
                    </button>
                  </form>
                </div>
              </div>

              {/* Aid Lifecycle Tracking */}
              <div className="md:col-span-2 space-y-6">
                <div className="space-y-4">
                  <h4 className="text-lg font-black text-gray-900">سجل الطلبات والمساعدات المخصصة</h4>
                  
                  {(!managingMemberAid.aidRequests || managingMemberAid.aidRequests.length === 0) && (
                    <div className="bg-gray-50 rounded-3xl p-12 text-center text-gray-400 italic">
                      لا توجد طلبات مساعدة مسجلة لهذا العضو بعد.
                    </div>
                  )}

                  <div className="space-y-6">
                    {[
                      { status: 'requested', label: 'طلبات معلقة بانتظار المراجعة والزيارة', color: 'amber' },
                      { status: 'visit_confirmed', label: 'طلبات مؤكدة ميدانياً بانتظار اللجنة', color: 'blue' },
                      { status: 'approved', label: 'طلبات معتمدة بانتظار التنفيذ', color: 'indigo' },
                      { status: 'delivering', label: 'جاري التنفيذ والتسليم', color: 'purple' },
                      { status: 'delivered', label: 'مساعدات تم تسليمها بنجاح', color: 'emerald' },
                      { status: 'rejected', label: 'طلبات مرفوضة', color: 'red' }
                    ].map(group => {
                      const groupRequests = (managingMemberAid.aidRequests || [])
                        .filter(r => r.status === group.status)
                        .sort((a, b) => b.requestDate.localeCompare(a.requestDate));
                      
                      if (groupRequests.length === 0) return null;

                      const isExpanded = expandedGroups[group.status];

                      return (
                        <div key={group.status} className="space-y-3">
                          <button 
                            type="button"
                            onClick={() => toggleGroup(group.status)}
                            className={cn(
                              "w-full flex items-center justify-between p-4 rounded-2xl border transition-all shadow-sm hover:shadow-md",
                              group.color === 'amber' ? "bg-amber-50/50 border-amber-100 text-amber-900" :
                              group.color === 'blue' ? "bg-blue-50/50 border-blue-100 text-blue-900" :
                              group.color === 'emerald' ? "bg-emerald-50/50 border-emerald-100 text-emerald-900" :
                              group.color === 'indigo' ? "bg-indigo-50/50 border-indigo-100 text-indigo-900" :
                              group.color === 'purple' ? "bg-purple-50/50 border-purple-100 text-purple-900" :
                              "bg-red-50/50 border-red-100 text-red-900"
                            )}
                          >
                            <span className="font-black text-sm">{group.label} ({groupRequests.length})</span>
                            {isExpanded ? <Plus className="w-4 h-4 rotate-45 transition-transform" /> : <Plus className="w-4 h-4 transition-transform" />}
                          </button>

                          {isExpanded && (
                            <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                              {groupRequests.map(aid => (
                                <div key={aid.id} className="p-6 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-md transition-all">
                                  <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-4">
                                      {(() => {
                                        const c = aid.status === 'requested' ? "bg-amber-50 text-amber-600" :
                                                aid.status === 'visit_confirmed' ? "bg-blue-50 text-blue-600" :
                                                aid.status === 'approved' ? "bg-indigo-50 text-indigo-600" :
                                                aid.status === 'delivering' ? "bg-purple-50 text-purple-600" :
                                                aid.status === 'delivered' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600";
                                        return (
                                          <div className={cn("p-3 rounded-2xl", c)}>
                                            <Heart className="w-5 h-5" />
                                          </div>
                                        );
                                      })()}
                                      <div>
                                        <div className="flex items-center gap-2 mb-1">
                                          <p className="text-lg font-black text-gray-900 leading-none">{aid.type || 'مساعدة بدون مسمى'}</p>
                                          {aid.committeeCode && (
                                            <span className="text-[9px] font-black text-white bg-indigo-600 px-1.5 py-0.5 rounded-full font-mono">
                                              {aid.committeeCode}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                          {aid.quantity} وحدات × {aid.unitCost} ج.م {aid.durationMonths && aid.durationMonths > 1 ? ` × ${aid.durationMonths} شهر ` : ''} = <span className="text-emerald-600">{aid.totalCost} ج.م</span>
                                        </p>
                                      </div>
                                    </div>
                                    <div className="text-left flex flex-col items-end gap-2">
                                       <div>
                                          <p className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">تاريخ الطلب</p>
                                          <p className="text-xs font-black text-gray-900">{aid.requestDate || '---'}</p>
                                       </div>
                                       {aid.dueDate && (
                                          <div className="bg-amber-50 px-3 py-1 rounded-lg border border-amber-100 flex flex-col items-end">
                                            <p className="text-[9px] font-black text-amber-600 uppercase leading-none mb-0.5">موعد التنفيذ المتوقع</p>
                                            <p className="text-[10px] font-black text-amber-900">{aid.dueDate}</p>
                                          </div>
                                       )}
                                    </div>
                                  </div>

                                  {(aid.illnessDetails || aid.needDetails) && (
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                      {aid.illnessDetails && (
                                        <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl">
                                          <p className="text-[10px] font-black text-gray-400 uppercase mb-1">بيانات المرض</p>
                                          <p className="text-sm text-gray-700 font-bold">{aid.illnessDetails}</p>
                                        </div>
                                      )}
                                      {aid.needDetails && (
                                        <div className="bg-gray-50 border border-gray-100 p-3 rounded-2xl">
                                          <p className="text-[10px] font-black text-gray-400 uppercase mb-1">تفاصيل الاحتياج</p>
                                          <p className="text-sm text-gray-700 font-bold">{aid.needDetails}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {aid.prescriptionItems && aid.prescriptionItems.length > 0 && (
                                    <div className="mt-2 mb-4 p-4 bg-blue-50/30 rounded-2xl border border-blue-100">
                                      <p className="text-[10px] font-black text-blue-600 uppercase mb-2">الأصناف المصروفة / الروشتة</p>
                                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {aid.prescriptionItems.map((p, i) => (
                                          <div key={i} className="bg-white p-2 rounded-xl text-[10px] font-bold border border-blue-50 flex justify-between">
                                            <span className="text-gray-900 truncate">{p.itemName}</span>
                                            <span className="text-blue-600 font-black ml-1">
                                              {p.dispensedQuantity > 0 ? p.dispensedQuantity : p.requestedQuantity}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {aid.startDate && (
                                     <div className="mb-4 bg-gray-50 border-2 border-dashed border-gray-100 p-4 rounded-2xl">
                                        <div className="flex justify-between items-center mb-2">
                                           <p className="text-[10px] font-black text-gray-400 uppercase">الجدول الزمني للخدمة</p>
                                           {aid.durationMonths && (
                                             <span className="text-[10px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                                               المدة: {aid.durationMonths} شهر
                                             </span>
                                           )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                           <div>
                                              <p className="text-[9px] font-bold text-gray-400 mb-0.5 tracking-tighter">تاريخ البدء</p>
                                              <p className="text-xs font-black text-gray-900">{aid.startDate}</p>
                                           </div>
                                           {aid.endDate && (
                                             <div className="text-left">
                                                <p className="text-[9px] font-bold text-gray-400 mb-0.5 tracking-tighter">تاريخ الانتهاء</p>
                                                <p className="text-xs font-black text-gray-900">{aid.endDate}</p>
                                             </div>
                                           )}
                                        </div>
                                     </div>
                                  )}

                                  {aid.notes && (
                                    <div className="mb-4 bg-amber-50/30 border border-amber-100 p-3 rounded-2xl">
                                      <p className="text-[10px] font-black text-amber-600 uppercase mb-1">ملاحظات إضافية</p>
                                      <p className="text-xs text-gray-600 font-bold italic">{aid.notes}</p>
                                    </div>
                                  )}

                                  {(aid.status === 'visit_confirmed' || aid.status === 'approved' || aid.status === 'delivering' || aid.status === 'delivered') && aid.processedDate && (
                                    <div className="mb-4 bg-blue-50/30 border border-blue-100 p-4 rounded-2xl flex justify-between items-center">
                                      <p className="text-[10px] font-black text-blue-600 uppercase">تاريخ الاعتماد والموافقة</p>
                                      <p className="text-xs text-blue-900 font-black">{aid.processedDate}</p>
                                    </div>
                                  )}

                                  {aid.status === 'delivered' && (
                                    <div className="mb-4 bg-emerald-50 border border-emerald-100 p-5 rounded-2xl space-y-3">
                                      <div className="flex justify-between items-center">
                                        <p className="text-[10px] font-black text-emerald-600 uppercase">تاريخ الاستلام النهائي</p>
                                        <p className="text-sm font-black text-emerald-900">{aid.deliveryDate}</p>
                                      </div>
                                      <div className="pt-3 border-t border-emerald-100">
                                        <p className="text-[10px] font-black text-emerald-600 uppercase mb-1 underline decoration-emerald-200">تفاصيل عملية التسليم</p>
                                        <p className="text-sm text-emerald-800 font-bold leading-relaxed">{aid.deliveryDetails}</p>
                                      </div>
                                    </div>
                                  )}

                                  {aid.status === 'rejected' && (
                                    <div className="mb-4 bg-red-50 border border-red-100 p-4 rounded-2xl">
                                      <p className="text-[10px] font-black text-red-600 uppercase mb-1">سبب الرفض والاعتذار</p>
                                      <p className="text-sm text-red-900 font-bold">{aid.rejectionReason}</p>
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-50">
                                    {aid.status === 'requested' && (
                                      <button 
                                        type="button"
                                        onClick={() => updateAidStatus(managingMemberAid.id, aid.id, 'visit_confirmed')}
                                        className="bg-amber-600 text-white font-black px-6 py-2.5 rounded-xl hover:bg-amber-700 transition-all text-xs shadow-md shadow-amber-50"
                                      >تأكيد الباحث</button>
                                    )}
                                    {aid.status === 'visit_confirmed' && (
                                      <button 
                                        type="button"
                                        onClick={() => updateAidStatus(managingMemberAid.id, aid.id, 'approved')}
                                        className="bg-blue-600 text-white font-black px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-all text-xs shadow-md shadow-blue-50"
                                      >اعتماد اللجنة</button>
                                    )}
                                    {['requested', 'visit_confirmed', 'approved'].includes(aid.status) && (
                                      <button 
                                        type="button"
                                        onClick={() => {
                                          const reason = prompt('سبب اعتذار اللجنة أو رفض الطلب؟');
                                          if (reason) updateAidStatus(managingMemberAid.id, aid.id, 'rejected', reason);
                                        }}
                                        className="bg-red-50 text-red-600 font-black px-6 py-2.5 rounded-xl hover:bg-red-100 transition-all text-xs"
                                      >رفض الطلب</button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
