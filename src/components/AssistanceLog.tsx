import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc, collectionGroup, updateDoc, addDoc, serverTimestamp, increment, arrayUnion } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase';
import { Assistance, Family, AidRequest, FamilyMember, DeliveryTask, LookupItem, SystemService, EmergencyCase, Priority, StoreItem, PrescriptionItem, AppUser, AppModule } from '../types';
import { 
  ClipboardList, Filter, Search, ArrowUpRight, List, Heart, Users, CheckCircle2, 
  XCircle, DollarSign, Utensils, Stethoscope, Calendar as CalendarIcon, 
  Briefcase, Search as SearchIcon, Gavel, Trash2, Edit2, AlertCircle, Clock, Truck, ChevronRight, Plus, Warehouse, Receipt,
  User, Hash, Calendar, PieChart, Bell, X, Box, Package, FileText, MapPin
} from 'lucide-react';
import { cn, generateSystemCode } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

type EnrichedAidRequest = AidRequest & { 
  familyId: string; 
  memberId: string; 
  memberName: string; 
  familyName: string;
};

interface Notification {
  id: string;
  type: 'status_change';
  title: string;
  message: string;
  timestamp: Date;
}

export function AssistanceLog({ userProfile, modules }: { userProfile: AppUser | null, modules: AppModule[] }) {
  const [logs, setLogs] = useState<(Assistance & { familyName?: string, targetMemberName?: string })[]>([]);
  const prevLogsRef = useRef<(Assistance & { familyName?: string, targetMemberName?: string })[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingRequests, setPendingRequests] = useState<EnrichedAidRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Permission helper
  const hasPermission = (modulePath: string, action: 'canView' | 'canAdd' | 'canEdit' | 'canDelete' | 'canApprove' | 'canConfirmVisit' | 'canConfirmDecision' | 'canProcessDelivery') => {
    if (!userProfile) return true; 
    if (userProfile.role === 'admin') return true;
    
    // Find module by path
    const module = modules.find(m => m.path === modulePath);
    if (!module) return true; // Default to true if module not found in config (e.g. built-in)

    const perm = userProfile.permissions?.find(p => p.moduleId === module.id);
    return perm ? !!(perm as any)[action] : false;
  };
  const [families, setFamilies] = useState<Family[]>([]);
  const [lookups, setLookups] = useState<LookupItem[]>([]);
  const [services, setServices] = useState<SystemService[]>([]);
  const [emergencyCases, setEmergencyCases] = useState<EmergencyCase[]>([]);
  const [activeTab, setActiveTab] = useState<'distribution' | 'visits' | 'decisions' | 'schedule'>('distribution');
  const [deliveryTasks, setDeliveryTasks] = useState<(DeliveryTask & { memberName: string, familyName: string, type: string, familyId: string })[]>([]);
  const [isAddingAssistance, setIsAddingAssistance] = useState(false);
  const [newAssistance, setNewAssistance] = useState({
    familyId: '',
    targetMemberId: '',
    amount: 0,
    type: 'نقدي',
    unit: 'ج.م',
    distributionDate: new Date().toISOString().split('T')[0],
    deliveryDestination: '',
    deliveryMethod: 'branch' as 'shipping' | 'branch',
    deliveryQuantity: 1,
    notes: '',
    processedBy: 'مسؤول التوزيع',
    receiptUrl: '',
    recipientName: '',
    isDelivered: true,
    createMedicalClaim: false,
    paymentType: 'cash' as 'cash' | 'claim' | 'item',
    emergencyCaseId: ''
  });
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<{ start: string, end: string }>({ start: '', end: '' });
  const [deliveryMethodFilter, setDeliveryMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'delivered' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Assistance | 'familyName'; direction: 'asc' | 'desc' } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [editingRequest, setEditingRequest] = useState<EnrichedAidRequest | null>(null);
  const [editingAssistance, setEditingAssistance] = useState<(Assistance & { familyName?: string, targetMemberName?: string }) | null>(null);
  const [editingDeliveryTask, setEditingDeliveryTask] = useState<(DeliveryTask & { memberName: string, familyName: string, type: string, familyId: string }) | null>(null);
  const [deliveryTaskToProcess, setDeliveryTaskToProcess] = useState<(DeliveryTask & { memberName: string, familyName: string, type: string, familyId?: string }) | null>(null);
  const [deliveryDetails, setDeliveryDetails] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: 0,
    unit: 'ج.م',
    notes: '',
    recipientName: '',
    recipientSignatureName: '',
    receiptUrl: '',
    processedBy: 'مسؤول التوزيع',
    type: '',
    deliveryMethod: 'branch' as 'shipping' | 'branch',
    deliveryQuantity: 1,
    deliveryDestination: '',
    actualCost: 0,
    createMedicalClaim: false,
    prescriptionItems: [] as PrescriptionItem[]
  });

  const [viewingRequestDetails, setViewingRequestDetails] = useState<{ memberName: string, aid: AidRequest } | null>(null);
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [assistanceTypes, setAssistanceTypes] = useState<any[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [addingFollowUp, setAddingFollowUp] = useState<(Assistance & { familyName?: string }) | null>(null);
  const [followUpDetails, setFollowUpDetails] = useState({
    date: new Date().toISOString().split('T')[0],
    comment: '',
    processedBy: 'مسؤول التوزيع',
    type: 'comment' as 'comment' | 'delivery_attempt' | 'final_delivery'
  });

  useEffect(() => {
    // 1. Fetch Assistance Logs
    const q = query(collection(db, 'assistances'), orderBy('distributionDate', 'desc'));
    const unsubscribeLogs = onSnapshot(q, async (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Assistance));
      const enriched = await Promise.all(data.map(async (item) => {
        try {
          const famDoc = await getDoc(doc(db, 'families', item.familyId));
          let memberName = '';
          if (item.assignedToMemberId) {
            const memDoc = await getDoc(doc(db, `families/${item.familyId}/members`, item.assignedToMemberId));
            if (memDoc.exists()) memberName = memDoc.data().name;
          }
          return { 
            ...item, 
            familyName: famDoc.exists() ? (famDoc.data() as Family).name : 'عائلة غير معروفة',
            targetMemberName: memberName
          };
        } catch (e) {
          return { ...item, familyName: 'خطأ في التحميل', targetMemberName: '' };
        }
      }));
      setLogs(enriched);
    }, err => handleFirestoreError(err, OperationType.LIST, 'assistances'));

    // 2. Fetch All Aid Requests using collectionGroup for members
    const unsubscribeMembers = onSnapshot(collectionGroup(db, 'members'), (snapshot) => {
      const allRequests: EnrichedAidRequest[] = [];
      const allTasks: (DeliveryTask & { memberName: string, familyName: string, type: string, familyId: string })[] = [];
      
      snapshot.docs.forEach(docSnap => {
        const member = docSnap.data() as FamilyMember;
        const familyId = docSnap.ref.parent.parent?.id;
        
        if (familyId && member.aidRequests) {
          member.aidRequests.forEach(req => {
            allRequests.push({
              ...req,
              familyId,
              memberId: member.id,
              memberName: member.name,
              familyName: 'جاري التحميل...'
            });

            if (req.deliverySchedule) {
               req.deliverySchedule.forEach(task => {
                  allTasks.push({
                     ...task,
                     memberName: member.name,
                     familyName: 'جاري التحميل...',
                     familyId: familyId,
                     type: req.type
                  });
               });
            }
          });
        }
      });
      setPendingRequests(allRequests);
      setDeliveryTasks(allTasks);
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'members-collection-group'));

    const unsubscribeFamilies = onSnapshot(collection(db, 'families'), (snapshot) => {
       setFamilies(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Family)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'families'));

    const unsubscribeLookups = onSnapshot(collection(db, 'lookups'), (snapshot) => {
      setLookups(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LookupItem)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'lookups'));

    const unsubscribeAssistanceTypes = onSnapshot(collection(db, 'assistance_types'), (snapshot) => {
      setAssistanceTypes(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'assistance_types'));

    const unsubscribeServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      setServices(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SystemService)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'services'));

    const unsubscribeEmergencies = onSnapshot(collection(db, 'emergency_cases'), (snapshot) => {
      setEmergencyCases(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as EmergencyCase)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'emergency_cases'));

    const unsubscribeStore = onSnapshot(query(collection(db, 'store_items'), orderBy('name', 'asc')), (snapshot) => {
      setStoreItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StoreItem)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'store_items'));

    return () => {
      unsubscribeLogs();
      unsubscribeMembers();
      unsubscribeFamilies();
      unsubscribeLookups();
      unsubscribeAssistanceTypes();
      unsubscribeServices();
      unsubscribeEmergencies();
      unsubscribeStore();
    };
  }, []);

  // Notification logic for status changes and overdue items
  useEffect(() => {
    // Status change notifications
    if (prevLogsRef.current.length > 0 && logs.length > 0) {
      logs.forEach(log => {
        const prevLog = prevLogsRef.current.find(pl => pl.id === log.id);
        if (prevLog) {
          const getStatusText = (l: any) => {
            if (l.isDelivered) return 'مُسلمة';
            if (l.deliveryDate) return 'قيد المعالجة';
            return 'لم تبدأ';
          };

          const currentStatus = getStatusText(log);
          const prevStatus = getStatusText(prevLog);

          if (currentStatus !== prevStatus) {
            const newNotification: Notification = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'status_change',
              title: 'تحديث حالة المساعدة',
              message: `تغيرت حالة المساعدة للأسرة "${log.familyName}" من "${prevStatus}" إلى "${currentStatus}"`,
              timestamp: new Date()
            };
            setNotifications(prev => [newNotification, ...prev].slice(0, 5));
            
            setTimeout(() => {
              setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
            }, 8000);
          }
        }
      });
    }

    // Overdue item notifications
    const today = new Date().toISOString().split('T')[0];
    const overdueLogs = logs.filter(log => !log.isDelivered && log.distributionDate < today);
    
    if (overdueLogs.length > 0) {
      overdueLogs.forEach(log => {
        // Only notify if not already notified in this session to prevent spam
        const notificationId = `overdue-${log.id}`;
        setNotifications(prev => {
          if (prev.some(n => n.id === notificationId)) return prev;
          
          const newNotification: Notification = {
            id: notificationId,
            type: 'status_change',
            title: 'تنبيه: مساعدة متأخرة',
            message: `المساعدة رقم ${log.assistanceCode || log.id} للأسرة "${log.familyName}" تجاوزت موعد التسليم المقرر (${log.distributionDate}). المسؤول: ${log.processedBy || log.assignedToMemberId || 'غير محدد'}`,
            timestamp: new Date()
          };
          return [newNotification, ...prev].slice(0, 8);
        });
      });
    }

    prevLogsRef.current = logs;
  }, [logs]);

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const updateRequestStatus = async (request: EnrichedAidRequest, newStatus: string, rejectionReason?: string) => {
    try {
      const memberRef = doc(db, `families/${request.familyId}/members`, request.memberId);
      const memberSnap = await getDoc(memberRef);
      if (!memberSnap.exists()) return;

      const memberData = memberSnap.data() as FamilyMember;
      const updatedRequests = memberData.aidRequests?.map(r => 
        r.id === request.id ? { 
          ...r, 
          status: newStatus as any,
          rejectionReason: rejectionReason || r.rejectionReason,
          processedDate: new Date().toISOString().split('T')[0]
        } : r
      );

      await updateDoc(memberRef, { aidRequests: updatedRequests });
      
      // Add comment to emergency case if linked
      if ((request as any).emergencyCaseId) {
        try {
          const caseRef = doc(db, 'emergency_cases', (request as any).emergencyCaseId);
          await updateDoc(caseRef, {
            comments: arrayUnion({
              text: `تحديث في قرار المساعدة: ${newStatus === 'approved' ? 'تمت الموافقة والاعتماد' : newStatus === 'rejected' ? 'تم الرفض' : 'تغيير الحالة للمراجعة'} (${request.type})`,
              user: auth.currentUser?.displayName || auth.currentUser?.email || 'نظام المساعدات',
              date: new Date().toISOString()
            }),
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Error adding emergency case comment:", e);
        }
      }

      // If approved and medical, optionally create medical claim
      if (newStatus === 'approved') {
        const isMedical = (request.type || '').toLowerCase().includes('medical') || (request.type || '').includes('طبي');
        // By default we create it if it's medical, unless explicitly set to false or if user preference is needed
        if (isMedical && request.createMedicalClaim !== false) {
          const service = services.find(s => s.name === request.type);
          await addDoc(collection(db, 'medical_claims'), {
            familyId: request.familyId,
            memberId: request.memberId || null,
            serviceId: service?.id || 'manual',
            serviceName: request.type,
            serviceCode: request.committeeCode || `SRV-${request.id.slice(-4)}`,
            claimCode: `CLM-${Date.now().toString().slice(-6)}`,
            status: 'pending',
            amount: request.totalCost || 0,
            date: new Date().toISOString().split('T')[0],
            providerName: 'بانتظار التحديد',
            notes: `مطالبة ناتجة عن قرار لجنة رقم (${request.committeeCode || 'غير محدد'}): ${request.notes || ''}`,
            createdAt: serverTimestamp()
          });
        }
      }

      setEditingRequest(null);
    } catch (error) {
      console.error("Error updating status:", error);
      alert("حدث خطأ أثناء تحديث الحالة");
    }
  };

  const handleAddToCampaign = async (request: EnrichedAidRequest) => {
     const campaignDetails = prompt('تفاصيل الحملة الخيرية (محتوى الحملة وبنودها):');
     if (!campaignDetails) return;
     const goalStr = prompt('المبلغ المستهدف للحالة (ج.م):');
     const campaignGoal = goalStr ? parseFloat(goalStr) : 0;
     const notes = prompt('ملاحظات إضافية لطلب الإضافة للحملة:');
     
     try {
       const memberRef = doc(db, `families/${request.familyId}/members`, request.memberId);
       const memberSnap = await getDoc(memberRef);
       if (!memberSnap.exists()) return;
 
       const memberData = memberSnap.data() as FamilyMember;
       const updatedRequests = memberData.aidRequests?.map(r => 
         r.id === request.id ? { 
           ...r, 
           addToCampaign: true,
           campaignNotes: notes,
           campaignDetails,
           campaignGoal,
           campaignRaised: 0,
           status: 'committee_review'
         } : r
       );
 
       await updateDoc(memberRef, { aidRequests: updatedRequests });
       alert('تم إدراج الحالة لطلب حملة خيرية بنجاح.');
     } catch (error) {
       console.error("Error adding to campaign:", error);
     }
  };

  const handleEditRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;
    
    try {
      const memberRef = doc(db, `families/${editingRequest.familyId}/members`, editingRequest.memberId);
      const memberSnap = await getDoc(memberRef);
      if (!memberSnap.exists()) return;

      const memberData = memberSnap.data() as FamilyMember;
      const updatedRequests = memberData.aidRequests?.map(r => 
        r.id === editingRequest.id ? { ...editingRequest } : r
      );

      await updateDoc(memberRef, { aidRequests: updatedRequests });
      setEditingRequest(null);
    } catch (error) {
      console.error("Error saving edits:", error);
    }
  };

  const handleEditAssistance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssistance) return;
    
    try {
      const logRef = doc(db, 'assistances', editingAssistance.id);
      const { familyName, targetMemberName, ...cleanData } = editingAssistance;
      
      // Remove undefined fields to prevent Firestore errors
      const dataToUpdate = Object.entries(cleanData).reduce((acc, [key, value]) => {
        if (value !== undefined) acc[key] = value;
        return acc;
      }, {} as any);

      await updateDoc(logRef, dataToUpdate);
      setEditingAssistance(null);
    } catch (error) {
      console.error("Error updating assistance:", error);
      alert("حدث خطأ أثناء حفظ التعديلات");
    }
  };

  const handleUpdateDeliveryTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeliveryTask) return;
    
    try {
      const memberRef = doc(db, `families/${editingDeliveryTask.familyId}/members`, editingDeliveryTask.memberId);
      const memberSnap = await getDoc(memberRef);
      if (!memberSnap.exists()) return;

      const memberData = memberSnap.data() as FamilyMember;
      const updatedRequests = memberData.aidRequests?.map(req => {
        if (req.id === editingDeliveryTask.aidRequestId) {
          const updatedSchedule = req.deliverySchedule?.map(task => 
            task.id === editingDeliveryTask.id ? { ...task, scheduledDate: editingDeliveryTask.scheduledDate, deliveryCode: editingDeliveryTask.deliveryCode } : task
          );
          return { ...req, deliverySchedule: updatedSchedule };
        }
        return req;
      });

      await updateDoc(memberRef, { aidRequests: updatedRequests });
      setEditingDeliveryTask(null);
    } catch (error) {
      console.error("Error updating delivery task:", error);
      alert("حدث خطأ أثناء تحديث بيانات التسليم");
    }
  };

  const handleProcessDelivery = async (e: React.FormEvent, isFinal: boolean = true) => {
    if (e) e.preventDefault();
    if (!deliveryTaskToProcess || !deliveryTaskToProcess.familyId) return;

    try {
      const newUpdate = {
        date: new Date().toISOString(),
        text: deliveryDetails.notes || '',
        user: deliveryDetails.processedBy || ''
      };

      const memberRef = doc(db, `families/${deliveryTaskToProcess.familyId}/members`, deliveryTaskToProcess.memberId);
      const memberSnap = await getDoc(memberRef);
      if (!memberSnap.exists()) return;

      const memberData = memberSnap.data() as FamilyMember;
      const currentReq = memberData.aidRequests?.find(r => r.id === deliveryTaskToProcess.aidRequestId);
      const itemsToProcess = (deliveryDetails.prescriptionItems && deliveryDetails.prescriptionItems.length > 0) 
        ? deliveryDetails.prescriptionItems 
        : currentReq?.prescriptionItems;

      const updatedRequests = memberData.aidRequests?.map(req => {
        if (req.id === deliveryTaskToProcess.aidRequestId) {
          const updatedSchedule = req.deliverySchedule?.map(task => 
            task.id === deliveryTaskToProcess.id ? { 
              ...task, 
              status: isFinal ? 'delivered' as any : (task.status || 'pending'), 
              deliveryDate: isFinal ? deliveryDetails.date : (task.deliveryDate || ''),
              notes: deliveryDetails.notes || '',
              updates: [...(task.updates || []), newUpdate]
            } : task
          );
          
          const allDelivered = updatedSchedule?.every(t => t.status === 'delivered');
          
          return { 
            ...req, 
            deliverySchedule: updatedSchedule || [],
            prescriptionItems: itemsToProcess || [],
            status: isFinal && allDelivered ? 'delivered' : (req.status || 'pending'),
            actualCost: isFinal ? (Number(req.actualCost) || 0) + (Number(deliveryDetails.actualCost) || 0) : (Number(req.actualCost) || 0)
          };
        }
        return req;
      });

      await updateDoc(memberRef, { aidRequests: updatedRequests });

      if (isFinal) {
        // Collect all previous updates for this task
        const reqRef = memberData.aidRequests?.find(r => r.id === deliveryTaskToProcess.aidRequestId);
        const task = reqRef?.deliverySchedule?.find(t => t.id === deliveryTaskToProcess.id);
        
        const historyLogs = (task?.updates || []).map(u => ({
          date: u.date,
          comment: u.text,
          processedBy: u.user,
          type: 'comment' as const
        }));

        // Create the Assistance Log record only when final
        const famData = families.find(f => f.id === deliveryTaskToProcess.familyId);
        const astCode = generateSystemCode('AST', famData?.fileNumber, deliveryTaskToProcess.memberId.slice(-4), deliveryTaskToProcess.idNumber?.toString());
        const delCode = generateSystemCode('DEL', famData?.fileNumber, deliveryTaskToProcess.memberId.slice(-4), `${deliveryTaskToProcess.idNumber}-${deliveryTaskToProcess.id.slice(-2)}`);

        const assistanceDocData: any = {
          assistanceCode: astCode,
          deliveryCode: delCode,
          familyId: deliveryTaskToProcess.familyId,
          targetMemberId: deliveryTaskToProcess.memberId,
          assignedToMemberId: deliveryTaskToProcess.memberId,
          amount: Number(deliveryDetails.actualCost),
          unit: deliveryDetails.unit,
          distributionDate: deliveryDetails.date,
          type: deliveryDetails.type || deliveryTaskToProcess.type,
          notes: deliveryDetails.notes,
          processedBy: deliveryDetails.processedBy,
          recipientName: deliveryDetails.recipientName,
          recipientSignatureName: deliveryDetails.recipientSignatureName,
          receiptUrl: deliveryDetails.receiptUrl,
          deliveryDestination: deliveryDetails.deliveryDestination,
          deliveryMethod: deliveryDetails.deliveryMethod,
          deliveryQuantity: Number(deliveryDetails.deliveryQuantity),
          isDelivered: true,
          deliveryDate: deliveryDetails.date,
          followUpLog: [
            ...historyLogs,
            {
              date: new Date().toISOString(),
              comment: deliveryDetails.notes,
              processedBy: deliveryDetails.processedBy,
              type: 'final_delivery'
            }
          ],
          createdAt: new Date().toISOString()
        };

        const astDocRef = await addDoc(collection(db, 'assistances'), assistanceDocData);

        // Deduct from inventory if medical and has prescription items
        const isMedical = (assistanceDocData.type || '').toLowerCase().includes('medical') || (assistanceDocData.type || '').includes('طبي');
        if (isMedical) {
          if (itemsToProcess && itemsToProcess.length > 0) {
            for (const item of itemsToProcess) {
              if (item.itemId && (item.dispensedQuantity || item.requestedQuantity) > 0) {
                const qtyToSubtract = item.dispensedQuantity || item.requestedQuantity;
                try {
                  await updateDoc(doc(db, 'store_items', item.itemId), {
                    quantity: increment(-qtyToSubtract)
                  });
                } catch (err) {
                  console.error("Error deducting from store:", err);
                }
              }
            }
          }
        }

        // Auto-create medical claim if user chose to or it was forced
        if (isMedical && (deliveryDetails as any).createMedicalClaim) {
          const service = services.find(s => s.name === assistanceDocData.type);
          const claimDoc = await addDoc(collection(db, 'medical_claims'), {
            familyId: assistanceDocData.familyId,
            memberId: assistanceDocData.targetMemberId || null,
            serviceId: service?.id || 'manual',
            serviceName: assistanceDocData.type,
            serviceCode: astCode,
            claimCode: `CLM-${Date.now().toString().slice(-6)}`,
            status: 'pending',
            amount: assistanceDocData.amount,
            date: assistanceDocData.distributionDate,
            providerName: assistanceDocData.deliveryDestination || 'غير محدد',
            notes: `مطالبة تلقائية من جدول التسليمات (قسط رقم ${deliveryTaskToProcess.idNumber}): ${assistanceDocData.notes || ''}`,
            createdAt: serverTimestamp()
          });

          await updateDoc(doc(db, 'assistances', astDocRef.id), {
            claimId: claimDoc.id
          });
        }
      }

      if (isFinal) {
        setDeliveryTaskToProcess(null);
      } else {
        // Just clear the notes for next comment
        setDeliveryDetails(prev => ({ ...prev, notes: '' }));
        // Refresh local tasks by mimicking what unsubscribeMembers does (simplified: close and reopen or just wait for snapshot)
      }
    } catch (error) {
       handleFirestoreError(error, OperationType.WRITE, 'assistances');
    }
  };

  const handleAddFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingFollowUp) return;

    try {
      const logRef = doc(db, 'assistances', addingFollowUp.id);
      const newFollowUp = {
        ...followUpDetails,
        date: new Date(followUpDetails.date).toISOString()
      };

      const updatedFollowUpLog = [
        ...(addingFollowUp.followUpLog || []),
        newFollowUp
      ];

      await updateDoc(logRef, {
        followUpLog: updatedFollowUpLog,
        updatedAt: serverTimestamp()
      });

      setAddingFollowUp(null);
      setFollowUpDetails({
        date: new Date().toISOString().split('T')[0],
        comment: '',
        processedBy: 'مسؤول التوزيع',
        type: 'comment'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `assistances/${addingFollowUp.id}`);
    }
  };

  const handleAddAssistance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssistance.familyId) return;

    // Emergency check
    const isEmergency = newAssistance.type.includes('طوارئ') || newAssistance.type.toLowerCase().includes('emergency');
    if (isEmergency) {
      const hasCase = emergencyCases.some(c => c.familyId === newAssistance.familyId && c.status === 'open');
      if (!hasCase) {
        alert('خطأ: يجب تسجيل حالة طوارئ مفتوحة لهذه العائلة أولاً قبل تسجيل مساعدة طارئة.');
        return;
      }
    }

    try {
      const famData = families.find(f => f.id === newAssistance.familyId);
      const astCode = generateSystemCode('AST', famData?.fileNumber, newAssistance.targetMemberId?.slice(-4), Math.floor(Math.random() * 1000).toString().padStart(3, '0'));

      const { createMedicalClaim, ...assistanceData } = newAssistance;
      
      const docRef = await addDoc(collection(db, 'assistances'), {
        ...assistanceData,
        assistanceCode: astCode,
        createdAt: new Date().toISOString()
      });

      if (createMedicalClaim) {
        const service = services.find(s => s.name === newAssistance.type);
        const claimDoc = await addDoc(collection(db, 'medical_claims'), {
          familyId: newAssistance.familyId,
          memberId: newAssistance.targetMemberId || null,
          serviceId: service?.id || 'manual',
          serviceName: newAssistance.type,
          serviceCode: astCode,
          claimCode: `CLM-${Date.now().toString().slice(-6)}`,
          status: 'pending',
          amount: newAssistance.amount,
          date: newAssistance.distributionDate,
          providerName: newAssistance.deliveryDestination || 'غير محدد',
          notes: `مطالبة تلقائية من مساعدة يدوية: ${newAssistance.notes || ''}`,
          createdAt: serverTimestamp()
        });

        // Update assistance with claimId
        await updateDoc(doc(db, 'assistances', docRef.id), {
          claimId: claimDoc.id
        });
      }

      // Add comment to emergency case if linked
      if (newAssistance.emergencyCaseId) {
        try {
          const caseRef = doc(db, 'emergency_cases', newAssistance.emergencyCaseId);
          await updateDoc(caseRef, {
            comments: arrayUnion({
              text: `تم تسجيل مساعدة مباشرة مرتبطة بالحالة: ${newAssistance.type} بمبلغ ${newAssistance.amount} ${newAssistance.unit}`,
              user: auth.currentUser?.displayName || auth.currentUser?.email || 'نظام المساعدات',
              date: new Date().toISOString()
            }),
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.error("Error adding emergency case comment:", e);
        }
      }

      setIsAddingAssistance(false);
      setNewAssistance({
        familyId: '',
        targetMemberId: '',
        amount: 0,
        type: 'نقدي',
        unit: 'ج.م',
        distributionDate: new Date().toISOString().split('T')[0],
        deliveryDestination: '',
        deliveryMethod: 'branch',
        deliveryQuantity: 1,
        notes: '',
        processedBy: 'مسؤول التوزيع',
        receiptUrl: '',
        recipientName: '',
        isDelivered: true,
        createMedicalClaim: false,
        paymentType: 'cash',
        emergencyCaseId: ''
      });
    } catch (error) {
       handleFirestoreError(error, OperationType.WRITE, 'assistances');
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
        notes: `مطالبة يدوية محولة من مساعدة (${log.assistanceCode || log.id}): ${log.notes || ''}`,
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

  const filteredLogs = logs
    .filter(log => {
      const matchesType = typeFilter === 'all' || log.type === typeFilter;
      const matchesDate = (!dateFilter.start || log.distributionDate >= dateFilter.start) && 
                          (!dateFilter.end || log.distributionDate <= dateFilter.end);
      const matchesDeliveryMethod = deliveryMethodFilter === 'all' || log.deliveryMethod === deliveryMethodFilter;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'delivered' ? log.isDelivered : !log.isDelivered);
      const matchesSearch = !searchTerm || 
        log.familyName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        log.targetMemberName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.deliveryDestination?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.assistanceCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.deliveryCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.notes?.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesType && matchesDate && matchesDeliveryMethod && matchesStatus && matchesSearch;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const aValue = a[sortConfig.key] || '';
      const bValue = b[sortConfig.key] || '';
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const requestSort = (key: keyof Assistance | 'familyName') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredRequests = pendingRequests.filter(req => {
    if (activeTab === 'visits') return req.status === 'requested' || req.status === 'visit_scheduled';
    if (activeTab === 'decisions') return req.status === 'visit_confirmed' || req.status === 'committee_review';
    return false;
  });

  const totalDistributed = filteredLogs.reduce((sum, log) => sum + (log.amount || 0), 0);
  const familiesServed = new Set(filteredLogs.map(log => log.familyId)).size;

  const tasksGroupedByDate = deliveryTasks.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)).reduce((acc, task) => {
    const date = task.scheduledDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {} as Record<string, typeof deliveryTasks>);

  const getTypeStyle = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('cash') || t.includes('نقدي')) return { label: 'نقدي', icon: DollarSign, bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-100' };
    if (t.includes('food') || t.includes('غذائي')) return { label: 'غذائي', icon: Utensils, bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-100' };
    if (t.includes('medical') || t.includes('طبي')) return { label: 'طبي', icon: Stethoscope, bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-100' };
    if (t.includes('seasonal') || t.includes('موسمي')) return { label: 'موسمي', icon: CalendarIcon, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100' };
    if (t.includes('service') || t.includes('خدمي')) return { label: 'خدمي', icon: Briefcase, bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100' };
    return { label: type, icon: Heart, bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-100' };
  };

  return (
    <div className="space-y-8 relative">
      {/* Floating Notifications */}
      <div className="fixed top-24 left-8 z-[100] flex flex-col gap-4 max-w-sm pointer-events-none">
        <AnimatePresence>
          {notifications.map(notification => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: -100, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -100, scale: 0.8 }}
              className="bg-white border border-indigo-100 p-5 rounded-3xl shadow-2xl pointer-events-auto flex gap-4 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-1.5 h-full bg-indigo-600" />
              <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 h-fit">
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h4 className="text-sm font-black text-gray-900">{notification.title}</h4>
                  <button 
                    onClick={() => removeNotification(notification.id)}
                    className="text-gray-300 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs font-bold text-gray-400 mt-1 leading-relaxed">{notification.message}</p>
                <p className="text-[8px] font-black text-indigo-400 mt-2 uppercase tracking-widest">{notification.timestamp.toLocaleTimeString('ar-EG')}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900">سجل التوزيع العام</h2>
          <p className="text-gray-400 font-bold mt-1 uppercase tracking-widest text-[10px]">تتبع تاريخ المساعدات لكل المستفيدين</p>
        </div>
        <button 
          onClick={() => setIsAddingAssistance(true)}
          className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          إضافة مساعدة خارجية
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-7 rounded-[32px] border border-gray-100 shadow-sm flex items-center gap-6">
          <div className="p-4 rounded-3xl bg-emerald-50 text-emerald-600">
            <Heart className="w-7 h-7" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-tighter">إجمالي الموزع</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{totalDistributed.toLocaleString()} ج.م</p>
          </div>
        </div>
        <div className="bg-white p-7 rounded-[32px] border border-gray-100 shadow-sm flex items-center gap-6">
          <div className="p-4 rounded-3xl bg-blue-50 text-blue-600">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-tighter">عائلات مستفيدة</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{familiesServed}</p>
          </div>
        </div>
        <div className="bg-white p-7 rounded-[32px] border border-gray-100 shadow-sm flex items-center gap-6">
          <div className="p-4 rounded-3xl bg-amber-50 text-amber-600">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-tighter">إجمالي الحركات</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{filteredLogs.length}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-20 flex flex-col items-center justify-center space-y-4">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 font-bold animate-pulse">جاري تحميل سجل المساعدات...</p>
        </div>
      ) : (
        <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden min-h-[500px]">
        <div className="p-8 border-b border-gray-50 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                activeTab === 'distribution' ? "bg-emerald-50 text-emerald-600" :
                activeTab === 'visits' ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
              )}>
                 {activeTab === 'distribution' ? <List className="w-6 h-6" /> :
                  activeTab === 'visits' ? <SearchIcon className="w-6 h-6" /> : <Gavel className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 leading-none">
                  {activeTab === 'distribution' ? 'سجل العمليات التفصيلي' :
                   activeTab === 'visits' ? 'طلبات تحتاج معاينة' : 'طلبات تنتظر قرار اللجنة'}
                </h3>
                <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-widest">إدارة ومتابعة طلبات المساعدات</p>
              </div>
            </div>

            <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
              <button 
                onClick={() => setActiveTab('distribution')}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2",
                  activeTab === 'distribution' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <ClipboardList className="w-4 h-4" />
                سجل التوزيع
              </button>
              <button 
                onClick={() => setActiveTab('visits')}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2",
                  activeTab === 'visits' ? "bg-white text-amber-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <SearchIcon className="w-4 h-4" />
                للمعاينة
              </button>
              <button 
                onClick={() => setActiveTab('decisions')}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2",
                  activeTab === 'decisions' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <Gavel className="w-4 h-4" />
                لجنة القرار
              </button>
              <button 
                onClick={() => setActiveTab('schedule')}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2",
                  activeTab === 'schedule' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                <Truck className="w-4 h-4" />
                جدول التسليمات
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "p-3 rounded-2xl transition-all border shadow-sm",
                  showFilters ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-white text-gray-400 hover:text-emerald-600 border-gray-100"
                )}
              >
                <Filter className="w-5 h-5" />
              </button>
            </div>
          </div>

          {showFilters && activeTab === 'distribution' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 animate-in slide-in-from-top-4 pb-10">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">بحث ذكي</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="ابحث بالاسم، الكود، الوجهة..."
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl pr-11 pl-4 py-4 outline-none text-sm font-bold focus:bg-white transition-all shadow-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">نوع المساعدة</label>
                <select 
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold shadow-sm"
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                >
                  <option value="all">كل الأنواع</option>
                  <option value="cash">نقدي</option>
                  <option value="food">غذائي</option>
                  <option value="medical">طبي</option>
                  <option value="seasonal">موسمي</option>
                  <option value="service">خدمي</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">طريقة التسليم</label>
                <select 
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold shadow-sm"
                  value={deliveryMethodFilter}
                  onChange={e => setDeliveryMethodFilter(e.target.value)}
                >
                  <option value="all">كل الطرق</option>
                  <option value="branch">استلام من الفرع</option>
                  <option value="shipping">شحن / توصيل</option>
                  <option value="hospital">بالمشفى</option>
                  <option value="other">أخرى</option>
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">فترة التوزيع (من - إلى)</label>
                <div className="flex gap-3">
                  <input 
                    type="date"
                    className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold shadow-sm"
                    value={dateFilter.start}
                    onChange={e => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
                  />
                  <input 
                    type="date"
                    className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold shadow-sm"
                    value={dateFilter.end}
                    onChange={e => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
                  />
                  {(dateFilter.start || dateFilter.end) && (
                    <button 
                      onClick={() => setDateFilter({ start: '', end: '' })}
                      className="bg-gray-100 text-gray-500 px-5 rounded-2xl text-xs font-black hover:bg-gray-200 transition-all border border-gray-200"
                    >مسح</button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">حالة الملف</label>
                <select 
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold shadow-sm"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                >
                  <option value="all">كل الحالات</option>
                  <option value="delivered">تم التسليم النهائي</option>
                  <option value="pending">قيد التسليم / معلق</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'distribution' ? (
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="text-[11px] text-gray-400 font-black uppercase tracking-widest border-b border-gray-50">
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => requestSort('distributionDate')}>تاريخ التوزيع</th>
                  <th className="px-8 py-5">الأكواد المرجعية</th>
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => requestSort('familyName')}>العائلة / المستفيد</th>
                  <th className="px-8 py-5 hidden md:table-cell">المستلم</th>
                  <th className="px-8 py-5 text-center">نوع / كمية</th>
                  <th className="px-8 py-5">المستجدات والتنفيذ</th>
                  <th className="px-8 py-5">القيمة / التكلفة</th>
                  <th className="px-8 py-5 hidden lg:table-cell">جهة التسليم</th>
                  <th className="px-8 py-5 hidden xl:table-cell">مسؤول التسليم</th>
                  <th className="px-8 py-5 hidden md:table-cell text-center">أخر حالة</th>
                  <th className="px-8 py-5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50/50">
                {filteredLogs.map((log) => (
                  <React.Fragment key={log.id}>
                    <tr 
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      className={cn(
                        "group hover:bg-gray-50/80 transition-all border-b border-gray-50/30 cursor-pointer",
                        expandedLogId === log.id && "bg-emerald-50/30"
                      )}
                    >
                      <td className="px-8 py-6 text-sm font-bold text-gray-400 tabular-nums text-right">
                        <div className="flex items-center gap-3">
                          <ChevronRight className={cn(
                            "w-4 h-4 text-gray-300 transition-transform",
                            expandedLogId === log.id && "rotate-90 text-emerald-500"
                          )} />
                          {log.distributionDate}
                        </div>
                      </td>
                    <td className="px-8 py-6">
                      <div className="space-y-1">
                        {log.assistanceCode && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px] font-black text-white bg-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-tighter">AST</span>
                            <span className="text-[10px] font-black text-indigo-700 font-mono">{log.assistanceCode}</span>
                          </div>
                        )}
                        {log.deliveryCode && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8px] font-black text-white bg-emerald-600 px-1.5 py-0.5 rounded uppercase tracking-tighter">DEL</span>
                            <span className="text-[10px] font-black text-emerald-700 font-mono">{log.deliveryCode}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-1">
                        <p className="text-sm font-black text-gray-900 group-hover:text-emerald-700 transition-colors">{log.familyName}</p>
                        {log.targetMemberName && (
                          <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-full w-fit">
                            <span>المستهدف: {log.targetMemberName}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6 hidden md:table-cell">
                       <p className="text-xs font-bold text-gray-600">{log.recipientName || '—'}</p>
                    </td>
                    <td className="px-8 py-6">
                      {(() => {
                        const style = getTypeStyle(log.type);
                        const Icon = style.icon;
                        const latestFollowUp = log.followUpLog && log.followUpLog.length > 0 ? log.followUpLog[log.followUpLog.length - 1] : null;
                        
                        return (
                          <div className="space-y-2">
                             <div className={cn(
                                "inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl text-[10px] font-black border uppercase tracking-wider",
                                style.bg, style.text, style.border
                             )}>
                               <Icon className="w-3.5 h-3.5" />
                               {style.label}
                               <span className="mx-1 opacity-20">|</span>
                               <span className="tabular-nums">{log.deliveryQuantity || 1}</span>
                             </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-8 py-6">
                       {(() => {
                          const latestFollowUp = log.followUpLog && log.followUpLog.length > 0 ? log.followUpLog[log.followUpLog.length - 1] : null;
                          return latestFollowUp ? (
                            <div className="space-y-1">
                               <p className="text-[11px] font-bold text-gray-700 leading-tight line-clamp-2 italic">"{latestFollowUp.comment}"</p>
                               <div className="flex items-center gap-2 text-[9px] font-black text-indigo-400 tabular-nums">
                                  <span>{new Date(latestFollowUp.date).toLocaleDateString('ar-EG')}</span>
                                  <span>•</span>
                                  <span>{latestFollowUp.processedBy}</span>
                               </div>
                            </div>
                          ) : (
                            <p className="text-xs font-bold text-gray-300 italic">لا يوجد تحديثات متابعة</p>
                          );
                       })()}
                    </td>
                    <td className="px-8 py-6 text-center">
                       <p className="text-sm font-black text-gray-900 tabular-nums">{(log.amount || log.actualCost || 0).toLocaleString()} <span className="text-[10px] text-gray-400 font-bold">{log.unit || 'ج.م'}</span></p>
                    </td>
                    <td className="px-8 py-6 hidden lg:table-cell">
                       <div className="space-y-1">
                          <p className="text-xs font-bold text-gray-500">{log.deliveryDestination || '—'}</p>
                          {log.deliveryMethod && (
                            <div className="flex items-center gap-1.5">
                               <span className={cn(
                                 "text-[9px] font-black px-1.5 py-0.5 rounded border flex items-center gap-1",
                                 log.deliveryMethod === 'shipping' ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                               )}>
                                  {log.deliveryMethod === 'shipping' ? <Truck className="w-3 h-3" /> : <Warehouse className="w-3 h-3" />}
                                  {log.deliveryMethod === 'shipping' ? 'شحن' : 'فرع'}
                               </span>
                            </div>
                          )}
                       </div>
                    </td>
                    <td className="px-8 py-6 hidden xl:table-cell">
                       <p className="text-xs font-bold text-gray-400">{log.processedBy || log.deliveryHandler || log.assignedBy || '—'}</p>
                    </td>
                    <td className="px-8 py-6 hidden md:table-cell">
                      {log.isDelivered ? (
                        <div className="flex flex-col items-center">
                          <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center border border-emerald-100 shadow-sm mb-1">
                             <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          </div>
                          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-tighter">مُسلمة</p>
                        </div>
                      ) : log.deliveryDate ? (
                        <div className="flex flex-col items-center">
                           <div className="w-9 h-9 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100 shadow-sm mb-1">
                              <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                           </div>
                           <p className="text-[10px] font-black text-amber-700 uppercase tracking-tighter text-center">قيد المعالجة</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center opacity-40 grayscale">
                           <div className="w-9 h-9 rounded-2xl bg-gray-50 flex items-center justify-center border border-gray-100 mb-1">
                              <AlertCircle className="w-4 h-4 text-gray-400" />
                           </div>
                           <p className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">لم تبدأ</p>
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6 text-left">
                      <div className="flex items-center justify-end gap-2 text-right">
                        {log.receiptUrl && (
                          <a 
                            href={log.receiptUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-3 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-2xl transition-all"
                            title="عرض الإيصال"
                          >
                            <Receipt className="w-5 h-5" />
                          </a>
                        )}
                        {((log.type || '').includes('طبي') || (log.type || '').toLowerCase().includes('medical')) && !log.claimId && (
                          <button 
                            onClick={() => handleCreateClaimFromAssistance(log)}
                            className="p-3 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-2xl transition-all flex items-center gap-2 border border-transparent hover:border-rose-100"
                            title="تحويل لمطالبة طبية"
                          >
                            <Receipt className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase">تحويل لمطالبة</span>
                          </button>
                        )}
                        <button 
                          onClick={() => setEditingAssistance(log)}
                          className="p-3 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-2xl transition-all"
                          title="تعديل المساعدة"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => {
                            setAddingFollowUp(log);
                            setFollowUpDetails({
                              date: new Date().toISOString().split('T')[0],
                              comment: '',
                              processedBy: 'مسؤول التوزيع',
                              type: 'comment'
                            });
                          }}
                          className="p-3 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all"
                          title="إضافة متابعة"
                        >
                          <ClipboardList className="w-5 h-5" />
                        </button>
                        <button className="p-3 text-gray-300 hover:text-gray-600 hover:bg-gray-50 rounded-2xl transition-all">
                          <ArrowUpRight className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                    </tr>
                    <AnimatePresence>
                      {expandedLogId === log.id && (
                        <tr>
                          <td colSpan={10} className="px-8 py-0 border-none bg-gray-50/30">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <FileText className="w-4 h-4" /> تفاصيل المساعدة
                                  </h4>
                                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-3">
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs font-bold text-gray-400">القيمة:</span>
                                      <span className="text-sm font-black text-gray-900">{(log.amount || log.actualCost || 0).toLocaleString()} {log.unit || 'ج.م'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs font-bold text-gray-400">النوع:</span>
                                      <span className="text-sm font-black text-emerald-600">{log.type}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs font-bold text-gray-400">الكمية:</span>
                                      <span className="text-sm font-black text-gray-900">{log.deliveryQuantity || 1}</span>
                                    </div>
                                    <div className="pt-3 border-t border-gray-50">
                                      <p className="text-[10px] font-black text-gray-400 uppercase mb-2">ملاحظات إضافية</p>
                                      <p className="text-xs font-bold text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl">{log.notes || 'لا توجد ملاحظات مسجلة'}</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <Truck className="w-4 h-4" /> بيانات التسليم الاستلام
                                  </h4>
                                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                        <User className="w-5 h-5" />
                                      </div>
                                      <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase">المستلم</p>
                                        <p className="text-sm font-black text-gray-900">{log.recipientName || 'غير مسجل'}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                        <MapPin className="w-5 h-5" />
                                      </div>
                                      <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase">الوجهة</p>
                                        <p className="text-sm font-black text-gray-900">{log.deliveryDestination || 'غير محدد'}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                                        <CheckCircle2 className="w-5 h-5" />
                                      </div>
                                      <div>
                                        <p className="text-[9px] font-black text-gray-400 uppercase">الموسم</p>
                                        <p className="text-sm font-black text-gray-900">{log.processedBy || '—'}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <Clock className="w-4 h-4" /> سجل المتابعة
                                  </h4>
                                  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 max-h-[300px] overflow-y-auto">
                                    {log.followUpLog && log.followUpLog.length > 0 ? (
                                      log.followUpLog.map((follow, idx) => (
                                        <div key={idx} className="relative pr-6 border-r-2 border-gray-100 pb-4">
                                          <div className="absolute top-0 -right-[7px] w-3 h-3 rounded-full bg-indigo-500 border-2 border-white shadow-sm" />
                                          <p className="text-xs font-bold text-gray-700 mb-1">{follow.comment}</p>
                                          <div className="flex items-center gap-2 text-[9px] font-black text-gray-400">
                                            <span>{new Date(follow.date).toLocaleDateString('ar-EG')}</span>
                                            <span>•</span>
                                            <span className="text-indigo-600">{follow.processedBy}</span>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <div className="py-8 text-center text-gray-300 font-bold italic text-xs">لا يوجد سجلات متابعة لهذه المساعدة</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          ) : activeTab === 'schedule' ? (
            <div className="p-8 space-y-12">
               {Object.entries(tasksGroupedByDate).map(([date, tasks]) => (
                 <div key={date} className="relative">
                    <div className="flex items-center gap-4 mb-6 relative z-10">
                       <div className="bg-indigo-600 text-white px-6 py-2 shadow-lg shadow-indigo-100 rounded-full text-xs font-black flex items-center gap-2">
                          <CalendarIcon className="w-4 h-4" />
                          {date}
                       </div>
                       <div className="flex-1 h-px bg-gray-100" />
                       <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{tasks.length} تسليمات مقررة</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {tasks.map(task => (
                        <div key={task.id} className="bg-white border border-gray-100 rounded-[32px] p-6 hover:shadow-xl hover:shadow-indigo-50/50 transition-all group relative overflow-hidden">
                           <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-bl-full -mr-12 -mt-12 group-hover:bg-indigo-100/50 transition-colors" />
                           
                           <div className="relative z-10 space-y-4">
                              <div className="flex justify-between items-start">
                                 <div className="space-y-1">
                                    <h4 className="font-black text-gray-900 group-hover:text-indigo-600 transition-colors uppercase leading-none">{task.type}</h4>
                                    <p className="text-xs font-bold text-gray-400">{task.memberName}</p>
                                 </div>
                                 <div className={cn(
                                   "p-2 rounded-xl text-[8px] font-black uppercase tracking-tighter",
                                   task.status === 'delivered' ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"
                                 )}>
                                   {task.status === 'delivered' ? 'تم التسليم' : 'مقرر'}
                                 </div>
                                 {task.updates && task.updates.length > 0 && (
                                   <div className="absolute top-12 left-6 flex items-center gap-1.5 text-[8px] font-black text-indigo-500 bg-white border border-indigo-100 px-2 py-1 rounded-lg">
                                      <span className="relative flex h-1.5 w-1.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                                      </span>
                                      {task.updates.length} تحديثات
                                   </div>
                                 )}
                              </div>

                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                   <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500">
                                      <div className="w-6 h-6 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                                         <ArrowUpRight className="w-3 h-3" />
                                      </div>
                                      قسط رقم #{task.idNumber}
                                   </div>
                                   <div className="h-4 w-px bg-gray-100" />
                                   <button 
                                     onClick={() => {
                                        const parentAid = pendingRequests.find(r => r.id === task.aidRequestId);
                                        if(parentAid) setViewingRequestDetails({ memberName: task.memberName, aid: parentAid });
                                     }}
                                     className="text-[10px] font-black text-indigo-500 hover:text-indigo-700 transition-colors uppercase tracking-tight flex items-center gap-1"
                                   >
                                      <SearchIcon className="w-3 h-3" /> تفاصيل الطلب
                                   </button>
                                </div>

                                {task.status !== 'delivered' && (
                                   <div className="flex items-center gap-2">
                                      <button 
                                        onClick={() => {
                                          setDeliveryTaskToProcess(task);
                                          setDeliveryDetails({
                                             date: new Date().toISOString().split('T')[0],
                                             amount: 0,
                                             unit: 'ج.م',
                                             notes: '',
                                             recipientName: '',
                                             recipientSignatureName: '',
                                             receiptUrl: '',
                                             processedBy: 'مسؤول التوزيع',
                                             type: task.type,
                                             deliveryMethod: 'branch',
                                             deliveryQuantity: 1,
                                             deliveryDestination: '',
                                             actualCost: 0,
                                             createMedicalClaim: false,
                                             prescriptionItems: []
                                          });
                                        }}
                                        className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                                      >
                                        <Truck className="w-3.5 h-3.5" />
                                        تسليم الآن
                                      </button>
                                      <button 
                                        onClick={() => setEditingDeliveryTask(task as any)}
                                        className="p-2.5 bg-white border border-gray-100 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all shadow-sm"
                                        title="تعديل موعد أو تفاصيل التسليم"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button 
                                        onClick={() => {
                                           const note = prompt("أضف تعليق متابعة:");
                                           if(note) {
                                              setDeliveryTaskToProcess(task);
                                              setDeliveryDetails(prev => ({ ...prev, notes: note }));
                                              setTimeout(() => {
                                                 handleProcessDelivery(null as any, false);
                                              }, 100);
                                           }
                                        }}
                                        className="bg-white border border-gray-200 text-gray-500 px-3 py-2 rounded-xl text-[10px] font-bold hover:bg-gray-50 transition-all"
                                      >تعليق</button>
                                   </div>
                                )}
                              </div>
                           </div>
                        </div>
                      ))}
                    </div>
                 </div>
               ))}
               {Object.keys(tasksGroupedByDate).length === 0 && (
                  <div className="py-32 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                    <div className="w-20 h-20 bg-indigo-50 rounded-[40px] flex items-center justify-center">
                      <Truck className="w-10 h-10 text-indigo-200" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-gray-900">جدول التسليمات فارغ</p>
                      <p className="text-sm font-bold text-gray-400">لا توجد تسليمات دورية مجدولة حالياً</p>
                    </div>
                  </div>
               )}
            </div>
          ) : (
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRequests.map(req => (
                  <div key={req.id} className="bg-white border border-gray-100 rounded-3xl p-6 hover:shadow-xl hover:shadow-gray-100/50 transition-all group space-y-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h4 className="text-lg font-black text-gray-900 group-hover:text-amber-600 transition-colors uppercase leading-none">{req.type}</h4>
                        <p className="text-xs font-bold text-gray-400">{req.memberName}</p>
                      </div>
                      <div className={cn(
                        "p-2.5 rounded-2xl",
                        activeTab === 'visits' ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                      )}>
                        {activeTab === 'visits' ? <SearchIcon className="w-5 h-5" /> : <Gavel className="w-5 h-5" />}
                      </div>
                    </div>

                    <div className="space-y-3 bg-gray-50/50 rounded-2xl p-4 border border-gray-100/50">
                      <div className="flex justify-between items-center text-[11px] font-black text-gray-400 uppercase tracking-wider">
                         <span>الميزانية التقديرية</span>
                         <span className="text-gray-900">{req.totalCost?.toLocaleString()} ج.م</span>
                      </div>
                      <div className="h-px bg-gray-100" />
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">ملاحظات الطلب</p>
                        <p className="text-xs font-bold text-gray-700 leading-relaxed line-clamp-3">{req.notes || 'لا توجد ملاحظات إضافية مسجلة لهذا الطلب'}</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                       <button 
                         onClick={() => setEditingRequest({
                           ...req,
                           createMedicalClaim: req.createMedicalClaim ?? ((req.type || '').toLowerCase().includes('medical') || (req.type || '').includes('طبي'))
                         })}
                         className="p-3 bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 rounded-2xl transition-all"
                       >
                         <Edit2 className="w-5 h-5" />
                       </button>

                       {activeTab === 'visits' ? (
                         <button 
                           disabled={!hasPermission('assistance', 'canConfirmVisit')}
                           onClick={() => updateRequestStatus(req, 'visit_confirmed')}
                           className="flex-1 bg-amber-600 text-white font-black py-3 rounded-2xl hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 text-xs"
                         >تأكيد المعاينة</button>
                       ) : (
                         <div className="flex-1 flex gap-2">
                            <button 
                               disabled={!hasPermission('assistance', 'canApprove')}
                               onClick={() => handleAddToCampaign(req)}
                               className="px-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-2xl transition-all"
                               title="طلب إدراج في حملة خيرية"
                             >
                               <Heart className="w-5 h-5" />
                             </button>
                             <button 
                               disabled={!hasPermission('assistance', 'canApprove')}
                             onClick={() => {
                               if (confirm("هل أنت متأكد من اعتماد الصرف؟ سيتم تحويل الطلبات الطبية لمطالبات تلقائياً.")) {
                                 updateRequestStatus(req, 'approved');
                               }
                             }}
                             className="flex-1 bg-emerald-600 text-white font-black py-3 rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 text-xs"
                           >اعتماد وصرف</button>
                         </div>
                       )}

                       <button 
                         onClick={() => {
                           const reason = prompt("سبب الرفض؟");
                           if (reason) updateRequestStatus(req, 'rejected', reason);
                         }}
                         className="p-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-2xl transition-all"
                       >
                         <Trash2 className="w-5 h-5" />
                       </button>
                    </div>
                  </div>
                ))}
              </div>
              {filteredRequests.length === 0 && (
                <div className="py-32 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                  <div className="w-20 h-20 bg-gray-50 rounded-[40px] flex items-center justify-center">
                    {activeTab === 'visits' ? <SearchIcon className="w-10 h-10 text-gray-300" /> : <Gavel className="w-10 h-10 text-gray-300" />}
                  </div>
                  <div>
                    <p className="text-lg font-black text-gray-900">لا توجد طلبات معلقة</p>
                    <p className="text-sm font-bold text-gray-400">جميع الطلبات في هذه المرحلة تم معالجتها بالكامل</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && activeTab === 'distribution' && filteredLogs.length === 0 && (
             <div className="py-32 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
               <div className="w-20 h-20 bg-emerald-50 rounded-[40px] flex items-center justify-center">
                 <ClipboardList className="w-10 h-10 text-emerald-200" />
               </div>
               <div>
                 <p className="text-lg font-black text-gray-900">سجل التوزيع فارغ</p>
                 <p className="text-sm font-bold text-gray-400">لم يتم تسجيل أي توزيعات مطابقة للفلاتر المختارة</p>
               </div>
             </div>
          )}
        </div>
      </div>
    )}

      {/* Request Details Modal */}
      {viewingRequestDetails && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-8">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-indigo-50/20">
               <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-3xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-100">
                    <Heart className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-gray-900">{viewingRequestDetails.aid.type}</h3>
                    <p className="text-xs font-bold text-gray-400 mt-1 flex items-center gap-2 uppercase tracking-widest">
                       <User className="w-3.5 h-3.5" /> المستفيد: {viewingRequestDetails.memberName}
                    </p>
                  </div>
               </div>
               <button onClick={() => setViewingRequestDetails(null)} className="p-4 bg-white text-gray-400 rounded-3xl shadow-sm hover:text-gray-900 transition-all">
                 <XCircle className="w-6 h-6" />
               </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="space-y-8">
                     <div className="bg-gray-50 rounded-[32px] p-8 border border-gray-100 space-y-6">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-3">بيانات الطلب المالية والزمنية</h4>
                        <div className="grid grid-cols-2 gap-6">
                           <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-50">
                              <p className="text-[10px] font-black text-emerald-600 uppercase mb-1.5 flex items-center gap-1"><DollarSign className="w-3 h-3" /> تكلفة الوحدة</p>
                              <p className="text-xl font-black text-gray-900 tabular-nums">{viewingRequestDetails.aid.unitCost.toLocaleString()} ج.م</p>
                           </div>
                           <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-50">
                              <p className="text-[10px] font-black text-indigo-600 uppercase mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3" /> الكمية</p>
                              <p className="text-xl font-black text-gray-900 tabular-nums">{viewingRequestDetails.aid.quantity}</p>
                           </div>
                           <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-50">
                              <p className="text-[10px] font-black text-amber-600 uppercase mb-1.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> مدة الدعم</p>
                              <p className="text-xl font-black text-gray-900 tabular-nums">{viewingRequestDetails.aid.durationMonths} شهور</p>
                           </div>
                           <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-50">
                              <p className="text-[10px] font-black text-rose-600 uppercase mb-1.5 flex items-center gap-1"><PieChart className="w-3 h-3" /> الإجمالي</p>
                              <p className="text-xl font-black text-gray-900 tabular-nums">{(viewingRequestDetails.aid.totalCost || 0).toLocaleString()} ج.م</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-6 pt-2">
                           <div className="flex-1 bg-white p-4 rounded-2xl border border-gray-50">
                              <p className="text-[9px] font-black text-gray-400 uppercase mb-1">تاريخ البدء</p>
                              <p className="text-sm font-bold text-gray-700">{viewingRequestDetails.aid.startDate || '--'}</p>
                           </div>
                           <div className="flex-1 bg-white p-4 rounded-2xl border border-gray-50">
                              <p className="text-[9px] font-black text-gray-400 uppercase mb-1">تاريخ الانتهاء</p>
                              <p className="text-sm font-bold text-gray-700">{viewingRequestDetails.aid.endDate || '--'}</p>
                           </div>
                        </div>
                     </div>
                     
                     <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">تفاصيل الحالة والاحتياج</h4>
                        <div className="bg-white rounded-[32px] p-6 border border-gray-100 shadow-sm space-y-5">
                           <div className="bg-indigo-50/30 p-5 rounded-2xl border border-indigo-100/50">
                              <span className="text-indigo-600 font-black text-[10px] uppercase block mb-2 tracking-widest">وصف الاحتياج:</span>
                              <p className="text-sm font-bold text-gray-700 leading-relaxed">{viewingRequestDetails.aid.needDetails || 'لا يوجد وصف مفصل مسجل.'}</p>
                           </div>
                           {viewingRequestDetails.aid.notes && (
                              <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                                 <span className="text-gray-400 font-black text-[10px] uppercase block mb-2 tracking-widest">ملاحظات إضافية:</span>
                                 <p className="text-sm font-bold text-gray-600 leading-relaxed">{viewingRequestDetails.aid.notes}</p>
                              </div>
                           )}
                        </div>
                     </div>

                     {viewingRequestDetails.aid.prescriptionItems && viewingRequestDetails.aid.prescriptionItems.length > 0 && (
                        <div className="space-y-4">
                          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">الأصناف الطبية والمخزون</h4>
                          <div className="bg-white rounded-[32px] p-6 border border-rose-100 shadow-xl shadow-rose-50/50 space-y-4">
                            {viewingRequestDetails.aid.prescriptionItems.map((item, idx) => {
                              const storeItem = storeItems.find(s => s.id === item.itemId);
                              const available = storeItem?.quantity || 0;
                              return (
                                <div key={idx} className="flex items-center justify-between p-4 bg-rose-50/30 rounded-2xl border border-rose-100/50">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-white rounded-xl shadow-sm">
                                      <Package className="w-4 h-4 text-rose-500" />
                                    </div>
                                    <div>
                                      <p className="text-xs font-black text-gray-900">{item.itemName}</p>
                                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">الكمية المطلوبة: {item.requestedQuantity}</p>
                                    </div>
                                  </div>
                                  <div className="text-left">
                                    <p className={cn(
                                      "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
                                      available > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                    )}>
                                      المتاح: {available}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                   </div>

                  <div className="space-y-6">
                     <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between px-2">
                        <span>سجل التسليمات والمتابعة المجدولة</span>
                        <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[10px]">{(viewingRequestDetails.aid.deliverySchedule || []).length} دفعات</span>
                     </h4>
                     <div className="space-y-4 max-h-[600px] overflow-y-auto pr-3 custom-scrollbar">
                        {(viewingRequestDetails.aid.deliverySchedule || []).map((task) => (
                           <div key={task.id} className={cn(
                              "p-6 rounded-[32px] border transition-all space-y-5 relative",
                              task.status === 'delivered' ? "bg-emerald-50/50 border-emerald-100" : "bg-gray-50 border-gray-100"
                           )}>
                              <div className="flex justify-between items-center">
                                 <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-xs font-black text-gray-600 shadow-sm">
                                       #{task.idNumber}
                                    </div>
                                    <div>
                                       <p className="text-sm font-black text-gray-900 tracking-tight">{task.scheduledDate}</p>
                                       <p className="text-[10px] font-bold text-gray-400">موعد الاستحقاق</p>
                                    </div>
                                 </div>
                                 <div className={cn(
                                    "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm",
                                    task.status === 'delivered' ? "bg-emerald-600 text-white" : 
                                    task.status === 'delivering' ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-white border border-gray-200 text-gray-400"
                                 )}>
                                    {task.status === 'delivered' ? 'تم التسليم' : task.status === 'delivering' ? 'قيد المعالجة' : 'مجدول'}
                                 </div>
                              </div>
                              
                              {task.updates && task.updates.length > 0 && (
                                 <div className="space-y-3 border-t border-gray-200/50 pt-4">
                                    {task.updates.map((upd, idx) => (
                                       <div key={idx} className="bg-white/80 p-4 rounded-2xl border border-white shadow-sm flex gap-4 hover:shadow-md transition-shadow">
                                          <div className="w-1 h-auto bg-indigo-200 rounded-full flex-shrink-0" />
                                          <div className="flex-1">
                                             <div className="flex justify-between items-center mb-1.5">
                                                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{upd.user}</span>
                                                <span className="text-[9px] font-black text-gray-400 tabular-nums">{new Date(upd.date).toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                                             </div>
                                             <p className="text-xs font-bold text-gray-700 leading-relaxed">{upd.text}</p>
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

      {isAddingAssistance && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-900">تسجيل مساعدة جديدة</h3>
                <p className="text-[10px] font-black text-gray-400 mt-1 uppercase tracking-widest">إضافة مساعدة مباشرة للنظام</p>
              </div>
              <button 
                onClick={() => setIsAddingAssistance(false)}
                className="p-3 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-2xl transition-all"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleAddAssistance} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">نوع التسوية</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cash', label: 'نقدي', icon: DollarSign },
                    { id: 'item', label: 'عيني (صنف)', icon: Box },
                    { id: 'claim', label: 'مطالبة طبية', icon: Receipt }
                  ].map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setNewAssistance({
                        ...newAssistance, 
                        paymentType: mode.id as any,
                        createMedicalClaim: mode.id === 'claim'
                      })}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all font-black text-[10px]",
                        newAssistance.paymentType === mode.id 
                          ? "bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm" 
                          : "bg-gray-50 border-transparent text-gray-400 hover:border-gray-200"
                      )}
                    >
                      <mode.icon className="w-5 h-5" />
                      <span>{mode.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">العائلة المستفيدة</label>
                  <select 
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all font-mono"
                    value={newAssistance.familyId}
                    onChange={e => setNewAssistance({...newAssistance, familyId: e.target.value, emergencyCaseId: ''})}
                    required
                  >
                    <option value="">اختر العائلة...</option>
                    {families.sort((a,b) => a.name.localeCompare(b.name)).map(f => (
                      <option key={f.id} value={f.id}>{f.name} (#{f.fileNumber})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">ربط بحالة طوارئ (اختياري)</label>
                  <select 
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all font-mono"
                    value={newAssistance.emergencyCaseId}
                    onChange={e => {
                      const caseId = e.target.value;
                      const selectedCase = emergencyCases.find(c => c.id === caseId);
                      setNewAssistance({
                        ...newAssistance, 
                        emergencyCaseId: caseId,
                        targetMemberId: selectedCase?.memberId || newAssistance.targetMemberId,
                        notes: selectedCase ? `مساعدة طارئة مرتبطة بحالة: ${selectedCase.title}` : newAssistance.notes
                      });
                    }}
                    disabled={!newAssistance.familyId}
                  >
                    <option value="">لا يوجد ربط...</option>
                    {emergencyCases
                      .filter(c => c.familyId === newAssistance.familyId && c.status === 'open')
                      .map(c => (
                        <option key={c.id} value={c.id}>{c.caseCode} - {c.title}</option>
                      ))
                    }
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">نوع المساعدة</label>
                  <select 
                    value={newAssistance.type}
                    onChange={e => {
                      const at = assistanceTypes.find(a => a.name === e.target.value);
                      const service = services.find(s => s.name === e.target.value);
                      setNewAssistance({
                        ...newAssistance, 
                        type: e.target.value,
                        amount: at?.defaultPrice || service?.defaultUnitCost || 0,
                        unit: at?.unit || service?.defaultUnit || 'ج.م'
                      });
                    }}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all font-mono"
                    required
                  >
                    <option value="">اختر المساعدة / الخدمة...</option>
                    <optgroup label="أنواع المساعدات">
                      {assistanceTypes.map(at => (
                        <option key={at.id} value={at.name}>{at.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="الخدمات والبرامج">
                      {services.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">طريقة التسليم (تأكيد)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewAssistance({...newAssistance, deliveryMethod: 'branch'})}
                      className={cn(
                        "flex items-center justify-center gap-2 px-4 py-4 rounded-2xl border-2 transition-all font-black text-xs",
                        newAssistance.deliveryMethod === 'branch' 
                          ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-lg shadow-emerald-50" 
                          : "bg-gray-50 border-transparent text-gray-400 opacity-60 hover:opacity-100"
                      )}
                    >
                      <Warehouse className="w-4 h-4" />
                      <span>الفرع</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewAssistance({...newAssistance, deliveryMethod: 'shipping'})}
                      className={cn(
                        "flex items-center justify-center gap-2 px-4 py-4 rounded-2xl border-2 transition-all font-black text-xs",
                        newAssistance.deliveryMethod === 'shipping' 
                          ? "bg-blue-50 border-blue-500 text-blue-700 shadow-lg shadow-blue-50" 
                          : "bg-gray-50 border-transparent text-gray-400 opacity-60 hover:opacity-100"
                      )}
                    >
                      <Truck className="w-4 h-4" />
                      <span>شحن</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">التاريخ</label>
                  <input 
                    type="date"
                    value={newAssistance.distributionDate}
                    onChange={e => setNewAssistance({...newAssistance, distributionDate: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all font-mono"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">جهة التسليم المعتمدة</label>
                  <select 
                    value={newAssistance.deliveryDestination}
                    onChange={e => setNewAssistance({...newAssistance, deliveryDestination: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all font-mono text-right"
                    required={newAssistance.deliveryMethod === 'branch'}
                  >
                    <option value="">اختر الجهة...</option>
                    {lookups
                      .filter(l => l.type === 'delivery_location')
                      .filter(l => {
                        const service = services.find(s => s.name === newAssistance.type);
                        return !service || !l.serviceIds || l.serviceIds.includes(service.id);
                      })
                      .map(l => (
                        <option key={l.id} value={l.name}>{l.name} - {l.address}</option>
                      ))
                    }
                    <option value="other">جهة أخرى / خارجية</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">اسم المستلم أو التوقيع</label>
                  <input 
                    type="text"
                    value={newAssistance.recipientName}
                    onChange={e => setNewAssistance({...newAssistance, recipientName: e.target.value})}
                    placeholder="اسم الشخص الذي استلم المساعدة"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">رابط صورة الإيصال</label>
                  <input 
                    type="text"
                    value={newAssistance.receiptUrl}
                    onChange={e => setNewAssistance({...newAssistance, receiptUrl: e.target.value})}
                    placeholder="رابط صورة السند (اختياري)"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الكمية</label>
                  <input 
                    type="number"
                    value={newAssistance.deliveryQuantity}
                    onChange={e => setNewAssistance({...newAssistance, deliveryQuantity: Number(e.target.value)})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-black focus:bg-white focus:border-emerald-200 transition-all font-mono"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">القيمة الإجمالية</label>
                  <input 
                    type="number"
                    value={newAssistance.amount}
                    onChange={e => setNewAssistance({...newAssistance, amount: Number(e.target.value)})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-black focus:bg-white focus:border-emerald-200 transition-all font-mono"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">ملاحظات إضافية</label>
                <textarea 
                  value={newAssistance.notes}
                  onChange={e => setNewAssistance({...newAssistance, notes: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all min-h-[100px] resize-none"
                  placeholder="أدخل ملاحظات التوزيع..."
                />
              </div>

              {(newAssistance.type.includes('طبي') || newAssistance.type.toLowerCase().includes('medical')) && (
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

              <div className="flex items-center gap-3 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <input 
                  type="checkbox" 
                  id="confirmDelivery" 
                  required
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                />
                <label htmlFor="confirmDelivery" className="text-xs font-black text-gray-500 cursor-pointer">
                  أؤكد أنني راجعت <span className="text-emerald-700 underline">طريقة التسليم</span> (
                  {newAssistance.deliveryMethod === 'branch' ? 'استلام من الفرع' : 'شحن وتوصيل'}
                  ) وهي مطابقة للطلبية.
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                {(newAssistance.type.includes('طبي') || newAssistance.type.toLowerCase().includes('medical')) && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      setNewAssistance(prev => ({ ...prev, createMedicalClaim: true }));
                      setTimeout(() => {
                        const form = (e.target as HTMLElement).closest('form');
                        if (form) form.requestSubmit();
                      }, 0);
                    }}
                    className="flex-1 bg-rose-600 text-white font-black py-4 rounded-2xl hover:bg-rose-700 transition-all shadow-xl shadow-rose-100 flex items-center justify-center gap-2"
                  >
                    <Receipt className="w-5 h-5" />
                    تسجيل وتحويل لمطالبة
                  </button>
                )}
                <button 
                  type="submit"
                  className="flex-[2] bg-emerald-600 text-white font-black py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100"
                >تسجيل المساعدة</button>
                <button 
                  type="button"
                  onClick={() => setIsAddingAssistance(false)}
                  className="px-8 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 transition-all"
                >إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingRequest && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-900">تعديل طلب المساعدة</h3>
                <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">{editingRequest.memberName}</p>
              </div>
              <button 
                onClick={() => setEditingRequest(null)}
                className="p-3 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-2xl transition-all"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleEditRequest} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">نوع الطلب</label>
                  <input 
                    type="text"
                    value={editingRequest.type}
                    onChange={e => setEditingRequest({...editingRequest, type: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">رقم قرار اللجنة</label>
                  <input 
                    type="text"
                    value={editingRequest.committeeCode || ''}
                    onChange={e => setEditingRequest({...editingRequest, committeeCode: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all"
                  />
                </div>
              </div>

              {((editingRequest.type || '').toLowerCase().includes('medical') || (editingRequest.type || '').includes('طبي')) && (
                <div className="bg-rose-50/50 p-6 rounded-3xl border border-rose-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-rose-900">تحويل لمطالبة طبية</p>
                    <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mt-1">إنشاء سجل مطالبة تلقائياً عند الموافقة</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setEditingRequest({...editingRequest, createMedicalClaim: !editingRequest.createMedicalClaim})}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative overflow-hidden",
                      editingRequest.createMedicalClaim ? "bg-rose-600 shadow-inner" : "bg-gray-200"
                    )}
                  >
                    <motion.div 
                      layout
                      className={cn(
                        "absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm",
                        editingRequest.createMedicalClaim ? "left-1" : "right-1"
                      )}
                    />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الكمية</label>
                  <input 
                    type="number"
                    value={editingRequest.quantity}
                    onChange={e => setEditingRequest({...editingRequest, quantity: Number(e.target.value)})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-black focus:bg-white focus:border-emerald-200 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تكلفة الوحدة</label>
                  <input 
                    type="number"
                    value={editingRequest.unitCost}
                    onChange={e => {
                      const cost = Number(e.target.value);
                      setEditingRequest({...editingRequest, unitCost: cost, totalCost: cost * editingRequest.quantity});
                    }}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-black focus:bg-white focus:border-emerald-200 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">ملاحظات إضافية</label>
                <textarea 
                  value={editingRequest.notes}
                  onChange={e => setEditingRequest({...editingRequest, notes: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all min-h-[120px] resize-none"
                  placeholder="أدخل ملاحظات الباحث أو اللجنة هنا..."
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="submit"
                  className="flex-1 bg-gray-900 text-white font-black py-4 rounded-2xl hover:bg-black transition-all shadow-xl shadow-gray-200"
                >حفظ التغييرات</button>
                <button 
                  type="button"
                  onClick={() => setEditingRequest(null)}
                  className="px-8 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 transition-all"
                >إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingAssistance && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-gray-900">تعديل سجل المساعدة</h3>
                <p className="text-xs font-bold text-gray-400 mt-1 uppercase tracking-widest">{editingAssistance.familyName}</p>
              </div>
              <button 
                onClick={() => setEditingAssistance(null)}
                className="p-3 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-2xl transition-all"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleEditAssistance} className="p-8 space-y-6">
              {editingAssistance.followUpLog && editingAssistance.followUpLog.length > 0 && (
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ التوزيع والمتابعة</label>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {editingAssistance.followUpLog.map((log, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 italic">
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-[9px] font-black text-indigo-600 uppercase tabular-nums">
                            {new Date(log.date).toLocaleString('ar-EG')}
                          </p>
                          <p className="text-[9px] font-bold text-gray-400">{log.processedBy}</p>
                        </div>
                        <p className="text-xs font-bold text-gray-700 leading-relaxed">{log.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">التاريخ</label>
                  <input 
                    type="date"
                    value={editingAssistance.distributionDate}
                    onChange={e => setEditingAssistance({...editingAssistance, distributionDate: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">النوع</label>
                  <input 
                    type="text"
                    value={editingAssistance.type}
                    onChange={e => setEditingAssistance({...editingAssistance, type: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المبلغ / القيمة</label>
                  <input 
                    type="number"
                    value={editingAssistance.amount}
                    onChange={e => setEditingAssistance({...editingAssistance, amount: Number(e.target.value)})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-black"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المسؤول عن التنفيذ</label>
                  <input 
                    type="text"
                    value={editingAssistance.processedBy || ''}
                    onChange={e => setEditingAssistance({...editingAssistance, processedBy: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المسؤول عن التخصيص</label>
                  <input 
                    type="text"
                    value={editingAssistance.assignedBy || ''}
                    onChange={e => setEditingAssistance({...editingAssistance, assignedBy: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">اسم المستلم</label>
                  <input 
                    type="text"
                    value={editingAssistance.recipientName || ''}
                    onChange={e => setEditingAssistance({...editingAssistance, recipientName: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">جهة التسليم</label>
                  <input 
                    type="text"
                    value={editingAssistance.deliveryDestination || ''}
                    onChange={e => setEditingAssistance({...editingAssistance, deliveryDestination: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الكمية المسلمة</label>
                  <input 
                    type="number"
                    value={editingAssistance.deliveryQuantity || 0}
                    onChange={e => setEditingAssistance({...editingAssistance, deliveryQuantity: Number(e.target.value)})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-black"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">ربط بحالة طوارئ (اختياري)</label>
                <select 
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-emerald-200 transition-all font-mono"
                  value={editingAssistance.emergencyCaseId || ''}
                  onChange={e => setEditingAssistance({...editingAssistance, emergencyCaseId: e.target.value})}
                >
                  <option value="">لا يوجد ربط...</option>
                  {emergencyCases
                    .filter(c => c.familyId === editingAssistance.familyId && (c.status === 'open' || c.id === editingAssistance.emergencyCaseId))
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.caseCode} - {c.title}</option>
                    ))
                  }
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">إيصال الاستلام</label>
                <input 
                  type="text"
                  value={editingAssistance.receiptUrl || ''}
                  onChange={e => setEditingAssistance({...editingAssistance, receiptUrl: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold"
                  placeholder="رابط الصورة أو السند"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">ملاحظات</label>
                <textarea 
                  value={editingAssistance.notes || ''}
                  onChange={e => setEditingAssistance({...editingAssistance, notes: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold min-h-[100px] resize-none"
                />
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

              <div className="flex gap-4 pt-4">
                <button 
                  type="submit"
                  className="flex-1 bg-emerald-600 text-white font-black py-4 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100"
                >حفظ التعديلات</button>
                <button 
                  type="button"
                  onClick={() => setEditingAssistance(null)}
                  className="px-8 bg-gray-100 text-gray-500 font-bold rounded-2xl"
                >إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addingFollowUp && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setAddingFollowUp(null)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[40px] w-full max-w-lg relative z-[130] p-10 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-gray-900">إضافة متابعة جديدة</h3>
                <p className="text-[10px] font-black text-gray-400 mt-1 uppercase tracking-widest">{addingFollowUp.familyName}</p>
              </div>
              <button onClick={() => setAddingFollowUp(null)} className="text-gray-400 hover:text-gray-900 transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleAddFollowUp} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">التاريخ</label>
                  <input 
                    type="date"
                    required
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none font-bold text-sm"
                    value={followUpDetails.date}
                    onChange={e => setFollowUpDetails({...followUpDetails, date: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">المسؤول</label>
                  <input 
                    type="text"
                    required
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none font-bold text-sm"
                    value={followUpDetails.processedBy}
                    onChange={e => setFollowUpDetails({...followUpDetails, processedBy: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">النوع</label>
                <select 
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none font-bold text-sm"
                  value={followUpDetails.type}
                  onChange={e => setFollowUpDetails({...followUpDetails, type: e.target.value as any})}
                >
                  <option value="comment">تعليق عام</option>
                  <option value="delivery_attempt">محاولة تسليم</option>
                  <option value="final_delivery">تسليم نهائي</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">التعليق / الملاحظات</label>
                <textarea 
                  required
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none font-bold text-sm min-h-[120px] resize-none"
                  value={followUpDetails.comment}
                  onChange={e => setFollowUpDetails({...followUpDetails, comment: e.target.value})}
                  placeholder="اكتب ملاحظات المتابعة هنا..."
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="submit"
                  className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                >حفظ المتابعة</button>
                <button 
                  type="button"
                  onClick={() => setAddingFollowUp(null)}
                  className="px-8 bg-gray-100 text-gray-500 font-bold rounded-2xl"
                >إلغاء</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {editingDeliveryTask && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setEditingDeliveryTask(null)} />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[40px] w-full max-w-lg relative z-[130] p-10 shadow-2xl overflow-y-auto"
          >
             <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-gray-900 leading-none">تعديل قسط التسليم</h3>
                <button onClick={() => setEditingDeliveryTask(null)} className="text-gray-400 hover:text-gray-900 transition-colors"><XCircle className="w-6 h-6" /></button>
             </div>
             
             <form onSubmit={handleUpdateDeliveryTask} className="space-y-6">
                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">تاريخ التسليم المجدول</label>
                   <input 
                     type="date"
                     className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-6 py-3 outline-none font-bold text-sm"
                     value={editingDeliveryTask.scheduledDate}
                     onChange={e => setEditingDeliveryTask({...editingDeliveryTask, scheduledDate: e.target.value})}
                   />
                </div>

                <div className="space-y-1.5">
                   <label className="text-[10px] font-black text-gray-400 mr-2 uppercase tracking-widest">كود التسليم</label>
                   <input 
                     type="text"
                     className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-6 py-3 outline-none font-bold text-sm"
                     value={editingDeliveryTask.deliveryCode}
                     onChange={e => setEditingDeliveryTask({...editingDeliveryTask, deliveryCode: e.target.value})}
                   />
                </div>

                <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100/50 space-y-2">
                   <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">معلومات الطلب الأساسي</p>
                   <div className="flex justify-between items-center text-sm">
                      <span className="font-bold text-gray-500">المستفيد:</span>
                      <span className="font-black text-gray-900">{editingDeliveryTask.memberName}</span>
                   </div>
                   <div className="flex justify-between items-center text-sm">
                      <span className="font-bold text-gray-500">نوع الخدمة:</span>
                      <span className="font-black text-indigo-600">{editingDeliveryTask.type}</span>
                   </div>
                </div>

                <div className="flex gap-4 pt-6 border-t border-gray-100">
                   <button type="submit" className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100">حفظ التغييرات</button>
                   <button type="button" onClick={() => setEditingDeliveryTask(null)} className="px-10 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 transition-all">إلغاء</button>
                </div>
             </form>
          </motion.div>
        </div>
      )}

      {deliveryTaskToProcess && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-indigo-50 flex items-center justify-between bg-indigo-50/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900">إتمام عملية التسليم</h3>
                  <p className="text-xs font-bold text-indigo-600 mt-1 uppercase tracking-widest">{deliveryTaskToProcess.type}</p>
                </div>
              </div>
              <button 
                onClick={() => setDeliveryTaskToProcess(null)}
                className="p-3 bg-white text-gray-400 hover:text-gray-900 rounded-2xl transition-all shadow-sm"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={(e) => handleProcessDelivery(e, true)} className="p-8 space-y-6">
              {deliveryTaskToProcess.updates && deliveryTaskToProcess.updates.length > 0 && (
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ المتابعة (آخر المستجدات)</label>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {deliveryTaskToProcess.updates.map((update, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-[9px] font-black text-indigo-600 uppercase tabular-nums">
                            {new Date(update.date).toLocaleString('ar-EG')}
                          </p>
                          <p className="text-[9px] font-bold text-gray-400">{update.user}</p>
                        </div>
                        <p className="text-xs font-bold text-gray-700 leading-relaxed">{update.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">نوع الخدمة / المساعدة</label>
                  <input 
                    type="text"
                    value={deliveryDetails.type}
                    onChange={e => setDeliveryDetails({...deliveryDetails, type: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-indigo-200 transition-all"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">تاريخ التسليم</label>
                  <input 
                    type="date"
                    value={deliveryDetails.date}
                    onChange={e => setDeliveryDetails({...deliveryDetails, date: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-indigo-200 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الكمية المسلمة</label>
                  <input 
                    type="number"
                    value={deliveryDetails.deliveryQuantity}
                    onChange={e => setDeliveryDetails({...deliveryDetails, deliveryQuantity: Number(e.target.value)})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-black focus:bg-white focus:border-indigo-200 transition-all font-mono"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">طريقة التسليم</label>
                  <select 
                    value={deliveryDetails.deliveryMethod}
                    onChange={e => setDeliveryDetails({...deliveryDetails, deliveryMethod: e.target.value as any})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-indigo-200 transition-all font-mono"
                    required
                  >
                    <option value="branch">فرع / مقر</option>
                    <option value="shipping">شحن / توصيل</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">التكلفة الإجمالية (ج.م)</label>
                  <input 
                    type="number"
                    value={deliveryDetails.actualCost}
                    onChange={e => setDeliveryDetails({...deliveryDetails, actualCost: Number(e.target.value)})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-black focus:bg-white focus:border-indigo-200 transition-all font-mono"
                    required
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">جهة التسليم</label>
                   <select 
                    value={deliveryDetails.deliveryDestination}
                    onChange={e => setDeliveryDetails({...deliveryDetails, deliveryDestination: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-indigo-200 transition-all font-mono text-right"
                    required={deliveryDetails.deliveryMethod === 'branch'}
                    dir="rtl"
                  >
                    <option value="">اختر الجهة...</option>
                    {lookups
                      .filter(l => l.type === 'delivery_location')
                      .filter(l => {
                        const service = services.find(s => s.name === deliveryDetails.type);
                        return !service || !l.serviceIds || l.serviceIds.includes(service.id);
                      })
                      .map(l => (
                        <option key={l.id} value={l.name}>{l.name}</option>
                      ))
                    }
                    <option value="other">جهة أخرى</option>
                  </select>
                </div>
              </div>

              {((deliveryDetails.type || '').toLowerCase().includes('medical') || (deliveryDetails.type || '').includes('طبي')) && (
                <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100">
                  <h4 className="text-[10px] font-black text-amber-800 uppercase mb-4 flex items-center gap-2">
                    <Package className="w-4 h-4" /> تفريغ الروشتة والأصناف المصروفة
                  </h4>
                  <div className="space-y-4">
                    {(() => {
                      const req = pendingRequests.find(r => r.id === deliveryTaskToProcess.aidRequestId);
                      const items = deliveryDetails.prescriptionItems.length > 0 ? deliveryDetails.prescriptionItems : (req?.prescriptionItems || []);
                      
                      return items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white/50 p-3 rounded-xl border border-amber-100">
                          <div>
                            <p className="text-[11px] font-bold text-gray-900">{item.itemName}</p>
                            <p className="text-[9px] text-gray-400">المطلوب: {item.requestedQuantity} | المتاح بالفرع: {storeItems.find(s => s.id === item.itemId)?.quantity ?? 0}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number"
                              className="w-12 text-center bg-white border border-amber-200 rounded py-1 text-xs font-black"
                              value={item.dispensedQuantity}
                              onChange={e => {
                                const val = Number(e.target.value);
                                const newItems = [...items];
                                newItems[idx] = { ...newItems[idx], dispensedQuantity: val };
                                setDeliveryDetails({ ...deliveryDetails, prescriptionItems: newItems });
                              }}
                            />
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">اسم المستلم الفعلي</label>
                  <input 
                    type="text"
                    value={deliveryDetails.recipientName}
                    onChange={e => setDeliveryDetails({...deliveryDetails, recipientName: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-indigo-200 transition-all"
                    placeholder="اسم الشخص المستلم"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">توقيع المستلم (الاسم الثلاثي)</label>
                  <input 
                    type="text"
                    value={deliveryDetails.recipientSignatureName}
                    onChange={e => setDeliveryDetails({...deliveryDetails, recipientSignatureName: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-indigo-200 transition-all"
                    placeholder="توقيع المستلم كتابةً"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">المسؤول عن التسليم</label>
                 <input 
                  type="text"
                  value={deliveryDetails.processedBy}
                  onChange={e => setDeliveryDetails({...deliveryDetails, processedBy: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-indigo-200 transition-all"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">ملاحظات وتعليقات على التسليم</label>
                <textarea 
                  value={deliveryDetails.notes}
                  onChange={e => setDeliveryDetails({...deliveryDetails, notes: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-indigo-200 transition-all min-h-[80px] resize-none"
                  placeholder="أدخل أي ملاحظات حول حالة المستلم أو عملية التسليم..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">إرفاق إيصال التسليم أو صورة السند</label>
                <input 
                  type="text"
                  value={deliveryDetails.receiptUrl}
                  onChange={e => setDeliveryDetails({...deliveryDetails, receiptUrl: e.target.value})}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none text-sm font-bold focus:bg-white focus:border-indigo-200 transition-all font-mono"
                  placeholder="رابط الصورة أو رقم السند"
                />
              </div>

              <div className="flex gap-4 pt-4">
                {(deliveryDetails.type.includes('طبي') || deliveryDetails.type.toLowerCase().includes('medical')) && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      setDeliveryDetails(prev => ({ ...prev, createMedicalClaim: true }));
                      setTimeout(() => {
                        const form = (e.target as HTMLElement).closest('form');
                        if (form) form.requestSubmit();
                      }, 0);
                    }}
                    className="flex-1 bg-rose-600 text-white font-black py-4 rounded-2xl hover:bg-rose-700 transition-all shadow-xl shadow-rose-100 flex items-center justify-center gap-2"
                  >
                    <Receipt className="w-5 h-5" />
                    تسليم وتحويل لمطالبة
                  </button>
                )}
                <button 
                  type="button"
                  onClick={(e) => handleProcessDelivery(e, false)}
                  className="flex-1 bg-white text-indigo-600 border-2 border-indigo-100 font-black py-4 rounded-2xl hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                >
                  <Clock className="w-5 h-5" />
                  حفظ تحديث الموقف
                </button>
                <button 
                  type="submit"
                  disabled={!hasPermission('assistance', 'canProcessDelivery')}
                  className={cn(
                    "font-black py-4 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed",
                    (deliveryDetails.type.includes('طبي') || deliveryDetails.type.toLowerCase().includes('medical')) ? "flex-1 bg-indigo-600 shadow-indigo-100 text-white hover:bg-indigo-700" : "flex-[2] bg-indigo-600 shadow-indigo-100 text-white hover:bg-indigo-700"
                  )}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  إتمام التسليم النهائي
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
