import React, { useState, useEffect } from 'react';
import { auth, signIn } from './lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { Layout } from './components/Layout';
import { FamilyList } from './components/FamilyList';
import { FamilyDetails } from './components/FamilyDetails';
import { AssistanceLog } from './components/AssistanceLog';
import { DonorManagement } from './components/DonorManagement';
import { Dashboard } from './components/Dashboard';
import { CampaignManagement } from './components/CampaignManagement';
import { PublicWebsite } from './components/PublicWebsite';
import { Settings } from './components/Settings';
import { EmergencyManagement } from './components/EmergencyManagement';
import { StoreManagement } from './components/StoreManagement';
import { MedicalClaims } from './components/MedicalClaims';
import { VisitsManagement } from './components/VisitsManagement';
import { SystemGuide } from './components/SystemGuide';
import { LogIn, Heart, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { AppUser, AppModule } from './types';

type View = 'families' | 'details' | 'assistance' | 'dashboard' | 'donors' | 'campaigns' | 'public' | 'settings' | 'emergencies' | 'store' | 'claims' | 'visits' | 'guide';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<AppUser | null>(null);
  const [modules, setModules] = useState<AppModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('public'); // Default to public website
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!user?.email) return;

    const q = query(collection(db, 'users'), where('email', '==', user.email));
    const unsubscribeProfile = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setUserProfile({ id: snap.docs[0].id, ...snap.docs[0].data() } as AppUser);
      } else {
        setUserProfile(null);
      }
    }, err => {
      handleFirestoreError(err, OperationType.LIST, 'user-profile');
    });

    const qModules = query(collection(db, 'modules'), orderBy('order', 'asc'));
    const unsubscribeModules = onSnapshot(qModules, (snap) => {
      setModules(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppModule)));
      setLoading(false);
    }, err => {
      handleFirestoreError(err, OperationType.LIST, 'modules');
      setLoading(false);
    });

    return () => {
      unsubscribeProfile();
      unsubscribeModules();
    };
  }, [user?.email]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  // Allow "public" view even without login
  if (view === 'public') {
    return (
      <PublicWebsite 
        onLoginRequest={() => setView('dashboard')} 
        isLoggedIn={!!user}
      />
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex flex-col items-center justify-center p-4 relative overflow-hidden" dir="rtl">
        {/* Background decorations with motion */}
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-50 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 opacity-60" 
        />
        <motion.div 
          animate={{ scale: [1, 1.2, 1], rotate: [0, -5, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 opacity-60" 
        />
        
        <motion.div 
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-[48px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] p-12 text-center border border-white relative z-10"
        >
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
            className="w-28 h-28 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-[32px] flex items-center justify-center mx-auto mb-10 shadow-xl shadow-emerald-200"
          >
            <Heart className="w-14 h-14 text-white fill-white/20" />
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-4xl font-black text-gray-900 mb-3 font-sans tracking-tight"
          >
            أوبن تشاريتي
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-gray-500 mb-12 leading-relaxed font-medium text-lg px-4"
          >
            إدارة متقدّمة للعمل الخيري.. حيث تلتقي التكنولوجيا مع الإنسانية.
          </motion.p>
          
          <div className="space-y-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => signIn()}
              className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-black text-white font-black py-5 px-8 rounded-[24px] transition-all shadow-2xl shadow-gray-200"
            >
              <LogIn className="w-6 h-6" />
              <span className="font-sans text-lg">دخول بوابة الإدارة</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setView('public')}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-emerald-50 text-emerald-700 border-2 border-emerald-100 font-black py-5 px-8 rounded-[24px] transition-all shadow-sm"
            >
              <Globe className="w-6 h-6" />
              <span className="font-sans text-lg">زيارة الموقع العام</span>
            </motion.button>
          </div>
          
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-12 flex items-center justify-center gap-2"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Open Charity v2.0 • Pro Edition</span>
          </motion.div>
        </motion.div>

        {/* Footer Link */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-8 text-sm font-bold text-gray-400"
        >
          مؤسسة خيرية مسجلة برقم ١٤٢٥
        </motion.div>
      </div>
    );
  }

  const navigateToFamily = (id: string) => {
    setSelectedFamilyId(id);
    setView('details');
  };

  return (
    <Layout 
      user={user} 
      userProfile={userProfile}
      modules={modules}
      currentView={view} 
      setView={setView} 
      onLogout={() => {
        signOut(auth);
        setView('public');
      }}
    >
      <AnimatePresence mode="wait">
        {view === 'families' && (
          <motion.div
            key="families"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="w-full"
          >
            <FamilyList onSelect={navigateToFamily} userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
        {view === 'details' && selectedFamilyId && (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full"
          >
            <FamilyDetails 
              familyId={selectedFamilyId} 
              onBack={() => setView('families')} 
              userProfile={userProfile}
              modules={modules}
            />
          </motion.div>
        )}
        {view === 'assistance' && (
          <motion.div
            key="assistance"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <AssistanceLog userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
        {view === 'donors' && (
          <motion.div
            key="donors"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <DonorManagement userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
        {view === 'campaigns' && (
          <motion.div
            key="campaigns"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <CampaignManagement userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
        {view === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <Dashboard userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
        {view === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="w-full"
          >
            <Settings userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
        {view === 'emergencies' && (
          <motion.div
            key="emergencies"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <EmergencyManagement userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
        {view === 'store' && (
          <motion.div
            key="store"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <StoreManagement userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
        {view === 'claims' && (
          <motion.div
            key="claims"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <MedicalClaims userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
        {view === 'visits' && (
          <motion.div
            key="visits"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <VisitsManagement userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
        {view === 'guide' && (
          <motion.div
            key="guide"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <SystemGuide userProfile={userProfile} modules={modules} />
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
