import React from 'react';
import { User } from 'firebase/auth';
import { LogOut, Users, Heart, LayoutDashboard, ClipboardList, Menu, X, Rocket, Globe, Bell, Info, CheckCircle, Settings as SettingsIcon, AlertCircle, Box, Receipt as ClaimIcon, CalendarDays, BookOpen } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, updateDoc, doc, where } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as LucideIcons from 'lucide-react';
import { AppModule, AppUser } from '../types';

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning';
  timestamp: any;
  read: boolean;
}

interface LayoutProps {
  user: User;
  userProfile: AppUser | null;
  modules: AppModule[];
  currentView: string;
  setView: (view: any) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function Layout({ user, userProfile, modules, currentView, setView, onLogout, children }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);

  const DEFAULT_MODULE_ITEMS = [
    { id: 'dashboard', label: 'لوحة التحكم', view: 'dashboard', iconName: 'LayoutDashboard', subModules: [] },
    { id: 'families', label: 'سجل العائلات', view: 'families', iconName: 'Users', subModules: [] },
    { id: 'assistance', label: 'طلبات المساعدات', view: 'assistance', iconName: 'Heart', subModules: [] },
    { id: 'donors', label: 'إدارة المتبرعين', view: 'donors', iconName: 'Rocket', subModules: [] },
    { id: 'campaigns', label: 'الحملات', view: 'campaigns', iconName: 'Rocket', subModules: [] },
    { id: 'store', label: 'المخازن', view: 'store', iconName: 'Box', subModules: [] },
    { id: 'claims', label: 'المطالبات الطبية', view: 'claims', iconName: 'Receipt', subModules: [] },
    { id: 'visits', label: 'الزيارات الميدانية', view: 'visits', iconName: 'MapPin', subModules: [] },
    { id: 'guide', label: 'دليل النظام', view: 'guide', iconName: 'BookOpen', subModules: [] },
    { id: 'settings', label: 'الإعدادات', view: 'settings', iconName: 'Settings', subModules: [] },
  ];

  React.useEffect(() => {
    // Notifications
    const q = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(10));
    const unsubNotify = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
    }, err => handleFirestoreError(err, OperationType.LIST, 'notifications'));

    return () => {
      unsubNotify();
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      console.error("Error marking notification as read:", err);
    }
  };

  // Filter and prepare menu items
  const menuItems = React.useMemo(() => {
    // If no modules initialized yet, show defaults
    if (modules.length === 0) return DEFAULT_MODULE_ITEMS;

    const filtered = modules
      .filter(mod => {
        if (!mod.isActive) return false;
        // Dashboard is always visible to authenticated users
        if (mod.path === 'dashboard') return true;
        
        // Show all to admins or if profile is still loading (to avoid flicker)
        if (!userProfile || userProfile.role === 'admin') return true;
        
        const permissions = userProfile.permissions || [];
        const perm = permissions.find(p => p.moduleId === mod.id);
        return perm && perm.canView;
      })
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map(mod => ({
        id: mod.id,
        label: mod.name,
        view: mod.path,
        iconName: mod.icon,
        subModules: mod.subModules
      }));

    return filtered.length > 0 ? filtered : DEFAULT_MODULE_ITEMS;
  }, [modules, userProfile]);

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-gray-900 font-sans selection:bg-emerald-100 selection:text-emerald-900" dir="rtl">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-100 h-16 md:h-20 flex items-center px-4 md:px-12 justify-between sticky top-0 z-50 shadow-sm transition-all">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2.5 md:hidden hover:bg-gray-100 rounded-2xl transition-colors text-gray-500"
          >
            <AnimatePresence mode="wait">
              {isMobileMenuOpen ? (
                <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
                  <LucideIcons.X className="w-6 h-6" />
                </motion.div>
              ) : (
                <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
                  <LucideIcons.Menu className="w-6 h-6" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
          <div className="flex items-center gap-3">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 md:w-12 md:h-12 bg-emerald-600 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200"
            >
              <LucideIcons.Heart className="text-white fill-white w-5 h-5 md:w-7 md:h-7" />
            </motion.div>
            <div className="hidden sm:block">
              <h1 className="text-lg md:text-xl font-black tracking-tight leading-none text-gray-900">أوبن تشاريتي</h1>
              <p className="text-[8px] md:text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest hidden lg:block">المنصة المتكاملة للعمل الخيري</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
          <div className="relative">
            <button 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={cn(
                "p-2 md:p-3 rounded-2xl transition-all relative group",
                unreadCount > 0 ? "bg-amber-50 text-amber-600 shadow-sm" : "bg-gray-50 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
              )}
            >
              <LucideIcons.Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center ring-2 ring-white transform translate-x-1 -translate-y-1">
                  {unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {isNotificationsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute left-0 mt-4 w-96 bg-white rounded-[32px] shadow-3xl border border-gray-100 z-50 overflow-hidden"
                  >
                    <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                      <h4 className="font-black text-gray-900">الاشعارات</h4>
                      <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                        الأحدث
                      </span>
                    </div>
                    
                    <div className="max-h-[400px] overflow-y-auto">
                      {notifications.map((n) => (
                        <button 
                          key={n.id}
                          onClick={() => { markAsRead(n.id); setIsNotificationsOpen(false); }}
                          className={cn(
                            "w-full p-4 flex gap-4 text-right transition-colors border-b border-gray-50 last:border-0",
                            !n.read ? "bg-emerald-50/30 hover:bg-emerald-50/50" : "hover:bg-gray-50"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                            n.type === 'success' ? "bg-emerald-100 text-emerald-600" :
                            n.type === 'info' ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"
                          )}>
                            {n.type === 'success' ? <LucideIcons.CheckCircle className="w-5 h-5" /> : <LucideIcons.Info className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 leading-relaxed mb-1">{n.message}</p>
                            <p className="text-[10px] text-gray-400 font-bold">
                              {n.timestamp?.toDate ? new Date(n.timestamp.toDate()).toLocaleString('ar-EG') : 'الآن'}
                            </p>
                          </div>
                        </button>
                      ))}
                      {notifications.length === 0 && (
                        <div className="p-12 text-center text-gray-400 italic">
                          لا توجد إشعارات حالياً
                        </div>
                      )}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={() => setView('public')}
            className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
          >
            <LucideIcons.Globe className="w-4 h-4" />
            تصفح الموقع
          </button>
          
          <div className="h-8 w-px bg-gray-100 hidden sm:block" />

          <div className="text-left md:text-right hidden sm:block">
            <p className="text-sm font-black leading-none">{user.displayName || 'متحكم'}</p>
            <p className="text-[10px] text-gray-400 mt-1 font-bold uppercase tracking-tight">{user.email}</p>
          </div>
          <img 
            src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=059669&color=fff`} 
            className="w-10 h-10 rounded-2xl ring-4 ring-emerald-50 shadow-sm"
            alt="avatar"
          />
          <button 
            onClick={onLogout}
            className="p-2.5 bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            title="تسجيل خروج"
          >
            <LucideIcons.LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex overflow-hidden">
        {/* Sidebar */}
        <aside className={cn(
          "fixed inset-y-0 right-0 z-40 w-72 bg-white border-l border-gray-100 transition-all duration-500 ease-in-out md:relative md:translate-x-0 pt-20 md:pt-10 h-screen md:h-[calc(100vh-80px)] shadow-[0_0_50px_0_rgba(0,0,0,0.05)] md:shadow-none",
          isMobileMenuOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        )}>
          <nav className="px-4 space-y-1 md:space-y-2 overflow-y-auto max-h-full pb-20 custom-scrollbar">
            {menuItems.map((item) => {
              const Icon = (LucideIcons as any)[item.iconName] || LucideIcons.LayoutDashboard;
              return (
                 <React.Fragment key={item.id}>
                    <button
                      onClick={() => {
                        setView(item.view);
                        setIsMobileMenuOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-sm font-bold transition-all relative group overflow-hidden",
                        currentView === item.view 
                          ? "bg-emerald-600 text-white shadow-xl shadow-emerald-100" 
                          : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      <Icon className={cn(
                        "w-5 h-5 transition-colors",
                        currentView === item.view ? "text-white" : "text-gray-400 group-hover:text-emerald-500"
                      )} />
                      <span className="flex-1 text-right">{item.label}</span>
                      {currentView === item.view && (
                        <motion.div 
                          layoutId="sidebar-active"
                          className="absolute right-0 w-1.5 h-6 bg-white/40 rounded-l-full"
                        />
                      )}
                    </button>

                    {/* Render Sub-modules if parent is active */}
                    {currentView === item.view && item.subModules && item.subModules.length > 0 && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="mr-14 space-y-1 mt-1 mb-3 border-r-2 border-emerald-100/50 pr-4"
                      >
                        {item.subModules
                          .sort((a, b) => a.order - b.order)
                          .map(sm => (
                            <div key={sm.id} className="py-2 text-[11px] font-black text-gray-500 hover:text-emerald-600 cursor-default flex items-center gap-2">
                               <div className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                               {sm.name}
                            </div>
                          ))
                        }
                      </motion.div>
                    )}
                 </React.Fragment>
              );
            })}
          </nav>

          <div className="absolute bottom-10 left-4 right-4 p-6 bg-emerald-50 rounded-3xl border border-emerald-100 hidden lg:block">
            <p className="text-xs font-bold text-emerald-800 mb-2">كيف حالك اليوم؟</p>
            <p className="text-[10px] text-emerald-600 leading-relaxed font-medium">نشكرك على مجهودك العظيم في خدمة المجتمع.</p>
            <button className="mt-4 w-full py-2 bg-emerald-600 text-white text-[10px] font-black rounded-xl hover:bg-emerald-700 transition-all">تواصل مع الدعم</button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-10 max-w-[1600px] mx-auto w-full min-h-[calc(100vh-80px)] overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
