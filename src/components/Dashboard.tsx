import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, onSnapshot, limit, orderBy, collectionGroup } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Users, Heart, MapPin, DollarSign, ClipboardCheck, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { GeographicMap } from './GeographicMap';
import { Family, LookupItem, AppUser, AppModule } from '../types';
import { cn } from '../lib/utils';

export function Dashboard({ userProfile, modules }: { userProfile: AppUser | null, modules: AppModule[] }) {
  const [families, setFamilies] = useState<Family[]>([]);
  const [lookups, setLookups] = useState<LookupItem[]>([]);
  const [stats, setStats] = useState({
    activeFamilies: 0,
    totalFamilies: 0,
    members: 0,
    assistanceTotal: 0,
    donationsTotal: 0,
    visitsCount: 0,
    pendingDeliveries: 0,
    approvedAid: 0
  });
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [viewType, setViewType] = useState<'charts' | 'stats'>('charts');

  useEffect(() => {
    // Families
    const fUnsub = onSnapshot(collection(db, 'families'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Family));
      setFamilies(data);
      const active = data.filter(f => f.status === 'active').length;
      setStats(prev => ({ ...prev, totalFamilies: data.length, activeFamilies: active }));
    }, err => handleFirestoreError(err, OperationType.LIST, 'families'));

    // Assistance stats
    const aUnsub = onSnapshot(collection(db, 'assistances'), (snap) => {
      const data = snap.docs.map(doc => doc.data());
      const total = data.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const pending = data.filter(d => !d.isDelivered).length;
      setStats(prev => ({ ...prev, assistanceTotal: total, pendingDeliveries: pending }));
    }, err => handleFirestoreError(err, OperationType.LIST, 'assistances'));

    // Aid Requests (Aggregated from members)
    const reqUnsub = onSnapshot(collectionGroup(db, 'members'), (snap) => {
      let approved = 0;
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.aidRequests && Array.isArray(data.aidRequests)) {
          approved += data.aidRequests.filter((r: any) => r.status === 'approved' || r.status === 'delivered' || r.status === 'visit_confirmed').length;
        }
      });
      setStats(prev => ({ ...prev, approvedAid: approved }));
    }, err => handleFirestoreError(err, OperationType.LIST, 'members-aid-requests'));

    // Visits
    const vUnsub = onSnapshot(collectionGroup(db, 'visits'), (snap) => {
      setStats(prev => ({ ...prev, visitsCount: snap.size }));
    }, err => handleFirestoreError(err, OperationType.LIST, 'visits'));

    // Donations total
    const dUnsub = onSnapshot(collection(db, 'donations'), (snap) => {
      const total = snap.docs.reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0);
      setStats(prev => ({ ...prev, donationsTotal: total }));
    }, err => handleFirestoreError(err, OperationType.LIST, 'donations'));

    // Lookups
    const lUnsub = onSnapshot(collection(db, 'lookups'), (snap) => {
      setLookups(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LookupItem)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'lookups'));

    // Recent Activities (Mix of donations and assistances)
    const qA = query(collection(db, 'assistances'), orderBy('distributionDate', 'desc'), limit(5));
    const actUnsub = onSnapshot(qA, (snap) => {
      setRecentActivities(snap.docs.map(doc => ({
        id: doc.id,
        type: 'assistance',
        ...doc.data()
      })));
    }, err => handleFirestoreError(err, OperationType.LIST, 'recent_activities'));

    return () => {
      fUnsub();
      lUnsub();
      aUnsub();
      dUnsub();
      actUnsub();
      reqUnsub();
      vUnsub();
    };
  }, []);

  const chartData = [
    { name: 'يناير', aid: 4000, donation: 2400 },
    { name: 'فبراير', aid: 3000, donation: 1398 },
    { name: 'مارس', aid: 2000, donation: 9800 },
    { name: 'أبريل', aid: 2780, donation: 3908 },
    { name: 'مايو', aid: 1890, donation: 4800 },
    { name: 'يونيو', aid: 2390, donation: 3800 },
  ];

  const kpis = [
    { title: 'العائلات النشطة', value: stats.activeFamilies, icon: Users, color: 'bg-indigo-50 text-indigo-600', trend: '+12%' },
    { title: 'إجمالي المساعدات', value: `${stats.assistanceTotal.toLocaleString()} ج.م`, icon: Heart, color: 'bg-rose-50 text-rose-600', trend: '+5%' },
    { title: 'الزيارات الميدانية', value: stats.visitsCount, icon: MapPin, color: 'bg-emerald-50 text-emerald-600', trend: '+8%' },
    { title: 'مساعدات معتمدة', value: stats.approvedAid, icon: ClipboardCheck, color: 'bg-amber-50 text-amber-600', trend: 'قيد المراجعة' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-gray-900">نظرة عامة على الجمعية</h2>
          <p className="text-gray-400 font-bold mt-1 uppercase tracking-widest text-[10px]">نظام الإدارة المتكاملة لمؤسسة أوبن تشاريتي</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold border border-emerald-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            تحديث لحظي مفعل
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div 
              key={kpi.title}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="group bg-white p-7 rounded-[32px] border border-gray-100 shadow-sm flex items-center gap-6 relative overflow-hidden"
            >
              <div className={`p-4 rounded-3xl ${kpi.color} transition-transform group-hover:scale-110`}>
                <Icon className="w-7 h-7" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-tighter">{kpi.title}</p>
                <p className="text-2xl font-black text-gray-900 mt-1">{kpi.value}</p>
                <p className="text-[9px] font-bold text-gray-400 mt-1">{kpi.trend}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 -z-10" />
        
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-black flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
               <DollarSign className="w-5 h-5 text-indigo-600" />
             </div>
             اتجاهات التبرعات والمساعدات
          </h3>
          
          <div className="bg-gray-50 p-1 rounded-2xl flex gap-1">
            <button 
              onClick={() => setViewType('charts')}
              className={cn(
                "px-4 py-2 text-xs font-black rounded-xl transition-all",
                viewType === 'charts' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              رسوم بيانية
            </button>
            <button 
              onClick={() => setViewType('stats')}
              className={cn(
                "px-4 py-2 text-xs font-black rounded-xl transition-all",
                viewType === 'stats' ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
              )}
            >
              ملخص إحصائي
            </button>
          </div>
        </div>
        
        <AnimatePresence mode="wait">
          {viewType === 'charts' ? (
            <motion.div 
              key="charts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-[300px] w-full min-h-[300px] relative overflow-hidden"
            >
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorAid" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorDonation" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: '#9ca3af' }} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ fontWeight: 900, marginBottom: '4px' }}
                  />
                  <Area name="المساعدات" type="monotone" dataKey="aid" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorAid)" />
                  <Area name="التبرعات" type="monotone" dataKey="donation" stroke="#6366f1" strokeWidth={4} fillOpacity={1} fill="url(#colorDonation)" />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          ) : (
            <motion.div 
              key="stats"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8"
            >
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-4">كفاءة التوزيع</p>
                <div className="flex items-end justify-between">
                  <span className="text-4xl font-black text-gray-900">88%</span>
                  <span className="text-emerald-600 font-bold text-xs">مستحق عالي</span>
                </div>
                <div className="w-full bg-gray-200 h-2 rounded-full mt-4 overflow-hidden">
                  <div className="bg-emerald-500 h-full w-[88%]" />
                </div>
              </div>
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-4">سرعة الاستجابة</p>
                <div className="flex items-end justify-between">
                  <span className="text-4xl font-black text-gray-900">4.2</span>
                  <span className="text-blue-600 font-bold text-xs">أيام / حالة</span>
                </div>
                <div className="w-full bg-gray-200 h-2 rounded-full mt-4 overflow-hidden">
                  <div className="bg-blue-500 h-full w-[65%]" />
                </div>
              </div>
              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-4">نمو التبرعات</p>
                <div className="flex items-end justify-between">
                  <span className="text-4xl font-black text-gray-900">+15%</span>
                  <span className="text-indigo-600 font-bold text-xs">معدل شهري</span>
                </div>
                <div className="w-full bg-gray-200 h-2 rounded-full mt-4 overflow-hidden">
                  <div className="bg-indigo-500 h-full w-[50%]" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <GeographicMap families={families} lookups={lookups} />
        
        <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm h-full">
          <h3 className="text-xl font-black mb-8 flex items-center gap-3">
             <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
               <ClipboardCheck className="w-5 h-5 text-amber-600" />
             </div>
             النشاط الأخير
          </h3>
          <div className="space-y-6">
            {recentActivities.map((activity, i) => (
              <div key={activity.id} className="flex gap-4 relative group">
                {i !== recentActivities.length - 1 && (
                  <div className="absolute top-10 right-5 bottom-[-24px] w-0.5 bg-gray-100 -z-10" />
                )}
                <div className="w-10 h-10 bg-white border-2 border-gray-100 rounded-full flex items-center justify-center text-emerald-600 shadow-sm flex-shrink-0 group-hover:border-emerald-200 transition-colors">
                  <Heart className="w-4 h-4" />
                </div>
                <div className="pt-1">
                  <p className="text-sm font-black text-gray-900">تسجيل مساعدة بقيمة {activity.amount} ج.م</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">{activity.distributionDate}</p>
                </div>
              </div>
            ))}
            {recentActivities.length === 0 && (
              <div className="py-12 text-center text-gray-400 font-bold">لا توجد حركات مسجلة مؤخراً</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
