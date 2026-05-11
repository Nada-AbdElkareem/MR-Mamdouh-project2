import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { StoreItem, AppUser, AppModule } from '../types';
import { Plus, Search, Package, Box, Trash2, Edit2, AlertTriangle, History, ArrowUpRight, ArrowDownRight, Warehouse, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

export function StoreManagement({ userProfile, modules }: { userProfile: AppUser | null, modules: AppModule[] }) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [isQuantityModal, setIsQuantityModal] = useState(false);
  const [quantityDelta, setQuantityDelta] = useState<number>(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [newItem, setNewItem] = useState({
    name: '',
    category: 'food',
    quantity: 0,
    unit: 'كجم',
    minQuantity: 5,
    location: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'store_items'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreItem)));
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'store_items'));
    return unsub;
  }, []);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const docRef = await addDoc(collection(db, 'store_items'), {
        ...newItem,
        updatedAt: serverTimestamp()
      });

      // Check for low stock notification immediately if added with low quantity
      if (newItem.quantity <= newItem.minQuantity) {
        await addDoc(collection(db, 'notifications'), {
          title: 'تنبيه: صنف رصيده منخفض',
          message: `تم إضافة صنف "${newItem.name}" برصيد منخفض (${newItem.quantity} ${newItem.unit})`,
          type: 'warning',
          timestamp: serverTimestamp(),
          read: false,
          category: 'inventory',
          itemId: docRef.id
        });
      }

      setIsAddingItem(false);
      setNewItem({ name: '', category: 'food', quantity: 0, unit: 'كجم', minQuantity: 5, location: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'store_items');
    }
  };

  const handleUpdateQuantity = async () => {
    if (!selectedItem) return;
    try {
      const newQuantity = selectedItem.quantity + quantityDelta;
      await updateDoc(doc(db, 'store_items', selectedItem.id), {
        quantity: newQuantity,
        updatedAt: serverTimestamp()
      });

      // Check for low stock notification
      if (newQuantity <= selectedItem.minQuantity && selectedItem.quantity > selectedItem.minQuantity) {
        await addDoc(collection(db, 'notifications'), {
          title: 'تنبيه: مخزون منخفض',
          message: `وصل صنف "${selectedItem.name}" إلى الحد الأدنى للمخزون (${newQuantity} ${selectedItem.unit})`,
          type: 'warning',
          timestamp: serverTimestamp(),
          read: false,
          category: 'inventory',
          itemId: selectedItem.id
        });
      }

      setIsQuantityModal(false);
      setSelectedItem(null);
      setQuantityDelta(0);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `store_items/${selectedItem.id}`);
    }
  };

  const categories = Array.from(new Set(items.map(i => i.category)));

  const filteredItems = items.filter(i => {
    if (categoryFilter !== 'all' && i.category !== categoryFilter) return false;
    if (search && !i.name.includes(search)) return false;
    return true;
  });

  const lowStockItems = items.filter(i => i.quantity <= i.minQuantity);

  const exportData = (format: 'csv' | 'xlsx') => {
    const dataToExport = items.map(item => ({
      "الصنف": item.name,
      "الفئة": item.category,
      "الرصيد الحالي": item.quantity,
      "الوحدة": item.unit,
      "الحد الأدنى": item.minQuantity,
      "الموقع": item.location || 'غير محدد'
    }));

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory");
      XLSX.writeFile(wb, `inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      const headers = ["الصنف", "الفئة", "الرصيد الحالي", "الوحدة", "الحد الأدنى", "الموقع"];
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(row => Object.values(row).join(','))
      ].join('\n');

      const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">إدارة المخازن والمستودعات</h2>
          <p className="text-gray-400 font-bold mt-1 uppercase tracking-widest text-xs">تتبع المخزون والوارد والمنصرف</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => exportData('xlsx')}
            className="flex items-center gap-2 bg-white border border-gray-100 hover:bg-gray-50 text-emerald-600 px-6 py-4 rounded-[24px] font-black transition-all shadow-sm"
          >
            <Download className="w-5 h-5" />
            تصدير XLSX
          </button>
          <button 
            onClick={() => exportData('csv')}
            className="flex items-center gap-2 bg-white border border-gray-100 hover:bg-gray-50 text-gray-600 px-6 py-4 rounded-[24px] font-black transition-all shadow-sm"
          >
            <Download className="w-5 h-5" />
            تصدير CSV
          </button>
          <button 
            onClick={() => setIsAddingItem(true)}
            className="bg-indigo-600 text-white px-8 py-4 rounded-[24px] font-black flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
          >
            <Plus className="w-6 h-6" />
            إضافة صنف جديد
          </button>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-rose-50 border border-rose-100 p-6 rounded-[32px] flex flex-col md:flex-row items-center gap-6"
        >
          <div className="w-16 h-16 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-100 shrink-0">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="flex-1 text-center md:text-right">
            <h3 className="text-rose-900 font-black text-lg">تحذير: أصناف منخفضة المخزون</h3>
            <p className="text-rose-600/70 font-bold text-sm">يوجد {lowStockItems.length} صنف يحتاج لطلب توريد عاجل لتجاوزه الحد الأدنى للمخزون.</p>
          </div>
          <div className="flex overflow-hidden -space-x-4 space-x-reverse pr-4">
             {lowStockItems.slice(0, 5).map(item => (
                <div key={item.id} className="w-10 h-10 rounded-full bg-white border-2 border-rose-100 flex items-center justify-center text-[8px] font-black text-rose-600 text-center px-1">
                   {item.name.slice(0, 8)}..
                </div>
             ))}
             {lowStockItems.length > 5 && (
                <div className="w-10 h-10 rounded-full bg-rose-600 border-2 border-rose-100 flex items-center justify-center text-[10px] font-black text-white">
                   +{lowStockItems.length - 5}
                </div>
             )}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-3 relative">
          <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            className="w-full bg-white border border-gray-100 rounded-[24px] pr-14 pl-6 py-5 outline-none font-bold text-lg shadow-sm focus:border-indigo-200 transition-all"
            placeholder="البحث عن صنف بالمخزن..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select 
          className="bg-white border border-gray-100 rounded-[24px] px-8 py-5 outline-none font-black text-gray-600 shadow-sm"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          <option value="all">كل التصنيفات</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="space-y-12">
        {categories.map(category => (
          <div key={category} className="space-y-6">
            <div className="flex items-center gap-4 border-b border-indigo-50 pb-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                <Box className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-black text-gray-900 capitalize">
                {category === 'food' ? 'مواد غذائية' : 
                 category === 'medical' ? 'مستلزمات طبية' :
                 category === 'clothing' ? 'ملابس وأغطية' :
                 category === 'furniture' ? 'أثاث وأجهزة' :
                 category === 'education' ? 'أدوات تعليمية' : category}
              </h3>
              <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-[10px] font-black tabular-nums">
                {items.filter(i => i.category === category).length} صنف
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredItems.filter(i => i.category === category).map((item) => (
                <motion.div 
                  layout
                  key={item.id} 
                  className={cn(
                    "p-8 bg-white rounded-[40px] border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all group relative overflow-hidden",
                    item.quantity <= item.minQuantity && "ring-2 ring-rose-500 shadow-rose-50"
                  )}
                >
                  {item.quantity <= item.minQuantity && (
                    <div className="absolute top-6 left-6 bg-rose-600 text-white px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1.5 animate-pulse">
                      <AlertTriangle className="w-3 h-3" />
                      مخزون حرج
                    </div>
                  )}

                  <div className="flex gap-5 mb-8">
                    <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600">
                      <Package className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-black text-gray-900 uppercase group-hover:text-indigo-600 transition-colors">{item.name}</h3>
                      <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest">{item.category}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="p-5 bg-gray-50 rounded-3xl text-center space-y-1">
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">الرصيد الحالي</p>
                      <p className="text-2xl font-black text-gray-900 tabular-nums">{item.quantity} <span className="text-xs text-gray-400 font-bold">{item.unit}</span></p>
                    </div>
                    <button 
                      onClick={() => { setSelectedItem(item); setIsQuantityModal(true); }}
                      className="p-5 bg-indigo-600/5 hover:bg-indigo-600/10 rounded-3xl text-center space-y-1 transition-all"
                    >
                      <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">تحكم بالكمية</p>
                      <div className="flex items-center justify-center gap-2">
                        <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                        <ArrowDownRight className="w-4 h-4 text-rose-500" />
                      </div>
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold pt-6 border-t border-gray-50">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Warehouse className="w-4 h-4" />
                      <span>{item.location || 'مخزن عام'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                      <History className="w-4 h-4" />
                      <span>منذ {item.updatedAt ? 'قليل' : '--'}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div className="py-20 text-center text-gray-300 font-bold border-2 border-dashed border-gray-50 rounded-[48px]">
            لم يتم العثور على أي أصناف مطابقة للبحث
          </div>
        )}
      </div>

      <AnimatePresence>
        {(isAddingItem || isQuantityModal) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsAddingItem(false); setIsQuantityModal(false); }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[48px] w-full max-w-xl relative z-10 p-10 shadow-3xl"
            >
              {isAddingItem ? (
                <>
                  <h2 className="text-2xl font-black text-gray-900 mb-8">إضافة صنف جديد للمستودع</h2>
                  <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">اسم الصنف</label>
                      <input 
                        required
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all text-lg"
                        value={newItem.name}
                        onChange={e => setNewItem({...newItem, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">التصنيف</label>
                      <select 
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-6 py-4 outline-none font-bold shadow-sm transition-all"
                        value={newItem.category}
                        onChange={e => setNewItem({...newItem, category: e.target.value})}
                      >
                        <option value="food">غذائي</option>
                        <option value="medical">طبي/دواء</option>
                        <option value="clothing">ملابس/أغطية</option>
                        <option value="furniture">أثاث/أدوات كهربائية</option>
                        <option value="education">أدوات مدرسية</option>
                        <option value="general">عام</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الوحدة</label>
                      <input 
                        placeholder="كجم، كرتونة، علبة..."
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-6 py-4 outline-none font-bold"
                        value={newItem.unit}
                        onChange={e => setNewItem({...newItem, unit: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الكمية الافتتاحية</label>
                      <input 
                        type="number"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-6 py-4 outline-none font-bold"
                        value={newItem.quantity}
                        onChange={e => setNewItem({...newItem, quantity: Number(e.target.value)})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">الحد الأدنى (للإنذار)</label>
                      <input 
                        type="number"
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-indigo-600/20 rounded-2xl px-6 py-4 outline-none font-bold"
                        value={newItem.minQuantity}
                        onChange={e => setNewItem({...newItem, minQuantity: Number(e.target.value)})}
                      />
                    </div>
                    <div className="md:col-span-2 pt-6 flex gap-4">
                      <button type="submit" className="flex-1 bg-indigo-600 text-white py-5 rounded-3xl font-black text-lg shadow-xl shadow-indigo-100">حفظ الصنف</button>
                      <button type="button" onClick={() => setIsAddingItem(false)} className="px-10 bg-gray-100 text-gray-500 py-5 rounded-3xl font-black text-lg">إلغاء</button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-indigo-50 rounded-[32px] flex items-center justify-center text-indigo-600 mx-auto mb-4">
                      <Box className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900">{selectedItem?.name}</h2>
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-1">تعديل رصيد المخزن</p>
                  </div>

                  <div className="space-y-8">
                    <div className="flex items-center justify-center gap-12 py-10 bg-gray-50 rounded-[40px] px-8">
                      <button 
                        onClick={() => setQuantityDelta(prev => prev - 1)}
                        className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-gray-400 hover:text-rose-600 hover:border-rose-100 border border-gray-100 transition-all font-black text-3xl shadow-sm"
                      >
                        -
                      </button>
                      <div className="text-center min-w-[120px]">
                        <p className={cn(
                          "text-5xl font-black tabular-nums transition-colors",
                          quantityDelta > 0 ? "text-emerald-600" : quantityDelta < 0 ? "text-rose-600" : "text-gray-900"
                        )}>
                          {quantityDelta > 0 ? `+${quantityDelta}` : quantityDelta}
                        </p>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">{selectedItem?.unit}</p>
                      </div>
                      <button 
                        onClick={() => setQuantityDelta(prev => prev + 1)}
                        className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:border-indigo-100 border border-gray-100 transition-all font-black text-3xl shadow-sm"
                      >
                        +
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button 
                         onClick={handleUpdateQuantity}
                         className="bg-indigo-600 text-white py-5 rounded-3xl font-black text-lg shadow-xl shadow-indigo-100"
                      >
                         تأكيد الحركة
                      </button>
                      <button 
                         onClick={() => { setIsQuantityModal(false); setQuantityDelta(0); }}
                         className="bg-gray-100 text-gray-500 py-5 rounded-3xl font-black text-lg"
                      >
                         إلغاء
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
