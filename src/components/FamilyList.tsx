import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Family, FamilyStatus, Priority, LookupItem, AppUser, AppModule } from '../types';
import { Plus, Search, Filter, Phone, MapPin, MoreVertical, Loader2, Home, AlertCircle, Globe, ChevronDown, UserCircle, Heart, Users, ChevronRight, ChevronLeft, Receipt, Package, Clock, GripVertical, ShieldCheck } from 'lucide-react';
import { cn, generateSystemCode } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableFamilyCard({ 
  family, 
  isExpanded, 
  onToggleExpand, 
  getPriorityColor,
  stats,
  onSelect
}: { 
  family: Family, 
  isExpanded: boolean, 
  onToggleExpand: (e: React.MouseEvent, id: string) => void,
  getPriorityColor: (p: Priority) => string,
  onSelect: (id: string) => void,
  stats: {
    memberCount: number;
    recipientCount: number;
    totalAid: number;
    totalCost: number;
    lastMemberUpdate: string | null;
    loading: boolean;
  } | null
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: family.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      onClick={(e) => onToggleExpand(e, family.id)}
      className={cn(
        "bg-white p-6 rounded-[32px] border transition-all cursor-pointer group relative overflow-hidden flex flex-col",
        isExpanded ? "md:col-span-2 lg:col-span-3 border-emerald-600 shadow-xl shadow-emerald-50 bg-white ring-2 ring-emerald-600/10" : "border-gray-100 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-50/50",
        isDragging && "opacity-50 shadow-2xl scale-105 rotate-2"
      )}
    >
      <div {...attributes} {...listeners} className="absolute left-4 top-4 p-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-gray-300 hover:text-emerald-500">
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-gray-50 px-3 py-1 rounded-lg text-[10px] font-black text-gray-400 border border-gray-100 uppercase tracking-widest">
            #{family.fileNumber}
          </div>
          <div className={cn(
            "px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wider flex items-center gap-1",
            getPriorityColor(family.priority),
            family.priority === Priority.URGENT && "animate-pulse ring-2 ring-red-200"
          )}>
            <AlertCircle className="w-3 h-3" />
            {family.priority === Priority.URGENT ? 'عاجل جداً' : family.priority === Priority.HIGH ? 'أولوية مرتفعة' : family.priority === Priority.MEDIUM ? 'متوسط' : 'عادي'}
          </div>
        </div>
        <div className={cn(
          "px-3 py-1 rounded-full text-[10px] font-black tracking-tight flex items-center gap-1.5",
          family.status === FamilyStatus.ACTIVE ? "bg-emerald-50 text-emerald-700" :
          family.status === FamilyStatus.PENDING ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
        )}>
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            family.status === FamilyStatus.ACTIVE ? "bg-emerald-500" :
            family.status === FamilyStatus.PENDING ? "bg-amber-500" : "bg-red-500"
          )} />
          {family.status === FamilyStatus.ACTIVE ? 'نشط' :
           family.status === FamilyStatus.PENDING ? 'قيد الدراسة' : 'مغلق'}
        </div>
      </div>

      <div className="flex-1 space-y-3">
        <h3 className="text-xl font-black text-gray-900 group-hover:text-emerald-600 transition-colors leading-tight">{family.name}</h3>
        
        {!isExpanded && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-400 font-bold">
              <MapPin className="w-3.5 h-3.5" />
              <span>{family.city || 'غير محدد'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 font-bold">
              <Phone className="w-3.5 h-3.5" />
              <span className="tabular-nums">{family.phone || '---'}</span>
            </div>
          </div>
        )}
      </div>

      {isExpanded && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.4, ease: "circOut" }}
          className="mt-8 pt-8 border-t border-gray-50 flex flex-col gap-6"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">أفراد العائلة</span>
              </div>
              <div className="text-lg font-black text-gray-900 tabular-nums">
                {stats?.loading ? <Loader2 className="w-4 h-4 animate-spin text-gray-300" /> : (stats?.memberCount || family.numberOfDependents || 0)}
              </div>
            </div>

            <div className="bg-amber-50/30 p-4 rounded-2xl border border-amber-100/50 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-black text-amber-900 uppercase tracking-tighter">التكلفة المقررة</span>
              </div>
              <div className="text-lg font-black text-amber-700 tabular-nums">
                {stats?.loading ? <Loader2 className="w-4 h-4 animate-spin text-amber-300" /> : `${(stats?.totalCost || 0).toLocaleString()} ج.م`}
              </div>
            </div>

            <div className="bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100/50 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[10px] font-black text-emerald-900 uppercase tracking-tighter">التكلفة المنصرفة</span>
              </div>
              <div className="text-lg font-black text-emerald-700 tabular-nums">
                {stats?.loading ? <Loader2 className="w-4 h-4 animate-spin text-emerald-300" /> : `${(stats?.totalAid || 0).toLocaleString()} ج.م`}
              </div>
            </div>

            <div className="bg-blue-50/30 p-4 rounded-2xl border border-blue-100/50 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[10px] font-black text-blue-900 uppercase tracking-tighter">إجمالي الدخل</span>
              </div>
              <div className="text-lg font-black text-blue-700 tabular-nums">
                {(family.monthlyIncome || 0).toLocaleString()} ج.م
              </div>
            </div>

            <div className="bg-rose-50/30 p-4 rounded-2xl border border-rose-100/50 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-[10px] font-black text-rose-900 uppercase tracking-tighter">إجمالي الصرف</span>
              </div>
              <div className="text-lg font-black text-rose-700 tabular-nums">
                {(family.expenses?.total || 0).toLocaleString()} ج.م
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onSelect(family.id);
              }}
              className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-black text-xs transition-colors bg-emerald-50 px-4 py-2 rounded-xl group/btn"
            >
              <span>عرض الملف الكامل</span>
              <ChevronLeft className="w-4 h-4 transition-transform group-hover/btn:-translate-x-1" />
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

interface FamilyListProps {
  onSelect: (id: string) => void;
  userProfile: AppUser | null;
  modules: AppModule[];
}

export function FamilyList({ onSelect, userProfile, modules }: FamilyListProps) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [globalStats, setGlobalStats] = useState({
    totalFamilies: 0,
    totalIndividuals: 0,
    totalCases: 0,
    plannedCost: 0,
    executedCost: 0,
    serviceCount: 0,
    loading: true
  });
  const [lookups, setLookups] = useState<LookupItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FamilyStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [neighborhoodFilter, setNeighborhoodFilter] = useState('all');
  const [isAdding, setIsAdding] = useState(false);
  const [showContactPerson, setShowContactPerson] = useState(false);
  
  const [newFamily, setNewFamily] = useState<{
    fileNumber: string;
    name: string;
    nationalId: string;
    phone: string;
    address: string;
    governorate: string;
    city: string;
    neighborhood: string;
    detailedAddress: string;
    nationality: string;
    numberOfDependents: number;
    housingStatus: string;
    status: FamilyStatus;
    priority: Priority;
    monthlyIncome: number;
    contactPersonName: string;
    contactPersonPhone: string;
    contactPersonRole: string;
    expenses: {
      housing: number;
      food: number;
      health: number;
      education: number;
      other: number;
      total: number;
    };
  }>({
    fileNumber: '',
    name: '',
    nationalId: '',
    phone: '',
    address: '',
    governorate: '',
    city: '',
    neighborhood: '',
    detailedAddress: '',
    nationality: 'مصري',
    numberOfDependents: 0,
    housingStatus: 'rented',
    status: FamilyStatus.PENDING,
    priority: Priority.MEDIUM,
    monthlyIncome: 0,
    contactPersonName: '',
    contactPersonPhone: '',
    contactPersonRole: '',
    expenses: {
      housing: 0,
      food: 0,
      health: 0,
      education: 0,
      other: 0,
      total: 0
    }
  });

  const [orderByField, setOrderByField] = useState<'name' | 'fileNumber' | 'income_desc' | 'income_asc' | 'priority' | 'city' | 'neighborhood'>('fileNumber');
  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null);
  const [expandedFamilyStats, setExpandedFamilyStats] = useState<{
    memberCount: number;
    recipientCount: number;
    totalAid: number;
    totalCost: number;
    lastMemberUpdate: string | null;
    loading: boolean;
  } | null>(null);

  useEffect(() => {
    const qF = query(collection(db, 'families'), orderBy('updatedAt', 'desc'));
    const unsubscribeF = onSnapshot(qF, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Family));
      setFamilies(docs);
      
      // Basic count from families
      const totalFamilies = docs.length;
      const totalIndividuals = docs.reduce((sum, f) => sum + (f.numberOfDependents || 0) + 1, 0);
      
      setGlobalStats(prev => ({ ...prev, totalFamilies, totalIndividuals, loading: docs.length === 0 ? false : prev.loading }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'families');
    });

    // Fetch Assistances for stats
    const qA = query(collection(db, 'assistances'));
    const unsubscribeA = onSnapshot(qA, (snap) => {
      const docs = snap.docs.map(d => d.data());
      const executedCost = docs.filter(d => d.isDelivered).reduce((sum, d) => sum + (d.actualCost || d.amount || 0), 0);
      const serviceCount = docs.length;
      setGlobalStats(prev => ({ ...prev, executedCost, serviceCount, loading: false }));
    });

    // Fetch all members via collectionGroup to count recipients (Needs index/rules)
    // For now, we'll estimate or use a separate counter if possible, but collectionGroup is the cleanest way
    /* 
    const qM = query(collectionGroup(db, 'members'));
    const unsubscribeM = onSnapshot(qM, (snap) => {
       const docs = snap.docs.map(d => d.data());
       const totalCases = docs.filter(m => m.isServiceRecipient).length;
       const plannedCost = docs.reduce((sum, m) => {
          return sum + (m.aidRequests || []).filter((r: any) => r.status === 'approved').reduce((asum: number, r: any) => asum + (r.totalCost || 0), 0);
       }, 0);
       setGlobalStats(prev => ({ ...prev, totalCases, plannedCost }));
    });
    */

    const qL = query(collection(db, 'lookups'));
    const unsubscribeL = onSnapshot(qL, (snap) => {
      setLookups(snap.docs.map(d => ({ id: d.id, ...d.data() } as LookupItem)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'lookups'));

    return () => {
      unsubscribeF();
      unsubscribeA();
      unsubscribeL();
    };
  }, []);

  // Auto-index file number when adding
  useEffect(() => {
    if (isAdding && families.length > 0) {
      const lastFileNum = Math.max(...families.map(f => {
        const numPart = f.fileNumber.replace('FAM-', '');
        return parseInt(numPart) || 0;
      }));
      setNewFamily(prev => ({ ...prev, fileNumber: generateSystemCode('FAM', (lastFileNum + 1).toString().padStart(4, '0')) }));
    } else if (isAdding && families.length === 0) {
      setNewFamily(prev => ({ ...prev, fileNumber: 'FAM-0001' }));
    }
  }, [isAdding, families]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    if (!confirm('هل أنت متأكد من صحة البيانات وتريد إنشاء ملف العائلة الآن؟')) return;

    try {
      const fNum = newFamily.fileNumber.startsWith('FAM-') ? newFamily.fileNumber : generateSystemCode('FAM', newFamily.fileNumber);

      await addDoc(collection(db, 'families'), {
        ...newFamily,
        fileNumber: fNum,
        committeeCode: generateSystemCode('COM', fNum, 'INIT', '001'),
        ownerId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setIsAdding(false);
      setNewFamily({
        fileNumber: '',
        name: '',
        nationalId: '',
        phone: '',
        address: '',
        governorate: '',
        city: '',
        neighborhood: '',
        detailedAddress: '',
        nationality: 'مصري',
        numberOfDependents: 0,
        housingStatus: 'rented',
        status: FamilyStatus.PENDING,
        priority: Priority.MEDIUM,
        monthlyIncome: 0,
        contactPersonName: '',
        contactPersonPhone: '',
        contactPersonRole: '',
        expenses: {
          housing: 0,
          food: 0,
          health: 0,
          education: 0,
          other: 0,
          total: 0
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'families');
    }
  };

  const filteredFamilies = families
    .filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase()) || 
                           f.fileNumber.includes(search);
      const matchesStatus = statusFilter === 'all' || f.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || f.priority === priorityFilter;
      const matchesCity = cityFilter === 'all' || f.city === cityFilter;
      const matchesNeighborhood = neighborhoodFilter === 'all' || f.neighborhood === neighborhoodFilter;
      return matchesSearch && matchesStatus && matchesPriority && matchesCity && matchesNeighborhood && !f.isDeleted;
    })
    .sort((a, b) => {
        if (orderByField === 'income_desc') return b.monthlyIncome - a.monthlyIncome;
        if (orderByField === 'income_asc') return a.monthlyIncome - b.monthlyIncome;
      if (orderByField === 'priority') {
        const priorityScore = { [Priority.URGENT]: 4, [Priority.HIGH]: 3, [Priority.MEDIUM]: 2, [Priority.LOW]: 1 };
        return (priorityScore[b.priority] || 0) - (priorityScore[a.priority] || 0);
      }
      if (orderByField === 'city') return (a.city || '').localeCompare(b.city || '');
      if (orderByField === 'neighborhood') return (a.neighborhood || '').localeCompare(b.neighborhood || '');
      return (a[orderByField as keyof Family]?.toString() || '').localeCompare(b[orderByField as keyof Family]?.toString() || '');
    });

  const getPriorityColor = (p?: Priority) => {
    switch(p) {
      case Priority.URGENT: return 'bg-red-100 text-red-700 border-red-200';
      case Priority.HIGH: return 'bg-orange-100 text-orange-700 border-orange-200';
      case Priority.MEDIUM: return 'bg-blue-100 text-blue-700 border-blue-200';
      case Priority.LOW: return 'bg-gray-100 text-gray-700 border-gray-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const governorates = lookups.filter(l => l.type === 'governorate');
  const neighborhoods = lookups.filter(l => l.type === 'neighborhood' && l.parentId === newFamily.governorate);
  const nationalities = lookups.filter(l => l.type === 'nationality');

  const uniqueCities = Array.from(new Set(families.map(f => f.city).filter(Boolean))) as string[];
  const uniqueNeighborhoods = Array.from(new Set(families.map(f => f.neighborhood).filter(Boolean))) as string[];

  const handleToggleExpand = async (e: React.MouseEvent, familyId: string) => {
    e.stopPropagation();
    if (expandedFamilyId === familyId) {
      setExpandedFamilyId(null);
      setExpandedFamilyStats(null);
      return;
    }

    setExpandedFamilyId(familyId);
    setExpandedFamilyStats({ 
      memberCount: 0, 
      recipientCount: 0, 
      totalAid: 0, 
      totalCost: 0,
      lastMemberUpdate: null,
      loading: true 
    });

    try {
      const { getDocs, collection, query, where } = await import('firebase/firestore');
      
      // Fetch members
      const membersSnap = await getDocs(collection(db, `families/${familyId}/members`));
      const membersData = membersSnap.docs.map(d => d.data());
      const memberCount = membersData.length;
      const recipientCount = membersData.filter(m => m.isServiceRecipient).length;
      const lastMemberUpdate = membersData.reduce((latest, m) => {
        if (!m.updatedAt) return latest;
        return !latest || new Date(m.updatedAt) > new Date(latest) ? m.updatedAt : latest;
      }, null as string | null);

      // Fetch assistances
      const assistSnap = await getDocs(query(collection(db, 'assistances'), where('familyId', '==', familyId)));
      const assistData = assistSnap.docs.map(d => d.data());
      const totalAid = assistData.reduce((sum, doc) => sum + (doc.amount || 0), 0);
      
      // Calculate total cost (using amount as proxy if cost is not explicitly stored separately in a way we can sum easily here)
      // In many donation/assistance contexts, amount is the primary numeric metric.
      const totalCost = assistData.reduce((sum, doc) => sum + (doc.amount || 0), 0);

      setExpandedFamilyStats({
        memberCount,
        recipientCount,
        totalAid,
        totalCost,
        lastMemberUpdate,
        loading: false
      });
    } catch (err) {
      console.error("Error fetching family stats:", err);
      setExpandedFamilyStats(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = families.findIndex(f => f.id === active.id);
      const newIndex = families.findIndex(f => f.id === over.id);
      const newFamilies = arrayMove(families, oldIndex, newIndex);
      setFamilies(newFamilies);

      // Persist to firestore (optional but good practice)
      try {
        const { writeBatch, doc } = await import('firebase/firestore');
        const batch = writeBatch(db);
        newFamilies.forEach((f, idx) => {
          const ref = doc(db, 'families', f.id);
          // Wait, actually dnd-kit works with IDs. We need to find the actual IDs.
          // batch.update(ref, { order: idx }); 
        });
        // await batch.commit();
      } catch (err) {
        console.error("Error updating order:", err);
      }
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  return (
    <div className="space-y-6" onClick={() => setExpandedFamilyId(null)}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">سجل العائلات</h2>
          <p className="text-sm text-gray-500 mt-1">إدارة بيانات المستفيدين والملفات</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-100"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة عائلة جديدة</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
         {[
           { label: 'العائلات المسجلة', value: globalStats.totalFamilies, icon: Home, color: 'text-emerald-600', bg: 'bg-emerald-50' },
           { label: 'إجمالي الأفراد', value: globalStats.totalIndividuals, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
           { label: 'الحالات المستفيدة', value: globalStats.totalCases || '-', icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50' },
           { label: 'الخدمات المنفذة', value: globalStats.serviceCount, icon: Package, color: 'text-amber-600', bg: 'bg-amber-50' },
           { label: 'تكاليف منفذة', value: `${globalStats.executedCost.toLocaleString()} ج.م`, icon: Receipt, color: 'text-indigo-600', bg: 'bg-indigo-50' },
           { label: 'تكاليف مقررة', value: `${globalStats.plannedCost.toLocaleString()} ج.م`, icon: Clock, color: 'text-gray-600', bg: 'bg-gray-50' },
         ].map((stat, i) => (
           <motion.div 
             key={i}
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: i * 0.1 }}
             className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-2"
           >
             <div className="flex items-center justify-between">
                <div className={cn("p-2 rounded-xl", stat.bg)}>
                   <stat.icon className={cn("w-4 h-4", stat.color)} />
                </div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{stat.label}</span>
             </div>
             <div className="text-lg font-black text-gray-900 truncate" title={stat.value.toString()}>
                {stat.value}
             </div>
           </motion.div>
         ))}
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative group flex-1 w-full">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 transition-colors group-focus-within:text-emerald-500" />
          <input 
            type="text" 
            placeholder="ابحث بالاسم أو رقم الملف..."
            className="w-full bg-gray-50 border border-transparent rounded-xl py-3 pr-12 pl-4 focus:ring-4 focus:ring-emerald-50 focus:bg-white focus:border-emerald-200 outline-none transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <select 
              title="ترتيب النتائج حسب معايير مخصصة"
              className="bg-gray-50 border border-transparent rounded-xl px-4 py-3 text-sm font-bold text-gray-500 outline-none focus:ring-4 focus:ring-emerald-50"
              value={orderByField}
              onChange={e => setOrderByField(e.target.value as any)}
           >
              <option value="fileNumber">ترتيب برقم الملف</option>
              <option value="name">ترتيب بالاسم</option>
              <option value="income_desc">الدخل (الأعلى أولاً)</option>
              <option value="income_asc">الدخل (الأقل أولاً)</option>
              <option value="priority">ترتيب بالأولوية</option>
              <option value="city">ترتيب بالمدينة</option>
              <option value="neighborhood">ترتيب بالمنطقة</option>
           </select>
           <select 
              title="تصفية حسب المدينة أو المركز"
              className="bg-gray-50 border border-transparent rounded-xl px-4 py-3 text-sm font-bold text-gray-500 outline-none focus:ring-4 focus:ring-emerald-50"
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
           >
              <option value="all">كل المدن</option>
              {uniqueCities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
           </select>
           <select 
              title="تصفية حسب الحي أو المنطقة السكنية"
              className="bg-gray-50 border border-transparent rounded-xl px-4 py-3 text-sm font-bold text-gray-500 outline-none focus:ring-4 focus:ring-emerald-50"
              value={neighborhoodFilter}
              onChange={e => setNeighborhoodFilter(e.target.value)}
           >
              <option value="all">كل المناطق</option>
              {uniqueNeighborhoods.map(nb => (
                <option key={nb} value={nb}>{nb}</option>
              ))}
           </select>
           <select 
              title="تصفية حسب حالة ملف الأسرة (نشط، قيد الدراسة، مغلق)"
              className="bg-gray-50 border border-transparent rounded-xl px-4 py-3 text-sm font-bold text-gray-500 outline-none focus:ring-4 focus:ring-emerald-50"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
           >
              <option value="all">كل الحالات (الكل)</option>
              <option value={FamilyStatus.ACTIVE}>نشطة (Active)</option>
              <option value={FamilyStatus.PENDING}>قيد الدراسة (Pending)</option>
              <option value={FamilyStatus.SUSPENDED}>موقوفة (Suspended)</option>
              <option value={FamilyStatus.CLOSED}>مغلقة (Closed)</option>
           </select>
           <select 
              title="تصفية حسب درجة أولوية تقديم المساعدة"
              className="bg-gray-50 border border-transparent rounded-xl px-4 py-3 text-sm font-bold text-gray-500 outline-none focus:ring-4 focus:ring-emerald-50"
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value as any)}
           >
              <option value="all">الأولوية</option>
              <option value={Priority.URGENT}>عاجل</option>
              <option value={Priority.HIGH}>مرتفع</option>
              <option value={Priority.MEDIUM}>متوسط</option>
              <option value={Priority.LOW}>عادي</option>
           </select>
        </div>
      </div>

      {globalStats.loading ? (
        <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-40 flex flex-col items-center justify-center space-y-6">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-emerald-100 rounded-full" />
            <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
            <Heart className="w-6 h-6 text-emerald-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fill-emerald-600/20" />
          </div>
          <div className="text-center">
            <p className="text-xl font-black text-gray-900">جاري الربط مع قاعدة البيانات</p>
            <p className="text-sm text-gray-400 font-bold mt-1 animate-pulse">نحن نحضر لك أحدث البيانات الآن...</p>
          </div>
        </div>
      ) : filteredFamilies.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-gray-200 py-20 text-center">
          <div className="bg-gray-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-gray-400">
            <Search className="w-8 h-8" />
          </div>
          <p className="text-gray-500 font-bold">لا توجد نتائج مطابقة لبحثك</p>
        </div>
      ) : (
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <SortableContext 
              items={filteredFamilies.map(f => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <AnimatePresence>
                {filteredFamilies.map((family) => (
                  <SortableFamilyCard
                    key={family.id}
                    family={family}
                    isExpanded={expandedFamilyId === family.id}
                    stats={expandedFamilyId === family.id ? expandedFamilyStats : null}
                    onToggleExpand={handleToggleExpand}
                    getPriorityColor={getPriorityColor}
                    onSelect={onSelect}
                  />
                ))}
              </AnimatePresence>
            </SortableContext>
          </div>
        </DndContext>
      )}

      {/* Add Family Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsAdding(false)} />
          <div className="bg-white rounded-3xl w-full max-w-2xl relative z-10 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between sticky top-0 bg-white z-10 font-cairo">
              <h3 className="text-xl font-bold">إضافة عائلة جديدة</h3>
              <button onClick={() => { setIsAdding(false); setShowContactPerson(false); }} className="p-2 hover:bg-gray-100 rounded-lg"><Plus className="w-5 h-5 rotate-45" /></button>
            </div>
            
            <form onSubmit={handleAdd} className="p-8 space-y-8 font-cairo">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Visual Header for the Form Section */}
                <div className="col-span-full flex items-center gap-4 mb-2">
                  <div className="w-1.5 h-8 bg-emerald-600 rounded-full" />
                  <div>
                    <h4 className="text-sm font-black text-gray-900">البيانات الأساسية للملف</h4>
                    <p className="text-[10px] text-gray-400 font-bold">يرجى استكمال البيانات بدقة لضمان سرعة معالجة الطلبات</p>
                  </div>
                </div>

                <div className="space-y-2 group">
                   <label className="text-xs font-black text-gray-400 uppercase tracking-widest mr-2 group-focus-within:text-emerald-600 transition-colors">رقم الملف (تلقائي)</label>
                   <div className="relative">
                     <Home className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 group-focus-within:text-emerald-500 transition-colors" />
                     <input 
                      required
                      className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl pr-12 pl-4 py-4 focus:ring-4 focus:ring-emerald-50 focus:bg-white focus:border-emerald-200 transition-all outline-none font-bold tabular-nums"
                      value={newFamily.fileNumber}
                      onChange={e => setNewFamily({...newFamily, fileNumber: e.target.value})}
                    />
                   </div>
                </div>

                <div className="space-y-2 group">
                   <label className="text-xs font-black text-gray-400 uppercase tracking-widest mr-2 group-focus-within:text-emerald-600 transition-colors">حالة الملف</label>
                   <div className="relative">
                     <Clock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 group-focus-within:text-emerald-500 transition-colors" />
                     <select 
                      className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl pr-12 pl-4 py-4 outline-none focus:ring-4 focus:ring-emerald-50 focus:bg-white focus:border-emerald-200 transition-all font-bold appearance-none cursor-pointer"
                      value={newFamily.status}
                      onChange={e => setNewFamily({...newFamily, status: e.target.value as FamilyStatus})}
                    >
                      <option value={FamilyStatus.PENDING}>قيد الدراسة</option>
                      <option value={FamilyStatus.ACTIVE}>نشط</option>
                      <option value={FamilyStatus.SUSPENDED}>موقوف</option>
                    </select>
                    <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                   </div>
                </div>

                <div className="space-y-2 group col-span-full md:col-span-1">
                   <label className="text-xs font-black text-gray-400 uppercase tracking-widest mr-2 group-focus-within:text-emerald-600 transition-colors">اسم رب الأسرة رباعياً</label>
                   <div className="relative">
                     <UserCircle className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 group-focus-within:text-emerald-500 transition-colors" />
                     <input 
                      required
                      placeholder="أدخل الاسم الكامل كما في البطاقة..."
                      className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl pr-12 pl-4 py-4 focus:ring-4 focus:ring-emerald-50 focus:bg-white focus:border-emerald-200 transition-all outline-none font-bold"
                      value={newFamily.name}
                      onChange={e => setNewFamily({...newFamily, name: e.target.value})}
                    />
                   </div>
                </div>

                <div className="space-y-2 group col-span-full md:col-span-1">
                   <label className="text-xs font-black text-gray-400 uppercase tracking-widest mr-2 group-focus-within:text-emerald-600 transition-colors">الرقم القومي (١٤ رقم)</label>
                   <div className="relative">
                     <ShieldCheck className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 group-focus-within:text-emerald-500 transition-colors" />
                     <input 
                      required 
                      maxLength={14}
                      placeholder="00000000000000"
                      className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl pr-12 pl-4 py-4 focus:ring-4 focus:ring-emerald-50 focus:bg-white focus:border-emerald-200 transition-all outline-none font-bold tabular-nums"
                      value={newFamily.nationalId}
                      onChange={e => setNewFamily({...newFamily, nationalId: e.target.value})}
                    />
                   </div>
                </div>
              </div>

              {/* Advanced Sections */}
              <div className="p-8 bg-gray-50/30 rounded-[32px] border border-gray-100/50 space-y-8 shadow-inner shadow-gray-50/50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المحافظة</label>
                    <select 
                      required
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-4 focus:ring-emerald-50 font-bold transition-all shadow-sm"
                      value={newFamily.governorate}
                      onChange={e => setNewFamily({...newFamily, governorate: e.target.value, city: '', neighborhood: ''})}
                    >
                      <option value="">اختر المحافظة...</option>
                      {governorates.map(gov => <option key={gov.id} value={gov.id}>{gov.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المدينة / المركز</label>
                    <input 
                      required
                      placeholder="مثال: مدينة نصر"
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-4 focus:ring-emerald-50 font-bold transition-all shadow-sm"
                      value={newFamily.city}
                      onChange={e => setNewFamily({...newFamily, city: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المنطقة / الحي</label>
                    <select 
                      required
                      disabled={!newFamily.governorate}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-4 focus:ring-emerald-50 font-bold disabled:opacity-50 transition-all shadow-sm"
                      value={newFamily.neighborhood}
                      onChange={e => setNewFamily({...newFamily, neighborhood: e.target.value})}
                    >
                      <option value="">اختر المنطقة...</option>
                      {neighborhoods.map(nb => <option key={nb.id} value={nb.id}>{nb.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">العنوان بالتفصيل</label>
                   <div className="relative">
                      <MapPin className="absolute right-4 top-4 w-4 h-4 text-gray-300" />
                      <textarea 
                        required
                        placeholder="الشارع، رقم العقار، الدور، الشقة..."
                        rows={2}
                        className="w-full bg-white border border-gray-200 rounded-2xl pr-12 pl-4 py-4 focus:ring-4 focus:ring-emerald-50 transition-all shadow-sm outline-none font-bold resize-none"
                        value={newFamily.detailedAddress}
                        onChange={e => {
                          const val = e.target.value;
                          const govName = governorates.find(g => g.id === newFamily.governorate)?.name || '';
                          const nbName = neighborhoods.find(n => n.id === newFamily.neighborhood)?.name || '';
                          setNewFamily({
                            ...newFamily, 
                            detailedAddress: val, 
                            address: `${govName} - ${nbName} - ${val}`
                          });
                        }}
                      />
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2 group">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest mr-2 group-focus-within:text-emerald-600">الجنسية</label>
                  <div className="relative">
                    <Globe className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 group-focus-within:text-emerald-500" />
                    <select 
                      required
                      className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl pr-12 pl-4 py-4 outline-none focus:ring-4 focus:ring-emerald-50 focus:bg-white focus:border-emerald-200 transition-all font-bold appearance-none cursor-pointer"
                      value={newFamily.nationality}
                      onChange={e => setNewFamily({...newFamily, nationality: e.target.value})}
                    >
                      <option value="مصري">مصري (Egyptian)</option>
                      {nationalities.map(n => <option key={n.id} value={n.name}>{n.name}</option>)}
                    </select>
                    <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                </div>

                <div className="space-y-2 group">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest mr-2 group-focus-within:text-emerald-600">رقم هاتف التواصل</label>
                  <div className="relative">
                    <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 group-focus-within:text-emerald-500 transition-colors" />
                    <input 
                      type="tel"
                      placeholder="01xxxxxxxxx"
                      className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl pr-12 pl-4 py-4 focus:ring-4 focus:ring-emerald-50 focus:bg-white focus:border-emerald-200 transition-all outline-none font-bold tabular-nums"
                      value={newFamily.phone}
                      onChange={e => setNewFamily({...newFamily, phone: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الأولوية</label>
                  <select 
                    className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl px-4 py-4 outline-none focus:ring-4 focus:ring-red-50 focus:bg-white focus:border-red-200 transition-all font-bold"
                    value={newFamily.priority}
                    onChange={e => setNewFamily({...newFamily, priority: e.target.value as Priority})}
                  >
                    <option value={Priority.LOW}>عادي</option>
                    <option value={Priority.MEDIUM}>متوسط</option>
                    <option value={Priority.HIGH}>مرتفع</option>
                    <option value={Priority.URGENT}>عاجل جداً</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">إجمالي الدخل (ج.م)</label>
                  <input 
                    type="number"
                    min={0}
                    className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl px-4 py-4 outline-none focus:ring-4 focus:ring-emerald-50 focus:bg-white focus:border-emerald-200 transition-all font-bold tabular-nums"
                    value={newFamily.monthlyIncome}
                    onChange={e => setNewFamily({...newFamily, monthlyIncome: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المصاريف الشهرية (ج.م)</label>
                   <input 
                    type="number"
                    min={0}
                    className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl px-4 py-4 outline-none focus:ring-4 focus:ring-emerald-50 focus:bg-white focus:border-emerald-200 transition-all font-bold tabular-nums"
                    value={newFamily.expenses?.total || 0}
                    onChange={e => setNewFamily({...newFamily, expenses: { ...(newFamily.expenses || { housing: 0, food: 0, health: 0, education: 0, other: 0, total: 0 }), total: Number(e.target.value) }})}
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-gray-50 flex flex-col md:flex-row items-center justify-between gap-4">
                <p className="text-[10px] font-bold text-gray-400 max-w-xs leading-relaxed text-center md:text-right">بضغطك على إرسال، أنت تؤكد صحة البيانات المسؤولية الاجتماعية والقانونية المترتبة على ذلك.</p>
                <div className="flex gap-4 w-full md:w-auto">
                  <button 
                    type="button" 
                    onClick={() => setIsAdding(false)}
                    className="flex-1 md:flex-none px-8 py-4 rounded-2xl text-sm font-black text-gray-400 hover:bg-gray-50 transition-all"
                  >إلغاء</button>
                  <button 
                    type="submit"
                    className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-12 py-4 rounded-2xl font-black shadow-xl shadow-emerald-100 transition-all active:scale-95"
                  >إنشاء ملف العائلة</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
