import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { LookupItem, SystemService, AssistanceType, AppModule, AppUser, Department, ModulePermission } from '../types';
import { Settings as SettingsIcon, MapPin, Phone, HeartPulse, ShieldCheck, Gift, Globe, Plus, Trash2, ChevronRight, LayoutGrid, Briefcase, GraduationCap, Home, Zap, Truck, Warehouse, Stethoscope, Landmark, Wallet, MapPinned, ExternalLink, Map as MapIcon, Users, UserPlus, ListOrdered, Lock, Building, CheckSquare, Search, Mail, User, GripVertical, Edit3, ChevronDown, Rocket } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
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

function SortableItem({ id, children, className }: { id: string, children: React.ReactNode, className?: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(className, isDragging && "shadow-2xl ring-2 ring-emerald-500/20")}>
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-2 hover:bg-gray-100 rounded-lg transition-colors">
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

export function Settings({ userProfile, modules: allModules }: { userProfile: AppUser | null, modules: AppModule[] }) {
  const [activeCategory, setActiveCategory] = useState<LookupItem['type'] | 'services' | 'assistance_types' | 'store_items' | 'modules' | 'users' | 'departments'>('governorate');
  const [lookups, setLookups] = useState<LookupItem[]>([]);
  const [services, setServices] = useState<SystemService[]>([]);
  const [assistanceTypes, setAssistanceTypes] = useState<any[]>([]);
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [modules, setModules] = useState<AppModule[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [lookupCategories, setLookupCategories] = useState<{ id: string, label: string, icon: any }[]>([
    { id: 'governorate', label: 'المحافظات', icon: Globe },
    { id: 'neighborhood', label: 'الأحياء / المراكز', icon: MapPin },
    { id: 'services', label: 'الخدمات والبرامج', icon: SettingsIcon },
    { id: 'assistance_types', label: 'أنواع المساعدات', icon: HeartPulse },
    { id: 'store_items', label: 'أصناف المخزن', icon: Warehouse },
    { id: 'delivery_location', label: 'جهات التسليم', icon: Truck },
    { id: 'financial_category', label: 'البنود المالية', icon: Wallet },
    { id: 'hospital', label: 'الجهات / المستشفيات', icon: Stethoscope },
    { id: 'store_category', label: 'تصنيفات المخزن', icon: LayoutGrid },
    { id: 'disease', label: 'قائمة الأمراض', icon: HeartPulse },
    { id: 'modules', label: 'ترتيب ومسميات النظام', icon: ListOrdered },
    { id: 'users', label: 'إدارة المستخدمين', icon: Users },
    { id: 'departments', label: 'الإدارات والصلاحيات', icon: Building }
  ]);

  const handleDragEndCategories = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLookupCategories(prev => {
        const oldIndex = prev.findIndex(c => c.id === active.id);
        const newIndex = prev.findIndex(c => c.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleUpdateCategoryLabel = (id: string, newLabel: string) => {
    setLookupCategories(prev => prev.map(c => c.id === id ? { ...c, label: newLabel } : c));
    setEditingId(null);
  };
  const [newItemName, setNewItemName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedSubType, setSelectedSubType] = useState<'income' | 'expense'>('income');
  const [selectedMapUrl, setSelectedMapUrl] = useState<string | null>(null);
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState<string>('all');
  const [serviceExecutionFilter, setServiceExecutionFilter] = useState<string>('all');
  const [newDeliveryLocation, setNewDeliveryLocation] = useState({
    name: '',
    address: '',
    contactPhone: '',
    locationUrl: '',
    serviceIds: [] as string[]
  });
  const [newService, setNewService] = useState<Partial<SystemService>>({
    name: '',
    category: AssistanceType.SERVICE,
    executionMethod: 'pickup',
    defaultUnit: '',
    defaultUnitCost: 0,
    isActive: true,
    iconName: 'Zap'
  });
  const [newAssistanceType, setNewAssistanceType] = useState({
    name: '',
    unit: '',
    category: 'غذائي', // Default
    defaultPrice: 0,
    isActive: true
  });
  const [availableIcons] = useState([
    'Zap', 'Heart Pulse', 'Warehouse', 'Truck', 'Wallet', 'Stethoscope', 'Briefcase', 'GraduationCap', 'Home', 'ShieldCheck', 'Gift', 'Rocket'
  ]);

  const [editingModule, setEditingModule] = useState<AppModule | null>(null);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editingPermUserId, setEditingPermUserId] = useState<string | null>(null);
  const [editingPermDeptId, setEditingPermDeptId] = useState<string | null>(null);
  const [tempPermissions, setTempPermissions] = useState<ModulePermission[]>([]);
  
  const [newUser, setNewUser] = useState<Partial<AppUser>>({
    name: '',
    email: '',
    role: 'staff',
    departmentId: '',
    isActive: true,
    permissions: []
  });

  const handleDragEndSubModules = async (moduleId: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const mod = modules.find(m => m.id === moduleId);
      if (!mod || !mod.subModules) return;

      const oldIndex = mod.subModules.findIndex(sm => sm.id === active.id);
      const newIndex = mod.subModules.findIndex(sm => sm.id === over.id);
      
      const newSubModules = arrayMove(mod.subModules, oldIndex, newIndex);
      
      await updateDoc(doc(db, 'modules', moduleId), {
        subModules: newSubModules.map((sm, idx) => ({ ...sm, order: idx + 1 }))
      });
    }
  };

  const handleUpdateSubModuleName = async (moduleId: string, subModuleId: string, newName: string) => {
    const mod = modules.find(m => m.id === moduleId);
    if (!mod || !mod.subModules) return;

    const newSubModules = mod.subModules.map(sm => 
      sm.id === subModuleId ? { ...sm, name: newName } : sm
    );

    await updateDoc(doc(db, 'modules', moduleId), { subModules: newSubModules });
    setEditingId(null);
  };
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleDragEndModules = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = modules.findIndex(m => m.id === active.id);
      const newIndex = modules.findIndex(m => m.id === over.id);
      
      const newModules = arrayMove(modules, oldIndex, newIndex);
      setModules(newModules);

      // Update in Firebase
      const batch = writeBatch(db);
      newModules.forEach((mod, idx) => {
        batch.update(doc(db, 'modules', mod.id), { order: idx + 1 });
      });
      await batch.commit();
    }
  };

  const handleDragEndLookups = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const currentLookups = lookups.filter(l => l.type === activeCategory);
      const oldIndex = currentLookups.findIndex(l => l.id === active.id);
      const newIndex = currentLookups.findIndex(l => l.id === over.id);
      
      const movedItems = arrayMove(currentLookups, oldIndex, newIndex);
      
      // We don't have an 'order' field in lookups yet, so we should add it if we want persistent sorting
      // For now, let's update if the collection supports it or just reorder locally for the session if not.
      // Better to check if lookups have order. If not, I'll update the first one found.
      const batch = writeBatch(db);
      movedItems.forEach((item, idx) => {
        batch.update(doc(db, 'lookups', item.id), { order: idx + 1 });
      });
      await batch.commit();
    }
  };

  const defaultModules: Omit<AppModule, 'id'>[] = [
    { originalName: 'لوحة القيادة', name: 'لوحة القيادة', icon: 'LayoutDashboard', order: 1, isActive: true, path: 'dashboard' },
    { originalName: 'دليل النظام', name: 'دليل النظام', icon: 'BookOpen', order: 2, isActive: true, path: 'guide' },
    { originalName: 'سجل العائلات', name: 'سجل العائلات', icon: 'Users', order: 3, isActive: true, path: 'families', subModules: [
      { id: 'f1', name: 'سجل الأسر', order: 1 },
      { id: 'f2', name: 'أفراد الأسرة', order: 2 },
      { id: 'f3', name: 'دراسة حالة', order: 3 },
      { id: 'f4', name: 'بحث اجتماعي', order: 4 },
      { id: 'f5', name: 'تصنيف الاحتياجات', order: 5 }
    ]},
    { originalName: 'إدارة الزيارات', name: 'إدارة الزيارات', icon: 'ClipboardList', order: 4, isActive: true, path: 'visits', subModules: [
      { id: 'v1', name: 'جدول المعاينة', order: 1 },
      { id: 'v2', name: 'تقارير الزيارة', order: 2 },
      { id: 'v3', name: 'توزيع الباحثين', order: 3 }
    ]},
    { originalName: 'سجل المساعدات', name: 'سجل المساعدات', icon: 'Heart', order: 5, isActive: true, path: 'assistance', subModules: [
      { id: 'a1', name: 'طلبات قيد المراجعة', order: 1 },
      { id: 'a2', name: 'لجنة القرارات', order: 2 },
      { id: 'a3', name: 'سجل التوزيع', order: 3 },
      { id: 'a4', name: 'جدول التسليمات', order: 4 }
    ]},
    { originalName: 'إدارة المخزن', name: 'إدارة المخزن', icon: 'Box', order: 6, isActive: true, path: 'store', subModules: [
      { id: 's1', name: 'الأصناف والمخزون', order: 1 },
      { id: 's2', name: 'أذونات صرف', order: 2 },
      { id: 's3', name: 'أذونات إضافة', order: 3 }
    ]},
    { originalName: 'الحالات الطارئة', name: 'الحالات الطارئة', icon: 'AlertCircle', order: 7, isActive: true, path: 'emergencies', subModules: [
      { id: 'e1', name: 'بلاغات طارئة', order: 1 },
      { id: 'e2', name: 'مراجعة طبية أولية', order: 2 },
      { id: 'e3', name: 'تأكيد الخدمة', order: 3 }
    ]},
    { originalName: 'المطالبات الطبية', name: 'المطالبات الطبية', icon: 'Stethoscope', order: 8, isActive: true, path: 'claims', subModules: [
      { id: 'c1', name: 'سجل المطالبات', order: 1 },
      { id: 'c2', name: 'تسوية الصيدليات', order: 2 },
      { id: 'c3', name: 'أرشيف المطالبات', order: 3 }
    ]},
    { originalName: 'إدارة المتبرعين', name: 'إدارة المتبرعين', icon: 'Rocket', order: 9, isActive: true, path: 'donors', subModules: [
      { id: 'd1', name: 'قاعدة المتبرعين', order: 1 },
      { id: 'd2', name: 'سجل التبرعات', order: 2 }
    ]},
    { originalName: 'الحملات الخيرية', name: 'الحملات الخيرية', icon: 'Rocket', order: 10, isActive: true, path: 'campaigns', subModules: [
      { id: 'ch1', name: 'الحملات النشطة', order: 1 },
      { id: 'ch2', name: 'الحالات المدرجة', order: 2 }
    ]},
    { originalName: 'إعدادات النظام', name: 'إعدادات النظام', icon: 'Settings', order: 11, isActive: true, path: 'settings', subModules: [
      { id: 'st1', name: 'بيانات الجمعية', order: 1 },
      { id: 'st2', name: 'المستخدمين', order: 2 },
      { id: 'st3', name: 'الصلاحيات', order: 3 }
    ]}
  ];

  const initializeModules = async () => {
    if (modules.length > 0) return;
    try {
      const batch = writeBatch(db);
      defaultModules.forEach((mod) => {
        const docRef = doc(collection(db, 'modules'));
        batch.set(docRef, mod);
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'modules');
    }
  };

  useEffect(() => {
    const qLookups = query(collection(db, 'lookups'));
    const unsubscribeLookups = onSnapshot(qLookups, (snap) => {
      setLookups(snap.docs.map(d => ({ id: d.id, ...d.data() } as LookupItem)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'lookups'));

    const qServices = query(collection(db, 'services'));
    const unsubscribeServices = onSnapshot(qServices, (snap) => {
      setServices(snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemService)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'services'));

    const qStoreItems = query(collection(db, 'store_items'));
    const unsubscribeStoreItems = onSnapshot(qStoreItems, (snap) => {
      setStoreItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'store_items'));

    const qModules = query(collection(db, 'modules'));
    const unsubscribeModules = onSnapshot(qModules, (snap) => {
      setModules(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppModule)).sort((a,b) => a.order - b.order));
    }, err => handleFirestoreError(err, OperationType.LIST, 'modules'));

    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(qUsers, (snap) => {
      setAppUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'users'));

    const qDepts = query(collection(db, 'departments'));
    const unsubscribeDepts = onSnapshot(qDepts, (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'departments'));

    const qAssistanceTypes = query(collection(db, 'assistance_types'));
    const unsubscribeAssistanceTypes = onSnapshot(qAssistanceTypes, (snap) => {
      setAssistanceTypes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'assistance_types'));

    return () => {
      unsubscribeLookups();
      unsubscribeServices();
      unsubscribeStoreItems();
      unsubscribeModules();
      unsubscribeUsers();
      unsubscribeDepts();
      unsubscribeAssistanceTypes();
    };
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      await addDoc(collection(db, 'lookups'), {
        name: newItemName,
        type: activeCategory,
        parentId: activeCategory === 'neighborhood' ? selectedParentId : null,
        subType: activeCategory === 'financial_category' ? selectedSubType : null,
        createdAt: new Date().toISOString()
      });
      setNewItemName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'lookups');
    }
  };

  const handleAddDeliveryLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeliveryLocation.name) return;

    try {
      await addDoc(collection(db, 'lookups'), {
        ...newDeliveryLocation,
        type: 'delivery_location',
        createdAt: new Date().toISOString()
      });
      setNewDeliveryLocation({
        name: '',
        address: '',
        contactPhone: '',
        locationUrl: '',
        serviceIds: []
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'delivery_location');
    }
  };

  const handleSubmitStoreItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const data = {
      name: formData.get('name') as string,
      category: formData.get('category') as string,
      unit: formData.get('unit') as string,
      quantity: Number(formData.get('quantity')),
      cost: Number(formData.get('cost')),
      minQuantity: Number(formData.get('minQuantity')) || 0,
      notes: formData.get('notes') as string,
      updatedAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'store_items'), data);
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'store_items');
    }
  };

  const handleDeleteStoreItem = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الصنف من المخزن؟')) return;
    try {
      await deleteDoc(doc(db, 'store_items', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `store_items/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا البند؟')) return;
    try {
      await deleteDoc(doc(db, 'lookups', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `lookups/${id}`);
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newService.name) return;

    try {
      await addDoc(collection(db, 'services'), {
        ...newService,
        createdAt: new Date().toISOString(),
        isActive: true
      });
      setNewService({
        name: '',
        category: AssistanceType.SERVICE,
        executionMethod: 'pickup',
        defaultUnitCost: 0,
        isActive: true,
        iconName: 'Zap'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'services');
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('سيتم حذف هذه الخدمة نهائياً، هل أنت متأكد؟')) return;
    try {
      await deleteDoc(doc(db, 'services', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `services/${id}`);
    }
  };

  const handleToggleService = async (service: SystemService) => {
    try {
      await updateDoc(doc(db, 'services', service.id), {
        isActive: !service.isActive
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `services/${service.id}`);
    }
  };

  const categories = [
    { id: 'governorate', label: 'المحافظات', icon: Globe },
    { id: 'neighborhood', label: 'الأحياء / المراكز', icon: MapPin },
    { id: 'services', label: 'الخدمات والبرامج', icon: SettingsIcon },
    { id: 'store_items', label: 'أصناف المخزن', icon: Warehouse },
    { id: 'delivery_location', label: 'جهات التسليم', icon: Truck },
    { id: 'financial_category', label: 'البنود المالية', icon: Wallet },
    { id: 'hospital', label: 'الجهات / المستشفيات', icon: Stethoscope },
    { id: 'store_category', label: 'تصنيفات المخزن', icon: LayoutGrid },
    { id: 'disease', label: 'قائمة الأمراض', icon: HeartPulse },
    { id: 'modules', label: 'ترتيب ومسميات النظام', icon: ListOrdered },
    { id: 'users', label: 'إدارة المستخدمين', icon: Users },
    { id: 'departments', label: 'الإدارات والصلاحيات', icon: Building }
  ] as const;

  const handleUpdateModule = async (moduleId: string, data: Partial<AppModule>) => {
    try {
      await updateDoc(doc(db, 'modules', moduleId), data);
      setEditingModule(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `modules/${moduleId}`);
    }
  };

  const handleAddAssistanceType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssistanceType.name) return;
    try {
      await addDoc(collection(db, 'assistance_types'), {
        ...newAssistanceType,
        createdAt: new Date().toISOString()
      });
      setNewAssistanceType({ name: '', unit: '', category: 'غذائي', defaultPrice: 0, isActive: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'assistance_types');
    }
  };

  const handleDeleteAssistanceType = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا النوع؟')) return;
    try {
      await deleteDoc(doc(db, 'assistance_types', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `assistance_types/${id}`);
    }
  };

  const handleUpdateUser = async (userId: string, data: Partial<AppUser>) => {
    try {
      await updateDoc(doc(db, 'users', userId), data);
      setEditingUser(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dept = departments.find(d => d.id === newUser.departmentId);
      const permissions = dept?.defaultPermissions || [];
      
      await addDoc(collection(db, 'users'), {
        ...newUser,
        permissions,
        createdAt: new Date().toISOString()
      });
      setNewUser({ name: '', email: '', role: 'staff', departmentId: '', isActive: true, permissions: [] });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'users');
    }
  };

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    try {
      await addDoc(collection(db, 'departments'), {
        name: newItemName,
        defaultPermissions: [],
        createdAt: new Date().toISOString()
      });
      setNewItemName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'departments');
    }
  };

  const handleStartEditUserPermissions = (user: AppUser) => {
    setEditingPermUserId(user.id);
    setTempPermissions(user.permissions || []);
    setEditingPermDeptId(null);
  };

  const handleStartEditDeptPermissions = (dept: Department) => {
    setEditingPermDeptId(dept.id);
    setTempPermissions(dept.defaultPermissions || []);
    setEditingPermUserId(null);
  };

  const handleTogglePermission = (moduleId: string, field: keyof ModulePermission) => {
    setTempPermissions(prev => {
      const existing = prev.find(p => p.moduleId === moduleId);
      if (existing) {
        return prev.map(p => p.moduleId === moduleId ? { ...p, [field]: !p[field] } : p);
      } else {
        return [...prev, {
          moduleId,
          canView: field === 'canView',
          canAdd: field === 'canAdd',
          canEdit: field === 'canEdit',
          canDelete: field === 'canDelete',
          canApprove: field === 'canApprove',
          canConfirmVisit: field === 'canConfirmVisit',
          canConfirmDecision: field === 'canConfirmDecision',
          canProcessDelivery: field === 'canProcessDelivery',
        }];
      }
    });
  };

  const handleSelectAllInRow = (moduleId: string) => {
    setTempPermissions(prev => {
      const existing = prev.find(p => p.moduleId === moduleId);
      const allTrue = existing && Object.values(existing).every(v => typeof v !== 'boolean' || v === true);
      
      const newVal = !allTrue;
      const newPerm: ModulePermission = {
        moduleId,
        canView: newVal, canAdd: newVal, canEdit: newVal, canDelete: newVal,
        canApprove: newVal, canConfirmVisit: newVal, canConfirmDecision: newVal, canProcessDelivery: newVal
      };

      if (existing) {
        return prev.map(p => p.moduleId === moduleId ? newPerm : p);
      } else {
        return [...prev, newPerm];
      }
    });
  };

  const handleSelectAllInColumn = (field: keyof ModulePermission) => {
    setTempPermissions(prev => {
      const allModulesEnabled = modules.every(m => {
        const p = prev.find(perm => perm.moduleId === m.id);
        return p && p[field];
      });

      const newVal = !allModulesEnabled;
      
      let next = [...prev];
      modules.forEach(m => {
        const idx = next.findIndex(p => p.moduleId === m.id);
        if (idx >= 0) {
          next[idx] = { ...next[idx], [field]: newVal };
        } else {
          next.push({
            moduleId: m.id,
            canView: field === 'canView' ? newVal : false,
            canAdd: field === 'canAdd' ? newVal : false,
            canEdit: field === 'canEdit' ? newVal : false,
            canDelete: field === 'canDelete' ? newVal : false,
            canApprove: field === 'canApprove' ? newVal : false,
            canConfirmVisit: field === 'canConfirmVisit' ? newVal : false,
            canConfirmDecision: field === 'canConfirmDecision' ? newVal : false,
            canProcessDelivery: field === 'canProcessDelivery' ? newVal : false,
          });
        }
      });
      return next;
    });
  };

  const handleSavePermissions = async () => {
    try {
      if (editingPermUserId) {
        await updateDoc(doc(db, 'users', editingPermUserId), { permissions: tempPermissions });
        setEditingPermUserId(null);
      } else if (editingPermDeptId) {
        await updateDoc(doc(db, 'departments', editingPermDeptId), { defaultPermissions: tempPermissions });
        setEditingPermDeptId(null);
      }
      setTempPermissions([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, editingPermUserId ? 'users' : 'departments');
    }
  };

  const handleUpdateUserWithDept = async (userId: string, deptId: string) => {
    try {
      const dept = departments.find(d => d.id === deptId);
      const updates: any = { departmentId: deptId };
      
      if (dept && dept.defaultPermissions && dept.defaultPermissions.length > 0) {
        if (confirm('هل تريد تطبيق الصلاحيات الافتراضية لهذه الإدارة على هذا المستخدم؟')) {
          updates.permissions = dept.defaultPermissions;
        }
      }
      
      await updateDoc(doc(db, 'users', userId), updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const filteredLookups = lookups.filter(l => l.type === activeCategory);
  const filteredServices = services.filter(s => {
    if (serviceCategoryFilter !== 'all' && s.category !== serviceCategoryFilter) return false;
    if (serviceExecutionFilter !== 'all' && s.executionMethod !== serviceExecutionFilter) return false;
    return true;
  });

  const handleUpdateLookupName = async (id: string, newName: string) => {
    try {
      await updateDoc(doc(db, 'lookups', id), { name: newName });
      setEditingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `lookups/${id}`);
    }
  };

  const handleUpdateModuleName = async (id: string, newName: string) => {
    try {
      await updateDoc(doc(db, 'modules', id), { name: newName });
      setEditingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `modules/${id}`);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-gray-900">إعدادات النظام</h2>
          <p className="text-gray-400 font-bold mt-1 uppercase tracking-widest text-[10px]">إدارة القوائم المنسدلة والبيانات الأساسية</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="space-y-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEndCategories}
          >
            <SortableContext
              items={lookupCategories.map(c => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {lookupCategories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <SortableItem
                    key={cat.id}
                    id={cat.id}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-2xl font-bold transition-all border-2",
                      activeCategory === cat.id 
                        ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" 
                        : "bg-white border-transparent text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div 
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => setActiveCategory(cat.id as any)}
                      >
                        <Icon className={cn("w-5 h-5", activeCategory === cat.id ? "text-emerald-100" : "text-emerald-600")} />
                        {editingId === `cat-${cat.id}` ? (
                          <input 
                            autoFocus
                            className="bg-white text-gray-900 px-1 rounded outline-none w-full"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => handleUpdateCategoryLabel(cat.id, editValue)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateCategoryLabel(cat.id, editValue)}
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span className="flex items-center gap-2">
                            {cat.label}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(`cat-${cat.id}`);
                                setEditValue(cat.label);
                              }}
                              className="p-1 opacity-0 group-hover:opacity-100 hover:text-emerald-300 transition-all"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </span>
                        )}
                      </div>
                      <ChevronRight className={cn("w-4 h-4 transition-transform", activeCategory === cat.id ? "rotate-90" : "opacity-0")} />
                    </div>
                  </SortableItem>
                );
              })}
            </SortableContext>
          </DndContext>
        </div>

        <div className="lg:col-span-3 bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm h-full">
          {activeCategory === 'services' ? (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <h3 className="text-xl font-black text-gray-900">إدارة الخدمات والبرامج</h3>
                
                <div className="flex flex-wrap gap-2">
                  <select 
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-xs font-black text-gray-500 outline-none"
                    value={serviceCategoryFilter}
                    onChange={e => setServiceCategoryFilter(e.target.value)}
                  >
                    <option value="all">كل التصنيفات</option>
                    {Object.values(AssistanceType).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select 
                    className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-xs font-black text-gray-500 outline-none"
                    value={serviceExecutionFilter}
                    onChange={e => setServiceExecutionFilter(e.target.value)}
                  >
                    <option value="all">كل طرق التنفيذ</option>
                    <option value="pickup">استلام فرع</option>
                    <option value="delivery">شحن منزل</option>
                    <option value="office">بمقر الجمعية</option>
                    <option value="hospital">بالمستشفى</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
              </div>

              <form onSubmit={handleAddService} className="bg-white border-2 border-emerald-100 p-8 rounded-[40px] shadow-xl shadow-emerald-50 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase px-2">مسمى الخدمة</label>
                    <input 
                      type="text"
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-5 py-4 outline-none font-bold transition-all text-gray-900 placeholder:text-gray-300"
                      value={newService.name}
                      onChange={e => setNewService({...newService, name: e.target.value})}
                      placeholder="اسم الخدمة"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase px-2">الوحدة</label>
                    <input 
                      type="text"
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-5 py-4 outline-none font-bold"
                      value={newService.defaultUnit || ''}
                      onChange={e => setNewService({...newService, defaultUnit: e.target.value})}
                      placeholder="مثال: جلسة، عملية، حقنة"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase px-2">السعر الافتراضي</label>
                    <input 
                      type="number"
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-5 py-4 outline-none font-bold"
                      value={newService.defaultUnitCost || 0}
                      onChange={e => setNewService({...newService, defaultUnitCost: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase px-2">تصنيف المساعدة</label>
                    <select 
                      className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-5 py-4 outline-none font-bold"
                      value={newService.category}
                      onChange={e => setNewService({...newService, category: e.target.value as AssistanceType})}
                    >
                      {Object.values(AssistanceType).map(t => <option key={t} value={t}>{t}</option>)}
                      {assistanceTypes.map(at => <option key={at.id} value={at.name}>{at.name}</option>)}
                    </select>
                  </div>
                  <div className="lg:col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase block mb-2 px-2 flex items-center gap-2">أيقونة الخدمة</label>
                                 <div className="flex flex-wrap gap-3">
                                   {[
                                     { n: 'Zap', i: Zap },
                                     { n: 'HeartPulse', i: HeartPulse },
                                     { n: 'GraduationCap', i: GraduationCap },
                                     { n: 'Home', i: Home },
                                     { n: 'Stethoscope', i: Stethoscope },
                                     { n: 'Briefcase', i: Briefcase },
                                     { n: 'Gift', i: Gift },
                                     { n: 'Warehouse', i: Warehouse },
                                     { n: 'Truck', i: Truck },
                                     { n: 'Wallet', i: Wallet },
                                     { n: 'Rocket', i: Rocket },
                                     { n: 'ShieldCheck', i: ShieldCheck }
                                   ].map(iconObj => (
                                     <button
                                       key={iconObj.n}
                                       type="button"
                                       onClick={() => setNewService({...newService, iconName: iconObj.n})}
                                       className={cn(
                                         "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 min-w-[70px]",
                                         newService.iconName === iconObj.n ? "border-emerald-600 bg-emerald-50 text-emerald-600" : "border-gray-50 text-gray-400 hover:border-emerald-200 hover:bg-emerald-50/10"
                                       )}
                                     >
                                       <iconObj.i className="w-5 h-5" />
                                       <span className="text-[8px] font-black uppercase text-gray-400">{iconObj.n}</span>
                                     </button>
                                   ))}
                                 </div>
                  </div>
                </div>
                <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-emerald-100 transition-all hover:bg-emerald-700 flex items-center justify-center gap-2">
                  <CheckSquare className="w-6 h-6" />
                  إضافة الخدمة للنظام
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredServices.map(service => (
                  <div key={service.id} className={cn(
                    "p-6 rounded-[32px] border transition-all group space-y-4 shadow-sm",
                    service.isActive ? "bg-white border-gray-100 hover:border-emerald-200" : "bg-gray-50 border-gray-200 grayscale opacity-60"
                  )}>
                    <div className="flex justify-between items-start">
                      <div className="flex gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                          service.isActive ? "bg-emerald-50 text-emerald-600" : "bg-gray-200 text-gray-400"
                        )}>
                           {(() => {
                             const icons: Record<string, any> = {
                               'Zap': Zap, 'HeartPulse': HeartPulse, 'Gift': Gift, 'Briefcase': Briefcase,
                               'GraduationCap': GraduationCap, 'Home': Home, 'Stethoscope': Stethoscope,
                               'Warehouse': Warehouse, 'Truck': Truck, 'Wallet': Wallet, 'Rocket': Rocket,
                               'ShieldCheck': ShieldCheck
                             };
                             const Icon = icons[service.iconName || 'Zap'] || Zap;
                             return <Icon className="w-6 h-6" />;
                           })()}
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-black text-gray-900 group-hover:text-emerald-700 transition-colors uppercase">{service.name}</h4>
                          <div className="flex flex-wrap items-center gap-2">
                             <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase">{service.category}</span>
                             {service.defaultUnitCost !== undefined && (
                               <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase">
                                 {service.defaultUnitCost.toLocaleString()} ج.م
                                 {service.defaultUnit ? ` / ${service.defaultUnit}` : ''}
                               </span>
                             )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => handleToggleService(service)}
                          className={cn(
                            "p-2 rounded-xl transition-all",
                            service.isActive ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          )}
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteService(service.id)}
                          className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest pt-2 border-t border-gray-50">
                        <div className="flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          <span>{service.executionMethod === 'pickup' ? 'استلام فرع' : service.executionMethod === 'delivery' ? 'توصيل منزل' : service.executionMethod === 'office' ? 'بالمقر' : 'توزيع عام'}</span>
                        </div>
                        <div className="flex items-center gap-1 mr-auto">
                           <div className={cn(
                             "w-2 h-2 rounded-full",
                             service.isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-gray-300"
                           )} />
                           <span>{service.isActive ? 'مفعلة' : 'معطلة'}</span>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeCategory === 'assistance_types' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
               <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-gray-900">تخصيص أنواع المساعدات</h3>
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">تعريف وتصنيف أنواع المساعدات والوحدات المتاحة</p>
                  </div>
               </div>

               <form onSubmit={handleAddAssistanceType} className="bg-white border-2 border-emerald-100 p-8 rounded-[40px] shadow-xl shadow-emerald-50 space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase px-2 tracking-tighter">اسم النوع</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-5 py-4 outline-none font-bold text-gray-900"
                        placeholder="مثل: وجبات ساخنة"
                        value={newAssistanceType.name}
                        onChange={e => setNewAssistanceType({...newAssistanceType, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase px-2 tracking-tighter">الوحدة</label>
                      <input 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-5 py-4 outline-none font-bold text-gray-900"
                        placeholder="مثل: وجبة، كرتونة"
                        value={newAssistanceType.unit}
                        onChange={e => setNewAssistanceType({...newAssistanceType, unit: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase px-2 tracking-tighter">التصنيف الرئيسي</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-5 py-4 outline-none font-bold text-gray-900"
                        value={newAssistanceType.category}
                        onChange={e => setNewAssistanceType({...newAssistanceType, category: e.target.value})}
                      >
                        <option value="غذائي">غذائي</option>
                        <option value="صحي">صحي</option>
                        <option value="تعليمي">تعليمي</option>
                        <option value="نقدي">نقدي</option>
                        <option value="أخرى">أخرى</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-500 uppercase px-2 tracking-tighter">سعر الوحدة الافتراضي</label>
                      <input 
                        type="number"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-5 py-4 outline-none font-bold text-gray-900"
                        value={newAssistanceType.defaultPrice}
                        onChange={e => setNewAssistanceType({...newAssistanceType, defaultPrice: parseFloat(e.target.value)})}
                      />
                    </div>
                 </div>
                 <button type="submit" className="w-full bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100">
                    <Plus className="w-5 h-5" />
                    إضافة نوع المساعدة
                 </button>
               </form>

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-8">
                  {assistanceTypes.map(at => (
                    <div key={at.id} className="p-6 bg-white border border-gray-100 rounded-[32px] hover:shadow-lg transition-all group flex items-center justify-between">
                       <div>
                          <div className="font-black text-gray-900 group-hover:text-emerald-600 transition-colors uppercase">{at.name}</div>
                          <div className="flex gap-2 mt-1">
                             <span className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full uppercase">{at.unit}</span>
                             <span className="text-[10px] font-black bg-gray-50 text-gray-400 px-2 py-0.5 rounded-full uppercase">{at.category}</span>
                             <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full uppercase">{at.defaultPrice || 0} ج.م</span>
                          </div>
                       </div>
                       <button onClick={() => handleDeleteAssistanceType(at.id)} className="p-2 text-rose-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="w-5 h-5" />
                       </button>
                    </div>
                  ))}
               </div>
            </div>
          ) : activeCategory === 'modules' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
               <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-gray-900">ترتيب ومسميات النظام</h3>
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">تحكم في ظهور وترتيب الوحدات في القائمة الجانبية</p>
                  </div>
                  {modules.length === 0 && (
                    <button 
                      onClick={initializeModules}
                      className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 hover:bg-emerald-700 transition-all"
                    >
                      <Zap className="w-4 h-4" /> تهيئة الوحدات الافتراضية
                    </button>
                  )}
               </div>

               <DndContext 
                 sensors={sensors}
                 collisionDetection={closestCenter}
                 onDragEnd={handleDragEndModules}
               >
                 <SortableContext 
                   items={modules.map(m => m.id)}
                   strategy={verticalListSortingStrategy}
                 >
                   <div className="grid grid-cols-1 gap-4">
                      {modules.map((mod) => (
                        <SortableItem 
                          key={mod.id} 
                          id={mod.id}
                          className="bg-gray-50 rounded-[32px] border border-gray-100 flex flex-col group hover:border-emerald-200 transition-all overflow-hidden"
                        >
                          <div className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                              <div>
                                 <div className="flex items-center gap-3">
                                   {editingId === mod.id ? (
                                     <input 
                                       autoFocus
                                       className="bg-white border-b-2 border-emerald-600 outline-none font-black text-gray-900 px-1"
                                       value={editValue}
                                       onChange={e => setEditValue(e.target.value)}
                                       onBlur={() => handleUpdateModuleName(mod.id, editValue)}
                                       onKeyDown={e => e.key === 'Enter' && handleUpdateModuleName(mod.id, editValue)}
                                     />
                                   ) : (
                                     <h4 className="font-black text-gray-900 flex items-center gap-2">
                                       {mod.name}
                                       <button 
                                         onClick={() => {
                                           setEditingId(mod.id);
                                           setEditValue(mod.name);
                                         }}
                                         className="p-1 text-gray-300 hover:text-emerald-600 transition-colors"
                                       >
                                         <Edit3 className="w-3 h-3" />
                                       </button>
                                     </h4>
                                   )}
                                   <span className="text-[10px] font-black text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full uppercase">{mod.originalName}</span>
                                 </div>
                                 <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">المسار: {mod.path}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                               <button 
                                 onClick={() => toggleExpand(mod.id)}
                                 className={cn(
                                   "p-3 rounded-xl transition-all border border-gray-100 flex items-center gap-2 font-black text-[10px] uppercase",
                                   expandedItems.includes(mod.id) ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-white text-gray-500"
                                 )}
                               >
                                  فرد المحتوى
                                  <ChevronDown className={cn("w-4 h-4 transition-transform", expandedItems.includes(mod.id) && "rotate-180")} />
                               </button>
                               <button 
                                 onClick={() => handleUpdateModule(mod.id, { isActive: !mod.isActive })}
                                 className={cn(
                                   "px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all",
                                   mod.isActive ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-gray-200 text-gray-400 grayscale"
                                 )}
                               >
                                 {mod.isActive ? 'نشطة' : 'معطلة'}
                               </button>
                            </div>
                          </div>

                          <AnimatePresence>
                            {expandedItems.includes(mod.id) && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t border-gray-100 bg-white/50 px-8 py-8 space-y-10"
                              >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                  <div className="space-y-6">
                                    <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                                      <LayoutGrid className="w-3 h-3" /> محتويات الوحدة الداخلية
                                    </h5>
                                    
                                    <DndContext
                                      sensors={sensors}
                                      collisionDetection={closestCenter}
                                      onDragEnd={(e) => handleDragEndSubModules(mod.id, e)}
                                    >
                                      <SortableContext
                                        items={(mod.subModules || []).map(sm => sm.id)}
                                        strategy={verticalListSortingStrategy}
                                      >
                                        <div className="space-y-2">
                                          {(mod.subModules || []).map((sm) => (
                                            <SortableItem
                                              key={sm.id}
                                              id={sm.id}
                                              className="bg-white p-3 rounded-2xl border border-gray-100 flex items-center justify-between group/sm hover:border-emerald-200 transition-all shadow-sm"
                                            >
                                              <div className="flex items-center gap-3 w-full">
                                                {editingId === sm.id ? (
                                                  <input 
                                                    autoFocus
                                                    className="flex-1 bg-gray-50 px-2 py-1 rounded outline-none font-bold text-xs"
                                                    value={editValue}
                                                    onChange={e => setEditValue(e.target.value)}
                                                    onBlur={() => handleUpdateSubModuleName(mod.id, sm.id, editValue)}
                                                    onKeyDown={e => e.key === 'Enter' && handleUpdateSubModuleName(mod.id, sm.id, editValue)}
                                                  />
                                                ) : (
                                                  <div className="flex items-center justify-between w-full">
                                                    <span className="text-xs font-black text-gray-700">{sm.name}</span>
                                                    <div className="flex items-center gap-2">
                                                      <button 
                                                        onClick={() => {
                                                          setEditingId(sm.id);
                                                          setEditValue(sm.name);
                                                        }}
                                                        className="p-1 text-gray-300 hover:text-emerald-600 opacity-0 group-hover/sm:opacity-100 transition-all"
                                                      >
                                                        <Edit3 className="w-3 h-3" />
                                                      </button>
                                                      <button 
                                                        onClick={async () => {
                                                          const newSub = mod.subModules?.filter(s => s.id !== sm.id);
                                                          await handleUpdateModule(mod.id, { subModules: newSub });
                                                        }}
                                                        className="p-1 text-gray-200 hover:text-red-500 opacity-0 group-hover/sm:opacity-100 transition-all"
                                                      >
                                                        <Trash2 className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            </SortableItem>
                                          ))}
                                          <button 
                                            onClick={async () => {
                                              const newName = prompt('اسم المحتوى الداخلي الجديد:');
                                              if (newName) {
                                                const newSub = [...(mod.subModules || []), { 
                                                  id: Math.random().toString(36).substr(2, 9), 
                                                  name: newName, 
                                                  order: (mod.subModules?.length || 0) + 1 
                                                }];
                                                await handleUpdateModule(mod.id, { subModules: newSub });
                                              }
                                            }}
                                            className="w-full py-3 border-2 border-dashed border-gray-100 rounded-2xl text-[10px] font-black text-gray-400 hover:border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50/30 transition-all flex items-center justify-center gap-2"
                                          >
                                            <Plus className="w-3 h-3" /> إضافة محتوى داخلي
                                          </button>
                                        </div>
                                      </SortableContext>
                                    </DndContext>
                                  </div>
                                  
                                  <div className="space-y-6">
                                    <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                      <ShieldCheck className="w-3 h-3" /> خصائص وإعدادات إضافية
                                    </h5>
                                    <div className="space-y-3">
                                      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-50 group/prop hover:border-emerald-100 transition-all">
                                        <span className="text-xs font-bold text-gray-500">رابط المسار الثابت</span>
                                        <code className="text-[10px] font-mono text-emerald-600 bg-emerald-50/50 px-2 py-0.5 rounded">/{mod.path}</code>
                                      </div>
                                      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-50 group/prop hover:border-emerald-100 transition-all">
                                        <span className="text-xs font-bold text-gray-500">الأيقونة المستخدمة</span>
                                        <span className="text-[10px] font-black text-gray-900 bg-gray-50 px-2 py-0.5 rounded">{mod.icon}</span>
                                      </div>
                                      <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100 space-y-2">
                                        <h6 className="text-[9px] font-black text-amber-700 uppercase tracking-widest">تنبيه النظام</h6>
                                        <p className="text-[10px] font-medium text-amber-800 leading-tight">
                                          تغيير المسميات هنا يؤثر على القائمة الجانبية وعناوين الصفحات. يرجى الحفاظ على وضوح المصطلحات.
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </SortableItem>
                      ))}
                   </div>
                 </SortableContext>
               </DndContext>
            </div>
          ) : activeCategory === 'users' ? (
            <div className="space-y-12 animate-in fade-in duration-500">
               <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-gray-900">إدارة المستخدمين والموظفين</h3>
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">إضافة مستخدمين جدد وتعديل صلاحيات الوصول لكل مستخدم</p>
                  </div>
               </div>

                <form onSubmit={handleAddUser} className="bg-white border-2 border-emerald-50/50 p-10 rounded-[48px] shadow-xl shadow-emerald-50/20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
                   <div className="md:col-span-2 lg:col-span-1 flex flex-col justify-center border-l border-gray-100 pl-4">
                     <h4 className="text-lg font-black text-gray-900">تسجيل موظف جديد</h4>
                     <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">قم بإدخال بيانات الاعتماد الأساسية</p>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase mr-2">الاسم بالكامل</label>
                      <div className="relative">
                         <User className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                         <input 
                           type="text" required
                           className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl pr-12 pl-4 py-4 outline-none font-bold placeholder:text-gray-300 transition-all"
                           value={newUser.name}
                           onChange={e => setNewUser({...newUser, name: e.target.value})}
                           placeholder="مثال: يحيى زكريا"
                         />
                      </div>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase mr-2">البريد الإلكتروني المؤسسي</label>
                      <div className="relative">
                         <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                         <input 
                           type="email" required
                           className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl pr-12 pl-4 py-4 outline-none font-bold placeholder:text-gray-300 transition-all"
                           value={newUser.email}
                           onChange={e => setNewUser({...newUser, email: e.target.value})}
                           placeholder="user@organization.com"
                         />
                      </div>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase mr-2">الإدارة التابع لها</label>
                      <select 
                         required
                         className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-4 py-4 outline-none font-bold transition-all"
                         value={newUser.departmentId}
                         onChange={e => setNewUser({...newUser, departmentId: e.target.value})}
                      >
                         <option value="">اختر الإدارة...</option>
                         {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                   </div>
                   <div className="flex items-end">
                      <button className="w-full bg-emerald-600 text-white h-[60px] rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-50">
                         <UserPlus className="w-6 h-6" /> تسجيل الموظف
                      </button>
                   </div>
                </form>

               <div className="grid grid-cols-1 gap-6">
                  {appUsers.map(user => (
                    <div key={user.id} className="bg-white border-2 border-gray-50 p-8 rounded-[48px] hover:border-emerald-100 transition-all group overflow-hidden relative">
                       <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-8 relative z-10">
                          <div className="flex items-center gap-6">
                             <div className="w-16 h-16 bg-gray-50 rounded-[28px] flex items-center justify-center text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                                <User className="w-8 h-8" />
                             </div>
                             <div>
                                <h4 className="text-xl font-black text-gray-900">{user.name}</h4>
                                <p className="text-sm font-bold text-gray-400">{user.email}</p>
                             </div>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-3">
                             <div className={cn(
                                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest",
                                user.role === 'admin' ? "bg-rose-50 text-rose-600" :
                                user.role === 'staff' ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                             )}>
                                {user.role === 'admin' ? 'مدير نظام' : user.role === 'staff' ? 'موظف' : 'متطوع'}
                             </div>
                             <select 
                                className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2 text-[10px] font-black outline-none"
                                value={user.departmentId || ''}
                                onChange={e => handleUpdateUserWithDept(user.id, e.target.value)}
                             >
                                <option value="">بدون إدارة</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                             </select>
                             <button
                               onClick={() => handleStartEditUserPermissions(user)}
                               className={cn(
                                 "px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2",
                                 editingPermUserId === user.id ? "bg-emerald-600 text-white" : "bg-white border-2 border-gray-100 text-gray-500 hover:border-emerald-200"
                               )}
                             >
                                <Lock className="w-3 h-3" />
                                {editingPermUserId === user.id ? "قيد التعديل" : "تعديل الصلاحيات"}
                             </button>
                             <button 
                               onClick={() => handleUpdateUser(user.id, { isActive: !user.isActive })}
                               className={cn(
                                 "px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all",
                                 user.isActive ? "bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm" : "bg-gray-200 text-gray-400 grayscale"
                               )}
                             >
                               {user.isActive ? 'نشط' : 'موقف'}
                             </button>
                             <button onClick={() => deleteDoc(doc(db, 'users', user.id))} className="p-3 text-gray-300 hover:text-rose-600 transition-colors">
                                <Trash2 className="w-5 h-5" />
                             </button>
                          </div>
                       </div>

                       <div className="space-y-6 pt-8 border-t border-gray-50 relative z-10">
                          <div className="flex items-center justify-between">
                            <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                               <Lock className="w-3 h-3" /> مصفوفة الصلاحيات (Permission Matrix)
                            </h5>
                            {editingPermUserId === user.id && (
                              <div className="flex items-center gap-3">
                                 <button 
                                   onClick={() => {
                                     setEditingPermUserId(null);
                                     setTempPermissions([]);
                                   }}
                                   className="px-4 py-2 text-[10px] font-black text-gray-400 hover:text-gray-900"
                                 >
                                   إلغاء التعديل
                                 </button>
                                 <button 
                                   onClick={handleSavePermissions}
                                   className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-[10px] font-black shadow-lg shadow-emerald-50"
                                 >
                                   حفظ وتأكيد الصلاحيات
                                 </button>
                              </div>
                            )}
                          </div>
                          
                          <div className={cn("overflow-x-auto transition-all", editingPermUserId !== user.id && "opacity-50 pointer-events-none")}>
                            <table className="w-full text-right">
                               <thead>
                                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                     <th className="pb-4 pr-4">الوحدة / المكون</th>
                                     {[
                                       {f: 'canView' as const, label: 'عرض'},
                                       {f: 'canAdd' as const, label: 'إضافة'},
                                       {f: 'canEdit' as const, label: 'تعديل'},
                                       {f: 'canDelete' as const, label: 'حذف'},
                                       {f: 'canApprove' as const, label: 'اعتماد'},
                                       {f: 'canConfirmVisit' as const, label: 'زيارة'},
                                       {f: 'canConfirmDecision' as const, label: 'قرار'},
                                       {f: 'canProcessDelivery' as const, label: 'تسليم'}
                                     ].map(col => (
                                       <th key={col.f} className="pb-4 px-2 text-center">
                                          <button 
                                            onClick={() => handleSelectAllInColumn(col.f)}
                                            className="hover:text-emerald-600 transition-colors"
                                          >
                                            {col.label}
                                          </button>
                                       </th>
                                     ))}
                                     <th className="pb-4 px-2 text-center">الكل</th>
                                  </tr>
                               </thead>
                               <tbody className="divide-y divide-gray-50">
                                  {modules.map(mod => {
                                    const activePerms = editingPermUserId === user.id ? tempPermissions : user.permissions;
                                    const perm = activePerms.find(p => p.moduleId === mod.id) || {
                                      moduleId: mod.id,
                                      canView: false, canAdd: false, canEdit: false, canDelete: false,
                                      canApprove: false, canConfirmVisit: false, canConfirmDecision: false, canProcessDelivery: false
                                    };
                                    return (
                                      <tr key={mod.id} className="group/row hover:bg-gray-50/50 transition-colors">
                                         <td className="py-4 pr-4">
                                            <div className="flex items-center gap-3">
                                               <span className="text-sm font-black text-gray-900">{mod.name}</span>
                                            </div>
                                         </td>
                                         {[
                                           {f: 'canView' as const},
                                           {f: 'canAdd' as const},
                                           {f: 'canEdit' as const},
                                           {f: 'canDelete' as const},
                                           {f: 'canApprove' as const},
                                           {f: 'canConfirmVisit' as const},
                                           {f: 'canConfirmDecision' as const},
                                           {f: 'canProcessDelivery' as const}
                                         ].map(p => (
                                           <td key={p.f} className="py-4 px-2 text-center">
                                              <button 
                                                onClick={() => handleTogglePermission(mod.id, p.f)}
                                                className={cn(
                                                  "w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all",
                                                  (perm as any)[p.f] ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "bg-gray-100 text-gray-300 hover:bg-gray-200"
                                                )}
                                              >
                                                <CheckSquare className="w-4 h-4" />
                                              </button>
                                           </td>
                                         ))}
                                         <td className="py-4 px-2 text-center">
                                            <button 
                                              onClick={() => handleSelectAllInRow(mod.id)}
                                              className="w-8 h-8 rounded-lg border border-gray-100 text-gray-300 hover:border-emerald-600 hover:text-emerald-600 flex items-center justify-center mx-auto transition-all"
                                            >
                                              <Plus className="w-4 h-4" />
                                            </button>
                                         </td>
                                      </tr>
                                   );
                                })}
                             </tbody>
                          </table>
                        </div>
                     </div>
                     
                     {/* Background Decor */}
                     <div className="absolute top-0 left-0 w-32 h-32 bg-gray-50 rounded-full -translate-x-1/2 -translate-y-1/2 -z-0" />
                  </div>
                ))}
             </div>
          </div>
          ) : activeCategory === 'departments' ? (
            <div className="space-y-8 animate-in fade-in duration-500">
               <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-gray-900">إدارة الإدارات والأقسام</h3>
                    <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">تصنيف الموظفين حسب الإدارات التابعين لها</p>
                  </div>
                  <form onSubmit={handleAddDept} className="flex gap-4">
                     <input 
                        type="text" required
                        className="bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-6 py-3 outline-none font-bold"
                        value={newItemName}
                        onChange={e => setNewItemName(e.target.value)}
                        placeholder="اسم الإدارة الجديدة..."
                     />
                     <button className="bg-emerald-600 text-white p-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-50">
                        <Plus className="w-6 h-6" />
                     </button>
                  </form>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {departments.map(dept => (
                     <div key={dept.id} className={cn(
                       "bg-white border-2 p-8 rounded-[40px] transition-all group flex flex-col relative overflow-hidden",
                       editingPermDeptId === dept.id ? "border-emerald-600 shadow-xl shadow-emerald-50" : "border-gray-50 hover:border-emerald-200 shadow-sm"
                     )}>
                        <div className="flex items-start justify-between mb-6 relative z-10">
                           <div className={cn(
                             "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                             editingPermDeptId === dept.id ? "bg-emerald-600 text-white" : "bg-gray-50 text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600"
                           )}>
                              <Building className="w-7 h-7" />
                           </div>
                           <div className="flex gap-2">
                              <button 
                                onClick={() => handleStartEditDeptPermissions(dept)}
                                className={cn(
                                  "p-3 rounded-xl transition-all font-black text-[10px] uppercase",
                                  editingPermDeptId === dept.id ? "bg-emerald-100 text-emerald-700" : "bg-gray-50 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                                )}
                              >
                                {editingPermDeptId === dept.id ? "قيد الضبط" : "ضبط الصلاحيات الافتراضية"}
                              </button>
                              <button onClick={() => deleteDoc(doc(db, 'departments', dept.id))} className="p-3 text-gray-300 hover:text-rose-600 transition-colors">
                                 <Trash2 className="w-5 h-5" />
                              </button>
                           </div>
                        </div>
                        <div className="relative z-10 mb-6">
                           <h4 className="text-2xl font-black text-gray-900 mb-2">{dept.name}</h4>
                           <div className="flex items-center gap-3">
                              <Users className="w-4 h-4 text-gray-300" />
                              <span className="text-sm font-bold text-gray-400">{appUsers.filter(u => u.departmentId === dept.id).length} موظف مشمول</span>
                           </div>
                        </div>

                        {editingPermDeptId === dept.id && (
                          <div className="relative z-10 space-y-6 animate-in slide-in-from-top-4 duration-300">
                             <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                                <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">تعديل الصلاحيات الافتراضية للإدارة</h5>
                                <div className="flex gap-2">
                                   <button onClick={() => { setEditingPermDeptId(null); setTempPermissions([]); }} className="px-4 py-2 text-[10px] font-black text-gray-400 hover:text-gray-900">إلغاء</button>
                                   <button onClick={handleSavePermissions} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black shadow-lg shadow-emerald-50">حفظ الكل</button>
                                </div>
                             </div>
                             
                             <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                <table className="w-full text-right pointer-events-auto">
                                   <thead>
                                      <tr className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                                         <th className="pb-3 text-right">الوحدة</th>
                                         {[
                                           {f: 'canView' as const, label: 'عرض'},
                                           {f: 'canAdd' as const, label: 'إضافة'},
                                           {f: 'canEdit' as const, label: 'تعديل'},
                                           {f: 'canDelete' as const, label: 'حذف'},
                                           {f: 'canApprove' as const, label: 'اعتماد'},
                                           {f: 'canConfirmVisit' as const, label: 'زيارة'},
                                           {f: 'canConfirmDecision' as const, label: 'قرار'},
                                           {f: 'canProcessDelivery' as const, label: 'تسليم'}
                                         ].map(col => (
                                           <th key={col.f} className="pb-3 text-center">
                                              <button onClick={() => handleSelectAllInColumn(col.f)} className="hover:text-emerald-600 transition-colors">
                                                {col.label}
                                              </button>
                                           </th>
                                         ))}
                                         <th className="pb-3 text-center">الكل</th>
                                      </tr>
                                   </thead>
                                   <tbody className="divide-y divide-gray-50">
                                      {modules.map(mod => {
                                        const perm = tempPermissions.find(p => p.moduleId === mod.id) || {
                                          moduleId: mod.id,
                                          canView: false, canAdd: false, canEdit: false, canDelete: false,
                                          canApprove: false, canConfirmVisit: false, canConfirmDecision: false, canProcessDelivery: false
                                        };
                                        return (
                                          <tr key={mod.id}>
                                             <td className="py-3 text-[10px] font-black text-gray-700">{mod.name}</td>
                                             {[
                                               {f: 'canView' as const},
                                               {f: 'canAdd' as const},
                                               {f: 'canEdit' as const},
                                               {f: 'canDelete' as const},
                                               {f: 'canApprove' as const},
                                               {f: 'canConfirmVisit' as const},
                                               {f: 'canConfirmDecision' as const},
                                               {f: 'canProcessDelivery' as const}
                                             ].map((p: any) => (
                                               <td key={p.f} className="py-3 text-center">
                                                  <button 
                                                    onClick={(e) => { e.stopPropagation(); handleTogglePermission(mod.id, p.f); }}
                                                    className={cn(
                                                      "w-6 h-6 rounded flex items-center justify-center mx-auto transition-all",
                                                      (perm as any)[p.f] ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-300 hover:bg-gray-200"
                                                    )}
                                                  >
                                                     <CheckSquare className="w-3 h-3" />
                                                  </button>
                                               </td>
                                             ))}
                                             <td className="py-3 text-center">
                                               <button 
                                                 onClick={() => handleSelectAllInRow(mod.id)}
                                                 className="w-6 h-6 rounded border border-gray-100 text-gray-300 hover:border-emerald-600 hover:text-emerald-600 flex items-center justify-center mx-auto transition-all"
                                               >
                                                 <Plus className="w-3 h-3" />
                                               </button>
                                             </td>
                                          </tr>
                                        );
                                      })}
                                   </tbody>
                                </table>
                             </div>
                          </div>
                        )}
                        
                        {/* Background Decor */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-full translate-x-1/2 -translate-y-1/2 -z-0" />
                     </div>
                   ))}
               </div>
            </div>
          ) : activeCategory === 'store_items' ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-gray-900">إدارة بنود المخزن والتجهيزات</h3>
               </div>

               <form onSubmit={handleSubmitStoreItem} className="bg-gray-50 p-8 rounded-[32px] border border-gray-100 space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase mr-2">اسم الصنف</label>
                      <input name="name" required className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 outline-none font-bold" placeholder="مثال: شنطة مواد غذائية..." />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-gray-400 uppercase mr-2">التصنيف</label>
                       <select name="category" className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 outline-none font-bold">
                          <option value="food">مواد غذائية</option>
                          <option value="medical">أدوية ومستلزمات</option>
                          <option value="furniture">أثاث وتجهيزات</option>
                          <option value="clothing">ملابس وأغطية</option>
                          <option value="other">أخرى</option>
                          {lookups.filter(l => l.type === 'store_category').map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase mr-2">الوحدة</label>
                      <input name="unit" required className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 outline-none font-bold" placeholder="مثال: كرتونة، قطعة..." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase mr-2">الكمية الحالية</label>
                      <input name="quantity" type="number" required className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 outline-none font-bold" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase mr-2">سعر التكلفة</label>
                      <input name="cost" type="number" step="0.01" required className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 outline-none font-bold" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase mr-2">الحد الأدنى للأمان</label>
                      <input name="minQuantity" type="number" className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 outline-none font-bold" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase mr-2">ملاحظات / وصف</label>
                      <input name="notes" className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 outline-none font-bold" placeholder="أي ملاحظات فنية حول الصنف..." />
                    </div>
                 </div>
                 <button className="w-full bg-gray-900 text-white font-black py-4 rounded-2xl hover:bg-black transition-all">إضافة الصنف للمخزن</button>
               </form>

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {storeItems.map(item => (
                   <div key={item.id} className="bg-white border-2 border-gray-50 p-6 rounded-[32px] hover:border-emerald-100 transition-all group">
                      <div className="flex justify-between items-start mb-4">
                         <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                            <Warehouse className="w-6 h-6" />
                         </div>
                         <button onClick={() => handleDeleteStoreItem(item.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                      <h4 className="font-black text-gray-900 mb-1">{item.name}</h4>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">{item.category}</p>
                      
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50">
                         <div>
                            <p className="text-[8px] font-black text-gray-300 uppercase mb-1">الرصيد</p>
                            <p className={cn(
                              "text-sm font-black",
                              item.quantity <= item.minQuantity ? "text-rose-600 animate-pulse" : "text-emerald-600"
                            )}>
                              {item.quantity} {item.unit}
                            </p>
                         </div>
                         <div>
                            <p className="text-[8px] font-black text-gray-300 uppercase mb-1">التكلفة</p>
                            <p className="text-sm font-black text-gray-900">{item.cost} ج.م</p>
                         </div>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <h3 className="text-xl font-black text-gray-900">قائمة {lookupCategories.find(c => c.id === activeCategory)?.label}</h3>
                
                {activeCategory !== 'delivery_location' && (
                  <form onSubmit={handleAdd} className="flex flex-1 max-w-xl gap-3">
                    {activeCategory === 'neighborhood' && (
                      <select 
                        required
                        className="bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-4 py-2 outline-none font-bold text-sm min-w-[150px]"
                        value={selectedParentId}
                        onChange={e => setSelectedParentId(e.target.value)}
                      >
                        <option value="">اختر المحافظة...</option>
                        {lookups.filter(l => l.type === 'governorate').map(gov => <option key={gov.id} value={gov.id}>{gov.name}</option>)}
                      </select>
                    )}
                    {activeCategory === 'financial_category' && (
                      <select 
                        required
                        className="bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-4 py-2 outline-none font-bold text-sm min-w-[150px]"
                        value={selectedSubType}
                        onChange={e => setSelectedSubType(e.target.value as any)}
                      >
                        <option value="income">بند دخل (+)</option>
                        <option value="expense">بند صرف (-)</option>
                      </select>
                    )}
                    <input 
                      type="text" 
                      placeholder={`أضف ${lookupCategories.find(c => c.id === activeCategory)?.label.slice(0, -1)} جديد...`}
                      className="flex-1 bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 rounded-2xl px-6 py-3 outline-none font-bold"
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      required
                    />
                    <button className="bg-emerald-600 text-white p-3 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100">
                      <Plus className="w-6 h-6" />
                    </button>
                  </form>
                )}
              </div>

              {activeCategory === 'delivery_location' && (
                <form onSubmit={handleAddDeliveryLocation} className="bg-gray-50 p-8 rounded-[32px] border border-gray-100 space-y-6 mb-8">
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <input 
                        placeholder="اسم جهة التسليم" required
                        className="w-full bg-white border border-gray-100 rounded-2xl px-5 py-3 outline-none font-bold placeholder:text-gray-300"
                        value={newDeliveryLocation.name}
                        onChange={e => setNewDeliveryLocation({...newDeliveryLocation, name: e.target.value})}
                      />
                      <input 
                        placeholder="رقم التواصل"
                        className="w-full bg-white border border-gray-100 rounded-2xl px-5 py-3 outline-none font-bold placeholder:text-gray-300"
                        value={newDeliveryLocation.contactPhone}
                        onChange={e => setNewDeliveryLocation({...newDeliveryLocation, contactPhone: e.target.value})}
                      />
                      <input 
                        placeholder="العنوان التفصيلي"
                        className="w-full bg-white border border-gray-100 rounded-2xl px-5 py-3 outline-none font-bold placeholder:text-gray-300"
                        value={newDeliveryLocation.address}
                        onChange={e => setNewDeliveryLocation({...newDeliveryLocation, address: e.target.value})}
                      />
                      <input 
                        placeholder="رابط الموقع (Google Maps)"
                        className="w-full bg-white border border-gray-100 rounded-2xl px-5 py-3 outline-none font-bold placeholder:text-gray-300 transition-all"
                        value={newDeliveryLocation.locationUrl}
                        onChange={e => setNewDeliveryLocation({...newDeliveryLocation, locationUrl: e.target.value})}
                      />
                      <div className="lg:col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase mr-2">الخدمات المتاحة بهذه الجهة</label>
                        <div className="flex flex-wrap gap-2">
                          {services.map(s => (
                            <button
                              key={s.id} type="button"
                              onClick={() => {
                                const current = newDeliveryLocation.serviceIds;
                                const next = current.includes(s.id) ? current.filter(id => id !== s.id) : [...current, s.id];
                                setNewDeliveryLocation({...newDeliveryLocation, serviceIds: next});
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-xl text-[10px] font-black transition-all border",
                                newDeliveryLocation.serviceIds.includes(s.id) ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-gray-100 text-gray-400 hover:border-indigo-200"
                              )}
                            >
                              {s.name}
                            </button>
                          ))}
                        </div>
                      </div>
                   </div>
                   <button className="w-full bg-emerald-600 text-white py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-50 font-black text-sm uppercase">حفظ جهة التسليم الجديدة</button>
                </form>
              )}

              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndLookups}
              >
                <SortableContext 
                  items={filteredLookups.map(l => l.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence mode="popLayout">
                      {filteredLookups.map((item) => (
                        <SortableItem
                          key={item.id}
                          id={item.id}
                          className="bg-gray-50 rounded-2xl border border-gray-100 flex flex-col group hover:border-emerald-200 transition-colors overflow-hidden"
                        >
                          <div className="p-5 flex items-center justify-between">
                            <div className="flex flex-col gap-1 w-full mr-2">
                              {editingId === item.id ? (
                                <input 
                                  autoFocus
                                  className="bg-white border-b-2 border-emerald-600 outline-none font-black text-gray-900 px-1 w-full"
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => handleUpdateLookupName(item.id, editValue)}
                                  onKeyDown={e => e.key === 'Enter' && handleUpdateLookupName(item.id, editValue)}
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-gray-900 leading-tight">{item.name}</span>
                                  <button 
                                    onClick={() => {
                                      setEditingId(item.id);
                                      setEditValue(item.name);
                                    }}
                                    className="p-1 text-gray-300 hover:text-emerald-600 transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                              {activeCategory === 'delivery_location' && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-[8px] font-bold text-gray-400 uppercase">
                                    <MapPin className="w-3 h-3" />
                                    <span className="line-clamp-1">{item.address || 'لا يوجد عنوان مسجل'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[8px] font-bold text-gray-400 uppercase">
                                    <Phone className="w-3 h-3" />
                                    <span>{item.contactPhone || 'لا يوجد رقم'}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {item.serviceIds?.map(sid => {
                                      const s = services.find(sv => sv.id === sid);
                                      return s ? <span key={sid} className="text-[8px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">{s.name}</span> : null;
                                    })}
                                  </div>
                                </div>
                              )}
                              {activeCategory === 'neighborhood' && (
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                  {lookups.filter(l => l.type === 'governorate').find(g => g.id === item.parentId)?.name || 'غير محدد'}
                                </span>
                              )}
                              {activeCategory === 'financial_category' && (
                                <span className={cn(
                                  "text-[10px] font-black uppercase tracking-widest mt-1 px-2 py-0.5 rounded-full w-fit",
                                  item.subType === 'income' ? "text-emerald-600 bg-emerald-50" : "text-amber-600 bg-amber-50"
                                )}>
                                  {item.subType === 'income' ? 'بند دخل' : 'بند صرف'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => toggleExpand(item.id)}
                                className={cn(
                                  "p-2 rounded-lg transition-all",
                                  expandedItems.includes(item.id) ? "bg-emerald-50 text-emerald-600" : "text-gray-300 hover:text-gray-600"
                                )}
                              >
                                <ChevronDown className={cn("w-4 h-4 transition-transform", expandedItems.includes(item.id) && "rotate-180")} />
                              </button>
                              <button 
                                onClick={() => handleDelete(item.id)}
                                className="p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <AnimatePresence>
                            {expandedItems.includes(item.id) && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t border-gray-100 px-5 py-4 bg-white/50 space-y-3"
                              >
                                <div className="flex flex-col gap-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-gray-400 tracking-widest uppercase">ID الفريد</span>
                                    <code className="text-[9px] font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">{item.id}</code>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-gray-400 tracking-widest uppercase">تاريخ الإضافة</span>
                                    <span className="text-[10px] font-bold text-gray-700">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('ar-EG') : 'غير متوفر'}</span>
                                  </div>
                                  {activeCategory === 'delivery_location' && item.locationUrl && (
                                    <button 
                                      onClick={() => setSelectedMapUrl(item.locationUrl || null)}
                                      className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[10px] uppercase hover:bg-emerald-100 transition-all border border-emerald-100"
                                    >
                                      <MapIcon className="w-4 h-4" />
                                      فتح الخريطة التفاعلية
                                    </button>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </SortableItem>
                      ))}
                    </AnimatePresence>
                    {filteredLookups.length === 0 && (
                      <div className="col-span-full py-20 text-center text-gray-300 font-bold">لا يوجد بيانات مسجلة في هذه القائمة بعد</div>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedMapUrl && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMapUrl(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-4xl h-[80vh] relative z-10 overflow-hidden shadow-3xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-gray-900">الموقع الجغرافي لجهة التسليم</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">خريطة تفاعلية مباشرة</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedMapUrl(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-900"
                >
                  <Plus className="w-8 h-8 rotate-45" />
                </button>
              </div>
              <div className="flex-1 bg-gray-100 relative">
                {selectedMapUrl.includes('google.com/maps/embed') || selectedMapUrl.includes('google.com/maps?q=') || selectedMapUrl.includes('google.com/maps/search') ? (
                  <iframe 
                    src={selectedMapUrl.includes('embed') ? selectedMapUrl : `https://www.google.com/maps/embed/v1/place?key=YOUR_API_KEY&q=${encodeURIComponent(selectedMapUrl)}`}
                    className="w-full h-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-20 text-center space-y-4">
                    <MapIcon className="w-20 h-20 text-gray-200" />
                    <p className="text-gray-500 font-bold">عذراً، لا يمكن عرض المعاينة المباشرة لهذا الرابط. يمكنك فتحه مباشرة في خرائط جوجل:</p>
                    <a 
                      href={selectedMapUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100"
                    >
                      <ExternalLink className="w-5 h-5" />
                      فتح في خرائط جوجل
                    </a>
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
