import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, limit, addDoc, doc, updateDoc, increment, serverTimestamp, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Campaign, Family } from '../types';
import { Heart, Users, Globe, ArrowRight, CheckCircle, Smartphone, MapPin, Calculator, ShieldCheck, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface PublicWebsiteProps {
  onLoginRequest: () => void;
  isLoggedIn: boolean;
}

export function PublicWebsite({ onLoginRequest, isLoggedIn }: PublicWebsiteProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'campaigns'), where('status', '==', 'active'), limit(6));
    const unsub = onSnapshot(q, (snap) => {
      const fetchedCampaigns = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Campaign))
        .filter(c => c.collectedAmount < c.goalAmount);
      setCampaigns(fetchedCampaigns);
      setLoading(false);

      // Check if URL has a campaign slug
      const path = window.location.pathname;
      if (path.startsWith('/campaign/')) {
        const slug = path.split('/campaign/')[1];
        const campaign = fetchedCampaigns.find(c => c.slug === slug);
        if (campaign) {
          setSelectedCampaign(campaign);
        }
      }
    }, err => handleFirestoreError(err, OperationType.LIST, 'campaigns'));
    return unsub;
  }, []);

  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [donateAmount, setDonateAmount] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [donationSuccess, setDonationSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDonate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign || !donateAmount) return;
    
    setIsSubmitting(true);
    try {
      const amount = Number(donateAmount);
      let targetDonorId = 'web_donor';
      
      // 1. Resolve Donor (Search by phone if provided)
      if (donorPhone) {
        const donorsRef = collection(db, 'donors');
        const q = query(donorsRef, where('phone', '==', donorPhone), limit(1));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          // Existing donor found
          const donorDoc = querySnapshot.docs[0];
          targetDonorId = donorDoc.id;
          
          // Update existing donor total
          await updateDoc(doc(db, 'donors', targetDonorId), {
            totalDonated: increment(amount),
            lastDonationDate: new Date().toISOString().split('T')[0],
            updatedAt: serverTimestamp()
          });
        } else {
          // Create new donor from web data
          const newDonorRef = await addDoc(collection(db, 'donors'), {
            name: donorName || 'م فاعل خير',
            phone: donorPhone,
            type: 'individual',
            totalDonated: amount,
            lastDonationDate: new Date().toISOString().split('T')[0],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            notes: 'تمت الإضافة تلقائياً من الموقع الإلكتروني'
          });
          targetDonorId = newDonorRef.id;
        }
      }
      
      // 2. Create Donation Record
      await addDoc(collection(db, 'donations'), {
        amount,
        currency: 'EGP',
        date: new Date().toISOString().split('T')[0],
        type: 'cash',
        targetType: 'campaign',
        targetId: selectedCampaign.id,
        targetName: selectedCampaign.title,
        donorId: targetDonorId,
        donorName: donorName || 'م فاعل خير',
        donorPhone: donorPhone,
        notes: 'تبرع من الموقع الإلكتروني',
        createdAt: serverTimestamp()
      });

      // 3. Update Campaign Counter
      await updateDoc(doc(db, 'campaigns', selectedCampaign.id), {
        collectedAmount: increment(amount)
      });

      setDonationSuccess(true);
      setTimeout(() => {
        setDonationSuccess(false);
        setSelectedCampaign(null);
        setDonateAmount('');
        setDonorName('');
        setDonorPhone('');
      }, 4000);
    } catch (err) {
      console.error("Donation failed:", err);
      alert("عذراً، حدث خطأ أثناء معالجة التبرع. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-emerald-100 selection:text-emerald-900" dir="rtl">
      {/* Donation Modal */}
      <AnimatePresence>
        {selectedCampaign && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" 
              onClick={() => !donationSuccess && setSelectedCampaign(null)} 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-xl relative z-10 p-10 shadow-2xl overflow-hidden"
            >
              {donationSuccess ? (
                <div className="text-center py-10 animate-in zoom-in duration-500">
                  <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-emerald-600" />
                  </div>
                  <h3 className="text-3xl font-black text-gray-900 mb-2">شكراً لعطائك!</h3>
                  <p className="text-gray-500 font-bold">تم تسجيل تبرعك بنجاح. سيتم إرسال تقرير الأثر إليك قريباً.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-4 mb-8">
                    <img src={selectedCampaign.imageUrl} className="w-20 h-20 rounded-2xl object-cover" alt="" />
                    <div>
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">أنت تتبرع لـ</p>
                      <h3 className="text-xl font-black text-gray-900">{selectedCampaign.title}</h3>
                    </div>
                  </div>

                  <form onSubmit={handleDonate} className="space-y-6">
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase mb-3 mr-2">مبلغ التبرع (ج.م)</label>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {['100', '500', '1000'].map(amount => (
                          <button 
                            key={amount}
                            type="button"
                            onClick={() => setDonateAmount(amount)}
                            className={cn(
                              "py-3 rounded-2xl font-black transition-all border-2",
                              donateAmount === amount ? "bg-emerald-600 border-emerald-600 text-white" : "bg-gray-50 border-transparent hover:bg-gray-100 text-gray-600"
                            )}
                          >
                            {amount}
                          </button>
                        ))}
                      </div>
                      <input 
                        type="number" 
                        placeholder="أو أدخل مبلغاً آخر..."
                        className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-6 py-4 outline-none transition-all font-bold text-center text-xl"
                        value={donateAmount}
                        onChange={e => setDonateAmount(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-4">
                       <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-gray-400 uppercase mr-2">الاسم (اختياري)</label>
                             <input 
                               className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-5 py-3 outline-none font-bold"
                               value={donorName}
                               onChange={e => setDonorName(e.target.value)}
                               placeholder="فاعل خير"
                             />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-black text-gray-400 uppercase mr-2">رقم الهاتف</label>
                             <input 
                               className="w-full bg-gray-50 border-2 border-transparent focus:border-emerald-600/20 focus:bg-white rounded-2xl px-5 py-3 outline-none font-bold"
                               value={donorPhone}
                               onChange={e => setDonorPhone(e.target.value)}
                               placeholder="01xxxxxxxxx"
                             />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-3">
                      <button 
                        disabled={isSubmitting}
                        className="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 disabled:opacity-50 disabled:grayscale"
                      >
                        {isSubmitting ? 'جاري المعالجة...' : 'تأكيد التبرع الآن'}
                      </button>
                      <p className="text-[10px] text-center text-gray-400 font-bold">بضغطك على تأكيد التبرع، أنت توافق على شروط الاستخدام وسياسة الخصوصية.</p>
                    </div>
                  </form>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
              <Heart className="text-white fill-white w-6 h-6" />
            </div>
            <span className="text-xl font-black tracking-tight">أوبن تشاريتي</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#about" className="text-sm font-bold text-gray-500 hover:text-emerald-600 transition-colors">عن المنصة</a>
            <a href="#campaigns" className="text-sm font-bold text-gray-500 hover:text-emerald-600 transition-colors">الحملات النشطة</a>
            <a href="#features" className="text-sm font-bold text-gray-500 hover:text-emerald-600 transition-colors">المميزات</a>
          </div>

          <button 
            onClick={onLoginRequest}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-100 text-sm"
          >
            {isLoggedIn ? 'لوحة التحكم' : 'تسجيل الدخول'}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-50 rounded-full blur-[100px] -z-10 translate-x-1/3 -translate-y-1/3" />
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-xs font-black uppercase tracking-widest mb-6">
              <Globe className="w-3 h-3" />
              المستقبل الرقمي للمؤسسات الخيرية
            </div>
            <h1 className="text-5xl md:text-7xl font-black text-gray-900 leading-[1.1] mb-8">
              إدارة العمل الخيري <br /> 
              <span className="text-emerald-600">بشفافية مطلقة</span>
            </h1>
            <p className="text-xl text-gray-500 leading-relaxed mb-10 max-w-lg">
              أول منصة عربية مفتوحة المصدر لإدارة العائلات، المتبرعين، والحملات بكفاءة عالية وأمان تام.
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-black text-lg hover:scale-105 transition-all shadow-2xl flex items-center gap-3 group">
                ابدأ الآن مجاناً
                <ArrowRight className="w-5 h-5 group-hover:translate-x-[-4px] transition-transform" />
              </button>
              <button className="bg-white text-gray-900 border-2 border-gray-100 px-8 py-4 rounded-2xl font-black text-lg hover:bg-gray-50 transition-all">
                تصفح المشاريع
              </button>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            <div className="bg-emerald-600 rounded-[40px] aspect-square rotate-3 absolute inset-0 -z-10 opacity-10" />
            <img 
              src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?q=80&w=2070&auto=format&fit=crop" 
              className="rounded-[40px] shadow-2xl w-full h-full object-cover border-8 border-white"
              alt="Charity"
            />
            {/* Stats Card Overlay */}
            <div className="absolute -bottom-10 -right-10 bg-white p-8 rounded-3xl shadow-2xl border border-gray-50 max-w-xs animate-bounce-slow">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-emerald-100 rounded-2xl">
                  <Calculator className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-black text-gray-900">98%</p>
                  <p className="text-xs text-gray-400 font-bold">نسبة كفاءة التوزيع</p>
                </div>
              </div>
              <div className="w-full bg-gray-50 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-[98%]" />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h2 className="text-4xl font-black text-gray-900 mb-6">كل ما تحتاجه في مكان واحد</h2>
            <p className="text-gray-500 font-medium">نظام متكامل صمم خصيصاً ليلبي احتياجات المؤسسات الخيرية في الوطن العربي.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: ShieldCheck, title: "أمان وشفافية", desc: "تشفير كامل للبيانات مع سجل تدقيق لكل عملية مالية أو إدارية." },
              { icon: Users, title: "إدارة العائلات", desc: "ملفات تفصيلية لكل عائلة تشمل الحالة الصحية، التعليمية والاجتماعية." },
              { icon: Smartphone, title: "تطبيقات ميدانية", desc: "إمكانية الوصول للنظام من أي مكان للمتابعة الميدانية وتسجيل الزيارات." },
              { icon: MapPin, title: "خرائط تفاعلية", desc: "تتبع جغرافي دقيق لمواقع العائلات وحملات التوزيع الميدانية." },
              { icon: Heart, title: "بوابة المتبرعين", desc: "تجربة تبرع سهلة وسريعة مع تقارير دورية للمتبرع عن أثر مساهمته." },
              { icon: ClipboardList, title: "تقارير ذكية", desc: "لوحة بيانات ذكية (Dashboard) تعرض إحصائيات حية حول الأداء والميزانية." }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="bg-white p-10 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl transition-all"
              >
                <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6">
                  <feature.icon className="w-7 h-7 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                <p className="text-gray-500 leading-relaxed text-sm font-medium">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Campaigns Section */}
      <section id="campaigns" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-16">
            <div className="max-w-xl">
              <h2 className="text-4xl font-black text-gray-900 mb-6">ساهم في تغيير حياة الآخرين</h2>
              <p className="text-gray-500 font-medium">حملات نشطة تحتاج لدعمك الآن. كن جزءاً من الأثر الإيجابي.</p>
            </div>
            <button className="hidden md:flex items-center gap-2 text-emerald-600 font-black hover:gap-3 transition-all">
              تصفح كل الحملات
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {campaigns.length > 0 ? campaigns.map((campaign) => (
              <div key={campaign.id} className="group bg-white rounded-[40px] border border-gray-100 overflow-hidden shadow-sm hover:shadow-2xl transition-all">
                <div className="aspect-[16/10] overflow-hidden relative">
                  <img src={campaign.imageUrl || 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?q=80&w=2070&auto=format&fit=crop'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={campaign.title} />
                  <div className="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur rounded-full text-[10px] font-black text-emerald-700">حملة نشطة</div>
                </div>
                <div className="p-8">
                  <h3 className="text-xl font-black text-gray-900 mb-3 line-clamp-1">{campaign.title}</h3>
                  <p className="text-sm text-gray-500 mb-6 line-clamp-2 leading-relaxed">{campaign.description}</p>
                  
                  <div className="space-y-3 mb-8">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                      <span className="text-emerald-600">تم جمع: {campaign.collectedAmount.toLocaleString()} ج.م</span>
                      <span className="text-gray-400">الهدف: {campaign.goalAmount.toLocaleString()} ج.م</span>
                    </div>
                    <div className="w-full bg-gray-50 h-3 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((campaign.collectedAmount / campaign.goalAmount) * 100, 100)}%` }}
                        className="bg-emerald-500 h-full rounded-full" 
                      />
                    </div>
                  </div>

                  <button 
                    onClick={() => setSelectedCampaign(campaign)}
                    className="w-full bg-gray-50 hover:bg-emerald-600 hover:text-white text-gray-900 font-black py-4 rounded-2xl transition-all"
                  >
                    تبرع الآن
                  </button>
                </div>
              </div>
            )) : (
               [1,2,3].map(i => (
                  <div key={i} className="bg-gray-50 rounded-[40px] aspect-[16/20] animate-pulse" />
               ))
            )}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-emerald-600 rounded-[50px] p-12 md:p-24 text-center text-white relative overflow-hidden">
             {/* Decorative circles */}
             <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
             <div className="absolute bottom-0 left-0 w-96 h-96 bg-black/5 rounded-full translate-y-1/2 -translate-x-1/2" />
             
             <div className="relative z-10 max-w-2xl mx-auto">
                <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight">انضم إلينا في رحلة العطاء الرقمي</h2>
                <p className="text-emerald-100 text-lg mb-12 leading-relaxed">كن جزءاً من منصة تهدف لتمكين المؤسسات الخيرية ومضاعفة تأثيرها من خلال التكنولوجيا الحديثة.</p>
                <div className="flex flex-wrap justify-center gap-4">
                  <button onClick={onLoginRequest} className="bg-white text-emerald-700 px-10 py-5 rounded-3xl font-black text-xl hover:scale-105 transition-all shadow-2xl">
                    سجل مؤسستك اليوم
                  </button>
                  <button className="bg-emerald-700/50 text-white border border-emerald-400 px-10 py-5 rounded-3xl font-black text-xl hover:bg-emerald-700 transition-all">
                    تواصل معنا
                  </button>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 pt-24 pb-12">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12 mb-20">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
                <Heart className="text-white fill-white w-6 h-6" />
              </div>
              <span className="text-2xl font-black tracking-tight">أوبن تشاريتي</span>
            </div>
            <p className="text-gray-500 max-w-sm leading-relaxed font-medium">
              مبادرة تقنية عربية لتمكين قطاع العمل الخيري من خلال حلول ذكية، شفافة، وسهلة الاستخدام.
            </p>
          </div>
          <div>
            <h4 className="font-black mb-8 text-gray-900">روابط هامة</h4>
            <ul className="space-y-4 text-sm font-bold text-gray-400">
              <li><a href="#" className="hover:text-emerald-600 transition-colors">عن أوبن تشاريتي</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">المطورون</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">سياسة الخصوصية</a></li>
              <li><a href="#" className="hover:text-emerald-600 transition-colors">الشروط والأحكام</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-black mb-8 text-gray-900">تواصل معنا</h4>
            <p className="text-sm font-bold text-gray-400 leading-loose">
              القاهرة، مصر<br />
              info@opencharity.io<br />
              +20 123 456 789
            </p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 pt-12 border-t border-gray-50 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs font-bold text-gray-300">© 2024 أوبن تشاريتي. جميع الحقوق محفوظة.</p>
          <div className="flex gap-6 text-gray-300">
             {/* Simple Lucide icons as social placeholders */}
             <Globe className="w-5 h-5 hover:text-emerald-600 cursor-pointer" />
             <Users className="w-5 h-5 hover:text-emerald-600 cursor-pointer" />
             <Heart className="w-5 h-5 hover:text-emerald-600 cursor-pointer" />
          </div>
        </div>
      </footer>
    </div>
  );
}
