import React, { useState, useEffect } from 'react';
import { collectionGroup, query, onSnapshot, where, orderBy, doc, updateDoc, collection, getDocs, getDoc, addDoc, deleteDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { Visit, VisitStatus, VisitType, Family, FamilyMember, EducationLevel, HealthStatus, Relation, AppUser, AppModule } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ClipboardCheck, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  CheckCircle2, 
  Clock, 
  XCircle,
  Home,
  Receipt,
  Users,
  Eye,
  Edit3,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  LayoutGrid,
  FileText,
  AlertCircle,
  Plus,
  Trash2,
  Stethoscope,
  GraduationCap,
  CircleCheck,
  UserPlus,
  Paperclip,
  FilePlus,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ar } from 'date-fns/locale';

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
  color?: 'emerald' | 'blue' | 'indigo' | 'orange' | 'gray';
}

function CollapsibleSection({ title, icon, children, defaultOpen = false, badge, color = 'emerald' }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const colors = {
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    orange: 'text-orange-600 bg-orange-50 border-orange-100',
    gray: 'text-gray-600 bg-gray-50 border-gray-200'
  };

  return (
    <div className="bg-white border border-gray-100 rounded-[32px] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-xl border", colors[color])}>
            {icon}
          </div>
          <div className="text-right">
            <h4 className="text-sm font-black text-gray-900">{title}</h4>
            {badge !== undefined && (
              <span className="text-[10px] font-bold text-gray-400">({badge})</span>
            )}
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", damping: 20 }}
          className="text-gray-400"
        >
          <ChevronRight className="w-5 h-5 -rotate-90" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
          >
            <div className="px-6 pb-6 pt-2 border-t border-gray-50">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function VisitsManagement({ userProfile, modules }: { userProfile: AppUser | null, modules: AppModule[] }) {
  const [visits, setVisits] = useState<(Visit & { familyName?: string; familyCode?: string; familyId: string })[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMember, setNewMember] = useState<Partial<FamilyMember>>({
    name: '',
    relation: Relation.SON,
    gender: 'male',
    educationLevel: EducationLevel.NONE,
    healthCondition: HealthStatus.HEALTHY,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<VisitStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<VisitType | 'all'>('all');
  const [selectedVisit, setSelectedVisit] = useState<(Visit & { familyName?: string; familyId: string }) | null>(null);
  const [selectedFamilyMembers, setSelectedFamilyMembers] = useState<FamilyMember[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingVisit, setIsAddingVisit] = useState(false);
  const [targetFamilyId, setTargetFamilyId] = useState('');
  const [newVisit, setNewVisit] = useState({
    visitDate: new Date().toISOString().split('T')[0],
    type: VisitType.FIELD,
    status: VisitStatus.SCHEDULED,
    visitorName: auth.currentUser?.displayName || auth.currentUser?.email || '',
    generalDescription: '',
    location: {
      latitude: 0,
      longitude: 0,
      address: ''
    },
    emergencyCaseId: '',
    socialResearch: {
      caseSummary: '',
      incomeSource: '',
      priorityReason: ''
    },
    housingDetails: {
      type: 'brick' as 'brick' | 'adobe' | 'wood' | 'other',
      roomsCount: 1,
      hasWater: true,
      hasElectricity: true,
      hasFurniture: true,
      conditionDescription: ''
    },
    itemizedIncome: [] as { source: string, amount: number }[],
    itemizedExpenses: [] as { category: string, amount: number }[],
    socialSolidarity: {
      supportNetworks: '',
      communityContributions: '',
      socialSecurityBenefits: ''
    },
    findings: [] as string[],
    recommendations: [] as string[]
  });
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [emergencyCases, setEmergencyCases] = useState<any[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedVisit) return;

    if (file.size > 800000) { // Slightly higher limit
      alert('حجم الملف كبير جداً (الأقصى 800 كيلوبايت للعرض التجريبي)');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const newAttachment = {
          name: file.name,
          url: base64,
          type: file.type,
          uploadedAt: new Date().toISOString()
        };

        const updatedAttachments = [...(selectedVisit.attachments || []), newAttachment];
        
        await updateDoc(doc(db, `families/${selectedVisit.familyId}/visits`, selectedVisit.id), {
          attachments: updatedAttachments
        });

        setSelectedVisit({ ...selectedVisit, attachments: updatedAttachments });
        setIsUploading(false);
      };
      reader.onerror = () => {
        alert('فشل في قراءة الملف');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Upload error:", err);
      setIsUploading(false);
    }
  };

  const removeAttachment = async (index: number) => {
    if (!selectedVisit || !selectedVisit.attachments) return;
    if (!window.confirm('هل أنت متأكد من حذف هذا الملف؟')) return;

    const updated = selectedVisit.attachments.filter((_, i) => i !== index);
    try {
      await updateDoc(doc(db, `families/${selectedVisit.familyId}/visits`, selectedVisit.id), {
        attachments: updated
      });
      setSelectedVisit({ ...selectedVisit, attachments: updated });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'visit_attachments');
    }
  };

  useEffect(() => {
    if (selectedVisit) {
      const fetchMembers = async () => {
        try {
          const snap = await getDocs(collection(db, `families/${selectedVisit.familyId}/members`));
          setSelectedFamilyMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as FamilyMember)));
        } catch (err) {
          console.error("Error fetching members:", err);
        }
      };
      fetchMembers();
    } else {
      setSelectedFamilyMembers([]);
    }
  }, [selectedVisit?.id, selectedVisit?.familyId]);

  useEffect(() => {
    // To resolve family names, we fetch families
    // In a large system we'd do this differently, but here we can cache them
    const fetchFamilies = async () => {
      try {
        const snap = await getDocs(collection(db, 'families'));
        const familyMap: Record<string, Family> = {};
        snap.docs.forEach(d => {
          familyMap[d.id] = { id: d.id, ...d.data() } as Family;
        });
        setFamilies(familyMap);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'families');
      }
    };

    fetchFamilies();

    // Fetch Emergency Cases for linking
    const unsubEmergenices = onSnapshot(collection(db, 'emergency_cases'), (snap) => {
      setEmergencyCases(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Use collection group for all visits
    const q = query(collectionGroup(db, 'visits'), orderBy('visitDate', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const visitData = snap.docs.map(d => {
        const data = d.data() as Visit;
        const familyId = d.ref.parent.parent?.id || '';
        return { 
          ...data, 
          id: d.id, 
          familyId 
        };
      });
      setVisits(visitData);
      setLoading(false);
    }, err => {
      console.error("Collection group 'visits' error:", err);
      // Fallback if collection group index isn't created yet or denied
      // In a real app we'd need that index.
      handleFirestoreError(err, OperationType.LIST, 'all_visits');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const stats = {
    total: visits.length,
    completed: visits.filter(v => v.status === VisitStatus.COMPLETED).length,
    scheduled: visits.filter(v => v.status === VisitStatus.SCHEDULED).length,
    canceled: visits.filter(v => v.status === VisitStatus.CANCELED).length,
  };

  const filteredVisits = visits.filter(visit => {
    const family = families[visit.familyId];
    const familyName = family?.name || '';
    const familyCode = family?.fileNumber || '';
    const matchesSearch = 
      familyName.includes(searchTerm) || 
      familyCode.includes(searchTerm) || 
      visit.visitorName?.includes(searchTerm) ||
      visit.visitCode?.includes(searchTerm);
    
    const matchesStatus = filterStatus === 'all' || visit.status === filterStatus;
    const matchesType = filterType === 'all' || visit.type === filterType;

    return matchesSearch && matchesStatus && matchesType;
  });

  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);

  const handleSelectVisit = (visit: Visit, family?: Family) => {
    const updatedVisit = { ...visit, familyName: family?.name || '---' };
    
    // Auto-populate missing fields from family record if they don't exist in the visit yet
    if (family) {
      if (!updatedVisit.socialSolidarity || (!updatedVisit.socialSolidarity.supportNetworks && !updatedVisit.socialSolidarity.communityContributions && !updatedVisit.socialSolidarity.socialSecurityBenefits)) {
        updatedVisit.socialSolidarity = {
          supportNetworks: family.socialSolidarity?.supportNetworks || '',
          communityContributions: family.socialSolidarity?.communityContributions || '',
          socialSecurityBenefits: family.socialSolidarity?.socialSecurityBenefits || ''
        };
      }
      
      if (!updatedVisit.housingDetails || !updatedVisit.housingDetails.conditionDescription) {
        updatedVisit.housingDetails = {
          ...updatedVisit.housingDetails,
          roomsCount: updatedVisit.housingDetails?.roomsCount || family.housingCondition?.rooms || 0,
          hasWater: updatedVisit.housingDetails?.hasWater ?? family.housingCondition?.hasWater ?? false,
          hasElectricity: updatedVisit.housingDetails?.hasElectricity ?? family.housingCondition?.hasElectricity ?? false,
          hasFurniture: updatedVisit.housingDetails?.hasFurniture ?? family.housingCondition?.hasFurniture ?? false,
          conditionDescription: updatedVisit.housingDetails?.conditionDescription || family.housingCondition?.notes || '',
          type: updatedVisit.housingDetails?.type || family.housingCondition?.type || 'brick'
        } as any;
      }

      if (!updatedVisit.socialResearch || !updatedVisit.socialResearch.caseSummary) {
        updatedVisit.socialResearch = {
          caseSummary: updatedVisit.socialResearch?.caseSummary || family.socialResearch?.caseSummary || '',
          incomeSource: updatedVisit.socialResearch?.incomeSource || family.socialResearch?.incomeSource || '',
          priorityReason: updatedVisit.socialResearch?.priorityReason || family.socialResearch?.priorityReason || ''
        };
      }
    }

    setSelectedVisit(updatedVisit as any);
  };

  const handleUpdateStatus = async (visitId: string, familyId: string, newStatus: VisitStatus) => {
    try {
      const visitRef = doc(db, `families/${familyId}/visits`, visitId);
      const visitSnap = await getDoc(visitRef);
      const visitData = visitSnap.data() as Visit;

      let reasonForCancellation = '';
      if (newStatus === VisitStatus.CANCELED) {
        const reason = window.prompt('يرجى إدخال سبب إلغاء الزيارة:');
        if (reason === null) return; // User canceled the prompt
        reasonForCancellation = reason || 'لم يذكر سبب';
      }

      await updateDoc(visitRef, {
        status: newStatus,
        reasonForCancellation: reasonForCancellation || null,
        updatedAt: new Date().toISOString()
      });

      // Completion Logic
      if (newStatus === VisitStatus.COMPLETED) {
        // 1. Update family's lastVisitDate
        const familyUpdate: any = {
          lastVisitDate: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString()
        };

        // Mapping visit data to technical study fields
        if (visitData.housingDetails) {
          familyUpdate.housingCondition = {
            type: visitData.housingDetails.type || 'brick',
            rooms: visitData.housingDetails.roomsCount || 0,
            hasWater: visitData.housingDetails.hasWater || false,
            hasElectricity: visitData.housingDetails.hasElectricity || false,
            hasFurniture: visitData.housingDetails.hasFurniture || false,
            notes: visitData.housingDetails.conditionDescription || ''
          };
          
          // Also track housingStatus (Owned/Rented) if available in some way
          // For now we use the condition and notes as the primary housing record
          // But we can map common types if requested
        }

        if (visitData.socialSolidarity) {
          familyUpdate.socialSolidarity = visitData.socialSolidarity;
        }

        if (visitData.socialResearch) {
          familyUpdate.socialResearch = visitData.socialResearch;
        }

        // Calculate total income and expenses if itemized ones exist
        if (visitData.itemizedIncome && visitData.itemizedIncome.length > 0) {
          familyUpdate.itemizedIncome = visitData.itemizedIncome;
          familyUpdate.monthlyIncome = visitData.itemizedIncome.reduce((acc, curr) => acc + (curr.amount || 0), 0);
        }

        if (visitData.itemizedExpenses && visitData.itemizedExpenses.length > 0) {
          const totalExp = visitData.itemizedExpenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);
          familyUpdate.itemizedExpenses = visitData.itemizedExpenses;
          familyUpdate.expenses = {
            total: totalExp,
            health: 0, education: 0, food: 0, housing: 0, other: totalExp // Simplified mapping
          };
        }

        // If we have selected members for this visit, update numberOfDependents
        if (selectedFamilyMembers.length > 0) {
          familyUpdate.numberOfDependents = selectedFamilyMembers.length;
        }

        await updateDoc(doc(db, 'families', familyId), familyUpdate);

        // 2b. Create History Snapshots
        const historySnapshots: any[] = [];

        if (visitData.housingDetails) {
          historySnapshots.push({
            timestamp: new Date().toISOString(),
            source: 'visit',
            sourceId: visitId,
            category: 'housing',
            data: visitData.housingDetails,
            changeSummary: `تحديث بيانات السكن والتجهيزات بناءً على الزيارة الميدانية (${visitData.visitCode || '---'})`
          });
        }

        if (visitData.socialResearch) {
          historySnapshots.push({
            timestamp: new Date().toISOString(),
            source: 'visit',
            sourceId: visitId,
            category: 'social',
            data: visitData.socialResearch,
            changeSummary: `تحديث البحث الاجتماعي والحالة العامة للأسرة بناءً على الزيارة الميدانية`
          });
        }

        if (selectedFamilyMembers.length > 0) {
          historySnapshots.push({
            timestamp: new Date().toISOString(),
            source: 'visit',
            sourceId: visitId,
            category: 'social',
            data: { numberOfDependents: selectedFamilyMembers.length },
            changeSummary: `تحديث إجمالي عدد أفراد الأسرة إلى (${selectedFamilyMembers.length}) فرداً بناءً على البحث الميداني`
          });
        }

        for (const snap of historySnapshots) {
          await addDoc(collection(db, `families/${familyId}/history`), {
            ...snap,
            createdAt: serverTimestamp()
          });
        }

        // Add comment to emergency case if linked
        if ((visitData as any).emergencyCaseId) {
          try {
            const caseRef = doc(db, 'emergency_cases', (visitData as any).emergencyCaseId);
            await updateDoc(caseRef, {
              comments: arrayUnion({
                text: `تم إكمال الزيارة الميدانية المرتبطة (${visitData.visitCode}) بنجاح.`,
                user: auth.currentUser?.displayName || auth.currentUser?.email || 'نظام الزيارات',
                date: new Date().toISOString()
              }),
              updatedAt: serverTimestamp()
            });
          } catch (e) {
            console.error("Error adding comment to emergency case:", e);
          }
        }

        // 3. Prompt or automatically handle emergency case creation if findings indicate it
        const findings = Array.isArray(visitData.findings) ? visitData.findings.join(' ') : (visitData.findings || '');
        if (findings.includes('طوارئ') || findings.toLowerCase().includes('emergency')) {
          await addDoc(collection(db, 'emergency_cases'), {
            familyId,
            title: `حالة طارئة من زيارة بتاريخ ${visitData.visitDate}`,
            description: findings,
            status: 'open',
            priority: 'high',
            createdAt: new Date().toISOString(),
            date: visitData.visitDate
          });
          alert('تم إنشاء حالة طوارئ تلقائياً بناءً على نتائج الزيارة.');
        }

        const msg = `تم تحديث بيانات العائلة وتاريخ آخر زيارة بنجاح.
يرجى التأكد من تحديث عدد التابعين والحالة التعليمية في ملف العائلة إذا تغيرت خلال الزيارة.`;
        alert(msg);
      }

      if (selectedVisit && selectedVisit.id === visitId) {
        setSelectedVisit(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${familyId}/visits/${visitId}`);
    }
  };

  const handleDeleteVisit = async (visitId: string, familyId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذه العملية.')) return;
    try {
      await deleteDoc(doc(db, `families/${familyId}/visits`, visitId));
      setSelectedVisit(null);
      setIsEditing(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `families/${familyId}/visits/${visitId}`);
    }
  };

  // Auto-populate new visit fields from family data when selected
  useEffect(() => {
    if (targetFamilyId && families[targetFamilyId]) {
      const family = families[targetFamilyId];
      setNewVisit(prev => ({
        ...prev,
        location: {
          ...prev.location,
          address: family.address || ''
        },
        housingDetails: {
          ...prev.housingDetails,
          roomsCount: family.housingCondition?.rooms || 1,
          type: family.housingCondition?.type || 'brick',
          hasWater: family.housingCondition?.hasWater ?? true,
          hasElectricity: family.housingCondition?.hasElectricity ?? true,
          hasFurniture: family.housingCondition?.hasFurniture ?? true,
          conditionDescription: family.housingCondition?.notes || ''
        },
        socialSolidarity: {
          supportNetworks: family.socialSolidarity?.supportNetworks || '',
          communityContributions: family.socialSolidarity?.communityContributions || '',
          socialSecurityBenefits: family.socialSolidarity?.socialSecurityBenefits || ''
        },
        socialResearch: {
          caseSummary: family.socialResearch?.caseSummary || '',
          incomeSource: family.socialResearch?.incomeSource || '',
          priorityReason: family.socialResearch?.priorityReason || ''
        },
        itemizedIncome: family.monthlyIncome ? [{ source: 'دخل مسجل', amount: family.monthlyIncome }] : [],
        itemizedExpenses: family.expenses?.total ? [{ category: 'مصروفات مسجلة', amount: family.expenses.total }] : []
      }));
    }
  }, [targetFamilyId, families]);
  
  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetFamilyId) return;

    try {
      const family = families[targetFamilyId];
      if (!family) return;

      const visitsRef = collection(db, `families/${targetFamilyId}/visits`);
      const existingVisits = await getDocs(visitsRef);
      const vCode = `VST-${family.fileNumber}-${(existingVisits.size + 1).toString().padStart(3, '0')}`;

      await addDoc(visitsRef, {
        ...newVisit,
        visitCode: vCode,
        familyId: targetFamilyId,
        attachments: [],
        createdAt: new Date().toISOString()
      });

      setIsAddingVisit(false);
      setTargetFamilyId('');
      alert('تم إضافة الزيارة بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'visits');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisit || !newMember.name) return;

    try {
      const membersRef = collection(db, `families/${selectedVisit.familyId}/members`);
      await addDoc(membersRef, {
        ...newMember,
        createdAt: new Date().toISOString()
      });
      
      const snap = await getDocs(membersRef);
      setSelectedFamilyMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as FamilyMember)));
      
      setNewMember({
        name: '',
        relation: Relation.SON,
        gender: 'male',
        educationLevel: EducationLevel.NONE,
        healthCondition: HealthStatus.HEALTHY,
      });
      setIsAddingMember(false);
      alert('تم إضافة الفرد بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `families/${selectedVisit.familyId}/members`);
    }
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const handleSaveVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisit) return;

    try {
      // Destructure to remove UI-only fields and metadata from the document data
      const { id, familyId, familyName, ...rawVisitData } = selectedVisit as any;
      
      let finalReason = rawVisitData.reasonForCancellation || '';
      if (rawVisitData.status === VisitStatus.CANCELED && !finalReason) {
        const reason = window.prompt('يرجى إدخال سبب الإلغاء:');
        if (reason === null) return;
        finalReason = reason || 'غير محدد';
      }

      // Clean the data to ensure we are not sending anything extra or invalid
      const dataToSave = { 
        ...rawVisitData, 
        reasonForCancellation: finalReason || null,
        updatedAt: new Date().toISOString() 
      };

      await updateDoc(doc(db, `families/${familyId}/visits`, id), dataToSave);
      
      // If status changed to COMPLETED in the edit form, trigger the automation logic
      // (This updates the family record, creates history, etc.)
      if (dataToSave.status === VisitStatus.COMPLETED) {
        await handleUpdateStatus(id, familyId, VisitStatus.COMPLETED);
      }
      
      setIsEditing(false);
      alert('تم حفظ بيانات الزيارة بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `families/${selectedVisit.familyId}/visits/${selectedVisit.id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700" dir="rtl">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900">إدارة الزيارات الميدانية</h2>
          <p className="text-gray-400 font-bold mt-1 uppercase tracking-widest text-[10px]">متابعة وحصر الزيارات الاجتماعية والبحث الفني</p>
        </div>

        <div className="flex gap-2 bg-gray-100 p-1.5 rounded-2xl">
          <button 
            onClick={() => setViewMode('list')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2",
              viewMode === 'list' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
            قائمة
          </button>
          <button 
            onClick={() => setViewMode('calendar')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2",
              viewMode === 'calendar' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <CalendarDays className="w-4 h-4" />
            تقويم
          </button>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          {/* Enhanced Summary Stats */}
          {[
            { label: 'مكتملة', count: stats.completed, color: 'emerald', icon: <CheckCircle2 className="w-4 h-4" /> },
            { label: 'مجدولة', count: stats.scheduled, color: 'blue', icon: <Clock className="w-4 h-4" /> },
            { label: 'ملغاة', count: stats.canceled, color: 'red', icon: <XCircle className="w-4 h-4" /> }
          ].map((stat) => {
            const percentage = stats.total > 0 ? Math.round((stat.count / stats.total) * 100) : 0;
            return (
              <div key={stat.label} className={cn(
                "flex-1 min-w-[140px] p-4 rounded-[28px] border flex flex-col gap-1 relative overflow-hidden group",
                stat.color === 'emerald' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                stat.color === 'blue' ? "bg-blue-50 text-blue-700 border-blue-100" :
                "bg-red-50 text-red-700 border-red-100"
              )}>
                <div className="flex justify-between items-start z-10">
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-60 flex items-center gap-1">
                    {stat.icon} {stat.label}
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/50 border border-current shadow-sm">{percentage}%</span>
                </div>
                <span className="text-2xl font-black z-10">{stat.count}</span>
                <div className={cn(
                  "absolute bottom-0 right-0 w-16 h-16 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 -z-0 opacity-20",
                  stat.color === 'emerald' ? "bg-emerald-400" :
                  stat.color === 'blue' ? "bg-blue-400" :
                  "bg-red-400"
                )} />
              </div>
            );
          })}
          
          <div className="flex-1 min-w-[140px] bg-gray-900 text-white p-4 rounded-[28px] shadow-xl shadow-gray-200 flex flex-col gap-1 relative overflow-hidden">
            <span className="text-[10px] font-black opacity-60 uppercase tracking-widest flex items-center gap-1">
              <LayoutGrid className="w-4 h-4" /> الإجمالي
            </span>
            <span className="text-2xl font-black">{stats.total}</span>
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full blur-2xl -translate-y-1/4 translate-x-1/4" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'calendar' ? (
        <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">{format(currentMonth, 'MMMM yyyy', { locale: ar })}</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">عرض مواعيد الزيارات الميدانية</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={prevMonth}
                className="p-2 hover:bg-gray-50 rounded-xl transition-all"
              >
                <ChevronLeft className="w-6 h-6 rotate-180" />
              </button>
              <button 
                onClick={nextMonth}
                className="p-2 hover:bg-gray-50 rounded-xl transition-all"
              >
                <ChevronRight className="w-6 h-6 rotate-180" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 rounded-3xl overflow-hidden shadow-sm" dir="rtl">
            {['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(day => (
              <div key={day} className="bg-gray-50 p-4 text-center text-[10px] font-black text-gray-400 uppercase">
                {day}
              </div>
            ))}
            {(() => {
              const start = startOfWeek(startOfMonth(currentMonth));
              const end = endOfWeek(endOfMonth(currentMonth));
              const days = eachDayOfInterval({ start, end });

              return days.map(day => {
                const dayVisits = visits.filter(v => isSameDay(new Date(v.visitDate), day));
                const isCurrentMonth = isSameMonth(day, currentMonth);

                return (
                  <div 
                    key={day.toISOString()} 
                    className={cn(
                      "min-h-[140px] p-2 transition-all relative",
                      isCurrentMonth ? "bg-white" : "bg-gray-50/50 opacity-40",
                      dayVisits.length > 0 && isCurrentMonth && "bg-emerald-50/20 ring-1 ring-inset ring-emerald-100"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2 p-1">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "text-xs font-black",
                          isSameDay(day, new Date()) ? "w-6 h-6 flex items-center justify-center bg-emerald-600 text-white rounded-full" : "text-gray-400"
                        )}>
                          {format(day, 'd')}
                        </span>
                        {dayVisits.length > 0 && isCurrentMonth && (
                          <div className="w-1 h-1 rounded-full bg-emerald-500" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {dayVisits.map(visit => (
                        <button
                          key={visit.id}
                          onClick={() => {
                            const family = families[visit.familyId];
                            handleSelectVisit(visit, family);
                          }}
                          className={cn(
                            "w-full text-[9px] p-2 rounded-lg font-black text-right transition-all flex flex-col gap-0.5",
                            visit.status === VisitStatus.COMPLETED ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" :
                            visit.status === VisitStatus.CANCELED ? "bg-red-50 text-red-700 hover:bg-red-100" :
                            "bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-sm shadow-blue-50"
                          )}
                        >
                          <span className="truncate">{families[visit.familyId]?.name || 'غير معروف'}</span>
                          <span className="opacity-60 text-[8px]">
                            {visit.type === VisitType.FIELD ? 'ميدانية' : 
                             visit.type === VisitType.OFFICE ? 'مكتبية' : 
                             visit.type === VisitType.PHONE ? 'هاتفية' : 'تقييم'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[300px] relative">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                type="text"
                placeholder="بحث باسم العائلة، كود الملف، أو اسم الزائر..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-12 pl-4 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl">
                <Filter className="w-4 h-4 text-gray-400" />
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="bg-transparent border-none text-xs font-black focus:ring-0 cursor-pointer"
                >
                  <option value="all">كل الحالات</option>
                  <option value={VisitStatus.SCHEDULED}>مجدولة</option>
                  <option value={VisitStatus.COMPLETED}>مكتملة</option>
                  <option value={VisitStatus.CANCELED}>ملغاة</option>
                </select>
              </div>

              <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-xl">
                <CalendarDays className="w-4 h-4 text-gray-400" />
                <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="bg-transparent border-none text-xs font-black focus:ring-0 cursor-pointer"
                >
                  <option value="all">كل الأنواع</option>
                  <option value={VisitType.FIELD}>زيارة ميدانية</option>
                  <option value={VisitType.OFFICE}>زيارة مكتبية</option>
                  <option value={VisitType.PHONE}>مكالمة هاتفية</option>
                  <option value={VisitType.ASSESSMENT}>تقييم فني</option>
                </select>
              </div>

              <button
                onClick={() => setIsAddingVisit(true)}
                className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-black text-xs flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
              >
                <Plus className="w-4 h-4" />
                إضافة زيارة جديدة
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredVisits.map((visit) => {
                const family = families[visit.familyId];
                return (
                  <motion.div 
                    key={visit.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={cn(
                      "bg-white rounded-[32px] border transition-all group relative overflow-hidden flex flex-col shadow-sm hover:shadow-md",
                      expandedVisitId === visit.id ? "md:col-span-2 lg:col-span-3 border-emerald-200 shadow-lg shadow-emerald-50" : "border-gray-100",
                      visit.status === VisitStatus.CANCELED && "bg-red-50/20 border-red-100 opacity-90 border-r-8 border-r-red-400"
                    )}
                  >
                    <div 
                      className="p-6 cursor-pointer"
                      onClick={() => setExpandedVisitId(expandedVisitId === visit.id ? null : visit.id)}
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 -z-10 group-hover:bg-emerald-50 transition-colors" />
                      
                      {visit.status === VisitStatus.CANCELED && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-20deg] text-[40px] font-black text-red-100/40 pointer-events-none select-none z-0">
                          ملغاة CANCELED
                        </div>
                      )}
                      
                      <div className="flex justify-between items-start mb-6 z-10 relative">
                        <div className={cn(
                          "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border",
                          visit.status === VisitStatus.COMPLETED ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                          visit.status === VisitStatus.SCHEDULED ? "bg-blue-50 text-blue-700 border-blue-100" :
                          "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100"
                        )}>
                          {visit.status === VisitStatus.COMPLETED ? 'مكتملة' : visit.status === VisitStatus.SCHEDULED ? 'مجدولة' : 'ملغاة'}
                        </div>
                        <div className="text-[10px] font-bold text-gray-400">
                          {visit.visitCode || 'بدون كود'}
                        </div>
                      </div>
  
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-lg font-black text-gray-900 group-hover:text-emerald-700 transition-colors">
                              {family?.name || 'عائلة غير معروفة'}
                            </h4>
                            <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">كود الملف: {family?.fileNumber || '---'}</p>
                          </div>
  
                          <div className="flex flex-wrap gap-4">
                            <div className="flex items-center gap-3 text-sm text-gray-600 font-medium">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              {visit.visitDate}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-gray-600 font-medium">
                              <User className="w-4 h-4 text-gray-400" />
                              {visit.visitorName || 'غير محدد'}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                           <div className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                              {visit.type === VisitType.FIELD ? 'ميدانية' : 
                              visit.type === VisitType.OFFICE ? 'مكتبية' : 
                              visit.type === VisitType.PHONE ? 'هاتفية' : 'تقييم'}
                           </div>
                           <button 
                             onClick={(e) => { e.stopPropagation(); handleSelectVisit(visit, family); }}
                             className="p-3 bg-gray-50 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all"
                           >
                             <Eye className="w-5 h-5" />
                           </button>
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedVisitId === visit.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-6 pb-6 border-t border-gray-50 bg-gray-50/30"
                        >
                          {visit.status === VisitStatus.CANCELED && visit.reasonForCancellation && (
                            <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                              <div>
                                <p className="text-[10px] font-black text-red-800 uppercase">تم الإلغاء لسبب:</p>
                                <p className="text-sm font-bold text-red-600 italic">"{visit.reasonForCancellation}"</p>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
                            <div className="space-y-4">
                               <CollapsibleSection title="نتائج الدراسة الفنية والبحث الفعلي" icon={<FileText className="w-5 h-5" />} defaultOpen={true}>
                                  <div className="space-y-6">
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                                        <FileText className="w-3 h-3" />
                                        وصف الحالة والبحث الاجتماعي
                                      </div>
                                      <div className="bg-white p-4 rounded-2xl border border-gray-100 text-sm text-gray-600 leading-relaxed min-h-[80px]">
                                        {visit.generalDescription || <span className="text-gray-300 italic">لا يوجد وصف مسجل لهذه الزيارة</span>}
                                      </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                       <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                                          <p className="text-[9px] font-black text-emerald-400 uppercase mb-1">النتائج</p>
                                          <p className="text-xs font-bold text-emerald-700 line-clamp-3">{visit.findings?.join(', ') || 'لم تسجل نتائج'}</p>
                                       </div>
                                       <div className="p-3 bg-orange-50 rounded-2xl border border-orange-100">
                                          <p className="text-[9px] font-black text-orange-400 uppercase mb-1">التوصيات</p>
                                          <p className="text-xs font-bold text-orange-700 line-clamp-3">{visit.recommendations?.join(', ') || 'لم تسجل توصيات'}</p>
                                       </div>
                                    </div>
                                  </div>
                               </CollapsibleSection>

                               <CollapsibleSection title="الدراسة المالية" icon={<Receipt className="w-5 h-5" />} color="blue">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest">
                                        <Receipt className="w-3 h-3" />
                                        بنود الدخل
                                      </div>
                                      <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-2">
                                        {visit.itemizedIncome && visit.itemizedIncome.length > 0 ? (
                                          visit.itemizedIncome.map((inc, i) => (
                                            <div key={i} className="flex justify-between items-center text-xs">
                                              <span className="font-bold text-gray-500">{inc.source}</span>
                                              <span className="font-black text-blue-600">{inc.amount} ج.م</span>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="text-center py-4 text-gray-300 text-xs font-bold">لا توجد سجلات دخل</div>
                                        )}
                                      </div>
                                    </div>
        
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 text-[10px] font-black text-rose-600 uppercase tracking-widest">
                                        <Receipt className="w-3 h-3" />
                                        بنود المصروفات
                                      </div>
                                      <div className="bg-white p-4 rounded-2xl border border-gray-100 space-y-2">
                                        {visit.itemizedExpenses && visit.itemizedExpenses.length > 0 ? (
                                          visit.itemizedExpenses.map((exp: any, i: number) => (
                                            <div key={i} className="flex justify-between items-center text-xs">
                                              <span className="font-bold text-gray-500">{exp.category}</span>
                                              <span className="font-black text-rose-600">{exp.amount} ج.م</span>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="text-center py-4 text-gray-300 text-xs font-bold">لا توجد سجلات مصروفات</div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                               </CollapsibleSection>
                            </div>

                            <div className="space-y-4">
                               <CollapsibleSection title="الوضع المعيشي والسكن" icon={<Home className="w-5 h-5" />} color="gray">
                                  <div className="space-y-4">
                                     <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white p-4 rounded-2xl border border-gray-100">
                                           <p className="text-[10px] font-black text-gray-400 mb-1">نوع المسكن</p>
                                           <p className="text-xs font-black">{visit.housingDetails?.type || '---'}</p>
                                        </div>
                                        <div className="bg-white p-4 rounded-2xl border border-gray-100">
                                           <p className="text-[10px] font-black text-gray-400 mb-1">عدد الغرف</p>
                                           <p className="text-xs font-black">{visit.housingDetails?.roomsCount || 0}</p>
                                        </div>
                                     </div>
                                     <div className="flex gap-2">
                                        {visit.housingDetails?.hasWater && <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black">مياه</div>}
                                        {visit.housingDetails?.hasElectricity && <div className="px-3 py-1 bg-yellow-50 text-yellow-600 rounded-lg text-[9px] font-black">كهرباء</div>}
                                        {visit.housingDetails?.hasFurniture && <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black">أثاث</div>}
                                     </div>
                                  </div>
                               </CollapsibleSection>

                               {/* Quick Actions at the bottom of expansion */}
                               <div className="grid grid-cols-1 gap-2 pt-4">
                                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2 mb-1">الإجراءات المتاحة</p>
                                  <div className="flex flex-wrap gap-2">
                                    {visit.status !== VisitStatus.COMPLETED && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(visit.id, visit.familyId, VisitStatus.COMPLETED); }}
                                        className="flex-1 min-w-[120px] p-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 text-xs font-black"
                                      >
                                        <CheckCircle2 className="w-5 h-5" />
                                        إتمام الزيارة
                                      </button>
                                    )}
                                    {visit.status !== VisitStatus.CANCELED && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(visit.id, visit.familyId, VisitStatus.CANCELED); }}
                                        className="flex-1 min-w-[120px] p-4 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all border border-red-100 flex items-center justify-center gap-2 text-xs font-black"
                                      >
                                        <XCircle className="w-5 h-5" />
                                        إلغاء الزيارة
                                      </button>
                                    )}
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleSelectVisit(visit, family); setIsEditing(true); }}
                                      className="flex-1 min-w-[120px] p-4 bg-gray-900 text-white rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-2 text-xs font-black"
                                    >
                                      <Edit3 className="w-5 h-5" />
                                      تعديل البيانات
                                    </button>
                                  </div>
                               </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {filteredVisits.length === 0 && (
            <div className="py-20 text-center bg-white rounded-[40px] border border-dashed border-gray-200">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <ClipboardCheck className="w-10 h-10 text-gray-300" />
              </div>
              <h4 className="text-xl font-black text-gray-900">لا توجد زيارات مطابقة للبحث</h4>
              <p className="text-gray-400 font-bold mt-2">جرب تغيير معايير البحث أو الفلترة</p>
            </div>
          )}
        </>
      )}

      {/* Add Visit Modal */}
      <AnimatePresence>
        {isAddingVisit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingVisit(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" 
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[40px] shadow-3xl overflow-hidden relative z-10"
            >
              <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-20">
                <div>
                  <h3 className="text-2xl font-black text-gray-900">إضافة زيارة جديدة</h3>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">قم بتعبئة تفاصيل الزيارة الميدانية أو المكتبية</p>
                </div>
                <button 
                  onClick={() => setIsAddingVisit(false)}
                  className="p-3 bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                >
                  <ChevronLeft className="w-6 h-6 rotate-180" />
                </button>
              </div>

              <div className="p-8 max-h-[70vh] overflow-y-auto">
                <form onSubmit={handleCreateVisit} className="space-y-6">
                  {/* Family Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mr-2">اختيار العائلة المستهدفة</label>
                    <select 
                      required
                      value={targetFamilyId}
                      onChange={e => setTargetFamilyId(e.target.value)}
                      className="w-full px-6 py-5 bg-emerald-50 border-2 border-emerald-100 rounded-3xl text-sm font-black focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                    >
                      <option value="">-- اختر العائلة --</option>
                      {Object.values(families).sort((a, b) => a.name.localeCompare(b.name)).map(f => (
                        <option key={f.id} value={f.id}>{f.name} ({f.fileNumber})</option>
                      ))}
                    </select>
                  </div>

                  <CollapsibleSection title="البيانات الأساسية" icon={<Calendar className="w-5 h-5" />} defaultOpen={true}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase mr-2">تاريخ الزيارة</label>
                        <input 
                          type="date"
                          required
                          value={newVisit.visitDate}
                          onChange={e => setNewVisit({ ...newVisit, visitDate: e.target.value })}
                          className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all font-black"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase mr-2">نوع الزيارة</label>
                        <select 
                          value={newVisit.type}
                          onChange={e => setNewVisit({ ...newVisit, type: e.target.value as any })}
                          className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all font-black"
                        >
                          <option value={VisitType.FIELD}>زيارة ميدانية</option>
                          <option value={VisitType.OFFICE}>زيارة مكتبية</option>
                          <option value={VisitType.PHONE}>مكالمة هاتفية</option>
                          <option value={VisitType.ASSESSMENT}>تقييم فني</option>
                        </select>
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase mr-2">اسم الباحث / الزائر</label>
                        <input 
                          type="text"
                          required
                          placeholder="اسم الموظف القائم بالزيارة"
                          value={newVisit.visitorName}
                          onChange={e => setNewVisit({ ...newVisit, visitorName: e.target.value })}
                          className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all font-black"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest mr-2">ربط بحالة طوارئ نشطة (اختياري)</label>
                        <select 
                          className="w-full px-5 py-4 bg-rose-50/30 border-2 border-transparent focus:border-rose-100 rounded-2xl text-sm font-black transition-all outline-none"
                          value={newVisit.emergencyCaseId}
                          onChange={e => setNewVisit({ ...newVisit, emergencyCaseId: e.target.value })}
                        >
                          <option value="">-- لا يوجد ربط --</option>
                          {Object.values(emergencyCases)
                            .filter(c => c.familyId === targetFamilyId && c.status === 'open')
                            .map(c => (
                              <option key={c.id} value={c.id}>{c.caseCode} - {c.title}</option>
                            ))}
                        </select>
                      </div>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="تفاصيل السكن (البحث الفني)" icon={<Home className="w-5 h-5" />} color="emerald">
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                            <label className="text-[9px] font-black text-gray-400 uppercase mr-2">عدد الغرف</label>
                            <input 
                              type="number"
                              className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-black"
                              value={newVisit.housingDetails.roomsCount}
                              onChange={e => setNewVisit({ ...newVisit, housingDetails: { ...newVisit.housingDetails, roomsCount: Number(e.target.value) } })}
                            />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[9px] font-black text-gray-400 uppercase mr-2">نوع البناء</label>
                            <select 
                              className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-black"
                              value={newVisit.housingDetails.type}
                              onChange={e => setNewVisit({ ...newVisit, housingDetails: { ...newVisit.housingDetails, type: e.target.value as any } })}
                            >
                              <option value="brick">طوب</option>
                              <option value="adobe">طوب لبن</option>
                              <option value="wood">خشب</option>
                              <option value="other">أخرى</option>
                            </select>
                         </div>
                      </div>
                      <div className="flex gap-2">
                        {([
                          { key: 'hasWater', label: 'مياه' },
                          { key: 'hasElectricity', label: 'كهرباء' },
                          { key: 'hasFurniture', label: 'أثاث' }
                        ] as const).map(f => (
                          <button 
                            key={f.key} type="button"
                            onClick={() => setNewVisit({ ...newVisit, housingDetails: { ...newVisit.housingDetails, [f.key]: !newVisit.housingDetails[f.key] } })}
                            className={cn(
                              "flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 transition-all p-3",
                              newVisit.housingDetails[f.key] ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" : "bg-gray-50 border-gray-100 text-gray-300"
                            )}
                          >
                            <span className="text-[11px] font-black">{f.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="الدراسة المالية" icon={<Receipt className="w-5 h-5" />} color="blue">
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-gray-400 text-center">أدخل بنود الدخل والمصروفات بالتفصيل</p>
                      <button 
                        type="button"
                        onClick={() => setNewVisit({ ...newVisit, itemizedIncome: [...newVisit.itemizedIncome, { source: '', amount: 0 }] })}
                        className="w-full py-3 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-black border border-dashed border-blue-200"
                      >+ إضافة بند دخل</button>
                      <div className="space-y-2">
                        {newVisit.itemizedIncome.map((item, idx) => (
                           <div key={idx} className="flex gap-2">
                             <input 
                               placeholder="مصدر الدخل"
                               className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-bold"
                               value={item.source}
                               onChange={e => {
                                 const updated = [...newVisit.itemizedIncome];
                                 updated[idx].source = e.target.value;
                                 setNewVisit({ ...newVisit, itemizedIncome: updated });
                               }}
                             />
                             <input 
                               type="number"
                               placeholder="المبلغ"
                               className="w-24 bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-black text-blue-600"
                               value={item.amount}
                               onChange={e => {
                                 const updated = [...newVisit.itemizedIncome];
                                 updated[idx].amount = Number(e.target.value);
                                 setNewVisit({ ...newVisit, itemizedIncome: updated });
                               }}
                             />
                           </div>
                        ))}
                      </div>
                    </div>
                  </CollapsibleSection>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">ملاحظات عامة ووصف الحالة</label>
                    <textarea 
                      rows={3}
                      value={newVisit.generalDescription}
                      onChange={e => setNewVisit({ ...newVisit, generalDescription: e.target.value })}
                      className="w-full bg-gray-50 border-none rounded-3xl px-6 py-5 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-sm"
                      placeholder="اكتب هنا انطباعك العام عن الزيارة..."
                    />
                  </div>

                  <div className="flex gap-4 pt-6">
                    <button 
                      type="submit"
                      className="flex-[2] bg-gray-900 text-white font-black py-5 rounded-[24px] shadow-2xl shadow-gray-200 hover:bg-black transition-all"
                    >
                      تأكيد وحفظ الزيارة
                    </button>
                    <button 
                      type="button"
                      onClick={() => setIsAddingVisit(false)}
                      className="flex-1 bg-gray-100 text-gray-400 font-black py-5 rounded-[24px] hover:bg-gray-200 transition-all"
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Visit Details / Edit Modal */}
      <AnimatePresence>
        {selectedVisit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setSelectedVisit(null); setIsEditing(false); }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" 
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[40px] shadow-3xl overflow-hidden relative z-10"
            >
              <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-white sticky top-0 z-20">
                <div>
                  <h3 className="text-2xl font-black text-gray-900">تفاصيل الزيارة</h3>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">عائلة: {selectedVisit.familyName}</p>
                </div>
                <button 
                  onClick={() => { setSelectedVisit(null); setIsEditing(false); }}
                  className="p-3 bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                >
                  <ChevronLeft className="w-6 h-6 rotate-180" />
                </button>
              </div>

              <div className="p-8 max-h-[70vh] overflow-y-auto">
                {isEditing ? (
                  <form onSubmit={handleSaveVisit} className="space-y-4">
                    <CollapsibleSection title="البيانات الأساسية للزيارة" icon={<Calendar className="w-5 h-5" />} defaultOpen={true}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase mr-2">تاريخ الزيارة</label>
                          <input 
                            type="date"
                            value={selectedVisit.visitDate}
                            onChange={e => setSelectedVisit({ ...selectedVisit, visitDate: e.target.value })}
                            className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all font-black"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase mr-2">القائم بالزيارة</label>
                          <input 
                            type="text"
                            value={selectedVisit.visitorName}
                            onChange={e => setSelectedVisit({ ...selectedVisit, visitorName: e.target.value })}
                            className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all font-black"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase mr-2">نوع الزيارة</label>
                          <select 
                            value={selectedVisit.type}
                            onChange={e => setSelectedVisit({ ...selectedVisit, type: e.target.value as any })}
                            className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 transition-all font-black appearance-none"
                          >
                            <option value={VisitType.FIELD}>زيارة ميدانية</option>
                            <option value={VisitType.OFFICE}>زيارة مكتبية</option>
                            <option value={VisitType.PHONE}>مكالمة هاتفية</option>
                            <option value={VisitType.ASSESSMENT}>تقييم فني</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-rose-600 uppercase mr-2">ربط بحالة طوارئ</label>
                          <select 
                            value={(selectedVisit as any).emergencyCaseId || ''} 
                            onChange={e => setSelectedVisit({...selectedVisit, emergencyCaseId: e.target.value} as any)}
                            className="w-full px-5 py-4 bg-rose-50/30 border-none rounded-2xl text-sm font-black focus:ring-2 focus:ring-rose-500 transition-all"
                          >
                            <option value="">-- لا يوجد ربط --</option>
                            {emergencyCases
                              .filter(c => c.familyId === selectedVisit.familyId && (c.status === 'open' || c.id === (selectedVisit as any).emergencyCaseId))
                              .map(c => (
                                <option key={c.id} value={c.id}>{c.caseCode} - {c.title}</option>
                              ))
                            }
                          </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase mr-2">حالة الزيارة</label>
                            <div className="flex gap-2">
                              {[VisitStatus.SCHEDULED, VisitStatus.COMPLETED, VisitStatus.CANCELED].map(status => (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() => setSelectedVisit({ ...selectedVisit, status })}
                                  className={cn(
                                    "flex-1 py-4 text-[10px] font-black rounded-2xl border transition-all",
                                    selectedVisit.status === status 
                                      ? status === VisitStatus.COMPLETED ? "bg-emerald-600 text-white border-emerald-600 shadow-xl shadow-emerald-100"
                                        : status === VisitStatus.SCHEDULED ? "bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-100"
                                        : "bg-red-600 text-white border-red-600 shadow-xl shadow-red-100"
                                      : "bg-white text-gray-400 border-gray-100 hover:bg-gray-50"
                                  )}
                                >
                                  {status === VisitStatus.SCHEDULED ? 'مجدولة' : 
                                   status === VisitStatus.COMPLETED ? 'مكتملة' : 'ملغاة'}
                                </button>
                              ))}
                            </div>
                        </div>
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="نتائج الدراسة الفنية والبحث الميداني" icon={<FileText className="w-5 h-5" />} defaultOpen={true}>
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">وصف شامل ومطول للوضع القائم</label>
                          <textarea 
                            placeholder="اكتب هنا كافة تفاصيل الحالة الاجتماعية، المعيشية، والعلاقات الأسرية..." required rows={4}
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-3xl px-6 py-5 outline-none transition-all font-bold text-sm leading-relaxed"
                            value={selectedVisit.generalDescription || ''}
                            onChange={e => setSelectedVisit({...selectedVisit, generalDescription: e.target.value})}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-emerald-600 uppercase mr-2">أهم النتائج والملخص</label>
                            <textarea 
                              value={Array.isArray(selectedVisit.findings) ? selectedVisit.findings.join('\n') : (selectedVisit.findings || '')}
                              onChange={e => setSelectedVisit({ ...selectedVisit, findings: e.target.value.split('\n').filter(s => s.trim() !== '') })}
                              className="w-full px-6 py-4 bg-emerald-50/30 border-2 border-emerald-50 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-emerald-500 min-h-[120px] outline-none"
                              placeholder="اكتب كل نتيجة في سطر منفصل..."
                            />
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-orange-600 uppercase mr-2">التوصيات والخطوات القادمة</label>
                            <textarea 
                              value={Array.isArray(selectedVisit.recommendations) ? selectedVisit.recommendations.join('\n') : (selectedVisit.recommendations || '')}
                              onChange={e => setSelectedVisit({ ...selectedVisit, recommendations: e.target.value.split('\n').filter(s => s.trim() !== '') })}
                              className="w-full px-6 py-4 bg-orange-50/30 border-2 border-orange-50 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-orange-500 min-h-[120px] outline-none"
                              placeholder="اكتب كل توصية في سطر منفصل..."
                            />
                          </div>
                        </div>

                        <div className="p-6 bg-emerald-50/30 rounded-3xl border border-emerald-100 space-y-6">
                           <h5 className="text-[10px] font-black text-emerald-900 uppercase text-center border-b border-emerald-100 pb-2 mb-4">بيانات السكن والوضع المعيشي</h5>
                           <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                               <span className="text-[10px] font-black text-emerald-900 uppercase">نوع المسكن والمواد المستخدمة</span>
                               <div className="flex gap-2 flex-wrap justify-center">
                                  {['brick', 'adobe', 'wood', 'other'].map(t => (
                                    <button 
                                      key={t} type="button"
                                      onClick={() => setSelectedVisit({ ...selectedVisit, housingDetails: { ...selectedVisit.housingDetails || { roomsCount: 0, hasWater: false, hasElectricity: false, hasFurniture: false, conditionDescription: '' }, type: t as any } })}
                                      className={cn(
                                        "px-4 py-2 rounded-xl text-[10px] font-black transition-all border shadow-sm",
                                        selectedVisit.housingDetails?.type === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-400 border-gray-100 hover:bg-gray-50"
                                      )}
                                    >
                                      {t === 'brick' ? 'طوب' : t === 'adobe' ? 'لبن' : t === 'wood' ? 'خشب' : 'أخرى'}
                                    </button>
                                  ))}
                               </div>
                            </div>
    
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                               <div className="space-y-1.5 flex flex-col">
                                  <label className="text-[9px] font-black text-gray-400 uppercase mr-2">عدد الغرف</label>
                                  <input 
                                    type="number"
                                    className="w-full bg-white border border-emerald-100 rounded-xl px-4 py-3 text-xs font-black shadow-inner"
                                    value={selectedVisit.housingDetails?.roomsCount || 0}
                                    onChange={e => setSelectedVisit({ ...selectedVisit, housingDetails: { ...selectedVisit.housingDetails || { roomsCount: 0, hasWater: false, hasElectricity: false, hasFurniture: false, conditionDescription: '' }, roomsCount: Number(e.target.value) } })}
                                  />
                               </div>
                               {([
                                 { key: 'hasWater', label: 'مياه' },
                                 { key: 'hasElectricity', label: 'كهرباء' },
                                 { key: 'hasFurniture', label: 'أثاث' }
                               ] as const).map(f => (
                                 <button 
                                   key={f.key} type="button"
                                   onClick={() => setSelectedVisit({ ...selectedVisit, housingDetails: { ...selectedVisit.housingDetails || { roomsCount: 0, hasWater: false, hasElectricity: false, hasFurniture: false, conditionDescription: '' }, [f.key]: !selectedVisit.housingDetails?.[f.key] } })}
                                   className={cn(
                                     "flex items-center justify-center gap-2 rounded-2xl border-2 transition-all p-4 self-end",
                                     selectedVisit.housingDetails?.[f.key] ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" : "bg-white border-gray-100 text-gray-300"
                                   )}
                                 >
                                   <CheckCircle2 className={cn("w-3.5 h-3.5", selectedVisit.housingDetails?.[f.key] ? "text-emerald-200" : "")} />
                                   <span className="text-xs font-black">{f.label}</span>
                                 </button>
                               ))}
                            </div>
                        </div>
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="الدراسة المالية المتعمقة" icon={<Receipt className="w-5 h-5" />} color="blue">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h5 className="text-[10px] font-black text-blue-900 uppercase">بنود الدخل الشهري</h5>
                            <button 
                              type="button"
                              onClick={() => setSelectedVisit({ ...selectedVisit, itemizedIncome: [...(selectedVisit.itemizedIncome || []), { source: '', amount: 0 }] })}
                              className="text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-all"
                            >+ إضافة مصدر</button>
                          </div>
                          <div className="space-y-2">
                            {(selectedVisit.itemizedIncome || []).map((item, idx) => (
                              <div key={idx} className="flex gap-2 group">
                                <input 
                                  placeholder="المصدر" 
                                  className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-bold"
                                  value={item.source}
                                  onChange={e => {
                                    const updated = [...(selectedVisit.itemizedIncome || [])];
                                    updated[idx] = { ...updated[idx], source: e.target.value };
                                    setSelectedVisit({ ...selectedVisit, itemizedIncome: updated });
                                  }}
                                />
                                <input 
                                  type="number" placeholder="0"
                                  className="w-24 bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-black text-blue-600"
                                  value={item.amount}
                                  onChange={e => {
                                    const updated = [...(selectedVisit.itemizedIncome || [])];
                                    updated[idx] = { ...updated[idx], amount: Number(e.target.value) };
                                    setSelectedVisit({ ...selectedVisit, itemizedIncome: updated });
                                  }}
                                />
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const updated = (selectedVisit.itemizedIncome || []).filter((_, i) => i !== idx);
                                    setSelectedVisit({ ...selectedVisit, itemizedIncome: updated });
                                  }}
                                  className="p-3 text-gray-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h5 className="text-[10px] font-black text-red-900 uppercase">بنود الصرف الشهري</h5>
                            <button 
                              type="button"
                              onClick={() => setSelectedVisit({ ...selectedVisit, itemizedExpenses: [...(selectedVisit.itemizedExpenses || []), { category: '', amount: 0 }] })}
                              className="text-[9px] font-black text-red-600 bg-red-50 px-3 py-1.5 rounded-xl hover:bg-red-100 transition-all"
                            >+ إضافة بند</button>
                          </div>
                          <div className="space-y-2">
                            {(selectedVisit.itemizedExpenses || []).map((item, idx) => (
                              <div key={idx} className="flex gap-2 group">
                                <input 
                                  placeholder="البند" 
                                  className="flex-1 bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-bold"
                                  value={item.category}
                                  onChange={e => {
                                    const updated = [...(selectedVisit.itemizedExpenses || [])];
                                    updated[idx] = { ...updated[idx], category: e.target.value };
                                    setSelectedVisit({ ...selectedVisit, itemizedExpenses: updated });
                                  }}
                                />
                                <input 
                                  type="number" placeholder="0"
                                  className="w-24 bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-black text-red-600"
                                  value={item.amount}
                                  onChange={e => {
                                    const updated = [...(selectedVisit.itemizedExpenses || [])];
                                    updated[idx] = { ...updated[idx], amount: Number(e.target.value) };
                                    setSelectedVisit({ ...selectedVisit, itemizedExpenses: updated });
                                  }}
                                />
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const updated = (selectedVisit.itemizedExpenses || []).filter((_, i) => i !== idx);
                                    setSelectedVisit({ ...selectedVisit, itemizedExpenses: updated });
                                  }}
                                  className="p-3 text-gray-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="الدراسة الفنية والوضع المعيشي" icon={<Home className="w-5 h-5" />} color="emerald">
                      <div className="space-y-6">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-emerald-50/30 rounded-2xl border border-emerald-50">
                           <span className="text-[10px] font-black text-emerald-900 uppercase">نوع المسكن والمواد المستخدمة</span>
                           <div className="flex gap-2 flex-wrap justify-center">
                              {['brick', 'adobe', 'wood', 'other'].map(t => (
                                <button 
                                  key={t} type="button"
                                  onClick={() => setSelectedVisit({ ...selectedVisit, housingDetails: { ...selectedVisit.housingDetails || { roomsCount: 0, hasWater: false, hasElectricity: false, hasFurniture: false, conditionDescription: '' }, type: t as any } })}
                                  className={cn(
                                    "px-4 py-2 rounded-xl text-[10px] font-black transition-all border shadow-sm",
                                    selectedVisit.housingDetails?.type === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-400 border-gray-100 hover:bg-gray-50"
                                  )}
                                >
                                  {t === 'brick' ? 'طوب' : t === 'adobe' ? 'لبن' : t === 'wood' ? 'خشب' : 'أخرى'}
                                </button>
                              ))}
                           </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                           <div className="space-y-1.5 flex flex-col">
                              <label className="text-[9px] font-black text-gray-400 uppercase mr-2">عدد الغرف</label>
                              <input 
                                type="number"
                                className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-black shadow-inner"
                                value={selectedVisit.housingDetails?.roomsCount || 0}
                                onChange={e => setSelectedVisit({ ...selectedVisit, housingDetails: { ...selectedVisit.housingDetails || { roomsCount: 0, hasWater: false, hasElectricity: false, hasFurniture: false, conditionDescription: '' }, roomsCount: Number(e.target.value) } })}
                              />
                           </div>
                           {([
                             { key: 'hasWater', label: 'مياه' },
                             { key: 'hasElectricity', label: 'كهرباء' },
                             { key: 'hasFurniture', label: 'أثاث' }
                           ] as const).map(f => (
                             <button 
                               key={f.key} type="button"
                               onClick={() => setSelectedVisit({ ...selectedVisit, housingDetails: { ...selectedVisit.housingDetails || { roomsCount: 0, hasWater: false, hasElectricity: false, hasFurniture: false, conditionDescription: '' }, [f.key]: !selectedVisit.housingDetails?.[f.key] } })}
                               className={cn(
                                 "flex items-center justify-center gap-2 rounded-2xl border-2 transition-all p-4 self-end",
                                 selectedVisit.housingDetails?.[f.key] ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" : "bg-gray-50/50 border-gray-100 text-gray-300"
                               )}
                             >
                               <CheckCircle2 className={cn("w-3.5 h-3.5", selectedVisit.housingDetails?.[f.key] ? "text-emerald-200" : "")} />
                               <span className="text-xs font-black">{f.label}</span>
                             </button>
                           ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-emerald-600 uppercase mr-2">محتويات المنزل والمفروشات</label>
                            <textarea 
                              rows={2}
                              className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                              value={selectedVisit.housingDetails?.contents || ''}
                              onChange={e => setSelectedVisit({ ...selectedVisit, housingDetails: { ...selectedVisit.housingDetails || { roomsCount: 0, hasWater: false, hasElectricity: false, hasFurniture: false, conditionDescription: '' }, contents: e.target.value } })}
                              placeholder="أسرة، مراتب، خزائن..."
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-emerald-600 uppercase mr-2">الأجهزة الكهربائية المتوفرة</label>
                            <textarea 
                              rows={2}
                              className="w-full bg-gray-50 border-none rounded-2xl px-5 py-4 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                              value={selectedVisit.housingDetails?.appliances || ''}
                              onChange={e => setSelectedVisit({ ...selectedVisit, housingDetails: { ...selectedVisit.housingDetails || { roomsCount: 0, hasWater: false, hasElectricity: false, hasFurniture: false, conditionDescription: '' }, appliances: e.target.value } })}
                              placeholder="ثلاجة، غسالة، بوتاجاز..."
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-emerald-50 pt-6">
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-indigo-600 uppercase mr-2">شبكات الدعم الاجتماعي</label>
                              <input 
                                className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-bold"
                                placeholder="أقارب، جيران..."
                                value={selectedVisit.socialSolidarity?.supportNetworks || ''}
                                onChange={e => setSelectedVisit({ ...selectedVisit, socialSolidarity: { ...selectedVisit.socialSolidarity || { supportNetworks: '', communityContributions: '', socialSecurityBenefits: '' }, supportNetworks: e.target.value } })}
                              />
                           </div>
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-indigo-600 uppercase mr-2">المساعدات المجتمعية</label>
                              <input 
                                className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-bold"
                                placeholder="جمعيات، أهل خير..."
                                value={selectedVisit.socialSolidarity?.communityContributions || ''}
                                onChange={e => setSelectedVisit({ ...selectedVisit, socialSolidarity: { ...selectedVisit.socialSolidarity || { supportNetworks: '', communityContributions: '', socialSecurityBenefits: '' }, communityContributions: e.target.value } })}
                              />
                           </div>
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-indigo-600 uppercase mr-2">تأمين/معاش اجتماعي</label>
                              <input 
                                className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-xs font-bold"
                                placeholder="تكافل وكرامة، معاش..."
                                value={selectedVisit.socialSolidarity?.socialSecurityBenefits || ''}
                                onChange={e => setSelectedVisit({ ...selectedVisit, socialSolidarity: { ...selectedVisit.socialSolidarity || { supportNetworks: '', communityContributions: '', socialSecurityBenefits: '' }, socialSecurityBenefits: e.target.value } })}
                              />
                           </div>
                        </div>

                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-indigo-800 uppercase mr-2 tracking-widest">ملخص البحث الاجتماعي الفني ورؤية الباحث</label>
                           <textarea 
                             rows={3}
                             className="w-full bg-indigo-50/30 border-2 border-indigo-100 rounded-[28px] px-6 py-5 text-sm font-medium outline-none focus:bg-white italic shadow-inner"
                             placeholder="رؤية الباحث للوضع المعيشي والاجتماعي الشامل ومدى استحقاق الحالة..."
                             value={selectedVisit.socialResearch?.caseSummary || ''}
                             onChange={e => setSelectedVisit({ ...selectedVisit, socialResearch: { ...selectedVisit.socialResearch || { caseSummary: '', incomeSource: '', priorityReason: '' }, caseSummary: e.target.value } })}
                           />
                        </div>
                      </div>
                    </CollapsibleSection>

                      <CollapsibleSection title="أفراد الأسرة المشمولين بالبحث" icon={<Users className="w-5 h-5" />} badge={selectedFamilyMembers.length} color="indigo">
                        <div className="space-y-6">
                           {!isAddingMember ? (
                            <button 
                              type="button"
                              onClick={() => setIsAddingMember(true)}
                              className="w-full py-5 border-2 border-dashed border-indigo-100 rounded-[32px] text-indigo-600 font-black text-xs flex items-center justify-center gap-3 hover:bg-indigo-50 transition-all shadow-sm"
                            >
                              <UserPlus className="w-5 h-5" />
                              إضافة فرد جديد للبحث
                            </button>
                          ) : (
                            <motion.div 
                              initial={{ opacity: 0, y: -10 }} 
                              animate={{ opacity: 1, y: 0 }}
                              className="bg-indigo-50/50 p-6 rounded-[32px] border border-indigo-100 space-y-4"
                            >
                              <div className="flex items-center justify-between mb-2">
                                 <h5 className="text-xs font-black text-indigo-900">بيانات الفرد الجديد</h5>
                                 <button onClick={() => setIsAddingMember(false)} className="text-[10px] font-bold text-gray-400 hover:text-red-500">إلغاء</button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                 <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 mr-2">الاسم رباعي</label>
                                    <input 
                                      className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-3 text-xs font-bold shadow-sm"
                                      value={newMember.name}
                                      onChange={e => setNewMember({...newMember, name: e.target.value})}
                                    />
                                 </div>
                                 <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 mr-2">صلة القرابة</label>
                                    <select 
                                      className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-3 text-xs font-bold shadow-sm"
                                      value={newMember.relation}
                                      onChange={e => setNewMember({...newMember, relation: e.target.value as any})}
                                    >
                                      {Object.values(Relation).map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                 </div>
                                 <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 mr-2">المستوى التعليمي</label>
                                    <select 
                                      className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-3 text-xs font-bold shadow-sm"
                                      value={newMember.educationLevel}
                                      onChange={e => setNewMember({...newMember, educationLevel: e.target.value as any})}
                                    >
                                      {Object.values(EducationLevel).map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                 </div>
                                 <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 mr-2">الحالة الصحية</label>
                                    <select 
                                      className="w-full bg-white border border-indigo-100 rounded-xl px-4 py-3 text-xs font-bold shadow-sm"
                                      value={newMember.healthCondition}
                                      onChange={e => setNewMember({...newMember, healthCondition: e.target.value as any})}
                                    >
                                      {Object.values(HealthStatus).map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                 </div>
                              </div>
                              <button 
                                type="button"
                                onClick={handleAddMember}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs shadow-xl shadow-indigo-100 mt-4 active:scale-95 transition-all"
                              >
                                تأكيد إضافة الفرد
                              </button>
                            </motion.div>
                          )}

                          <div className="grid grid-cols-1 gap-4">
                            {selectedFamilyMembers.map((member) => (
                              <div key={member.id} className="bg-white p-6 rounded-3xl border border-gray-100 space-y-4 hover:shadow-lg transition-all border-r-4 border-r-indigo-400">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 font-black text-xs">
                                      {member.relation.substring(0, 2)}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-black text-gray-900">{member.name}</span>
                                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{member.relation}</span>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-bold text-gray-400 px-3 py-1 bg-gray-50 rounded-lg">{member.nationalId || 'بدون رقم قومي'}</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-300 uppercase mr-1">تحديث التعليم</label>
                                    <select 
                                      className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-[11px] font-black"
                                      value={member.educationLevel || EducationLevel.NONE}
                                      onChange={async (e) => {
                                        const newVal = e.target.value as EducationLevel;
                                        await updateDoc(doc(db, `families/${selectedVisit.familyId}/members`, member.id), { educationLevel: newVal });
                                        setSelectedFamilyMembers(prev => prev.map(m => m.id === member.id ? { ...m, educationLevel: newVal } : m));
                                      }}
                                    >
                                      {Object.values(EducationLevel).map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-300 uppercase mr-1">تحديث الصحة</label>
                                    <select 
                                      className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-[11px] font-black"
                                      value={member.healthCondition || HealthStatus.HEALTHY}
                                      onChange={async (e) => {
                                        const newVal = e.target.value as HealthStatus;
                                        await updateDoc(doc(db, `families/${selectedVisit.familyId}/members`, member.id), { healthCondition: newVal });
                                        setSelectedFamilyMembers(prev => prev.map(m => m.id === member.id ? { ...m, healthCondition: newVal } : m));
                                      }}
                                    >
                                      {Object.values(HealthStatus).map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CollapsibleSection>

                      <CollapsibleSection title="إدارة الملحقات والمستندات" icon={<Paperclip className="w-5 h-5" />} color="blue" badge={selectedVisit.attachments?.length || 0}>
                        <div className="space-y-6">
                           <div className="flex justify-center mb-4">
                            <label className="cursor-pointer bg-blue-600 text-white px-8 py-4 rounded-[20px] font-black text-xs hover:bg-black transition-all flex items-center gap-3 shadow-xl shadow-blue-100 active:scale-95">
                              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus className="w-4 h-4" />}
                              رفع مستند أو صورة جديدة
                              <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                            </label>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {selectedVisit.attachments?.map((file, i) => (
                              <div key={i} className="group bg-white border border-gray-100 p-4 rounded-2xl flex items-center justify-between hover:shadow-lg transition-all border-r-4 border-r-blue-400">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black text-gray-900 truncate" title={file.name}>{file.name}</p>
                                    <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">{(file.type.split('/')[1] || 'DOC')}</p>
                                  </div>
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => removeAttachment(i)}
                                  className="p-3 text-red-100 group-hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CollapsibleSection>

                    <div className="flex flex-col sm:flex-row gap-4 pt-10 border-t border-gray-50">
                      <button 
                        type="submit"
                        className="flex-[2] bg-gray-900 text-white font-black py-5 rounded-[24px] shadow-2xl shadow-gray-200 hover:bg-black transition-all transform active:scale-95"
                      >
                        حفظ التعديلات الشاملة
                      </button>
                      <button 
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="flex-1 bg-gray-100 text-gray-500 font-black py-5 rounded-[24px] hover:bg-gray-200 transition-all transform active:scale-95"
                      >
                        إلغاء
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4 pt-4">
                    {/* Primary Meta Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-50/50 p-4 rounded-3xl border border-gray-100 flex flex-col items-center text-center">
                        <Calendar className="w-5 h-5 text-emerald-600 mb-1" />
                        <span className="text-[10px] font-black text-gray-400 uppercase">تاريخ الزيارة</span>
                        <span className="text-sm font-black text-gray-900">{selectedVisit.visitDate}</span>
                      </div>
                      <div className="bg-gray-50/50 p-4 rounded-3xl border border-gray-100 flex flex-col items-center text-center">
                        <LayoutGrid className="w-5 h-5 text-blue-600 mb-1" />
                        <span className="text-[10px] font-black text-gray-400 uppercase">نوع الزيارة</span>
                        <span className="text-sm font-black text-gray-900">
                          {selectedVisit.type === VisitType.FIELD ? 'ميدانية' : 
                           selectedVisit.type === VisitType.OFFICE ? 'مكتبية' : 
                           selectedVisit.type === VisitType.PHONE ? 'هاتفية' : 'تقييم'}
                        </span>
                      </div>
                      <div className="bg-gray-50/50 p-4 rounded-3xl border border-gray-100 flex flex-col items-center text-center">
                        <CheckCircle2 className="w-5 h-5 text-indigo-600 mb-1" />
                        <span className="text-[10px] font-black text-gray-400 uppercase">الحالة</span>
                        <span className={cn(
                          "text-sm font-black",
                          selectedVisit.status === VisitStatus.COMPLETED ? "text-emerald-600" :
                          selectedVisit.status === VisitStatus.SCHEDULED ? "text-blue-600" : "text-red-600"
                        )}>
                          {selectedVisit.status === VisitStatus.COMPLETED ? 'مكتملة' : selectedVisit.status === VisitStatus.SCHEDULED ? 'مجدولة' : 'ملغاة'}
                        </span>
                      </div>
                      <div className="bg-gray-50/50 p-4 rounded-3xl border border-gray-100 flex flex-col items-center text-center">
                        <User className="w-5 h-5 text-gray-600 mb-1" />
                        <span className="text-[10px] font-black text-gray-400 uppercase">القائم بالزيارة</span>
                        <span className="text-sm font-black text-gray-900 truncate w-full px-2">{selectedVisit.visitorName || '---'}</span>
                      </div>
                    </div>

                    <CollapsibleSection title="نتائج الدراسة الفنية والبحث الميداني" icon={<FileText className="w-5 h-5" />} defaultOpen={true}>
                      <div className="space-y-8">
                        {/* Description */}
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2 mb-2">وصف الحالة والبحث الاجتماعي</p>
                          <p className="text-sm text-gray-600 font-medium leading-relaxed whitespace-pre-wrap bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                            {selectedVisit.generalDescription || 'لا يوجد وصف عام مسجل لهذا السكن أو البحث الاجتماعي.'}
                          </p>
                        </div>

                        {/* Findings & Recommendations */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <p className="text-[10px] font-black text-emerald-600 uppercase mr-2 flex items-center gap-2">
                              <CircleCheck className="w-3 h-3" />
                              أهم النتائج والملخص
                            </p>
                            <div className="bg-emerald-50/30 p-5 rounded-2xl border border-emerald-50 text-sm font-medium text-gray-700 min-h-[100px]">
                              {selectedVisit.findings && selectedVisit.findings.length > 0 ? (
                                <ul className="space-y-3">
                                  {selectedVisit.findings.map((f, i) => (
                                    <li key={i} className="flex gap-3 items-start">
                                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">{i+1}</span>
                                      <span className="leading-relaxed">{f}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="italic text-gray-400">لا توجد نتائج مسجلة</p>}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[10px] font-black text-orange-600 uppercase mr-2 flex items-center gap-2" >
                              <AlertCircle className="w-3 h-3" />
                              التوصيات المقترحة
                            </p>
                            <div className="bg-orange-50/30 p-5 rounded-2xl border border-orange-50 text-sm font-medium text-gray-700 min-h-[100px]">
                              {selectedVisit.recommendations && selectedVisit.recommendations.length > 0 ? (
                                <ul className="space-y-3">
                                  {selectedVisit.recommendations.map((r, i) => (
                                    <li key={i} className="flex gap-3 items-start">
                                      <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">{i+1}</span>
                                      <span className="leading-relaxed">{r}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="italic text-gray-400">لا توجد توصيات مسجلة</p>}
                            </div>
                          </div>
                        </div>

                        {/* Housing Details */}
                        <div className="space-y-4">
                          <h6 className="text-[10px] font-black text-emerald-900 uppercase text-center border-b border-emerald-100 pb-2 mb-2">بيانات السكن والوضع المعيشي</h6>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col shadow-sm">
                              <span className="text-[9px] font-black text-gray-400 mb-1">نوع المسكن</span>
                              <span className="text-xs font-black text-emerald-900">
                                {selectedVisit.housingDetails?.type === 'brick' ? 'طوب' : 
                                selectedVisit.housingDetails?.type === 'adobe' ? 'طوب لبن' : 
                                selectedVisit.housingDetails?.type === 'wood' ? 'خشب' : 'أخرى'}
                              </span>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-col shadow-sm">
                              <span className="text-[9px] font-black text-gray-400 mb-1">عدد الغرف</span>
                              <span className="text-xs font-black text-emerald-900">{selectedVisit.housingDetails?.roomsCount || 0}</span>
                            </div>
                            <div className="bg-white p-4 rounded-2xl border border-gray-100 lg:col-span-2 flex flex-col shadow-sm">
                              <span className="text-[9px] font-black text-gray-400 mb-1">المرافق المتوفرة</span>
                              <div className="flex flex-wrap gap-2">
                                {selectedVisit.housingDetails?.hasWater && <span className="text-[8px] font-black bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg">مياه</span>}
                                {selectedVisit.housingDetails?.hasElectricity && <span className="text-[8px] font-black bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-lg">كهرباء</span>}
                                {selectedVisit.housingDetails?.hasFurniture && <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg">أثاث</span>}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-2 shadow-sm">
                              <h6 className="text-[10px] font-black text-emerald-600 uppercase">محتويات المنزل</h6>
                              <p className="text-xs font-medium text-gray-600 italic leading-relaxed">
                                {selectedVisit.housingDetails?.contents || 'غير متوفر'}
                              </p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 space-y-2 shadow-sm">
                              <h6 className="text-[10px] font-black text-emerald-600 uppercase">الأجهزة الكهربائية</h6>
                              <p className="text-xs font-medium text-gray-600 italic leading-relaxed">
                                {selectedVisit.housingDetails?.appliances || 'غير متوفر'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="الدراسة المالية (دخل ومصروفات)" icon={<Receipt className="w-5 h-5" />} color="blue">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <h5 className="text-[10px] font-black text-blue-900 uppercase tracking-widest bg-blue-50/50 p-2 rounded-lg text-center font-black">تفاصيل الدخل</h5>
                          <div className="space-y-1.5">
                            {(selectedVisit.itemizedIncome || []).map((item, i) => (
                              <div key={i} className="flex justify-between items-center bg-gray-50/50 px-4 py-3 rounded-xl border border-gray-100 hover:bg-white transition-all">
                                <span className="text-xs font-bold text-gray-600">{item.source}</span>
                                <span className="text-xs font-black text-blue-700">{item.amount} ج.م</span>
                              </div>
                            ))}
                            {(!selectedVisit.itemizedIncome || selectedVisit.itemizedIncome.length === 0) && <p className="text-[10px] text-gray-400 text-center italic py-2">لا توجد بيانات</p>}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <h5 className="text-[10px] font-black text-red-900 uppercase tracking-widest bg-red-50/50 p-2 rounded-lg text-center font-black">تفاصيل المصروفات</h5>
                          <div className="space-y-1.5">
                            {(selectedVisit.itemizedExpenses || []).map((item, i) => (
                              <div key={i} className="flex justify-between items-center bg-gray-50/50 px-4 py-3 rounded-xl border border-gray-100 hover:bg-white transition-all">
                                <span className="text-xs font-bold text-gray-600">{item.category}</span>
                                <span className="text-xs font-black text-red-700">{item.amount} ج.م</span>
                              </div>
                            ))}
                            {(!selectedVisit.itemizedExpenses || selectedVisit.itemizedExpenses.length === 0) && <p className="text-[10px] text-gray-400 text-center italic py-2">لا توجد بيانات</p>}
                          </div>
                        </div>
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="الدراسة الفنية (بيانات السكن)" icon={<Home className="w-5 h-5" />} color="emerald">
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col">
                            <span className="text-[9px] font-black text-gray-400 mb-1">نوع المسكن</span>
                            <span className="text-xs font-black text-emerald-900">
                              {selectedVisit.housingDetails?.type === 'brick' ? 'طوب' : 
                               selectedVisit.housingDetails?.type === 'adobe' ? 'طوب لبن' : 
                               selectedVisit.housingDetails?.type === 'wood' ? 'خشب' : 'أخرى'}
                            </span>
                          </div>
                          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col">
                            <span className="text-[9px] font-black text-gray-400 mb-1">عدد الغرف</span>
                            <span className="text-xs font-black text-emerald-900">{selectedVisit.housingDetails?.roomsCount || 0}</span>
                          </div>
                          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 lg:col-span-2 flex flex-col">
                            <span className="text-[9px] font-black text-gray-400 mb-1">المرافق المتوفرة</span>
                            <div className="flex flex-wrap gap-2">
                              {selectedVisit.housingDetails?.hasWater && <span className="text-[8px] font-black bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg">مياه</span>}
                              {selectedVisit.housingDetails?.hasElectricity && <span className="text-[8px] font-black bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-lg">كهرباء</span>}
                              {selectedVisit.housingDetails?.hasFurniture && <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-lg">أثاث</span>}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 space-y-2">
                            <h6 className="text-[10px] font-black text-emerald-600 uppercase">محتويات المنزل والمفروشات</h6>
                            <p className="text-xs font-medium text-gray-600 italic leading-relaxed">
                              {selectedVisit.housingDetails?.contents || 'لم يتم رصد تفاصيل المحتويات.'}
                            </p>
                          </div>
                          <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 space-y-2">
                            <h6 className="text-[10px] font-black text-emerald-600 uppercase">الأجهزة الكهربائية المتوفرة</h6>
                            <p className="text-xs font-medium text-gray-600 italic leading-relaxed">
                              {selectedVisit.housingDetails?.appliances || 'لم يتم رصد الأجهزة الكهربائية.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="البحث الاجتماعي والتكافل" icon={<Users className="w-5 h-5" />} color="indigo">
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 flex flex-col justify-center">
                            <span className="text-[9px] font-black text-indigo-400 uppercase mb-1">شبكات الدعم</span>
                            <span className="text-xs font-bold text-gray-700">{selectedVisit.socialSolidarity?.supportNetworks || '---'}</span>
                          </div>
                          <div className="bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 flex flex-col justify-center">
                            <span className="text-[9px] font-black text-indigo-400 uppercase mb-1">المساعدات الخارجية</span>
                            <span className="text-xs font-bold text-gray-700">{selectedVisit.socialSolidarity?.communityContributions || '---'}</span>
                          </div>
                          <div className="bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 flex flex-col justify-center">
                            <span className="text-[9px] font-black text-indigo-400 uppercase mb-1">تأمين/معاش اجتماعي</span>
                            <span className="text-xs font-bold text-gray-700">{selectedVisit.socialSolidarity?.socialSecurityBenefits || '---'}</span>
                          </div>
                        </div>
                        <div className="p-6 bg-indigo-50/30 rounded-[32px] border border-indigo-100/50 border-r-4 border-r-indigo-400">
                          <h6 className="text-[10px] font-black text-indigo-900 mb-3 uppercase tracking-widest">ملخص البحث الاجتماعي</h6>
                          <p className="text-sm font-medium text-gray-700 leading-relaxed italic">
                            "{selectedVisit.socialResearch?.caseSummary || 'لم يتم تسجيل ملخص للبحث الاجتماعي في هذه الزيارة.'}"
                          </p>
                        </div>
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="أفراد الأسرة المشمولين" icon={<Users className="w-5 h-5" />} badge={selectedFamilyMembers.length} color="gray">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {selectedFamilyMembers.map(member => (
                          <div key={member.id} className="bg-white border border-gray-100 p-4 rounded-2xl hover:shadow-md transition-all border-r-4 border-r-indigo-400">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <h6 className="text-xs font-black text-gray-900">{member.name}</h6>
                                <p className="text-[10px] text-gray-400 font-bold">رقم قومي: {member.nationalId || 'غير مسجل'}</p>
                              </div>
                              <span className="text-[8px] font-black bg-gray-100 text-gray-600 px-2 py-1 rounded uppercase">
                                {member.relation}
                              </span>
                            </div>
                            <div className="flex gap-2">
                               <div className="flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                                 <GraduationCap className="w-3 h-3" />
                                 {member.educationLevel}
                               </div>
                               <div className="flex items-center gap-1 text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                                 <Stethoscope className="w-3 h-3" />
                                 {member.healthCondition}
                               </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="الملحقات والمستندات" icon={<Paperclip className="w-5 h-5" />} color="blue" badge={selectedVisit.attachments?.length || 0}>
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {selectedVisit.attachments?.map((file, i) => (
                            <div key={i} className="group bg-gray-50/50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between hover:bg-white hover:shadow-lg transition-all border-r-4 border-r-blue-400">
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                  <Paperclip className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-gray-900 truncate" title={file.name}>{file.name}</p>
                                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">{new Date(file.uploadedAt).toLocaleDateString('ar-EG')}</p>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <a href={file.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:bg-blue-600 hover:text-white p-2 rounded-xl transition-all">
                                  <Eye className="w-4 h-4" />
                                </a>
                                <button onClick={() => removeAttachment(i)} className="text-red-500 hover:bg-red-500 hover:text-white p-2 rounded-xl transition-all">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {(!selectedVisit.attachments || selectedVisit.attachments.length === 0) && (
                          <div className="py-12 border-4 border-dashed border-gray-50 rounded-[40px] text-center bg-gray-50/20">
                            <p className="text-sm font-black text-gray-300 italic">لا توجد ملفات مرفقة حالياً</p>
                            <p className="text-[10px] text-gray-400 mt-2 uppercase tracking-[0.2em]">ارفق صور المنزل أو التقارير الطبية هنا</p>
                          </div>
                        )}
                        <div className="flex justify-center">
                          <label className="cursor-pointer bg-blue-600 text-white px-8 py-3 rounded-2xl font-black text-xs hover:bg-black transition-all flex items-center gap-3 shadow-xl shadow-blue-100 active:scale-95">
                            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus className="w-4 h-4" />}
                            رفع مستند إضافي
                            <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                          </label>
                        </div>
                      </div>
                    </CollapsibleSection>

                    {/* Actions Panel */}
                    <div className="flex flex-col sm:flex-row gap-4 pt-8 border-t border-gray-100">
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="flex-1 flex items-center justify-center gap-3 bg-gray-900 text-white font-black py-5 rounded-[24px] shadow-2xl shadow-gray-200 hover:bg-black transition-all transform active:scale-95"
                      >
                        <Edit3 className="w-5 h-5" />
                        تعديل بيانات الحالة
                      </button>
                      
                      {selectedVisit.status === VisitStatus.SCHEDULED && (
                        <button 
                          onClick={() => handleUpdateStatus(selectedVisit.id, selectedVisit.familyId, VisitStatus.COMPLETED)}
                          className="flex-1 flex items-center justify-center gap-3 bg-emerald-600 text-white font-black py-5 rounded-[24px] shadow-2xl shadow-emerald-100 hover:bg-emerald-700 transition-all transform active:scale-95"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          تحديد كمكتملة
                        </button>
                      )}
                      
                      <button 
                        onClick={() => handleDeleteVisit(selectedVisit.id, selectedVisit.familyId)}
                        className="flex-none flex items-center justify-center gap-3 bg-red-50 text-red-600 border border-red-100 font-black py-5 px-8 rounded-[24px] hover:bg-red-100 transition-all"
                        title="حذف الزيارة"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
