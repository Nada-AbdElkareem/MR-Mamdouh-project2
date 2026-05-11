import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, serverTimestamp, orderBy, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { EmergencyCase, Priority, Family, FamilyMember, SystemService, LookupItem, AppUser, AppModule } from '../types';
import { Plus, Search, AlertCircle, CheckCircle2, Clock, MapPin, User, ChevronRight, Stethoscope, Landmark, Calendar, MessageSquare, Briefcase, PlusCircle, X, Receipt, PlayCircle, StopCircle, Eye, FileText, Edit2, Heart } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function EmergencyManagement({ userProfile, modules }: { userProfile: AppUser | null, modules: AppModule[] }) {
  const [cases, setCases] = useState<EmergencyCase[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [services, setServices] = useState<SystemService[]>([]);
  const [lookups, setLookups] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingCase, setIsAddingCase] = useState(false);
  const [isEditingCaseDetails, setIsEditingCaseDetails] = useState(false);
  const [editingCaseData, setEditingCaseData] = useState<Partial<EmergencyCase>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'resolved' | 'resolved_with_claim'>('all');
  const [selectedCase, setSelectedCase] = useState<EmergencyCase | null>(null);
  const [activeAction, setActiveAction] = useState<'review' | 'visit' | 'decision' | 'claim' | null>(null);
  const [actionData, setActionData] = useState<any>({});
  const [newComment, setNewComment] = useState('');

  const [newCase, setNewCase] = useState({
    familyId: '',
    memberId: '',
    serviceId: '',
    serviceCategory: '',
    otherService: '',
    providerName: '',
    otherProvider: '',
    diseaseName: '',
    otherDisease: '',
    hospitalEntryDate: '',
    hospitalExitDate: '',
    title: '',
    description: '',
    priority: Priority.URGENT
  });

  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'emergency_cases'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const updatedCases = snap.docs.map(d => ({ id: d.id, ...d.data() } as EmergencyCase));
      setCases(updatedCases);
      if (selectedCase) {
        const fresh = updatedCases.find(c => c.id === selectedCase.id);
        if (fresh) setSelectedCase(fresh);
      }
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'emergency_cases'));

    const fUnsub = onSnapshot(collection(db, 'families'), (snap) => {
      setFamilies(snap.docs.map(d => ({ id: d.id, ...d.data() } as Family)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'families'));

    const sUnsub = onSnapshot(collection(db, 'services'), (snap) => {
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemService)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'services'));

    const lUnsub = onSnapshot(collection(db, 'lookups'), (snap) => {
      setLookups(snap.docs.map(d => ({ id: d.id, ...d.data() } as LookupItem)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'lookups'));

    return () => {
      unsub();
      fUnsub();
      sUnsub();
      lUnsub();
    };
  }, []);

  useEffect(() => {
    if (newCase.familyId) {
      const fetchMembers = async () => {
        const snap = await getDocs(collection(db, `families/${newCase.familyId}/members`));
        setFamilyMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as FamilyMember)));
      };
      fetchMembers();
    } else {
      setFamilyMembers([]);
    }
  }, [newCase.familyId]);

  const handleAddCase = async (e: React.FormEvent) => {
    e.preventDefault();
    const family = families.find(f => f.id === newCase.familyId);
    const member = familyMembers.find(m => m.id === newCase.memberId);
    const service = services.find(s => s.id === newCase.serviceId);
    
    try {
      await addDoc(collection(db, 'emergency_cases'), {
        ...newCase,
        familyName: family?.name || 'عائلة غير محددة',
        memberName: member?.name || 'فرد غير محدد',
        serviceName: newCase.serviceId === 'other' ? (newCase.otherService || 'خدمة غير محددة') : (service?.name || 'خدمة غير محددة'),
        serviceCategory: newCase.serviceId === 'other' ? 'Other' : (service?.category || 'General'),
        providerName: newCase.providerName === 'other' ? (newCase.otherProvider || 'جهة غير محددة') : (newCase.providerName || 'جهة غير محددة'),
        diseaseName: newCase.diseaseName === 'other' ? (newCase.otherDisease || 'مرض غير محدد') : (newCase.diseaseName || 'مرض غير محدد'),
        caseCode: `EMG-${Date.now().toString().slice(-6)}`,
        status: 'open',
        comments: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setIsAddingCase(false);
      setNewCase({ 
        familyId: '', memberId: '', serviceId: '', serviceCategory: '', otherService: '',
        providerName: '', otherProvider: '', diseaseName: '', otherDisease: '',
        hospitalEntryDate: '', hospitalExitDate: '',
        title: '', description: '', priority: Priority.URGENT 
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'emergency_cases');
    }
  };

  const handleUpdateStatus = async (id: string, status: EmergencyCase['status'], extraData: any = {}) => {
    try {
      await updateDoc(doc(db, 'emergency_cases', id), {
        status,
        ...extraData,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `emergency_cases/${id}`);
    }
  };

  const handleUpdateCaseDetails = async () => {
    if (!selectedCase || !editingCaseData) return;
    try {
      // Find changes for logging
      const changes: string[] = [];
      const fieldLabels: Record<string, string> = {
        title: 'العنوان',
        description: 'الوصف',
        priority: 'الأولوية',
        hospitalEntryDate: 'تاريخ الدخول',
        hospitalExitDate: 'تاريخ الخروج',
        serviceId: 'الخدمة',
        providerName: 'الجهة/المستشفى',
        diseaseName: 'التشخيص/المرض'
      };

      Object.keys(editingCaseData).forEach(key => {
        const newValue = (editingCaseData as any)[key];
        const oldValue = (selectedCase as any)[key];
        if (newValue !== oldValue && fieldLabels[key]) {
          let oldDisplayValue = oldValue || 'فارغ';
          let newDisplayValue = newValue || 'فارغ';

          // Special case for service mapping for readable logs
          if (key === 'serviceId') {
            const oldService = services.find(s => s.id === oldValue);
            const newService = services.find(s => s.id === newValue);
            oldDisplayValue = oldService ? oldService.name : (oldValue || 'فارغ');
            newDisplayValue = newService ? newService.name : (newValue || 'فارغ');
          }

          // Special case for priority mapping
          if (key === 'priority') {
            const priorityLabels: any = { urgent: 'طارئ جداً', high: 'هام', medium: 'عادي' };
            oldDisplayValue = priorityLabels[oldValue] || oldValue;
            newDisplayValue = priorityLabels[newValue] || newValue;
          }

          changes.push(`${fieldLabels[key]}: من "${oldDisplayValue}" إلى "${newDisplayValue}"`);
        }
      });

      // Remove any undefined values to prevent Firestore error
      const sanitizedData = Object.keys(editingCaseData).reduce((acc: any, key) => {
        const value = (editingCaseData as any)[key];
        if (value !== undefined) {
          acc[key] = value;
        }
        return acc;
      }, {});

      // Add supplemental labels if IDs changed
      if (sanitizedData.serviceId && sanitizedData.serviceId !== selectedCase.serviceId) {
        const s = services.find(sv => sv.id === sanitizedData.serviceId);
        if (s) sanitizedData.serviceName = s.name;
      }

      await updateDoc(doc(db, 'emergency_cases', selectedCase.id), {
        ...sanitizedData,
        updatedAt: serverTimestamp()
      });

      if (changes.length > 0) {
        await addComment(selectedCase.id, `تم تحديث بيانات الحالة الأساسية: \n${changes.join(' | ')}`);
      }

      setIsEditingCaseDetails(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `emergency_cases/${selectedCase.id}`);
    }
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase) return;

    try {
      if (activeAction === 'review') {
        const isApproved = actionData.result === 'approved';
        await handleUpdateStatus(selectedCase.id, isApproved ? 'visit_pending' : 'closed', {
          medicalReviewNotes: actionData.notes,
          medicalReviewResult: actionData.result,
          diseaseType: actionData.diseaseType,
          diagnosis: actionData.diagnosis,
          medicalReason: actionData.medicalReason,
          prescribedService: actionData.prescribedService,
          locationDetails: actionData.locationDetails
        });
        addComment(selectedCase.id, `إقرار احتياج طبي: ${isApproved ? 'تمت الموافقة وتوجيه زيارة' : 'تم الرفض وإغلاق الحالة'}
التشخيص: ${actionData.diagnosis}
الخدمة المقررة: ${actionData.prescribedService}
المكان: ${actionData.locationDetails}
ملاحظات: ${actionData.notes || 'لا يوجد'}`);
      } else if (activeAction === 'visit') {
        await handleUpdateStatus(selectedCase.id, 'decision_pending', { 
          visitResult: actionData.visitResult,
          updatedAt: serverTimestamp()
        });
        addComment(selectedCase.id, `تقرير الزيارة الميدانية: ${actionData.visitResult}`);
      } else if (activeAction === 'decision') {
        const start = new Date(actionData.serviceStartDate);
        const end = new Date(actionData.serviceEndDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        await handleUpdateStatus(selectedCase.id, 'resolved', {
          decisionResult: actionData.decisionResult,
          serviceStartDate: actionData.serviceStartDate,
          serviceEndDate: actionData.serviceEndDate,
          serviceDays: diffDays
        });
        addComment(selectedCase.id, `اعتماد القرار النهائي: ${actionData.decisionResult} 
الفترة: من ${actionData.serviceStartDate} إلى ${actionData.serviceEndDate} (${diffDays} يوم)`);
      } else if (activeAction === 'claim') {
        const claimRef = await addDoc(collection(db, 'medical_claims'), {
          familyId: selectedCase.familyId,
          memberId: selectedCase.memberId || null,
          serviceId: selectedCase.serviceId || 'emergency_manual',
          serviceName: selectedCase.serviceName || 'خدمة طوارئ مستعجلة',
          serviceCode: selectedCase.caseCode,
          claimCode: `CLM-E-${Date.now().toString().slice(-6)}`,
          status: 'pending',
          amount: Number(actionData.amount) || 0,
          date: new Date().toISOString().split('T')[0],
          providerName: selectedCase.providerName || 'غير محدد',
          emergencyCaseId: selectedCase.id,
          notes: actionData.notes || `مطالبة ناتجة عن حالة طوارئ (${selectedCase.caseCode}): ${selectedCase.description}`,
          createdAt: serverTimestamp()
        });

        await updateDoc(doc(db, 'emergency_cases', selectedCase.id), {
          status: 'resolved_with_claim',
          claimId: claimRef.id,
          updatedAt: serverTimestamp()
        });
        addComment(selectedCase.id, `تم تحويل الحالة إلى مطالبة طبية رقم: ${claimRef.id.slice(0, 8)} بمبلغ ${actionData.amount}`);
      }

      setActiveAction(null);
      setActionData({});
      // Update local selected case to reflect changes
      if (selectedCase) {
        const updated = cases.find(c => c.id === selectedCase.id);
        if (updated) setSelectedCase(updated);
      }
    } catch (err) {
      console.error("Action error:", err);
    }
  };

  const addComment = async (caseId: string, text: string) => {
    if (!text.trim()) return;
    try {
      const caseRef = doc(db, 'emergency_cases', caseId);
      const targetCase = cases.find(c => c.id === caseId);
      if (!targetCase) return;

      const comment = {
        text,
        user: userProfile?.name || 'مسؤول النظام',
        date: new Date().toISOString()
      };

      await updateDoc(caseRef, {
        comments: [...(targetCase.comments || []), comment],
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `emergency_cases/${caseId}`);
    }
  };

  const handleAddComment = async (id: string) => {
    await addComment(id, newComment);
    setNewComment('');
  };

  const handleConvertToClaim = async (emergencyCase: EmergencyCase) => {
    if (emergencyCase.status === 'resolved_with_claim' || emergencyCase.claimId) {
      alert('تم تحويل هذه الحالة لمطالبة بالفعل.');
      return;
    }

    try {
      const claimRef = await addDoc(collection(db, 'medical_claims'), {
        familyId: emergencyCase.familyId,
        memberId: emergencyCase.memberId || null,
        serviceId: emergencyCase.serviceId || 'emergency_manual',
        serviceName: emergencyCase.serviceName || 'خدمة طوارئ مستعجلة',
        serviceCode: emergencyCase.caseCode,
        claimCode: `CLM-E-${Date.now().toString().slice(-6)}`,
        status: 'pending',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        providerName: emergencyCase.providerName || 'غير محدد',
        emergencyCaseId: emergencyCase.id,
        notes: `مطالبة ناتجة عن حالة طوارئ (${emergencyCase.caseCode}): ${emergencyCase.diagnosis || emergencyCase.diseaseName || ''} - ${emergencyCase.description}`,
        medicalReviewNotes: emergencyCase.medicalReviewNotes || '',
        diagnosis: emergencyCase.diagnosis || emergencyCase.diseaseName || '',
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'emergency_cases', emergencyCase.id), {
        status: 'resolved_with_claim',
        claimId: claimRef.id,
        updatedAt: serverTimestamp()
      });
      
      addComment(emergencyCase.id, `تم تحويل الحالة إلى مطالبة طبية رسمية رقم: ${claimRef.id.slice(0, 8)} للمتابعة المالية والسداد.`);
      alert('تم تحويل الحالة إلى مطالبة طبية بنجاح للبدء في إجراءات السداد.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'medical_claims');
    }
  };

  const filteredCases = cases.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search && !c.title.includes(search) && !c.familyName?.includes(search) && !c.caseCode.includes(search)) return false;
    return true;
  });

  const diseases = lookups.filter(l => l.type === 'disease');
  const medicalProviders = lookups.filter(l => l.type === 'hospital' || l.type === 'medical_provider');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">إدارة الحالات الطارئة</h2>
          <p className="text-gray-400 font-bold mt-1 uppercase tracking-widest text-xs">رصد ومعالجة الاستجابة السريعة للمستشفيات والكوارث</p>
        </div>
        <button 
          onClick={() => setIsAddingCase(true)}
          className="bg-rose-600 text-white px-8 py-4 rounded-[24px] font-black flex items-center justify-center gap-3 hover:bg-rose-700 transition-all shadow-xl shadow-rose-100"
        >
          <Plus className="w-6 h-6" />
          رصد حالة طارئة
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-3 relative">
          <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            className="w-full bg-white border border-gray-100 rounded-[24px] pr-14 pl-6 py-5 outline-none font-bold text-lg shadow-sm focus:border-rose-200 transition-all"
            placeholder="بحث بالكود، اسم الحالة أو اسم العائلة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select 
          className="bg-white border border-gray-100 rounded-[24px] px-8 py-5 outline-none font-black text-gray-600 shadow-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
        >
          <option value="all">كل الحالات</option>
          <option value="open">قيد المعالجة (مفتوح)</option>
          <option value="resolved">تم الحل بنجاح</option>
          <option value="resolved_with_claim">محولة لمطالبة</option>
          <option value="closed">مغلقة نهائياً</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {filteredCases.map((c) => (
          <motion.div 
            layout
            key={c.id} 
            onClick={() => setSelectedCase(c)}
            className={cn(
              "p-8 rounded-[40px] border transition-all group relative overflow-hidden flex flex-col cursor-pointer hover:shadow-2xl hover:scale-[1.01]",
              c.status === 'open' ? "bg-white border-rose-100 shadow-xl shadow-rose-50/50" : "bg-gray-50/50 border-gray-100 opacity-80"
            )}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black bg-rose-600 text-white px-3 py-1 rounded-full shadow-sm shadow-rose-200 uppercase tracking-widest">{c.caseCode}</span>
                  <span className={cn(
                    "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border",
                    c.priority === Priority.URGENT ? "bg-rose-50 text-rose-600 border-rose-200" :
                    c.priority === Priority.HIGH ? "bg-orange-50 text-orange-600 border-orange-200" : "bg-blue-50 text-blue-600 border-blue-200"
                  )}>
                    {c.priority === Priority.URGENT ? 'طارئ جداً' : c.priority === Priority.HIGH ? 'هام' : 'عادي'}
                  </span>
                </div>
                <h3 className="text-xl font-black text-gray-900 mt-3 group-hover:text-rose-600 transition-colors uppercase">{c.title}</h3>
              </div>
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-inner",
                c.status === 'open' ? "bg-rose-50 text-rose-600" : 
                c.status === 'resolved_with_claim' ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"
              )}>
                {c.status === 'open' ? <AlertCircle className="w-6 h-6 animate-pulse" /> : <CheckCircle2 className="w-6 h-6" />}
              </div>
            </div>

            <p className="text-gray-500 font-medium mb-8 leading-relaxed line-clamp-2">{c.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="p-5 bg-gray-50 rounded-[24px] border border-gray-100 group-hover:bg-white transition-colors space-y-3">
                <div className="space-y-1">
                  <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">العائلة والمستفيد</p>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-600" />
                    <p className="font-black text-gray-900 line-clamp-1">{c.familyName}</p>
                  </div>
                  {c.memberName && (
                    <p className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full w-fit mr-6">{c.memberName}</p>
                  )}
                </div>
                {c.serviceName && (
                  <div className="space-y-1 pt-2 border-t border-gray-200/50">
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">الخدمة المطلوبة</p>
                    <div className="flex items-center gap-2 text-rose-600 font-black text-xs">
                      <Briefcase className="w-4 h-4" />
                      <span>{c.serviceName}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-5 bg-gray-50 rounded-[24px] border border-gray-100 group-hover:bg-white transition-colors space-y-3">
                {c.providerName && (
                  <div className="space-y-1">
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">الجهة / المستشفى</p>
                    <div className="flex items-center gap-2 text-rose-600 font-black text-xs">
                      <Landmark className="w-4 h-4" />
                      <span>{c.providerName}</span>
                    </div>
                  </div>
                )}
                {(c.hospitalEntryDate || c.hospitalExitDate) && (
                  <div className="space-y-1 pt-2 border-t border-gray-200/50">
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">فترة الإقامة / الخدمة</p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-[10px] font-black text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-emerald-500" />
                          <span>دخول: {c.hospitalEntryDate || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-rose-500" />
                          <span>خروج: {c.hospitalExitDate || '—'}</span>
                        </div>
                      </div>
                      {(c.serviceStartDate || c.serviceEndDate) && (
                        <div className="flex items-center justify-between bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                          <div className="flex items-center gap-4 text-[9px] font-black text-emerald-700">
                            <div className="flex items-center gap-1">
                              <PlayCircle className="w-3 h-3" />
                              <span>بدء: {c.serviceStartDate}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <StopCircle className="w-3 h-3" />
                              <span>انتهاء: {c.serviceEndDate}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-white px-2 py-0.5 rounded-full border border-emerald-200">
                            <Clock className="w-3 h-3" />
                            <span>{c.serviceDays} يوم</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Comments Preview */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  ملاحظات المتابعة والتحديثات ({c.comments?.length || 0})
                </h4>
                <button 
                  onClick={() => setSelectedCase(c)}
                  className="text-[10px] font-black text-rose-600 hover:underline"
                >إدارة الحالة</button>
              </div>
              <div className="bg-gray-50/50 rounded-[24px] p-4 border border-gray-50/50 space-y-3">
                {c.comments && c.comments.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-3">
                       <p className="text-xs font-bold text-gray-600 leading-relaxed line-clamp-2">"{c.comments[c.comments.length - 1].text}"</p>
                       <span className="text-[8px] font-black text-gray-300 uppercase whitespace-nowrap">{new Date(c.comments[c.comments.length - 1].date).toLocaleDateString('ar-EG')}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-300 font-bold italic">لا توجد ملاحظات متابعة حتى الآن لهذه الحالة...</p>
                )}
              </div>
            </div>

            {c.medicalReviewResult && (
              <div className="mt-4 p-5 bg-blue-50 rounded-3xl border border-blue-100 space-y-3">
                <div className="flex items-center gap-2 text-blue-800">
                  <Stethoscope className="w-5 h-5" />
                  <span className="font-black text-sm uppercase">نتائج المراجعة الطبية</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-[11px] font-bold text-blue-700">
                  <div className="space-y-1">
                    <span className="text-blue-400 font-black text-[9px] uppercase block">نوع المرض</span>
                    <span>{c.diseaseType}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-blue-400 font-black text-[9px] uppercase block">التشخيص</span>
                    <span>{c.diagnosis}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-blue-400 font-black text-[9px] uppercase block">الخدمة المقررة</span>
                    <span>{c.prescribedService}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-blue-400 font-black text-[9px] uppercase block">المكان</span>
                    <span>{c.locationDetails}</span>
                  </div>
                </div>
                {c.medicalReviewNotes && (
                   <div className="pt-2 border-t border-blue-200/50 mt-2">
                     <p className="text-[10px] text-blue-600 italic">"{c.medicalReviewNotes}"</p>
                   </div>
                )}
              </div>
            )}

            {c.claimId && (
              <div className="mt-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Receipt className="w-5 h-5 text-indigo-600" />
                  <div>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">مطالبة طبية مرتبطة</p>
                    <p className="text-xs font-bold text-indigo-800">تم إنشاء مطالبة لتغطية تكاليف هذه الحالة</p>
                  </div>
                </div>
                <span className="text-[10px] font-black bg-indigo-600 text-white px-3 py-1 rounded-full">نشطة</span>
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3">
               <button 
                  onClick={() => setSelectedCase(c)}
                  className="w-full bg-gray-900 text-white py-4 rounded-2xl font-black text-sm hover:bg-gray-800 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  عرض وإدارة الحالة
                </button>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isAddingCase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingCase(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[48px] w-full max-w-4xl relative z-10 p-10 shadow-3xl overflow-hidden overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-black text-gray-900">رصد حالة طارئة متكاملة</h2>
                  <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-1">تسجيل استجابة سريعة مع ربط الخدمة والجهة</p>
                </div>
                <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
                  <AlertCircle className="w-8 h-8" />
                </div>
              </div>

              <form onSubmit={handleAddCase} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">العائلة المستهدفة</label>
                      <select 
                        required
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newCase.familyId}
                        onChange={e => setNewCase({...newCase, familyId: e.target.value, memberId: ''})}
                      >
                        <option value="">اختر العائلة...</option>
                        {families.map(f => <option key={f.id} value={f.id}>{f.name} ({f.fileNumber})</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المستفيد (اختياري)</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newCase.memberId}
                        onChange={e => setNewCase({...newCase, memberId: e.target.value})}
                        disabled={!newCase.familyId}
                      >
                        <option value="">الأسرة بالكامل</option>
                        {familyMembers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.relation})</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">عنوان الحالة</label>
                      <input 
                        placeholder="مثال: حريق منزل، الحاجة لعملية قلب فورية..."
                        required
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all text-lg"
                        value={newCase.title}
                        onChange={e => setNewCase({...newCase, title: e.target.value})}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الأولوية</label>
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          type="button"
                          onClick={() => setNewCase({...newCase, priority: Priority.URGENT})}
                          className={cn(
                            "py-4 rounded-2xl font-black text-sm border-2 transition-all",
                            newCase.priority === Priority.URGENT ? "bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-100" : "bg-gray-50 border-transparent text-gray-400 hover:border-gray-200"
                          )}
                        >
                          طارئ جداً
                        </button>
                        <button 
                          type="button"
                          onClick={() => setNewCase({...newCase, priority: Priority.HIGH})}
                          className={cn(
                            "py-4 rounded-2xl font-black text-sm border-2 transition-all",
                            newCase.priority === Priority.HIGH ? "bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-100" : "bg-gray-50 border-transparent text-gray-400 hover:border-gray-200"
                          )}
                        >
                          هام / عاجل
                        </button>
                      </div>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الخدمة المرتبطة (اختياري)</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newCase.serviceId}
                        onChange={e => {
                          const sId = e.target.value;
                          const selectedService = services.find(s => s.id === sId);
                          setNewCase({
                            ...newCase, 
                            serviceId: sId,
                            serviceCategory: sId === 'other' ? 'Other' : selectedService?.category || 'General',
                            otherService: sId === 'other' ? '' : selectedService?.name || '',
                          });
                        }}
                      >
                        <option value="">اختر الخدمة...</option>
                        {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        <option value="other">أخرى (أدخل يدوياً)...</option>
                      </select>
                      {newCase.serviceId === 'other' && (
                        <div className="space-y-3 mt-4 animate-in slide-in-from-top-2">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-rose-400 uppercase tracking-widest mr-2">اسم الخدمة اليدوي</label>
                            <input 
                              placeholder="اكتب اسم الخدمة هنا..."
                              required
                              className="w-full bg-rose-50/30 border-2 border-rose-100 rounded-2xl px-6 py-3 outline-none font-bold text-sm"
                              value={newCase.otherService}
                              onChange={e => setNewCase({...newCase, otherService: e.target.value})}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-rose-400 uppercase tracking-widest mr-2">تصنيف الخدمة</label>
                            <input 
                              placeholder="مثل: طبية، غذائية، طوارئ..."
                              required
                              className="w-full bg-rose-50/30 border-2 border-rose-100 rounded-2xl px-6 py-3 outline-none font-bold text-sm"
                              value={newCase.serviceCategory}
                              onChange={e => setNewCase({...newCase, serviceCategory: e.target.value})}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الجهة / المستشفى</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newCase.providerName}
                        onChange={e => setNewCase({...newCase, providerName: e.target.value})}
                      >
                        <option value="">اختيار الجهة...</option>
                        {medicalProviders.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        <option value="other">أخرى (أدخل يدوياً)...</option>
                      </select>
                      {newCase.providerName === 'other' && (
                        <motion.input 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          placeholder="اكتب اسم الجهة أو المستشفى هنا..."
                          required
                          className="w-full mt-2 bg-rose-50/30 border-2 border-rose-100 rounded-2xl px-6 py-3 outline-none font-bold text-sm"
                          value={newCase.otherProvider}
                          onChange={e => setNewCase({...newCase, otherProvider: e.target.value})}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ الدخول</label>
                          <input 
                            type="date"
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                            value={newCase.hospitalEntryDate}
                            onChange={e => setNewCase({...newCase, hospitalEntryDate: e.target.value})}
                          />
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ الخروج</label>
                          <input 
                            type="date"
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                            value={newCase.hospitalExitDate}
                            onChange={e => setNewCase({...newCase, hospitalExitDate: e.target.value})}
                          />
                       </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">نوع المرض / التشخيص</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newCase.diseaseName}
                        onChange={e => setNewCase({...newCase, diseaseName: e.target.value})}
                      >
                        <option value="">اختر التشخيص...</option>
                        {diseases.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                        <option value="other">آخر (أدخل يدوياً)...</option>
                      </select>
                      {newCase.diseaseName === 'other' && (
                        <motion.input 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          placeholder="اكتب التشخيص أو نوع المرض هنا..."
                          required
                          className="w-full mt-2 bg-rose-50/30 border-2 border-rose-100 rounded-2xl px-6 py-3 outline-none font-bold text-sm"
                          value={newCase.otherDisease}
                          onChange={e => setNewCase({...newCase, otherDisease: e.target.value})}
                        />
                      )}
                    </div>
                 </div>
                </div>

                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">وصف الحالة بالتفصيل</label>
                   <textarea 
                     rows={3}
                     placeholder="اشرح طبيعة الحالة والاحتياجات الملحة والوضع الحالي..."
                     required
                     className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                     value={newCase.description}
                     onChange={e => setNewCase({...newCase, description: e.target.value})}
                   />
                </div>

                <div className="flex gap-4 pt-6">
                  <button 
                    type="submit"
                    className="flex-1 bg-rose-600 text-white py-5 rounded-[24px] font-black text-lg shadow-xl shadow-rose-100 hover:translate-y-[-2px] transition-all active:translate-y-0"
                  >
                    تأكيد الرصد والحفظ
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsAddingCase(false)}
                    className="px-10 bg-gray-100 text-gray-500 py-5 rounded-[24px] font-black text-lg hover:bg-gray-200 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Professional Case Detail Modal */}
      <AnimatePresence>
        {selectedCase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!activeAction) setSelectedCase(null);
              }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-xl" 
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white h-[95vh] w-full max-w-5xl relative z-10 rounded-[48px] shadow-3xl overflow-hidden flex flex-col md:flex-row"
              dir="rtl"
            >
              {/* Sidebar: Case Info */}
              <div className="w-full md:w-[340px] bg-[#fdfdfd] p-10 border-l border-gray-100 overflow-y-auto custom-scrollbar flex flex-col gap-10">
                <div className="space-y-8">
                  <div className="space-y-6">
                    <div className="flex justify-between items-start">
                       <span className="text-[11px] font-black bg-rose-600 text-white px-5 py-2 rounded-2xl uppercase tracking-widest shadow-lg shadow-rose-100">{selectedCase.caseCode}</span>
                       <div className={cn(
                        "px-4 py-1.5 rounded-xl text-[10px] font-black border uppercase tracking-widest shadow-sm",
                        selectedCase.priority === Priority.URGENT ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-blue-50 text-blue-600 border-blue-100"
                      )}>
                        {selectedCase.priority === Priority.URGENT ? "طارئ جداً" : "عادي"}
                      </div>
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">{selectedCase.title}</h2>
                      <div className="h-1.5 w-12 bg-rose-600 rounded-full mt-4" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" /> وصف الحالة
                    </label>
                    <p className="text-sm font-bold text-gray-600 leading-relaxed bg-gray-50/80 p-6 rounded-[32px] border border-gray-100 italic">
                      "{selectedCase.description}"
                    </p>
                  </div>

                  <div className="space-y-6">
                    <div className="p-6 bg-white rounded-[32px] border border-gray-100 space-y-5 shadow-sm hover:shadow-md transition-shadow">
                      {[
                        { label: 'المستفيد والأسرة', value: selectedCase.familyName, icon: User, color: 'text-rose-600', sub: selectedCase.memberName },
                        { label: 'الجهة الطبية / المزود', value: selectedCase.providerName, icon: Landmark, color: 'text-emerald-600' },
                        { label: 'المرض / التشخيص', value: selectedCase.diseaseName, icon: Stethoscope, color: 'text-indigo-600' },
                        { label: 'الخدمة المطلوبة', value: selectedCase.serviceName, icon: Heart, color: 'text-rose-500' }
                      ].map((item, idx) => (
                        <div key={idx} className="space-y-1.5">
                          <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest flex items-center gap-2">
                            <item.icon className={cn("w-3.5 h-3.5", item.color)} /> {item.label}
                          </p>
                          <div className="flex flex-col gap-1">
                            <p className="font-black text-gray-900 text-sm">{item.value}</p>
                            {item.sub && (
                              <p className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg w-fit">{item.sub}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-gray-100">
                   <div className="p-6 bg-indigo-900 text-white rounded-[32px] shadow-2xl shadow-indigo-100 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-1000" />
                      <p className="text-[10px] font-black text-indigo-300 uppercase mb-3 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" /> الحالة الحالية
                      </p>
                      <span className="text-md font-black block leading-tight">
                        {selectedCase.status === 'open' ? 'تحت المراجعة الطبية' :
                         selectedCase.status === 'medical_review' ? 'إقرار الاحتياج الطبي' :
                         selectedCase.status === 'visit_pending' ? 'بانتظار المعاينة الميدانية' :
                         selectedCase.status === 'decision_pending' ? 'بانتظار القرار النهائي' :
                         selectedCase.status === 'claim_pending' ? 'بانتظار المطالبة المالية' :
                         selectedCase.status === 'resolved' ? 'تم الحل والاعتماد' : 'مغلق'}
                      </span>
                   </div>
                </div>
              </div>

              {/* Main Content Area: Feed and Actions */}
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                <div className="p-10 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-20 backdrop-blur-md bg-white/90">
                  <div className="flex items-center gap-6">
                    <div className={cn(
                      "w-16 h-16 rounded-[24px] flex items-center justify-center shadow-lg",
                      selectedCase.status === 'open' ? "bg-rose-50 text-rose-600 shadow-rose-100" : "bg-emerald-50 text-emerald-600 shadow-emerald-100"
                    )}>
                      {selectedCase.status === 'open' ? <Clock className="w-8 h-8" /> : <CheckCircle2 className="w-8 h-8" />}
                    </div>
                    <div>
                      {isEditingCaseDetails ? (
                        <div className="space-y-2">
                           <input 
                              className="font-black text-2xl text-gray-900 border-b-4 border-rose-600 outline-none w-full bg-transparent px-4 py-1"
                              value={editingCaseData.title}
                              onChange={e => setEditingCaseData({...editingCaseData, title: e.target.value})}
                           />
                           <div className="flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                             <p className="text-[10px] font-black text-rose-600 uppercase tracking-[0.2em]">وضع التعديل النشط</p>
                           </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">مسار العمل الحالي:</span>
                             <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md uppercase tracking-widest">{selectedCase.status.replace('_', ' ')}</span>
                          </div>
                          <h4 className="text-2xl font-black text-gray-900 leading-none">سجل المتابعة والتنفيذ</h4>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {isEditingCaseDetails ? (
                      <>
                        <button 
                          onClick={handleUpdateCaseDetails}
                          className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-2xl shadow-emerald-200 hover:scale-105 active:scale-95 transition-all"
                        >حفظ التغييرات</button>
                        <button 
                          onClick={() => setIsEditingCaseDetails(false)}
                          className="bg-gray-100 text-gray-500 px-8 py-3 rounded-2xl font-black text-sm hover:bg-gray-200 transition-all"
                        >إلغاء</button>
                      </>
                    ) : (
                      <div className="flex gap-3">
                         {selectedCase.status === 'open' && (
                          <button 
                            onClick={() => handleUpdateStatus(selectedCase.id, 'medical_review')}
                            className="bg-amber-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl shadow-amber-200 hover:bg-amber-700 transition-all flex items-center gap-2"
                          >
                            <Stethoscope className="w-5 h-5" />
                            بدء المراجعة
                          </button>
                        )}
                        {!isEditingCaseDetails && (
                          <button 
                            onClick={() => {
                              setIsEditingCaseDetails(true);
                              setEditingCaseData({
                                title: selectedCase.title || '',
                                description: selectedCase.description || '',
                                priority: selectedCase.priority || Priority.URGENT,
                                hospitalEntryDate: selectedCase.hospitalEntryDate || '',
                                hospitalExitDate: selectedCase.hospitalExitDate || '',
                                serviceId: selectedCase.serviceId || '',
                                providerName: selectedCase.providerName || '',
                                diseaseName: selectedCase.diseaseName || ''
                              });
                            }}
                            className="p-4 bg-gray-50 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all shadow-sm"
                            title="تعديل البيانات"
                          >
                            <Edit2 className="w-6 h-6" />
                          </button>
                        )}
                        <button 
                          onClick={() => { setSelectedCase(null); setIsEditingCaseDetails(false); setActiveAction(null); }}
                          className="p-4 bg-gray-900 text-gray-400 hover:text-white rounded-2xl transition-all shadow-xl"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar bg-[#fafafa]">
                  {/* Editing Detail Form if active */}
                  <AnimatePresence>
                    {isEditingCaseDetails && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-white rounded-[40px] p-10 border-2 border-rose-100 shadow-2xl shadow-rose-50/50 mb-12 overflow-hidden"
                      >
                        <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-50">
                           <h5 className="text-xl font-black text-gray-900 flex items-center gap-3">
                              <Edit2 className="w-5 h-5 text-rose-600" /> تعديل بيانات الحالة التفصيلية
                           </h5>
                           <button onClick={() => setIsEditingCaseDetails(false)} className="text-[10px] font-black text-gray-400 hover:text-rose-600 uppercase tracking-widest transition-colors">إغلاق التعديل</button>
                        </div>

                        <div className="space-y-8">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">وصف الحالة</label>
                            <textarea 
                              className="w-full bg-gray-50 border border-gray-100 p-6 rounded-[32px] font-bold min-h-[120px] focus:ring-8 focus:ring-rose-500/5 outline-none transition-all resize-none"
                              value={editingCaseData.description}
                              onChange={e => setEditingCaseData({...editingCaseData, description: e.target.value})}
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ الدخول المتوقع</label>
                              <input 
                                type="date"
                                className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl font-black focus:ring-8 focus:ring-rose-500/5 outline-none transition-all"
                                value={editingCaseData.hospitalEntryDate}
                                onChange={e => setEditingCaseData({...editingCaseData, hospitalEntryDate: e.target.value})}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ الخروج المتوقع</label>
                              <input 
                                type="date"
                                className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl font-black focus:ring-8 focus:ring-rose-500/5 outline-none transition-all"
                                value={editingCaseData.hospitalExitDate}
                                onChange={e => setEditingCaseData({...editingCaseData, hospitalExitDate: e.target.value})}
                              />
                            </div>
                          </div>
                          <div className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تحديد الأولوية</label>
                            <div className="grid grid-cols-3 gap-4">
                              {[Priority.URGENT, Priority.HIGH, Priority.MEDIUM].map(p => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setEditingCaseData({...editingCaseData, priority: p})}
                                  className={cn(
                                    "py-4 rounded-[20px] font-black text-[10px] uppercase tracking-widest border-2 transition-all",
                                    editingCaseData.priority === p ? "bg-rose-600 border-rose-600 text-white shadow-xl shadow-rose-200" : "bg-gray-50 border-transparent text-gray-400 hover:bg-gray-100"
                                  )}
                                >
                                  {p === Priority.URGENT ? "طارئ جداً" : p === Priority.HIGH ? "هام" : "عادي"}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-gray-50">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الخدمة المرتبطة</label>
                              <select 
                                className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl font-black focus:ring-8 focus:ring-rose-500/5 outline-none transition-all"
                                value={editingCaseData.serviceId}
                                onChange={e => setEditingCaseData({...editingCaseData, serviceId: e.target.value})}
                              >
                                <option value="">اختر الخدمة...</option>
                                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الجهة / المستشفى</label>
                              <select 
                                className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl font-black focus:ring-8 focus:ring-rose-500/5 outline-none transition-all"
                                value={editingCaseData.providerName}
                                onChange={e => setEditingCaseData({...editingCaseData, providerName: e.target.value})}
                              >
                                <option value="">اختر الجهة...</option>
                                {medicalProviders.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                <option value="other">أخرى...</option>
                              </select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">التشخيص / نوع المرض</label>
                              <select 
                                className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl font-black focus:ring-8 focus:ring-rose-500/5 outline-none transition-all"
                                value={editingCaseData.diseaseName}
                                onChange={e => setEditingCaseData({...editingCaseData, diseaseName: e.target.value})}
                              >
                                <option value="">اختر التشخيص...</option>
                                {diseases.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                                <option value="other">أخرى...</option>
                              </select>
                            </div>
                          </div>
                          <div className="pt-4">
                             <button 
                               onClick={handleUpdateCaseDetails}
                               className="w-full bg-emerald-600 text-white py-5 rounded-[24px] font-black text-sm shadow-2xl shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-3"
                             >
                                <CheckCircle2 className="w-5 h-5" /> حفظ التغييرات وتحديث الحالة
                             </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Action Forms Section */}
                  <AnimatePresence mode="wait">
                    {activeAction && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 1.02, y: -10 }}
                        className={cn(
                          "bg-white rounded-[40px] p-10 border-2 shadow-2xl relative overflow-hidden",
                          activeAction === 'review' ? "border-blue-100 shadow-blue-50/50" : 
                          activeAction === 'visit' ? "border-amber-100 shadow-amber-50/50" : 
                          activeAction === 'decision' ? "border-emerald-100 shadow-emerald-50/50" :
                          "border-rose-100 shadow-rose-50/50"
                        )}
                      >
                        <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-50">
                           <h5 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                              <span className={cn(
                                "w-2 h-8 rounded-full",
                                activeAction === 'review' ? "bg-blue-600" : 
                                activeAction === 'visit' ? "bg-amber-600" : 
                                activeAction === 'decision' ? "bg-emerald-600" : "bg-rose-600"
                              )} />
                              {activeAction === 'review' ? 'إقرار الاحتياج الطبي' : 
                               activeAction === 'visit' ? 'نتائج الزيارة الميدانية' : 
                               activeAction === 'decision' ? 'اعتماد القرار النهائي' : 'تحويل لمطالبة مالية'}
                           </h5>
                           <button onClick={() => setActiveAction(null)} className="p-3 bg-gray-50 text-gray-400 hover:text-rose-600 rounded-xl transition-all"><X className="w-5 h-5"/></button>
                        </div>
                        
                        <form onSubmit={handleActionSubmit} className="space-y-6">
                          {activeAction === 'review' && (
                            <div className="grid grid-cols-2 gap-4">
                              <div className="col-span-2 space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">نوع القرار</label>
                                <div className="grid grid-cols-2 gap-3">
                                  <button 
                                    type="button"
                                    onClick={() => setActionData({...actionData, result: 'approved'})}
                                    className={cn(
                                      "py-3 rounded-xl font-black text-sm border-2 transition-all",
                                      actionData.result === 'approved' ? "bg-emerald-600 border-emerald-600 text-white" : "bg-gray-50 border-transparent text-gray-400"
                                    )}
                                  >موافقة (توجيه زيارة)</button>
                                  <button 
                                    type="button"
                                    onClick={() => setActionData({...actionData, result: 'rejected'})}
                                    className={cn(
                                      "py-3 rounded-xl font-black text-sm border-2 transition-all",
                                      actionData.result === 'rejected' ? "bg-rose-600 border-rose-600 text-white" : "bg-gray-50 border-transparent text-gray-400"
                                    )}
                                  >رفض وإغلاق</button>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">نوع المرض</label>
                                <input required className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl font-bold" value={actionData.diseaseType} onChange={e => setActionData({...actionData, diseaseType: e.target.value})} />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">التشخيص الطبي</label>
                                <input required className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl font-bold" value={actionData.diagnosis} onChange={e => setActionData({...actionData, diagnosis: e.target.value})} />
                              </div>
                              <div className="col-span-2 space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">السبب الطبي للحالة</label>
                                <textarea required className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl font-bold" rows={2} value={actionData.medicalReason} onChange={e => setActionData({...actionData, medicalReason: e.target.value})} />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">الخدمة المقررة</label>
                                <input required className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl font-bold" value={actionData.prescribedService} onChange={e => setActionData({...actionData, prescribedService: e.target.value})} />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">مكان الخدمة</label>
                                <input required className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl font-bold" value={actionData.locationDetails} onChange={e => setActionData({...actionData, locationDetails: e.target.value})} />
                              </div>
                              <div className="col-span-2 space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ملاحظات إضافية</label>
                                <textarea className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl font-bold" rows={2} value={actionData.notes} onChange={e => setActionData({...actionData, notes: e.target.value})} />
                              </div>
                            </div>
                          )}

                          {activeAction === 'visit' && (
                             <div className="space-y-4">
                               <div className="space-y-1.5">
                                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">تقرير الزيارة الميدانية وتوصياتها</label>
                                 <textarea required className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl font-bold" rows={4} placeholder="اكتب نتائج الزيارة بالتفصيل هنا..." value={actionData.visitResult} onChange={e => setActionData({...actionData, visitResult: e.target.value})} />
                               </div>
                             </div>
                          )}

                          {activeAction === 'decision' && (
                             <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-1.5">
                                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">تاريخ البدء</label>
                                 <input type="date" required className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl font-bold" value={actionData.serviceStartDate} onChange={e => setActionData({...actionData, serviceStartDate: e.target.value})} />
                               </div>
                               <div className="space-y-1.5">
                                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">تاريخ الانتهاء</label>
                                 <input type="date" required className="w-full bg-gray-50 border border-gray-100 p-3 rounded-xl font-bold" value={actionData.serviceEndDate} onChange={e => setActionData({...actionData, serviceEndDate: e.target.value})} />
                               </div>
                               <div className="col-span-2 space-y-1.5">
                                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">منطوق القرار النهائي</label>
                                 <textarea required className="w-full bg-gray-50 border border-gray-100 p-4 rounded-xl font-bold" rows={3} placeholder="اكتب تفاصيل الموافقة النهائية والالتزامات..." value={actionData.decisionResult} onChange={e => setActionData({...actionData, decisionResult: e.target.value})} />
                               </div>
                             </div>
                          )}

                          {activeAction === 'claim' && (
                             <div className="grid grid-cols-2 gap-4">
                               <div className="col-span-2 space-y-1.5">
                                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">المبلغ التقديري للمطالبة</label>
                                 <input type="number" required className="w-full bg-gray-50 border border-gray-100 p-4 rounded-2xl font-black text-lg" value={actionData.amount} onChange={e => setActionData({...actionData, amount: e.target.value})} />
                               </div>
                               <div className="col-span-2 space-y-1.5">
                                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ملاحظات التحويل المالي</label>
                                 <textarea className="w-full bg-gray-50 border border-gray-100 p-4 rounded-xl font-bold" rows={3} placeholder="اكتب أي تعليمات مالية إضافية هنا..." value={actionData.notes} onChange={e => setActionData({...actionData, notes: e.target.value})} />
                               </div>
                             </div>
                          )}

                          <button 
                            type="submit"
                            className="w-full bg-gray-900 text-white py-4 rounded-2xl font-black shadow-xl"
                          >حفظ القرار وتنفيذه</button>
                        </form>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* History Timeline */}
                  <div className="space-y-8">
                    {/* Render Medical Review Data if exists */}
                    {selectedCase.medicalReviewResult && (
                      <div className="bg-blue-50/50 rounded-3xl p-6 border border-blue-100 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2"><Stethoscope className="w-4 h-4 text-blue-200" /></div>
                        <h6 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">بيانات الاحتياج الطبي المعتمدة</h6>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                           <div>
                             <p className="text-[9px] text-blue-300 font-bold uppercase">نوع المرض</p>
                             <p className="text-sm font-black text-blue-900">{selectedCase.diseaseType}</p>
                           </div>
                           <div>
                             <p className="text-[9px] text-blue-300 font-bold uppercase">التشخيص</p>
                             <p className="text-sm font-black text-blue-900">{selectedCase.diagnosis}</p>
                           </div>
                           <div>
                             <p className="text-[9px] text-blue-300 font-bold uppercase">الخدمة المقررة</p>
                             <p className="text-sm font-black text-blue-900">{selectedCase.prescribedService}</p>
                           </div>
                           <div className="col-span-full pt-4 border-t border-blue-100">
                             <p className="text-[9px] text-blue-300 font-bold uppercase">السبب الطبي والملاحظات</p>
                             <p className="text-sm font-bold text-blue-800 italic">"{selectedCase.medicalReviewNotes || selectedCase.medicalReason}"</p>
                           </div>
                        </div>
                      </div>
                    )}

                    {selectedCase.visitResult && (
                      <div className="bg-indigo-50/50 rounded-3xl p-6 border border-indigo-100">
                         <h6 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">تقرير الزيارة الميدانية</h6>
                         <p className="text-sm font-black text-indigo-900 leading-relaxed">{selectedCase.visitResult}</p>
                      </div>
                    )}

                    {selectedCase.decisionResult && (
                      <div className="bg-emerald-50 rounded-3xl p-6 border-2 border-emerald-100">
                         <h6 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4">القرار النهائي والاعتماد</h6>
                         <div className="space-y-4">
                           <p className="text-lg font-black text-emerald-900 leading-relaxed">{selectedCase.decisionResult}</p>
                           <div className="flex gap-6 pt-4 border-t border-emerald-100">
                              <div>
                                <p className="text-[9px] text-emerald-400 font-bold uppercase">مدة الخدمة</p>
                                <p className="text-sm font-black text-emerald-900">{selectedCase.serviceDays} يوم</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-emerald-400 font-bold uppercase">من</p>
                                <p className="text-sm font-black text-emerald-900">{selectedCase.serviceStartDate}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-emerald-400 font-bold uppercase">إلى</p>
                                <p className="text-sm font-black text-emerald-900">{selectedCase.serviceEndDate}</p>
                              </div>
                           </div>
                         </div>
                      </div>
                    )}

                    {/* Comments Feed */}
                    <div className="space-y-8 pt-8 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <h6 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3">
                          <MessageSquare className="w-4 h-4 text-indigo-500" />
                          سجل التحديثات وتعليقات فريق العمل
                        </h6>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{selectedCase.comments?.length || 0} تعليق</span>
                      </div>
                      
                      <div className="space-y-6">
                        {selectedCase.comments && selectedCase.comments.length > 0 ? (
                          [...selectedCase.comments].reverse().map((comment, idx) => (
                            <motion.div 
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              key={idx} 
                              className="relative group pr-6"
                            >
                                <div className="absolute top-0 right-0 bottom-0 w-1 bg-indigo-100 rounded-full group-hover:bg-indigo-600 transition-colors" />
                                <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm group-hover:shadow-xl group-hover:shadow-indigo-50/50 transition-all">
                                    <div className="flex justify-between items-center mb-4">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-[10px] uppercase">
                                          {comment.user.slice(0, 2)}
                                        </div>
                                        <span className="text-[11px] font-black text-gray-900">{comment.user}</span>
                                      </div>
                                      <span className="text-[9px] font-black text-gray-400 tabular-nums bg-gray-50 px-2 py-1 rounded-md">
                                        {new Date(comment.date).toLocaleString('ar-EG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                    <p className="text-sm font-bold text-gray-600 leading-relaxed indent-4 italic">
                                      {comment.text}
                                    </p>
                                </div>
                            </motion.div>
                          ))
                        ) : (
                          <div className="py-20 flex flex-col items-center justify-center text-gray-300 bg-white rounded-[40px] border border-dashed border-gray-200">
                             <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                               <MessageSquare className="w-10 h-10 opacity-20" />
                             </div>
                             <p className="font-black text-sm uppercase tracking-widest">لا توجد تحديثات مسجلة بعد</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Comment Input */}
                <div className="p-8 border-t border-gray-50 bg-white">
                  <div className="flex gap-4">
                    <textarea 
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      placeholder="أضف تعليقاً أو تحديثاً جديداً لمتابعة الحالة..."
                      className="flex-1 bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all resize-none text-sm"
                      rows={1}
                    />
                    <button 
                      onClick={() => handleAddComment(selectedCase.id)}
                      className="bg-rose-600 text-white w-14 h-14 rounded-2xl font-black text-sm shadow-xl shadow-rose-100 hover:bg-rose-700 transition-all flex items-center justify-center"
                    >
                      <PlusCircle className="w-7 h-7" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
