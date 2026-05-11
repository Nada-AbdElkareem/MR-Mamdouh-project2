import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, orderBy, where, arrayUnion, collectionGroup } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { MedicalClaim, Family, SystemService, Assistance, FamilyMember, AppUser, AppModule, ModulePermission, EmergencyCase } from '../types';
import { Plus, Search, Receipt, CheckCircle2, Clock, Filter, User, Building2, Stethoscope, MoreVertical, Bell, History, FileText, ChevronLeft, AlertCircle, TrendingUp, Heart, DollarSign, Paperclip, ExternalLink, Percent, Edit2, Trash2, XCircle, Activity, ShieldAlert, CreditCard } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function MedicalClaims({ userProfile, modules }: { userProfile: AppUser | null, modules: AppModule[] }) {
  const hasPermission = (modulePath: string, action: keyof ModulePermission) => {
    try {
      if (!userProfile) return true;
      if (userProfile.role === 'admin') return true;
      const safeModules = Array.isArray(modules) ? modules : [];
      const module = safeModules.find(m => m && m.path === modulePath);
      const moduleId = module ? module.id : (modulePath === 'claims' ? 'claims' : null);
      if (!moduleId) return true;
      const permissions = Array.isArray(userProfile.permissions) ? userProfile.permissions : [];
      const perm = permissions.find(p => p && p.moduleId === moduleId);
      return perm ? !!(perm as any)[action] : false;
    } catch (e) {
      console.error("Permission check error:", e);
      return true;
    }
  };

  const [claims, setClaims] = useState<MedicalClaim[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [services, setServices] = useState<SystemService[]>([]);
  const [emergencyCases, setEmergencyCases] = useState<EmergencyCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingClaim, setIsAddingClaim] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MedicalClaim['status']>('all');
  const [notifications, setNotifications] = useState<{ id: string, message: string, type: 'success' | 'info' }[]>([]);
  const [selectedClaimHistory, setSelectedClaimHistory] = useState<MedicalClaim | null>(null);
  const [isAddingAssistanceFromClaim, setIsAddingAssistanceFromClaim] = useState(false);
  const [editingClaim, setEditingClaim] = useState<MedicalClaim | null>(null);
  const [approvalClaim, setApprovalClaim] = useState<MedicalClaim | null>(null);
  const [approvalAmount, setApprovalAmount] = useState(0);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [selectedClaimForAssistance, setSelectedClaimForAssistance] = useState<MedicalClaim | null>(null);
  const [managingAttachments, setManagingAttachments] = useState<MedicalClaim | null>(null);
  const [assistanceFromClaim, setAssistanceFromClaim] = useState({
    amount: 0,
    distributionDate: new Date().toISOString().split('T')[0],
    notes: '',
    recipientName: '',
    unit: 'ج.م',
    deliveryMethod: 'office'
  });

  const [newClaim, setNewClaim] = useState({
    familyId: '',
    memberId: '',
    serviceId: '',
    serviceCode: '',
    serviceCategory: 'Consultation',
    claimCode: '',
    icd10Code: '',
    cptCode: '',
    emergencyCaseId: '',
    diseaseName: '',
    amount: 0,
    approvedAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    discountReason: '',
    attachmentUrl: '',
    attachments: [] as MedicalClaim['attachments'],
    providerName: '',
    providerId: '',
    providerAddress: '',
    date: new Date().toISOString().split('T')[0],
    invoiceDate: new Date().toISOString().split('T')[0],
    isCoPay: false,
    coPayAmount: 0,
    notes: '',
    adjudicationNotes: ''
  });

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'medical_claims'));
    const unsub = onSnapshot(q, (snap) => {
      try {
        const claimsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as MedicalClaim));
        const sortedData = claimsData.sort((a, b) => {
          const getTime = (val: any) => {
            if (!val) return 0;
            if (typeof val.seconds === 'number') return val.seconds * 1000;
            if (val.toDate && typeof val.toDate === 'function') return val.toDate().getTime();
            if (typeof val === 'string') return new Date(val).getTime();
            if (val instanceof Date) return val.getTime();
            return 0;
          };
          return getTime(b.createdAt || b.date) - getTime(a.createdAt || a.date);
        });
        setClaims(sortedData);
        setLoading(false);
        setError(null);
      } catch (err) {
        console.error("Error processing claims data:", err);
        setError("حدث خطأ أثناء معالجة بيانات المطالبات");
        setLoading(false);
      }
    }, err => {
      setLoading(false);
      console.error("Claims load error:", err);
      setError("حدث خطأ أثناء تحميل المطالبات من قاعدة البيانات");
    });

    const fUnsub = onSnapshot(collection(db, 'families'), (snap) => {
      setFamilies(snap.docs.map(d => ({ id: d.id, ...d.data() } as Family)));
    }, err => {
      console.error("Families load error:", err);
    });

    const sUnsub = onSnapshot(collection(db, 'services'), (snap) => {
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemService)));
    }, err => {
      console.error("Services load error:", err);
    });

    const eUnsub = onSnapshot(collection(db, 'emergency_cases'), (snap) => {
      setEmergencyCases(snap.docs.map(d => ({ id: d.id, ...d.data() } as EmergencyCase)));
    }, err => {
      console.error("Emergencies load error:", err);
    });

    const mUnsub = onSnapshot(collectionGroup(db, 'members'), (snap) => {
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as FamilyMember)));
    }, err => {
      console.error("Members load error:", err);
    });

    return () => {
      unsub();
      fUnsub();
      sUnsub();
      eUnsub();
      mUnsub();
    };
  }, []);

  const addNotification = (message: string, type: 'success' | 'info' = 'success') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const handleAddClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const service = services.find(s => s.id === newClaim.serviceId);
    try {
      const initialStatus = 'pending';
      const generatedClaimCode = newClaim.claimCode || `CLM-${Date.now().toString().slice(-4)}`;
      const generatedServiceCode = newClaim.serviceCode || (service?.iconName || `MC-${Date.now().toString().slice(-6)}`);

      await addDoc(collection(db, 'medical_claims'), {
        ...newClaim,
        serviceName: service?.name || 'خدمة طبية',
        serviceCode: generatedServiceCode,
        claimCode: generatedClaimCode,
        status: initialStatus,
        createdAt: serverTimestamp(),
        statusHistory: [{
          status: initialStatus,
          date: new Date().toISOString(),
          updatedBy: auth.currentUser?.email || 'System',
          comment: 'تم إنشاء المطالبة'
        }]
      });
      setIsAddingClaim(false);
        setNewClaim({ 
          familyId: '', 
          memberId: '',
          serviceId: '', 
          serviceCode: '',
          serviceCategory: 'Consultation',
          claimCode: '',
          icd10Code: '',
          cptCode: '',
          emergencyCaseId: '',
          diseaseName: '',
          amount: 0, 
          approvedAmount: 0,
          discountAmount: 0,
          discountPercent: 0,
          discountReason: '',
          attachmentUrl: '',
          attachments: [],
          providerName: '', 
          providerId: '',
          providerAddress: '',
          date: new Date().toISOString().split('T')[0], 
          invoiceDate: new Date().toISOString().split('T')[0],
          isCoPay: false,
          coPayAmount: 0,
          notes: '',
          adjudicationNotes: ''
        });
      addNotification('تم إنشاء المطالبة الطبية بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'medical_claims');
    }
  };

  const handleUpdateStatus = async (claim: MedicalClaim, status: MedicalClaim['status'], approvedAmount?: number, comment?: string) => {
    try {
      await updateDoc(doc(db, 'medical_claims', claim.id), {
        status,
        approvedAmount: approvedAmount || claim.approvedAmount || null,
        statusHistory: arrayUnion({
          status,
          date: new Date().toISOString(),
          updatedBy: auth.currentUser?.email || 'System',
          comment: comment || (status === 'approved' ? 'تمت الموافقة على المطالبة' : status === 'paid' ? 'تم تأكيد الدفع والتسوية' : status === 'rejected' ? 'تم رفض المطالبة' : 'تحديث الحالة')
        })
      });

      if (status === 'approved' || status === 'paid' || status === 'rejected') {
        const message = status === 'approved' ? `المطالبة ${claim.claimCode} تم اعتمادها` : 
                        status === 'paid' ? `المطالبة ${claim.claimCode} تم دفعها بنجاح` :
                        `المطالبة ${claim.claimCode} تم رفضها`;
        addNotification(message, status === 'rejected' ? 'info' : 'success');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `medical_claims/${claim.id}`);
    }
  };

  const handleAddAssistanceFromClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaimForAssistance) return;

    try {
      // 1. Create Assistance record
      const assistanceData = {
        familyId: selectedClaimForAssistance.familyId,
        targetMemberId: selectedClaimForAssistance.memberId || null,
        claimId: selectedClaimForAssistance.id,
        amount: assistanceFromClaim.amount,
        type: selectedClaimForAssistance.serviceName,
        unit: assistanceFromClaim.unit,
        distributionDate: assistanceFromClaim.distributionDate,
        isDelivered: true,
        deliveryDate: assistanceFromClaim.distributionDate,
        deliveryMethod: assistanceFromClaim.deliveryMethod,
        recipientName: assistanceFromClaim.recipientName,
        notes: assistanceFromClaim.notes || `مساعدة تم إنشاؤها من مطالبة طبية رقم ${selectedClaimForAssistance.claimCode}`,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'assistances'), assistanceData);

      // 2. Update Claim status if needed (or just add to history)
      const newStatus = assistanceFromClaim.amount >= (selectedClaimForAssistance.approvedAmount || selectedClaimForAssistance.amount) ? 'paid' : 'partially_paid';
      
      await updateDoc(doc(db, 'medical_claims', selectedClaimForAssistance.id), {
        status: newStatus,
        statusHistory: arrayUnion({
          status: newStatus,
          date: new Date().toISOString(),
          updatedBy: auth.currentUser?.email || 'System',
          comment: `تم إضافة سجل مساعدة بقيمة ${assistanceFromClaim.amount} ج.م`
        })
      });

      setIsAddingAssistanceFromClaim(false);
      setSelectedClaimForAssistance(null);
      addNotification('تم تسجيل المساعدة وربطها بالمطالبة بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'assistances');
    }
  };

  const handleUpdateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClaim) return;
    try {
      await updateDoc(doc(db, 'medical_claims', editingClaim.id), {
        ...editingClaim,
        statusHistory: arrayUnion({
          status: editingClaim.status,
          date: new Date().toISOString(),
          updatedBy: auth.currentUser?.email || 'System',
          comment: 'تم تحديث بيانات المطالبة / المرفقات'
        })
      });
      setEditingClaim(null);
      addNotification('تم تحديث بيانات المطالبة بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `medical_claims/${editingClaim.id}`);
    }
  };

  const handleDeleteClaim = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذه المطالبة؟')) return;
    try {
      await deleteDoc(doc(db, 'medical_claims', id));
      addNotification('تم حذف المطالبة بنجاح', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `medical_claims/${id}`);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, mode: 'new' | 'edit' | 'manage') => {
    const files = event.target.files;
    if (!files) return;

    const newAttachments: any[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      newAttachments.push({
        name: file.name,
        url: dataUrl,
        type: file.type.includes('pdf') ? 'pdf' : file.type.includes('image') ? 'image' : 'other',
        uploadedAt: new Date().toISOString()
      });
    }

    if (mode === 'new') {
      setNewClaim(prev => ({ ...prev, attachments: [...(prev.attachments || []), ...newAttachments] }));
    } else if (mode === 'edit') {
      setEditingClaim(prev => prev ? ({ ...prev, attachments: [...(prev.attachments || []), ...newAttachments] }) : null);
    } else if (mode === 'manage') {
      setManagingAttachments(prev => prev ? ({ ...prev, attachments: [...(prev.attachments || []), ...newAttachments] }) : null);
    }
  };

  const removeAttachment = (index: number, mode: 'new' | 'edit' | 'manage') => {
    if (mode === 'new') {
      setNewClaim(prev => ({ ...prev, attachments: prev.attachments?.filter((_, i) => i !== index) }));
    } else if (mode === 'edit') {
      setEditingClaim(prev => prev ? ({ ...prev, attachments: prev.attachments?.filter((_, i) => i !== index) }) : null);
    } else {
      setManagingAttachments(prev => prev ? ({ ...prev, attachments: prev.attachments?.filter((_, i) => i !== index) }) : null);
    }
  };

  const handleUpdateAttachmentsOnly = async () => {
    if (!managingAttachments) return;
    try {
      await updateDoc(doc(db, 'medical_claims', managingAttachments.id), {
        attachments: managingAttachments.attachments || [],
        statusHistory: arrayUnion({
          status: managingAttachments.status,
          date: new Date().toISOString(),
          updatedBy: auth.currentUser?.email || 'System',
          comment: 'تم تحديث المرفقات الطبية'
        })
      });
      setManagingAttachments(null);
      addNotification('تم تحديث المرفقات بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `medical_claims/${managingAttachments.id}`);
    }
  };

  const filteredClaims = (claims || []).filter(c => {
    if (!c) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    const searchLower = (search || '').toLowerCase();
    const familyName = families.find(f => f.id === c.familyId)?.name?.toLowerCase() || '';
    const memberName = members.find(m => m.id === c.memberId)?.name?.toLowerCase() || '';
    
    if (search && 
        !(c.claimCode || '').toLowerCase().includes(searchLower) && 
        !(c.providerName || '').toLowerCase().includes(searchLower) &&
        !(c.serviceName || '').toLowerCase().includes(searchLower) &&
        !(c.icd10Code || '').toLowerCase().includes(searchLower) &&
        !(c.cptCode || '').toLowerCase().includes(searchLower) &&
        !(c.serviceCategory || '').toLowerCase().includes(searchLower) &&
        !familyName.includes(searchLower) &&
        !memberName.includes(searchLower)
    ) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center">
          <AlertCircle className="w-8 h-8" />
        </div>
        <p className="text-xl font-black text-gray-900">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="bg-gray-100 text-gray-600 px-6 py-2 rounded-xl font-bold"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  // Dashboard Stats Calculation with Safeties
  const stats = React.useMemo(() => {
    try {
      const validClaims = Array.isArray(claims) ? claims.filter(c => c && typeof c === 'object') : [];
      return {
        total: validClaims.length,
        pending: validClaims.filter(c => c.status === 'pending').length,
        pendingAmount: validClaims.filter(c => c.status === 'pending').reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
        approvedAmount: validClaims.filter(c => c.status !== 'rejected' && c.status !== 'pending').reduce((sum, c) => sum + (Number(c.approvedAmount) || 0), 0),
        paidAmount: validClaims.filter(c => c.status === 'paid').reduce((sum, c) => sum + (Number(c.approvedAmount) || 0), 0),
        processedCount: validClaims.filter(c => c.status !== 'pending').length
      };
    } catch (e) {
      console.error("Stats calculation error:", e);
      return { total: 0, pending: 0, pendingAmount: 0, approvedAmount: 0, paidAmount: 0, processedCount: 0 };
    }
  }, [claims]);

  return (
    <div className="space-y-8">
      {/* Notifications Portal Alternative (Top Right Overlay) */}
      <div className="fixed top-6 left-6 z-[60] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "pointer-events-auto px-6 py-4 rounded-2xl shadow-xl border flex items-center gap-4 min-w-[300px]",
                n.type === 'success' ? "bg-emerald-600 border-emerald-500 text-white" : "bg-blue-600 border-blue-500 text-white"
              )}
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </div>
              <p className="font-black text-sm">{n.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">إدارة المطالبات الطبية</h2>
          <p className="text-gray-400 font-bold mt-1 uppercase tracking-widest text-xs">تجهيز وتسوية فواتير الخدمات الطبية وفق المعايير العالمية</p>
        </div>
        {hasPermission('claims', 'canAdd') && (
          <button 
            onClick={() => setIsAddingClaim(true)}
            className="bg-blue-600 text-white px-8 py-4 rounded-[24px] font-black flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
          >
            <Plus className="w-6 h-6" />
            طلب مطالبة جديدة
          </button>
        )}
      </div>

      {/* Global Standard Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col justify-between group hover:border-blue-200 transition-all">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 group-hover:rotate-12 transition-transform">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest">إجمالي الحالات</span>
          </div>
          <div className="mt-6">
            <h4 className="text-3xl font-black text-gray-900 tabular-nums">{stats.total}</h4>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <p className="text-xs font-bold text-gray-400">{stats.processedCount} حالة مكتملة/معالجة</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col justify-between group hover:border-amber-200 transition-all">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 group-hover:rotate-12 transition-transform">
              <Clock className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-amber-500 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-widest">تحت المراجعة</span>
          </div>
          <div className="mt-6">
            <h4 className="text-3xl font-black text-gray-900 tabular-nums">{(stats.pendingAmount || 0).toLocaleString()}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold text-gray-400 mr-1.5">ج.م</span>
              <p className="text-xs font-bold text-amber-500">{stats.pending} مطالبات عالقة</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col justify-between group hover:border-emerald-200 transition-all">
          <div className="flex justify-between items-start">
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:rotate-12 transition-transform">
              <DollarSign className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-widest">إجمالي المدفوعات</span>
          </div>
          <div className="mt-6">
            <h4 className="text-3xl font-black text-gray-900 tabular-nums">{(stats.paidAmount || 0).toLocaleString()}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold text-gray-400 mr-1.5">ج.م</span>
              <p className="text-xs font-bold text-emerald-500">تمت التسوية بنجاح</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 rounded-[32px] shadow-xl shadow-indigo-100 flex flex-col justify-between text-white group overflow-hidden relative">
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
            <Activity className="w-32 h-32" />
          </div>
          <div className="flex justify-between items-start relative z-10">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-white">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] font-black bg-white/20 px-3 py-1 rounded-full uppercase tracking-widest">المبالغ المعتمدة</span>
          </div>
          <div className="mt-6 relative z-10">
            <h4 className="text-3xl font-black tabular-nums">{(stats.approvedAmount || 0).toLocaleString()}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold text-indigo-200 mr-1.5">ج.م</span>
              <p className="text-xs font-bold text-indigo-100">بانتظار الصرف النهائي</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-3 relative">
          <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            className="w-full bg-white border border-gray-100 rounded-[24px] pr-14 pl-6 py-5 outline-none font-bold text-lg shadow-sm focus:border-blue-200 transition-all"
            placeholder="بحث بالكود أو جهة تقديم الخدمة..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select 
          className="bg-white border border-gray-100 rounded-[24px] px-8 py-5 outline-none font-black text-gray-600 shadow-sm"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
        >
          <option value="all">كل المطالبات</option>
          <option value="pending">قيد المراجعة</option>
          <option value="approved">معتمدة</option>
          <option value="paid">تمت التسوية</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        {filteredClaims.length > 0 ? (
          filteredClaims.map((claim) => (
            <motion.div 
              key={claim.id}
              className="bg-white rounded-[40px] border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-blue-50/50 transition-all overflow-hidden flex flex-col group"
            >
              <div className="p-8 space-y-6 flex-1">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full border border-blue-100 tracking-widest uppercase inline-block w-fit">
                        {claim.claimCode}
                      </span>
                      {claim.serviceCategory && (
                        <span className="text-[8px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg border border-indigo-100 tracking-tighter uppercase inline-block">
                          {claim.serviceCategory}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                       <Building2 className="w-3.5 h-3.5 text-gray-400" />
                       <span className="text-xs font-bold text-gray-500">{claim.providerName}</span>
                    </div>
                  </div>
                  <span className={cn(
                      "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 border shadow-sm",
                      claim.status === 'pending' ? "bg-amber-50 text-amber-600 border-amber-200" :
                      claim.status === 'approved' ? "bg-blue-50 text-blue-600 border-blue-200" :
                      claim.status === 'paid' ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-gray-50 text-gray-400 border-gray-200"
                    )}>
                      <div className={cn("w-1.5 h-1.5 rounded-full", claim.status === 'pending' ? "bg-amber-500 animate-pulse" : claim.status === 'paid' ? "bg-emerald-500" : "bg-blue-500")} />
                      {claim.status === 'pending' ? 'قيد المراجعة' : 
                       claim.status === 'approved' ? 'معتمدة' : 
                       claim.status === 'paid' ? 'تمت التسوية' : claim.status}
                  </span>
                </div>

              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner group-hover:rotate-6 transition-transform duration-500">
                  <Stethoscope className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="font-black text-2xl text-gray-900 leading-tight">{claim.serviceName}</h3>
                  <p className="text-xs font-bold text-gray-400">كود الخدمة: {claim.serviceCode}</p>
                </div>
              </div>

                <div className="grid grid-cols-2 gap-4 py-3 bg-gray-50/50 rounded-2xl px-6">
                  {claim.diseaseName && (
                    <div className="col-span-2 border-b border-gray-100 pb-2 mb-2">
                       <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">التشخيص / المرض</p>
                       <p className="text-xs font-black text-gray-800">{claim.diseaseName}</p>
                    </div>
                  )}
                  {claim.icd10Code && (
                    <div className="space-y-0.5">
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">كود التشخيص ICD-10</p>
                      <p className="text-xs font-black text-gray-700 font-mono tracking-tight">{claim.icd10Code}</p>
                    </div>
                  )}
                  {claim.cptCode && (
                    <div className="space-y-0.5">
                      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">كود الإجراء CPT</p>
                      <p className="text-xs font-black text-gray-700 font-mono tracking-tight">{claim.cptCode}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-end border-b border-gray-50 pb-3">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">المبلغ المطلوب</span>
                    <div className="text-left">
                      <span className="text-2xl font-black text-gray-900 tabular-nums">{(claim.amount || 0).toLocaleString()}</span>
                      <span className="text-xs font-bold text-gray-400 mr-1.5">ج.م</span>
                    </div>
                  </div>
                  {claim.isCoPay && claim.coPayAmount && (
                    <div className="flex justify-between items-center bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-amber-600" />
                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">حصة المستفيد (Co-Pay)</span>
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-black text-amber-700 tabular-nums">{(Number(claim.coPayAmount) || 0).toLocaleString()}</span>
                        <span className="text-[10px] font-bold text-amber-500 mr-1">ج.م</span>
                      </div>
                    </div>
                  )}
                {claim.approvedAmount && (
                  <div className="flex justify-between items-end border-b border-gray-50 pb-3">
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">المبلغ المعتمد</span>
                    <div className="text-left">
                      <span className="text-xl font-black text-emerald-600 tabular-nums">{(Number(claim.approvedAmount) || 0).toLocaleString()}</span>
                      <span className="text-[10px] font-bold text-emerald-400 mr-1.5">ج.م</span>
                    </div>
                  </div>
                )}
                {claim.discountAmount && Number(claim.discountAmount) > 0 ? (
                  <div className="flex flex-col gap-1 border-b border-gray-50 pb-3">
                    <div className="flex justify-between items-end">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">قيمة الخصم</span>
                        {claim.discountPercent ? <span className="text-[8px] font-bold text-rose-400">({claim.discountPercent}%)</span> : null}
                      </div>
                      <div className="text-left">
                        <span className="text-lg font-black text-rose-600 tabular-nums">{(Number(claim.discountAmount) || 0).toLocaleString()}</span>
                        <span className="text-[10px] font-bold text-rose-400 mr-1.5">ج.م</span>
                      </div>
                    </div>
                    {claim.discountReason && (
                      <p className="text-[10px] font-bold text-gray-400 bg-gray-50 p-2 rounded-lg border border-gray-100">
                        سبب الخصم: {claim.discountReason}
                      </p>
                    )}
                  </div>
                ) : null}
                <div className="flex justify-between items-center text-xs font-bold text-gray-400">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{claim.date}</span>
                  </div>
                  {claim.attachmentUrl && (
                    <a 
                      href={claim.attachmentUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-colors border border-blue-100"
                    >
                      <Paperclip className="w-3 h-3" />
                      <span className="text-[10px] font-black uppercase">المرفق</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                  {claim.attachments && claim.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {claim.attachments.map((at, idx) => (
                        <button 
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (at.url) {
                              window.open(at.url, '_blank', 'noopener,noreferrer');
                            }
                          }}
                          className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors border border-indigo-100 shrink-0"
                          title={at.name}
                        >
                          <FileText className="w-3 h-3" />
                          <span className="text-[10px] font-black uppercase truncate max-w-[60px]">{at.name}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-gray-400 mt-2">
                  <User className="w-3.5 h-3.5" />
                  <span>{families.find(f => f.id === claim.familyId)?.name || 'عائلة غير معروفة'}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50/50 p-6 flex gap-3 border-t border-gray-100">
                   <button 
                     onClick={() => setManagingAttachments(claim)}
                     className="w-12 h-12 bg-white text-gray-400 border border-gray-200 rounded-2xl flex items-center justify-center hover:text-blue-600 hover:border-blue-100 hover:bg-blue-50 transition-all shadow-sm"
                     title="إدارة المرفقات"
                   >
                     <Paperclip className="w-5 h-5" />
                   </button>
               {claim.status === 'pending' && hasPermission('claims', 'canApprove') && (
                 <>
                   <button 
                     onClick={() => {
                        setApprovalClaim(claim);
                        setApprovalAmount(claim.amount);
                        setApprovalNotes('تم اعتماد المطالبة بعد المراجعة الطبية');
                        setIsRejecting(false);
                      }}
                     className="flex-1 bg-blue-600 text-white py-3 rounded-2xl font-black text-xs hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                   >
                     <CheckCircle2 className="w-4 h-4" />
                     اعتماد
                   </button>
                   <button 
                     onClick={() => {
                        setApprovalClaim(claim);
                        setIsRejecting(true);
                        setApprovalNotes('');
                      }}
                     className="flex-1 bg-rose-100 text-rose-600 py-3 rounded-2xl font-black text-xs hover:bg-rose-200 transition-all flex items-center justify-center gap-2"
                   >
                     <XCircle className="w-4 h-4" />
                     رفض
                   </button>
                 </>
               )}
               {claim.status === 'approved' && hasPermission('claims', 'canApprove') && (
                 <button 
                   onClick={() => {
                     setSelectedClaimForAssistance(claim);
                     setAssistanceFromClaim(prev => ({
                       ...prev,
                       amount: claim.approvedAmount || claim.amount,
                       recipientName: families.find(f => f.id === claim.familyId)?.name || ''
                     }));
                     setIsAddingAssistanceFromClaim(true);
                   }}
                   className="flex-1 bg-emerald-600 text-white py-3 rounded-2xl font-black text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                 >
                   <Receipt className="w-4 h-4" />
                   صرف وتسوية
                 </button>
               )}
               {claim.status === 'pending' && hasPermission('assistance', 'canAdd') && (
                 <button 
                   onClick={() => {
                     setSelectedClaimForAssistance(claim);
                     setAssistanceFromClaim(prev => ({
                       ...prev,
                       amount: claim.approvedAmount || claim.amount,
                       recipientName: families.find(f => f.id === claim.familyId)?.name || ''
                     }));
                     setIsAddingAssistanceFromClaim(true);
                   }}
                   className="w-12 h-12 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl flex items-center justify-center hover:bg-rose-100 transition-all shadow-sm"
                   title="إضافة مساعدة فورية"
                 >
                   <Heart className="w-5 h-5" />
                 </button>
               )}
               {hasPermission('claims', 'canEdit') && (
                 <button 
                   onClick={() => setEditingClaim(claim)}
                   className="w-12 h-12 bg-white text-gray-400 border border-gray-200 rounded-2xl flex items-center justify-center hover:text-blue-600 hover:border-blue-100 hover:bg-blue-50 transition-all shadow-sm"
                   title="مراجعة وتعديل"
                 >
                   <Edit2 className="w-5 h-5" />
                 </button>
               )}
               <button 
                 onClick={() => setSelectedClaimHistory(claim)}
                 className="w-12 h-12 bg-white text-gray-400 border border-gray-200 rounded-2xl flex items-center justify-center hover:text-indigo-600 hover:border-indigo-100 hover:bg-indigo-50 transition-all shadow-sm"
                 title="سجل الحالة"
               >
                 <History className="w-5 h-5" />
               </button>
               {hasPermission('claims', 'canDelete') && (
                 <button 
                   onClick={() => handleDeleteClaim(claim.id)}
                   className="w-12 h-12 bg-white text-gray-400 border border-gray-200 rounded-2xl flex items-center justify-center hover:text-rose-600 hover:border-rose-100 transition-all shadow-sm"
                   title="حذف المطالبة"
                 >
                   <Trash2 className="w-5 h-5" />
                 </button>
               )}
            </div>
          </motion.div>
          ))
        ) : (
          <div className="col-span-full py-32 bg-gray-50/50 rounded-[48px] border-4 border-dashed border-gray-100 flex flex-col items-center justify-center text-gray-300">
            <Receipt className="w-24 h-24 mb-6 opacity-10" />
            <p className="text-2xl font-black text-gray-400">لا توجد مطالبات طبية حالياً</p>
            <p className="font-bold text-gray-400/60 mt-2">يمكنك البدء بإضافة مطالبة جديدة باستخدام الزر أعلاه</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {managingAttachments && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setManagingAttachments(null)}
               className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" 
             />
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="bg-white rounded-[48px] w-full max-w-xl relative z-10 p-10 shadow-3xl text-right overflow-hidden shadow-emerald-50/50"
               dir="rtl"
             >
               <div className="flex items-center justify-between mb-8 border-b border-gray-50 pb-6">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                      <Paperclip className="w-7 h-7" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-gray-900 leading-none">المرفقات الطبية والتقارير</h2>
                      <p className="text-[10px] text-gray-400 font-bold mt-2 uppercase tracking-widest leading-none">إدارة الوثائق للمطالبة رقم: {managingAttachments.claimCode}</p>
                    </div>
                 </div>
                 <button onClick={() => setManagingAttachments(null)} className="p-3 hover:bg-gray-100 rounded-2xl text-gray-400 transition-colors"><XCircle className="w-7 h-7" /></button>
               </div>

               <div className="space-y-8">
                 <div className="bg-blue-50/30 p-8 rounded-[32px] border-2 border-dashed border-blue-200/50 space-y-5 text-center">
                    <div className="space-y-1">
                       <p className="font-black text-blue-900 text-lg">مركز رفع الوثائق</p>
                       <p className="text-xs font-bold text-gray-400">يمكنك رفع صور التقارير، الأشعة، أو الفواتير الأصلية (JPG, PNG, PDF)</p>
                    </div>
                    <div className="relative">
                      <input 
                        type="file"
                        multiple
                        id="file-upload-manage-final"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, 'manage')}
                        accept="image/*,.pdf"
                      />
                      <label 
                        htmlFor="file-upload-manage-final"
                        className="cursor-pointer w-full bg-blue-600 text-white rounded-[24px] py-5 font-black text-sm flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 group"
                      >
                        <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                        اختيار ملفات من الجهاز
                      </label>
                    </div>
                 </div>

                 <div className="max-h-[350px] overflow-y-auto pr-2 space-y-4 custom-scrollbar px-2">
                   {managingAttachments.attachments && managingAttachments.attachments.length > 0 ? (
                     managingAttachments.attachments.map((at, idx) => (
                       <div key={idx} className="bg-white p-5 rounded-3xl border border-gray-100 flex items-center justify-between group hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50/50 transition-all">
                         <div className="flex items-center gap-5 cursor-pointer flex-1 min-w-0" onClick={() => window.open(at.url, '_blank')}>
                           <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-blue-50 transition-colors">
                             {at.type === 'pdf' ? <FileText className="w-6 h-6" /> : <Paperclip className="w-6 h-6" />}
                           </div>
                           <div className="flex-1 min-w-0">
                             <p className="text-sm font-black text-gray-900 truncate">{at.name}</p>
                             <div className="flex items-center gap-3 mt-1">
                                <span className={cn(
                                  "text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter",
                                  at.type === 'pdf' ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                                )}>{at.type}</span>
                                <span className="text-[9px] font-bold text-gray-400">{new Date(at.uploadedAt).toLocaleDateString('ar-EG')}</span>
                             </div>
                           </div>
                         </div>
                         <div className="flex items-center gap-2">
                            <button 
                              onClick={() => window.open(at.url, '_blank')}
                              className="p-3 text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                              title="عرض الملف"
                            >
                              <ExternalLink className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => removeAttachment(idx, 'manage')}
                              className="p-3 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all"
                              title="حذف الملف"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                         </div>
                       </div>
                     ))
                   ) : (
                     <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-[40px] bg-gray-50/30">
                       <Paperclip className="w-16 h-16 text-gray-200 mx-auto mb-4 opacity-50" />
                       <p className="text-lg font-black text-gray-400">لا توجد مرفقات مسجلة حالياً</p>
                       <p className="text-xs font-bold text-gray-300 mt-1 uppercase tracking-widest">قم برفع الوثائق اللازمة لاستكمال إجراءات المطالبة</p>
                     </div>
                   )}
                 </div>

                 <div className="flex gap-4 pt-6 mt-4 border-t border-gray-50">
                    <button 
                      onClick={handleUpdateAttachmentsOnly}
                      className="flex-1 bg-blue-600 text-white py-5 rounded-[24px] font-black text-lg shadow-2xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-3"
                    >
                      <CheckCircle2 className="w-6 h-6" />
                      حفظ وتحديث المستندات
                    </button>
                    <button 
                      onClick={() => setManagingAttachments(null)}
                      className="px-10 bg-gray-100 text-gray-500 py-5 rounded-[24px] font-black text-lg hover:bg-gray-200 transition-all"
                    >إغلاق</button>
                 </div>
               </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {approvalClaim && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setApprovalClaim(null)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[48px] w-full max-w-lg relative z-10 p-10 shadow-3xl text-right"
              dir="rtl"
            >
              <h2 className={cn(
                "text-2xl font-black mb-6 border-b border-gray-50 pb-6",
                isRejecting ? "text-rose-600" : "text-blue-600"
              )}>
                {isRejecting ? 'رفض المطالبة الطبية' : 'اعتماد المطالبة الطبية'}
              </h2>

              <div className="space-y-6">
                {!isRejecting ? (
                  <div className="space-y-1.5 text-right">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المبلغ المعتمد النهائي</label>
                    <input 
                      type="number"
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-black text-xl text-center"
                      value={approvalAmount}
                      onChange={e => setApprovalAmount(Number(e.target.value))}
                    />
                    <p className="text-[10px] text-gray-400 font-bold mr-2 mt-1">المبلغ المطلوب الأصلي: {approvalClaim.amount} ريال</p>
                  </div>
                ) : (
                  <p className="text-gray-500 font-bold">هل أنت متأكد من رفض هذه المطالبة؟ يرجى ذكر السبب بالتفصيل.</p>
                )}

                <div className="space-y-1.5 text-right">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">
                    {isRejecting ? 'سبب الرفض' : 'ملاحظات الاعتماد (اختياري)'}
                  </label>
                  <textarea 
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold min-h-[120px]"
                    placeholder={isRejecting ? 'اكتب سبب الرفض هنا...' : 'اكتب ملاحظات إضافية هنا...'}
                    value={approvalNotes}
                    onChange={e => setApprovalNotes(e.target.value)}
                  />
                </div>

                <div className="flex gap-4 mt-8">
                  <button 
                    onClick={() => {
                      if (isRejecting) {
                        if (!approvalNotes.trim()) { alert('يرجى ذكر سبب الرفض'); return; }
                        handleUpdateStatus(approvalClaim, 'rejected', undefined, approvalNotes);
                      } else {
                        handleUpdateStatus(approvalClaim, 'approved', approvalAmount, approvalNotes || 'تم اعتماد المطالبة بعد المراجعة الطبية');
                      }
                      setApprovalClaim(null);
                    }}
                    className={cn(
                      "flex-1 py-4 rounded-2xl font-black text-sm text-white shadow-xl transition-all",
                      isRejecting ? "bg-rose-600 shadow-rose-100 hover:bg-rose-700" : "bg-blue-600 shadow-blue-100 hover:bg-blue-700"
                    )}
                  >
                    {isRejecting ? 'تأكيد الرفض وإغلاق المطالبة' : 'اعتماد المبلغ وحفظ القرار'}
                  </button>
                  <button 
                    onClick={() => setApprovalClaim(null)}
                    className="px-8 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black text-sm hover:bg-gray-200 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddingClaim && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingClaim(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[48px] w-full max-w-2xl relative z-10 p-10 shadow-3xl"
            >
              <h2 className="text-2xl font-black text-gray-900 mb-8 border-b border-gray-50 pb-6">رفع مطالبة طبية جديدة</h2>
              <form onSubmit={handleAddClaim} className="grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto max-h-[70vh] px-2">
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8 bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">العائلة المستفيدة</label>
                    <select 
                      required
                      className="w-full bg-white border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                      value={newClaim.familyId}
                      onChange={e => {
                        const fid = e.target.value;
                        setNewClaim({...newClaim, familyId: fid, memberId: ''});
                      }}
                    >
                      <option value="">اختر العائلة...</option>
                      {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الفرد المستفيد (اختياري)</label>
                    <select 
                      className={cn(
                        "w-full bg-white border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all",
                        !newClaim.familyId && "opacity-50 cursor-not-allowed"
                      )}
                      disabled={!newClaim.familyId}
                      value={newClaim.memberId}
                      onChange={e => setNewClaim({...newClaim, memberId: e.target.value})}
                    >
                      <option value="">كل العائلة...</option>
                      {members.filter(m => m.familyId === newClaim.familyId).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest mr-2">مرتبط بحالة طوارئ؟</label>
                      <select 
                        className={cn(
                          "w-full bg-white border-2 border-transparent focus:border-red-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all",
                          !newClaim.familyId && "opacity-50 cursor-not-allowed"
                        )}
                        disabled={!newClaim.familyId}
                        value={newClaim.emergencyCaseId || ''}
                        onChange={e => setNewClaim({...newClaim, emergencyCaseId: e.target.value})}
                      >
                        <option value="">غير مرتبط بحالة طوارئ (حالة عامة)</option>
                        {emergencyCases.filter(c => c.familyId === newClaim.familyId).map(c => (
                          <option key={c.id} value={c.id}>{c.serviceName || c.caseCode} - {new Date(c.createdAt).toLocaleDateString('ar-EG')}</option>
                        ))}
                      </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-blue-600 uppercase tracking-[0.2em] border-r-4 border-blue-600 pr-4 mr-2">تفاصيل الخدمة الطبية</h3>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تصنيف الخدمة</label>
                      <select 
                        required
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newClaim.serviceCategory}
                        onChange={e => setNewClaim({...newClaim, serviceCategory: e.target.value})}
                      >
                        <option value="Consultation">استشارة طبية (Consultation)</option>
                        <option value="Surgery">عملية جراحية (Surgery)</option>
                        <option value="Diagnostics">أشعة وتشخيص (Diagnostics)</option>
                        <option value="Laboratory">تحاليل طبية (Laboratory)</option>
                        <option value="Pharmacy">أدوية وصيدلية (Pharmacy)</option>
                        <option value="Inpatient">إقامة مستشفى (Inpatient)</option>
                        <option value="Emergency">طوارئ (Emergency)</option>
                        <option value="Physiotherapy">علاج طبيعي (Physiotherapy)</option>
                        <option value="Dental">أسنان (Dental)</option>
                        <option value="Optical">عيون ونظارات (Optical)</option>
                        <option value="Other">أخرى</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">التشخيص / المرض</label>
                      <input 
                        placeholder="اسم المرض أو التشخيص..."
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newClaim.diseaseName}
                        onChange={e => setNewClaim({...newClaim, diseaseName: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">كود التشخيص ICD-10</label>
                      <input 
                        placeholder="Diagnosis Code (e.g., E11.9)"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all font-mono"
                        value={newClaim.icd10Code}
                        onChange={e => setNewClaim({...newClaim, icd10Code: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">كود الإجراء CPT</label>
                      <input 
                        placeholder="Procedure Code (e.g., 99213)"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all font-mono"
                        value={newClaim.cptCode}
                        onChange={e => setNewClaim({...newClaim, cptCode: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الخدمة المسجلة بالنظام</label>
                      <select 
                        required
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newClaim.serviceId}
                        onChange={e => setNewClaim({...newClaim, serviceId: e.target.value})}
                      >
                        <option value="">اختر الخدمة...</option>
                        {services.filter(s => s.category === 'medical').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-emerald-600 uppercase tracking-[0.2em] border-r-4 border-emerald-600 pr-4 mr-2">البيانات المالية والجهة</h3>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">جهة تقديم الخدمة</label>
                      <div className="relative">
                         <Building2 className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                         <input 
                           placeholder="المستشفى أو المركز الطبي..."
                           required
                           className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl pr-14 pl-6 py-4 outline-none font-bold shadow-sm transition-all"
                           value={newClaim.providerName}
                           onChange={e => setNewClaim({...newClaim, providerName: e.target.value})}
                         />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">مبلغ الفاتورة (Gross Amount)</label>
                        <div className="relative">
                          <input 
                            type="number"
                            required
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl pr-6 pl-14 py-4 outline-none font-black text-xl tabular-nums shadow-sm"
                            value={newClaim.amount || ''}
                            onChange={e => setNewClaim({...newClaim, amount: Number(e.target.value)})}
                          />
                          <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs uppercase">ج.م</span>
                        </div>
                      </div>
                      <div className="bg-amber-50/30 p-4 rounded-2xl border border-amber-100/50 space-y-3">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox"
                            className="w-5 h-5 rounded-lg border-amber-200 text-amber-600 focus:ring-amber-500"
                            checked={newClaim.isCoPay}
                            onChange={e => setNewClaim({...newClaim, isCoPay: e.target.checked})}
                          />
                          <label className="text-xs font-black text-amber-900">هناك مساهمة من المستفيد (Co-Payment)</label>
                        </div>
                        {newClaim.isCoPay && (
                          <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                             <div className="relative">
                               <input 
                                 type="number"
                                 placeholder="مبلغ المساهمة..."
                                 className="w-full bg-white border-2 border-emerald-100/50 focus:border-emerald-600/20 rounded-xl pr-6 pl-14 py-3 outline-none font-black text-lg tabular-nums shadow-sm"
                                 value={newClaim.coPayAmount || ''}
                                 onChange={e => setNewClaim({...newClaim, coPayAmount: Number(e.target.value)})}
                               />
                               <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">ج.م</span>
                             </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-4 border-t border-gray-50 pt-8 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">رقم المطالبة بالنظام الخارجي</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newClaim.claimCode}
                        onChange={e => setNewClaim({...newClaim, claimCode: e.target.value})}
                        placeholder="External Reference Number"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ الفاتورة</label>
                      <input 
                        type="date"
                        required
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-8 py-4 outline-none font-bold shadow-sm"
                        value={newClaim.invoiceDate}
                        onChange={e => setNewClaim({...newClaim, invoiceDate: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المرفقات (أشعة، فواتير، تقارير)</label>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <Paperclip className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input 
                          placeholder="رابط المرفقات الرئيسي..."
                          className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-3xl pr-14 pl-6 py-5 outline-none font-bold shadow-sm transition-all text-sm"
                          value={newClaim.attachmentUrl}
                          onChange={e => setNewClaim({...newClaim, attachmentUrl: e.target.value})}
                        />
                      </div>
                      <div className="relative">
                        <input 
                          type="file"
                          multiple
                          id="file-upload-new"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, 'new')}
                          accept="image/*,.pdf"
                        />
                        <label 
                          htmlFor="file-upload-new"
                          className="cursor-pointer px-8 bg-blue-600 text-white rounded-3xl hover:bg-blue-700 transition-all flex flex-col items-center justify-center gap-1 min-w-[140px] h-full shadow-lg shadow-blue-100"
                        >
                          <Plus className="w-4 h-4" />
                          <span className="text-[10px] font-black uppercase">رفع ملفات</span>
                        </label>
                      </div>
                    </div>

                    {newClaim.attachments && newClaim.attachments.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {newClaim.attachments.map((at, idx) => (
                        <div key={idx} className="relative group/at bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3">
                          <div 
                            className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0 cursor-pointer hover:bg-indigo-50 transition-colors"
                            onClick={() => {
                              if (at.url) {
                                window.open(at.url, '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            {at.type === 'pdf' ? <FileText className="w-4 h-4 text-rose-500" /> : <Paperclip className="w-4 h-4 text-blue-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-gray-700 truncate">{at.name}</p>
                            <p className="text-[8px] font-bold text-gray-400 uppercase">{at.type}</p>
                          </div>
                          <button 
                            type="button"
                            onClick={() => removeAttachment(idx, 'new')}
                            className="absolute -top-2 -left-2 w-6 h-6 bg-rose-600 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover/at:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      </div>
                    )}
                  </div>
                  <p className="px-4 text-[9px] font-bold text-gray-400">يمكنك وضع رابط مباشر أو اختيار ملفات (صور أو PDF) ليتم إرفاقها بالمطالبة.</p>
                </div>
                <div className="md:col-span-2 pt-10 flex gap-6">
                  <button type="submit" className="flex-1 bg-blue-600 text-white py-6 rounded-[32px] font-black text-xl shadow-2xl shadow-blue-100 hover:bg-blue-700 transition-all">تأكيد المطالبة</button>
                  <button type="button" onClick={() => setIsAddingClaim(false)} className="px-12 bg-gray-100 text-gray-500 py-6 rounded-[32px] font-black text-xl hover:bg-gray-200 transition-all">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddingAssistanceFromClaim && selectedClaimForAssistance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingAssistanceFromClaim(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[48px] w-full max-w-xl relative z-10 p-10 shadow-3xl"
            >
              <div className="flex items-center gap-4 mb-8 border-b border-gray-50 pb-6">
                <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
                  <Heart className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-gray-900 leading-none">تسجيل مساعدة للمطالبة</h2>
                  <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">{selectedClaimForAssistance.claimCode}</p>
                </div>
              </div>

              <form onSubmit={handleAddAssistanceFromClaim} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">مبلغ المساعدة</label>
                    <div className="relative">
                      <DollarSign className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input 
                        type="number"
                        required
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl pr-12 pl-6 py-4 outline-none font-black text-xl tabular-nums shadow-sm"
                        value={assistanceFromClaim.amount || ''}
                        onChange={e => setAssistanceFromClaim({...assistanceFromClaim, amount: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ التوزيع</label>
                    <input 
                      type="date"
                      required
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm"
                      value={assistanceFromClaim.distributionDate}
                      onChange={e => setAssistanceFromClaim({...assistanceFromClaim, distributionDate: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">اسم المستلم</label>
                  <input 
                    placeholder="اسم الشخص الذي استلم المساعدة..."
                    required
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm"
                    value={assistanceFromClaim.recipientName}
                    onChange={e => setAssistanceFromClaim({...assistanceFromClaim, recipientName: e.target.value})}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">ملاحظات إضافية</label>
                  <textarea 
                    rows={3}
                    className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm resize-none"
                    placeholder="أي ملاحظات حول عملية الصرف أو التسليم..."
                    value={assistanceFromClaim.notes}
                    onChange={e => setAssistanceFromClaim({...assistanceFromClaim, notes: e.target.value})}
                  />
                </div>

                <div className="pt-6 flex gap-4">
                  <button type="submit" className="flex-1 bg-rose-600 text-white py-5 rounded-[24px] font-black text-lg shadow-xl shadow-rose-100 hover:bg-rose-700 transition-all">تسجيل العملية</button>
                  <button type="button" onClick={() => setIsAddingAssistanceFromClaim(false)} className="px-10 bg-gray-100 text-gray-500 py-5 rounded-[24px] font-black text-lg hover:bg-gray-200 transition-all">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingClaim && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingClaim(null)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[48px] w-full max-w-2xl relative z-10 p-10 shadow-3xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center gap-4 mb-8 border-b border-gray-50 pb-6 text-right" dir="rtl">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <FileText className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-gray-900 leading-none">مراجعة وتعديل المطالبة</h2>
                  <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">{editingClaim.claimCode}</p>
                </div>
              </div>
              
              <form onSubmit={handleUpdateClaim} className="grid grid-cols-1 md:grid-cols-2 gap-8 text-right overflow-y-auto max-h-[70vh] px-2" dir="rtl">
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50/50 p-6 rounded-[32px] border border-gray-100">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">مرتبط بحالة طوارئ؟ (اختياري)</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-red-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newClaim.emergencyCaseId || ''}
                        onChange={e => setNewClaim({...newClaim, emergencyCaseId: e.target.value})}
                      >
                        <option value="">غير مرتبط بحالة طوارئ</option>
                        {emergencyCases.filter(c => c.familyId === newClaim.familyId && c.status === 'open').map(c => (
                          <option key={c.id} value={c.id}>{c.serviceName || c.caseCode} - {new Date(c.createdAt).toLocaleDateString('ar-EG')}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5 text-right">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">التشخيص / المرض</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl pr-6 pl-6 py-4 outline-none font-bold shadow-sm transition-all text-lg"
                        value={editingClaim.diseaseName || ''}
                        onChange={e => setEditingClaim({...editingClaim, diseaseName: e.target.value})}
                        placeholder="اسم المرض أو التشخيص..."
                      />
                    </div>
                    <div className="space-y-1.5 text-right">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">جهة تقديم الخدمة</label>
                    <input 
                      className="w-full bg-white border-2 border-transparent focus:border-blue-600/20 rounded-2xl pr-6 pl-6 py-4 outline-none font-bold shadow-sm transition-all text-lg"
                      value={editingClaim.providerName}
                      onChange={e => setEditingClaim({...editingClaim, providerName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5 text-right">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">الفرد المستفيد (عضو العائلة)</label>
                    <select 
                      className="w-full bg-white border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm"
                      value={editingClaim.memberId || ''}
                      onChange={e => setEditingClaim({...editingClaim, memberId: e.target.value})}
                    >
                      <option value="">كل العائلة...</option>
                      {members.filter(m => m.familyId === editingClaim.familyId).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-blue-600 uppercase tracking-[0.2em] pr-4 border-r-4 border-blue-600">تفاصيل الخدمة</h3>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تصنيف الخدمة</label>
                      <select 
                        required
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={editingClaim.serviceCategory || 'Consultation'}
                        onChange={e => setEditingClaim({...editingClaim, serviceCategory: e.target.value})}
                      >
                        <option value="Consultation">استشارة طبية (Consultation)</option>
                        <option value="Surgery">عملية جراحية (Surgery)</option>
                        <option value="Diagnostics">أشعة وتشخيص (Diagnostics)</option>
                        <option value="Laboratory">تحاليل طبية (Laboratory)</option>
                        <option value="Pharmacy">أدوية وصيدلية (Pharmacy)</option>
                        <option value="Inpatient">إقامة مستشفى (Inpatient)</option>
                        <option value="Emergency">طوارئ (Emergency)</option>
                        <option value="Physiotherapy">علاج طبيعي (Physiotherapy)</option>
                        <option value="Dental">أسنان (Dental)</option>
                        <option value="Optical">عيون ونظارات (Optical)</option>
                        <option value="Other">أخرى</option>
                      </select>
                    </div>
                    <div className="space-y-1.5 text-right">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">كود التشخيص ICD-10</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm font-mono"
                        value={editingClaim.icd10Code || ''}
                        onChange={e => setEditingClaim({...editingClaim, icd10Code: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5 text-right">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">كود الإجراء CPT</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm font-mono"
                        value={editingClaim.cptCode || ''}
                        onChange={e => setEditingClaim({...editingClaim, cptCode: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5 text-right">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">كود المطالبة الخارجي</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm"
                        value={editingClaim.claimCode}
                        onChange={e => setEditingClaim({...editingClaim, claimCode: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black text-emerald-600 uppercase tracking-[0.2em] pr-4 border-r-4 border-emerald-600">البيانات المالية</h3>
                  <div className="space-y-4">
                    <div className="space-y-1.5 text-right">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">قيمة المطالبة الأصلية</label>
                      <input 
                        type="number"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl pr-6 pl-6 py-4 outline-none font-black text-xl tabular-nums shadow-sm"
                        value={editingClaim.amount}
                        onChange={e => setEditingClaim({...editingClaim, amount: Number(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-1.5 text-right">
                      <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-1">المبلغ المعتمد</label>
                      <input 
                        type="number"
                        className="w-full bg-emerald-50/30 border-2 border-emerald-100/50 focus:border-emerald-600/20 rounded-2xl pr-6 pl-6 py-4 outline-none font-black text-xl tabular-nums shadow-sm"
                        value={editingClaim.approvedAmount || ''}
                        onChange={e => setEditingClaim({...editingClaim, approvedAmount: Number(e.target.value)})}
                      />
                    </div>
                    <div className="bg-amber-50/30 p-4 rounded-2xl border border-amber-100/50 space-y-3">
                        <div className="flex items-center gap-3">
                          <input 
                            type="checkbox"
                            dir="rtl"
                            className="w-5 h-5 rounded-lg border-amber-200 text-amber-600 focus:ring-amber-500"
                            checked={editingClaim.isCoPay || false}
                            onChange={e => setEditingClaim({...editingClaim, isCoPay: e.target.checked})}
                          />
                          <label className="text-xs font-black text-amber-900">مساهمة من المستفيد (Co-Pay)</label>
                        </div>
                        {editingClaim.isCoPay && (
                          <div className="space-y-1.5">
                             <div className="relative">
                               <input 
                                 type="number"
                                 placeholder="مبلغ المساهمة..."
                                 className="w-full bg-white border-2 border-emerald-100/50 focus:border-emerald-600/20 rounded-xl pr-6 pl-14 py-3 outline-none font-black text-lg tabular-nums shadow-sm"
                                 value={editingClaim.coPayAmount || ''}
                                 onChange={e => setEditingClaim({...editingClaim, coPayAmount: Number(e.target.value)})}
                               />
                               <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">ج.م</span>
                             </div>
                          </div>
                        )}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-gray-50 pt-8">
                  <div className="space-y-1.5 text-right">
                    <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-1">نسبة الخصم (%)</label>
                    <div className="relative">
                      <Percent className="absolute right-5 top-1/2 -translate-y-1/2 text-rose-300 w-4 h-4" />
                      <input 
                        type="number"
                        className="w-full bg-rose-50/20 border-2 border-rose-100/30 focus:border-rose-600/20 rounded-2xl pr-12 pl-6 py-4 outline-none font-black text-xl tabular-nums shadow-sm"
                        value={editingClaim.discountPercent || ''}
                        onChange={e => {
                          const pct = Number(e.target.value);
                          const amt = Number(((editingClaim.amount || 0) * (pct / 100)).toFixed(2));
                          setEditingClaim({...editingClaim, discountPercent: pct, discountAmount: amt});
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 text-right">
                    <label className="text-[10px] font-black text-rose-400 uppercase tracking-widest block mb-1">مبلغ الخصم</label>
                    <input 
                      type="number"
                      className="w-full bg-rose-50/30 border-2 border-rose-100/50 focus:border-rose-600/20 rounded-2xl pr-6 pl-6 py-4 outline-none font-black text-xl tabular-nums shadow-sm"
                      value={editingClaim.discountAmount || ''}
                      onChange={e => {
                        const amt = Number(e.target.value);
                        const pct = editingClaim.amount ? Number(((amt / editingClaim.amount) * 100).toFixed(2)) : 0;
                        setEditingClaim({...editingClaim, discountAmount: amt, discountPercent: pct});
                      }}
                    />
                  </div>
                  <div className="space-y-1.5 text-right">
                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1">صافي التكلفة بعد الخصم</label>
                    <div className="w-full bg-emerald-50 border-2 border-emerald-100 rounded-2xl px-6 py-4 font-black text-xl text-emerald-700 tabular-nums shadow-inner h-[60px] flex items-center">
                      {((editingClaim.amount || 0) - (editingClaim.discountAmount || 0)).toLocaleString()} ج.م
                    </div>
                  </div>
                  <div className="md:col-span-3 space-y-1.5 text-right">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">توضيح سبب الخصم</label>
                    <input 
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm"
                      value={editingClaim.discountReason || ''}
                      onChange={e => setEditingClaim({...editingClaim, discountReason: e.target.value})}
                      placeholder="اشرح سبب خصم هذا المبلغ من المطالبة..."
                    />
                  </div>
                </div>
                <div className="md:col-span-2 space-y-1.5 text-right font-sans">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">المرفقات (أشعة، فواتير، تقارير)</label>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <input 
                        className="flex-1 bg-gray-50 border-2 border-transparent focus:border-blue-600/20 rounded-3xl pr-6 pl-6 py-4 outline-none font-bold shadow-sm transition-all text-sm"
                        value={editingClaim.attachmentUrl || ''}
                        onChange={e => setEditingClaim({...editingClaim, attachmentUrl: e.target.value})}
                      />
                      <div className="relative">
                        <input 
                          type="file"
                          multiple
                          id="file-upload-edit"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, 'edit')}
                          accept="image/*,.pdf"
                        />
                        <label 
                          htmlFor="file-upload-edit"
                          className="cursor-pointer px-6 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          رفع ملفات
                        </label>
                      </div>
                    </div>

                    {editingClaim.attachments && editingClaim.attachments.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {editingClaim.attachments.map((at, idx) => (
                        <div key={idx} className="relative group/at bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center gap-3">
                          <div 
                            className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0 cursor-pointer hover:bg-indigo-50 transition-colors"
                            onClick={() => {
                              if (at.url) {
                                window.open(at.url, '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            {at.type === 'pdf' ? <FileText className="w-4 h-4 text-rose-500" /> : <Paperclip className="w-4 h-4 text-blue-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-gray-700 truncate">{at.name}</p>
                            <p className="text-[8px] font-bold text-gray-400 uppercase">{at.type}</p>
                          </div>
                          <button 
                            type="button"
                            onClick={() => removeAttachment(idx, 'edit')}
                            className="absolute -top-2 -left-2 w-6 h-6 bg-rose-600 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover/at:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="md:col-span-2 pt-6 flex gap-6">
                  <button type="submit" className="flex-1 bg-blue-600 text-white py-6 rounded-[32px] font-black text-xl shadow-2xl shadow-blue-100 hover:bg-blue-700 transition-all">حفظ التعديلات</button>
                  <button type="button" onClick={() => setEditingClaim(null)} className="px-12 bg-gray-100 text-gray-500 py-6 rounded-[32px] font-black text-xl hover:bg-gray-200 transition-all">إلغاء</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedClaimHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedClaimHistory(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              className="bg-white h-full max-h-[85vh] w-full max-w-lg relative z-10 p-10 shadow-3xl flex flex-col rounded-[60px]"
            >
              <div className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                    <History className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 leading-none">تاريخ المطالبة</h2>
                    <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">{selectedClaimHistory.claimCode}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedClaimHistory(null)}
                  className="w-12 h-12 rounded-2xl border border-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-all"
                >
                  <ChevronLeft className="w-6 h-6 rotate-180" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-8 pb-10">
                {[...(selectedClaimHistory.statusHistory || [])].reverse().map((h, i) => (
                  <div key={i} className="relative pr-8 border-r-2 border-gray-50 pb-2">
                    <div className={cn(
                      "absolute -right-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm ring-4 ring-white transition-all",
                      h.status === 'pending' ? "bg-amber-500" :
                      h.status === 'approved' ? "bg-blue-500" :
                      h.status === 'paid' ? "bg-emerald-500" : "bg-gray-500"
                    )} />
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className={cn(
                          "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider",
                          h.status === 'pending' ? "bg-amber-50 text-amber-600" :
                          h.status === 'approved' ? "bg-blue-50 text-blue-600" :
                          h.status === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"
                        )}>
                          {h.status === 'pending' ? 'قيد المراجعة' : 
                           h.status === 'approved' ? 'تم الاعتماد' : 
                           h.status === 'paid' ? 'تم الدفع' : h.status}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 tabular-nums">{new Date(h.date).toLocaleString('ar-EG')}</span>
                      </div>
                      <p className="font-bold text-gray-900 text-sm leading-relaxed">{h.comment}</p>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold">
                        <User className="w-3 h-3" />
                        <span>من قبل: {h.updatedBy}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {(!selectedClaimHistory.statusHistory || selectedClaimHistory.statusHistory.length === 0) && (
                   <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                      <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                         <AlertCircle className="w-10 h-10" />
                      </div>
                      <p className="text-gray-400 font-bold">لا يوجد سجل حركات لهذه المطالبة</p>
                   </div>
                )}
              </div>

              <div className="pt-8 border-t border-gray-50">
                 <div className="bg-indigo-50/50 p-6 rounded-3xl flex items-center gap-4">
                    <TrendingUp className="w-8 h-8 text-indigo-600" />
                    <div>
                       <h4 className="font-black text-indigo-900 text-sm">إجمالي الرحلة</h4>
                       <p className="text-[10px] text-indigo-600 font-bold mt-0.5">تتبع مسار الفاتورة من التسجيل حتى التسوية المالية</p>
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

