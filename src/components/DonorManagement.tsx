import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, doc, getDocs, updateDoc, increment, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Donor, DonorType, Donation, Family, AppUser, AppModule, Campaign } from '../types';
import { Plus, Search, User, Phone, Mail, DollarSign, List, Home, Download, Clock, CheckCircle2, ChevronRight, History, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export function DonorManagement({ userProfile, modules }: { userProfile: AppUser | null, modules: AppModule[] }) {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingDonor, setIsAddingDonor] = useState(false);
  const [isAddingDonation, setIsAddingDonation] = useState(false);
  const [isAddingQuickDonation, setIsAddingQuickDonation] = useState(false);
  const [isNewDonorMode, setIsNewDonorMode] = useState(false);
  const [quickDonorSearch, setQuickDonorSearch] = useState('');
  const [selectedQuickDonor, setSelectedQuickDonor] = useState<Donor | null>(null);
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | DonorType>('all');
  const [sortBy, setSortBy] = useState<'name' | 'amount'>('name');
  const [expandedDonorId, setExpandedDonorId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'insights'>('list');

  const [newDonor, setNewDonor] = useState({
    name: '',
    phone: '',
    email: '',
    type: DonorType.INDIVIDUAL,
    registrationSource: 'other' as const
  });

  const [newDonation, setNewDonation] = useState({
    donorId: '',
    amount: 0,
    currency: 'EGP' as 'EGP' | 'USD' | 'SAR',
    date: new Date().toISOString().split('T')[0],
    type: 'cash' as const,
    targetType: 'general' as 'general' | 'family' | 'campaign',
    targetId: '',
    targetName: '',
    notes: '',
    purpose: ''
  });

  useEffect(() => {
    const dUnsub = onSnapshot(collection(db, 'donors'), (snap) => {
      setDonors(snap.docs.map(d => ({ id: d.id, ...d.data() } as Donor)));
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'donors'));

    const dnUnsub = onSnapshot(collection(db, 'donations'), (snap) => {
      setDonations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Donation)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'donations'));

    const fUnsub = onSnapshot(collection(db, 'families'), (snap) => {
      setFamilies(snap.docs.map(d => ({ id: d.id, ...d.data() } as Family)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'families'));

    const cUnsub = onSnapshot(collection(db, 'campaigns'), (snap) => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as Campaign)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'campaigns'));

    return () => {
      dUnsub();
      dnUnsub();
      fUnsub();
      cUnsub();
    };
  }, []);

  const typeData = [
    { name: 'نقدي', value: donations.filter(d => d.type === 'cash').reduce((sum, d) => sum + d.amount, 0), color: '#10b981' },
    { name: 'عيني', value: donations.filter(d => d.type === 'kind').reduce((sum, d) => sum + d.amount, 0), color: '#3b82f6' },
    { name: 'أخرى', value: donations.filter(d => d.type === 'other').reduce((sum, d) => sum + d.amount, 0), color: '#f59e0b' }
  ].filter(d => d.value > 0);

  const campaignData = campaigns.map(c => ({
    name: c.title,
    amount: donations.filter(d => d.targetType === 'campaign' && d.targetId === c.id).reduce((sum, d) => sum + d.amount, 0)
  })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);

  const handleAddDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'donors'), {
        ...newDonor,
        totalDonated: 0,
        createdAt: new Date().toISOString()
      });
      setIsAddingDonor(false);
      setNewDonor({ name: '', phone: '', email: '', type: DonorType.INDIVIDUAL, registrationSource: 'other' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'donors');
    }
  };

  const handleAddDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDonorId) return;
    const donor = donors.find(d => d.id === selectedDonorId);
    try {
      const donationRef = await addDoc(collection(db, 'donations'), {
        ...newDonation,
        donorId: selectedDonorId,
        donorName: donor?.name,
        donorPhone: donor?.phone
      });

      // Update donor stats
      await updateDoc(doc(db, 'donors', selectedDonorId), {
        totalDonated: increment(newDonation.amount),
        lastDonationDate: newDonation.date
      });

      // Update campaign collected amount if linked
      if (newDonation.targetType === 'campaign' && newDonation.targetId) {
        await updateDoc(doc(db, 'campaigns', newDonation.targetId), {
          collectedAmount: increment(newDonation.amount)
        });
      }

      setIsAddingDonation(false);
      setNewDonation({ 
        donorId: '', 
        amount: 0, 
        currency: 'EGP',
        date: new Date().toISOString().split('T')[0], 
        type: 'cash', 
        targetType: 'general',
        targetId: '',
        targetName: '',
        notes: '',
        purpose: ''
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'donations');
    }
  };

  const handleQuickDonationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let donorId = selectedQuickDonor?.id;

      if (isNewDonorMode) {
        // Register new donor first
        const donorRef = await addDoc(collection(db, 'donors'), newDonor);
        donorId = donorRef.id;
      }

      if (!donorId) return;

      // Add donation
      const donor = isNewDonorMode ? { name: newDonor.name, phone: newDonor.phone } : selectedQuickDonor;
      await addDoc(collection(db, 'donations'), {
        ...newDonation,
        donorId: donorId,
        donorName: donor?.name,
        donorPhone: donor?.phone
      });

      // Update donor stats
      await updateDoc(doc(db, 'donors', donorId), {
        totalDonated: increment(newDonation.amount),
        lastDonationDate: newDonation.date
      });

      // Update campaign collected amount if linked
      if (newDonation.targetType === 'campaign' && newDonation.targetId) {
        await updateDoc(doc(db, 'campaigns', newDonation.targetId), {
          collectedAmount: increment(newDonation.amount)
        });
      }

      // Cleanup
      setIsAddingQuickDonation(false);
      setIsNewDonorMode(false);
      setSelectedQuickDonor(null);
      setQuickDonorSearch('');
      setNewDonor({ name: '', phone: '', email: '', type: DonorType.INDIVIDUAL, registrationSource: 'other' });
      setNewDonation({ 
        donorId: '', 
        amount: 0, 
        currency: 'EGP',
        date: new Date().toISOString().split('T')[0], 
        type: 'cash', 
        targetType: 'general',
        targetId: '',
        targetName: '',
        notes: '',
        purpose: ''
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'quick_donation');
    }
  };

  const getDonorDonations = (id: string) => donations.filter(d => d.donorId === id);
  const getTotalDonated = (id: string) => getDonorDonations(id).reduce((sum, d) => sum + d.amount, 0);

  const filteredDonors = donors
    .filter(donor => {
      const matchesSearch = donor.name.toLowerCase().includes(search.toLowerCase()) || 
                           donor.phone?.includes(search) || 
                           donor.email?.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' || donor.type === typeFilter;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      if (sortBy === 'amount') {
        return getTotalDonated(b.id) - getTotalDonated(a.id);
      }
      return a.name.localeCompare(b.name);
    });

  const exportToCSV = () => {
    const headers = ["الاسم", "النوع", "الهاتف", "البريد الإلكتروني", "عدد التبرعات", "إجمالي المبالغ"];
    const rows = donors.map(donor => [
      donor.name,
      donor.type === DonorType.INDIVIDUAL ? 'فرد' : 'مؤسسة',
      donor.phone || '',
      donor.email || '',
      getDonorDonations(donor.id).length,
      getTotalDonated(donor.id)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `donors_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">إدارة المتبرعين</h2>
          <p className="text-sm text-gray-500">متابعة الأفراد والمنظمات الداعمة للجمعية</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                viewMode === 'list' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <List className="w-4 h-4" />
              سجل
            </button>
            <button 
              onClick={() => setViewMode('insights')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                viewMode === 'insights' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              )}
            >
              <BarChart3 className="w-4 h-4" />
              تحليلات
            </button>
          </div>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-white border border-gray-100 hover:bg-gray-50 text-gray-600 px-5 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Download className="w-5 h-5" />
            <span>تصدير CSV</span>
          </button>
          <button
            onClick={() => setIsAddingQuickDonation(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg"
          >
            <DollarSign className="w-5 h-5" />
            <span>تسجيل تبرع جديد</span>
          </button>
          <button
            onClick={() => setIsAddingDonor(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة متبرع</span>
          </button>
        </div>
      </div>

      {viewMode === 'insights' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                <PieChartIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">توزيع التبرعات حسب النوع</h3>
            </div>
            <div className="h-[350px] w-full min-h-[350px] relative overflow-hidden">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {typeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    itemStyle={{ fontWeight: 'bold' }}
                    formatter={(value: number) => [`${value.toLocaleString()} ج.م`, 'القيمة']}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">توزيع التبرعات حسب الحملات</h3>
            </div>
            <div className="h-[350px] w-full min-h-[350px] relative overflow-hidden">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={campaignData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    itemStyle={{ fontWeight: 'bold' }}
                    formatter={(value: number) => [`${value.toLocaleString()} ج.م`, 'قيمة التبرعات']}
                  />
                  <Bar dataKey="amount" fill="#10b981" radius={[0, 10, 10, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative group flex-1 w-full">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="ابحث بالاسم، الهاتف أو البريد..."
            className="w-full bg-gray-50 border border-transparent rounded-xl py-3 pr-12 pl-4 focus:ring-4 focus:ring-emerald-50 focus:bg-white focus:border-emerald-200 outline-none transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
           <select 
              className="bg-gray-50 border border-transparent rounded-xl px-4 py-3 text-sm font-bold text-gray-500 outline-none focus:ring-4 focus:ring-emerald-50"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as any)}
           >
              <option value="all">كل المتبرعين</option>
              <option value={DonorType.INDIVIDUAL}>أفراد</option>
              <option value={DonorType.ORGANIZATION}>مؤسسات</option>
           </select>
           <select 
              className="bg-gray-50 border border-transparent rounded-xl px-4 py-3 text-sm font-bold text-gray-500 outline-none focus:ring-4 focus:ring-emerald-50"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
           >
              <option value="name">ترتيب بالاسم</option>
              <option value="amount">ترتيب بإجمالي المبالغ</option>
           </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDonors.map(donor => (
          <div 
            key={donor.id} 
            className={cn(
              "bg-white rounded-[32px] border border-gray-100 shadow-sm transition-all overflow-hidden flex flex-col",
              expandedDonorId === donor.id ? "ring-2 ring-emerald-500/20 shadow-xl lg:col-span-2" : "hover:shadow-md"
            )}
          >
            <div className="p-6 flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className={cn(
                  "p-3 rounded-2xl transition-colors",
                  expandedDonorId === donor.id ? "bg-emerald-500 text-white" : "bg-gray-50 text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600"
                )}>
                  <User className="w-6 h-6" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                    donor.type === DonorType.INDIVIDUAL ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                  )}>
                    {donor.type === DonorType.INDIVIDUAL ? 'فرد' : 'مؤسسة'}
                  </span>
                  <button 
                    onClick={() => setExpandedDonorId(expandedDonorId === donor.id ? null : donor.id)}
                    className="flex items-center gap-1 text-[10px] font-black text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    {expandedDonorId === donor.id ? 'إغلاق التفاصيل' : 'عرض السجل'}
                    <ChevronRight className={cn("w-3 h-3 transition-transform", expandedDonorId === donor.id && "rotate-90")} />
                  </button>
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-gray-900 mb-2">{donor.name}</h3>
              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-2 text-xs text-gray-400 font-bold">
                  <Phone className="w-3.5 h-3.5" /> {donor.phone || 'لا يوجد هاتف'}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 font-bold">
                  <Mail className="w-3.5 h-3.5" /> {donor.email || 'لا يوجد بريد'}
                </div>
              </div>

              <div className="mt-auto space-y-4">
                {!expandedDonorId || expandedDonorId !== donor.id ? (
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2">
                      <Clock className="w-3 h-3" /> أخر التبرعات
                    </p>
                    <div className="space-y-2">
                      {getDonorDonations(donor.id).slice(-2).reverse().map(dn => (
                        <div key={dn.id} className="p-3 bg-gray-50 rounded-2xl border border-gray-100/50">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-black text-emerald-600">{dn.amount.toLocaleString()} ج.م</span>
                            <span className="text-[8px] font-bold text-gray-400">{dn.date}</span>
                          </div>
                          <p className="text-[10px] font-bold text-gray-500 leading-tight line-clamp-1">{dn.purpose || 'بدون غرض محدد'}</p>
                        </div>
                      ))}
                      {getDonorDonations(donor.id).length === 0 && (
                        <p className="text-[10px] text-gray-300 italic py-2 text-center">لا توجد تبرعات مسجلة</p>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                  <div>
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-tighter">إجمالي التبرعات</p>
                    <p className="text-xl font-black text-emerald-600 tabular-nums">{getTotalDonated(donor.id).toLocaleString()} <span className="text-xs">ج.م</span></p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setSelectedDonorId(donor.id);
                        setIsAddingDonation(true);
                      }}
                      className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                      title="إضافة تبرع"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {expandedDonorId === donor.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-gray-50/50 border-t border-gray-100"
                >
                  <div className="p-8">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <History className="w-4 h-4" /> سجل التبرعات الكامل
                      </h4>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                        {getDonorDonations(donor.id).length} تبرع مسجل
                      </span>
                    </div>
                    
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {getDonorDonations(donor.id).sort((a,b) => b.date.localeCompare(a.date)).map((dn) => (
                        <div key={dn.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                              <DollarSign className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-black text-gray-900">{dn.amount.toLocaleString()} ج.م</p>
                              <p className="text-[10px] font-bold text-gray-400">{dn.date} • {dn.type === 'cash' ? 'نقدي' : 'عيني'}</p>
                            </div>
                          </div>
                          
                          <div className="flex-1 md:px-6">
                            <p className="text-xs font-bold text-gray-600 bg-gray-50/50 p-2 rounded-xl border border-gray-50">{dn.purpose || 'غرض عام'}</p>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={cn(
                              "text-[9px] font-black px-2 py-1 rounded-lg border",
                              dn.targetType === 'family' ? "bg-blue-50 text-blue-600 border-blue-100" : 
                              dn.targetType === 'campaign' ? "bg-amber-50 text-amber-600 border-amber-100" :
                              "bg-gray-50 text-gray-400 border-gray-100"
                            )}>
                              {dn.targetType === 'family' ? 'موجه لعائلة' : 
                               dn.targetType === 'campaign' ? 'موجه لحملة' : 'تبرع عام'}
                            </span>
                            {dn.targetName && (
                              <span className="text-[9px] font-bold text-gray-500 max-w-[150px] truncate">
                                {dn.targetName}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </>
  )}

      {/* Add Donor Modal */}
      {isAddingDonor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsAddingDonor(false)} />
          <div className="bg-white rounded-3xl w-full max-w-md relative z-10 p-8 shadow-2xl">
            <h2 className="text-xl font-bold mb-6">إضافة متبرع جديد</h2>
            <form onSubmit={handleAddDonor} className="space-y-4">
              <input 
                placeholder="الاسم" required
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                value={newDonor.name}
                onChange={e => setNewDonor({...newDonor, name: e.target.value})}
              />
              <div className="grid grid-cols-2 gap-4">
                <input 
                  type="tel" placeholder="الهاتف"
                  className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                  value={newDonor.phone}
                  onChange={e => setNewDonor({...newDonor, phone: e.target.value})}
                />
                <select 
                  className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                  value={newDonor.type}
                  onChange={e => setNewDonor({...newDonor, type: e.target.value as DonorType})}
                >
                  <option value={DonorType.INDIVIDUAL}>فرد</option>
                  <option value={DonorType.ORGANIZATION}>مؤسسة</option>
                </select>
              </div>
              <input 
                type="email" placeholder="البريد الإلكتروني"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                value={newDonor.email}
                onChange={e => setNewDonor({...newDonor, email: e.target.value})}
              />
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 mr-2 uppercase">مصدر التسجيل</label>
                <select 
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-xs"
                  value={newDonor.registrationSource}
                  onChange={e => setNewDonor({...newDonor, registrationSource: e.target.value as any})}
                >
                  <option value="other">أخرى / غير محدد</option>
                  <option value="call_center">كول سنتر (اتصال هاتفي)</option>
                  <option value="campaign">حملة إعلانية / ميدانية</option>
                  <option value="social_media">وسائل التواصل الاجتماعي</option>
                  <option value="website">الموقع الإلكتروني</option>
                </select>
              </div>
              <button className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg mt-4">حفظ المتبرع</button>
            </form>
          </div>
        </div>
      )}

      {/* Add Donation Modal */}
      {isAddingDonation && selectedDonorId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsAddingDonation(false)} />
          <div className="bg-white rounded-3xl w-full max-w-md relative z-10 p-8 shadow-2xl">
            <h2 className="text-xl font-bold mb-6">تسجيل تبرع</h2>
            <form onSubmit={handleAddDonation} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input 
                  type="number" placeholder="المبلغ" required
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-black"
                  value={newDonation.amount || ''}
                  onChange={e => setNewDonation({...newDonation, amount: Number(e.target.value)})}
                />
                <select 
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none font-bold text-xs"
                  value={newDonation.currency}
                  onChange={e => setNewDonation({...newDonation, currency: e.target.value as any})}
                >
                  <option value="EGP">ج.م (EGP)</option>
                  <option value="USD">دولار (USD)</option>
                  <option value="SAR">ريال (SAR)</option>
                </select>
                <input 
                  type="date" required
                  className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none text-xs"
                  value={newDonation.date}
                  onChange={e => setNewDonation({...newDonation, date: e.target.value})}
                />
              </div>
              
              <input 
                placeholder="الغرض من التبرع (مثل: زكاة، صدقة، كفالة)" required
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                value={newDonation.purpose}
                onChange={e => setNewDonation({...newDonation, purpose: e.target.value})}
              />

              <select 
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                value={newDonation.type}
                onChange={e => setNewDonation({...newDonation, type: e.target.value as any})}
              >
                <option value="cash">تبرع نقدي</option>
                <option value="kind">تبرع عيني (طعام/ملابس)</option>
                <option value="other">أخر</option>
              </select>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase">تخصيص التبرع (اختياري)</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setNewDonation({...newDonation, targetType: 'general', targetId: '', targetName: ''})}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold rounded-lg border transition-all",
                      newDonation.targetType === 'general' ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-400 border-gray-100"
                    )}
                  >عام</button>
                  <button
                    type="button"
                    onClick={() => setNewDonation({...newDonation, targetType: 'family'})}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold rounded-lg border transition-all",
                      newDonation.targetType === 'family' ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-400 border-gray-100"
                    )}
                  >لحالة معينة</button>
                  <button
                    type="button"
                    onClick={() => setNewDonation({...newDonation, targetType: 'campaign'})}
                    className={cn(
                      "flex-1 py-2 text-xs font-bold rounded-lg border transition-all",
                      newDonation.targetType === 'campaign' ? "bg-amber-600 text-white border-amber-600" : "bg-white text-gray-400 border-gray-100"
                    )}
                  >لحملة معينة</button>
                </div>
                
                {newDonation.targetType === 'family' && (
                  <select 
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none text-sm font-bold"
                    value={newDonation.targetId}
                    onChange={e => {
                      const f = families.find(fam => fam.id === e.target.value);
                      setNewDonation({...newDonation, targetId: e.target.value, targetName: f ? f.name : ''});
                    }}
                  >
                    <option value="">اختر العائلة / الحالة...</option>
                    {families.map(f => (
                      <option key={f.id} value={f.id}>{f.name} (#{f.fileNumber})</option>
                    ))}
                  </select>
                )}

                {newDonation.targetType === 'campaign' && (
                  <select 
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none text-sm font-bold"
                    value={newDonation.targetId}
                    onChange={e => {
                      const c = campaigns.find(camp => camp.id === e.target.value);
                      setNewDonation({...newDonation, targetId: e.target.value, targetName: c ? c.title : ''});
                    }}
                  >
                    <option value="">اختر الحملة...</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                )}
              </div>

              <textarea 
                placeholder="ملاحظات"
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none"
                value={newDonation.notes}
                onChange={e => setNewDonation({...newDonation, notes: e.target.value})}
              />
              <button className="w-full bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg mt-4">حفظ التبرع</button>
            </form>
          </div>
        </div>
      )}
      {/* Quick Donation Modal */}
      {isAddingQuickDonation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => {
            setIsAddingQuickDonation(false);
            setIsNewDonorMode(false);
          }} />
          <div className="bg-white rounded-[40px] w-full max-w-2xl relative z-10 p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-2xl font-black text-gray-900">تسجيل تبرع مباشر</h2>
                <p className="text-sm text-gray-400 font-bold mt-1">قم باختيار المتبرع أو إضافة متبرع جديد</p>
              </div>
              <button 
                onClick={() => setIsAddingQuickDonation(false)}
                className="p-2 hover:bg-gray-50 rounded-2xl text-gray-400 transition-colors"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleQuickDonationSubmit} className="space-y-8">
              {/* Donor Selection Selection */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">بيانات المتبرع</label>
                
                {!isNewDonorMode ? (
                  <div className="space-y-4">
                    <div className="relative group">
                      <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input 
                        type="text" 
                        placeholder="ابحث عن متبرع مسجل..."
                        className="w-full bg-gray-50 border border-transparent rounded-2xl py-4 pr-12 pl-4 focus:ring-4 focus:ring-indigo-50 focus:bg-white focus:border-indigo-200 outline-none transition-all font-bold"
                        value={quickDonorSearch}
                        onChange={(e) => setQuickDonorSearch(e.target.value)}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {donors
                        .filter(d => d.name.toLowerCase().includes(quickDonorSearch.toLowerCase()) || d.phone?.includes(quickDonorSearch))
                        .slice(0, 5)
                        .map(d => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setSelectedQuickDonor(d)}
                          className={cn(
                            "flex items-center justify-between p-4 rounded-2xl border transition-all text-right",
                            selectedQuickDonor?.id === d.id 
                              ? "bg-indigo-50 border-indigo-200" 
                              : "bg-white border-gray-100 hover:border-indigo-100"
                          )}
                        >
                          <div>
                            <p className="font-bold text-gray-900">{d.name}</p>
                            <p className="text-[10px] text-gray-400">{d.phone || 'بدون هاتف'}</p>
                          </div>
                          {selectedQuickDonor?.id === d.id && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setIsNewDonorMode(true);
                          setSelectedQuickDonor(null);
                        }}
                        className="flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-gray-100 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all font-bold text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>متبرع جديد غير مسجل في النظام؟</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-indigo-50/50 p-6 rounded-[32px] border border-indigo-100 space-y-4 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex justify-between items-center mb-2">
                       <h3 className="text-sm font-black text-indigo-900">تسجيل متبرع جديد أول مرة</h3>
                       <button 
                        type="button"
                        onClick={() => setIsNewDonorMode(false)}
                        className="text-[10px] font-black text-indigo-600 hover:underline"
                       >العودة للبحث</button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        placeholder="اسم المتبرع بالكامل" required
                        className="w-full bg-white border border-indigo-100 rounded-2xl px-5 py-3 outline-none font-bold placeholder:text-gray-300"
                        value={newDonor.name}
                        onChange={e => setNewDonor({...newDonor, name: e.target.value})}
                      />
                      <input 
                        type="tel" placeholder="رقم الهاتف" required
                        className="w-full bg-white border border-indigo-100 rounded-2xl px-5 py-3 outline-none font-bold placeholder:text-gray-300"
                        value={newDonor.phone}
                        onChange={e => setNewDonor({...newDonor, phone: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <select 
                        className="w-full bg-white border border-indigo-100 rounded-2xl px-5 py-3 outline-none font-bold"
                        value={newDonor.type}
                        onChange={e => setNewDonor({...newDonor, type: e.target.value as DonorType})}
                      >
                        <option value={DonorType.INDIVIDUAL}>فرد</option>
                        <option value={DonorType.ORGANIZATION}>مؤسسة</option>
                      </select>
                      <input 
                        type="email" placeholder="البريد الإلكتروني (اختياري)"
                        className="w-full bg-white border border-indigo-100 rounded-2xl px-5 py-3 outline-none font-bold placeholder:text-gray-300"
                        value={newDonor.email}
                        onChange={e => setNewDonor({...newDonor, email: e.target.value})}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Donation Details Section */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">تفاصيل التبرع</label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="relative col-span-1">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 w-5 h-5" />
                    <input 
                      type="number" placeholder="القيمة" required
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pr-4 pl-12 focus:ring-4 focus:ring-emerald-50 outline-none transition-all font-black"
                      value={newDonation.amount || ''}
                      onChange={e => setNewDonation({...newDonation, amount: Number(e.target.value)})}
                    />
                  </div>
                  <select 
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-4 outline-none font-bold text-sm"
                    value={newDonation.currency}
                    onChange={e => setNewDonation({...newDonation, currency: e.target.value as any})}
                  >
                    <option value="EGP">ج.م</option>
                    <option value="USD">$ USD</option>
                    <option value="SAR">ريال</option>
                  </select>
                  <input 
                    type="date" required
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 focus:ring-4 focus:ring-emerald-50 outline-none transition-all font-bold text-sm"
                    value={newDonation.date}
                    onChange={e => setNewDonation({...newDonation, date: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">ربط بالحملة (اختياري)</label>
                    <select 
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none font-bold text-sm"
                      value={newDonation.targetId}
                      onChange={e => {
                        const c = campaigns.find(camp => camp.id === e.target.value);
                        setNewDonation({
                          ...newDonation, 
                          targetType: e.target.value ? 'campaign' : 'general',
                          targetId: e.target.value,
                          targetName: c ? c.title : ''
                        });
                      }}
                    >
                      <option value="">تبرع عام (غير مرتبط بحملة)</option>
                      {campaigns.filter(c => c.status === 'active').map(c => (
                        <option key={c.id} value={c.id}>{c.title} (المتبقي: {(c.goalAmount - c.collectedAmount).toLocaleString()} ج.م)</option>
                      ))}
                    </select>
                  </div>
                  <input 
                    placeholder="الغرض من التبرع (صدقة، كفالة...)" required
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none font-bold"
                    value={newDonation.purpose}
                    onChange={e => setNewDonation({...newDonation, purpose: e.target.value})}
                  />
                  <select 
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none font-bold"
                    value={newDonation.type}
                    onChange={e => setNewDonation({...newDonation, type: e.target.value as any})}
                  >
                    <option value="cash">تبرع نقدي</option>
                    <option value="kind">تبرع عيني</option>
                  </select>
                </div>

                <textarea 
                  placeholder="ملاحظات إضافية..."
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 outline-none font-medium h-24 resize-none"
                  value={newDonation.notes}
                  onChange={e => setNewDonation({...newDonation, notes: e.target.value})}
                />
              </div>

              <button 
                type="submit"
                disabled={!isNewDonorMode && !selectedQuickDonor}
                className="w-full bg-indigo-600 text-white font-black py-5 rounded-[24px] shadow-xl hover:bg-indigo-700 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed text-lg"
              >
                تأكيد وتسجيل التبرع في النظام
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
