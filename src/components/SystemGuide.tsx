import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Users, 
  Heart, 
  Search, 
  ClipboardCheck, 
  Rocket, 
  ShieldCheck, 
  Database, 
  Box, 
  Stethoscope, 
  History,
  LifeBuoy,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ArrowLeftRight,
  TrendingUp,
  Layout,
  Globe,
  Settings,
  ChevronRight,
  Share2,
  DollarSign,
  Truck,
  Layers,
  MapPin,
  Clock,
  ArrowRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AppUser, AppModule } from '../types';

export function SystemGuide({ userProfile, modules }: { userProfile: AppUser | null, modules: AppModule[] }) {
  const [activeModule, setActiveModule] = useState<string | null>(null);

  const stats = [
    { label: 'وحدات النظام', value: '12+', icon: Layers, color: 'text-indigo-600' },
    { label: 'تكاملات تقنية', value: '100%', icon: Share2, color: 'text-emerald-600' },
    { label: 'سرعة الاستجابة', value: '< 2s', icon: Rocket, color: 'text-amber-600' },
  ];

  const coreModules = [
    {
      id: 'families',
      title: 'إدارة العائلات',
      description: 'النواة الأساسية للنظام. إدارة الملفات، الأفراد، وتصنيف درجات الاستحقاق.',
      icon: Users,
      color: 'bg-blue-50 text-blue-600',
      details: [
        'تسجيل شامل لبيانات الأفراد (الرقم القومي، الحالة الصحية، التعليم).',
        'تتبع تلقائي لتاريخ العائلة وتغيرات الدخل والمصروفات.',
        'خرائط جغرافية لتوزيع الحالات والوصول السريع للمواقع.'
      ]
    },
    {
      id: 'assistance',
      title: 'المساعدات واللوجستيات',
      description: 'دورة حياة المساعدة من الطلب حتى التسليم النهائي للمستفيد.',
      icon: Heart,
      color: 'bg-rose-50 text-rose-600',
      details: [
        'إدارة المخازن وصرف العهينات (برقم الكود والباركود).',
        'جدولة المساعدات الدورية (كرتونة الشهر، لحوم، إعانات نقدية).',
        'توثيق التسليم بالصور والمحاضر الميدانية.'
      ]
    },
    {
      id: 'finance',
      title: 'المالية والتبرعات',
      description: 'إدارة الموارد المالية، المتبرعين، والحملات الموجهة.',
      icon: DollarSign,
      color: 'bg-emerald-50 text-emerald-600',
      details: [
        'ربط التبرعات بالحملات (إفطار صائم، علاج مريض، كفالة).',
        'إصدار سندات قبض رقمية وإرسالها للمتبرع فوراً.',
        'تقارير فورية عن العجز والزيادة في ميزانية الحملات.'
      ]
    },
    {
      id: 'medical',
      title: 'المنظومة الطبية',
      description: 'إدارة التعاقدات مع المستشفيات والمعامل والصيدليات.',
      icon: Stethoscope,
      color: 'bg-indigo-50 text-indigo-600',
      details: [
        'إصدار خطابات تحويل ذكية للمعامل والمراكز المتعاقدة.',
        'صرف الروشتات الشهرية وإدارة ميزانية العلاج.',
        'تتبع التاريخ المرضي لكل فـرد على حدة.'
      ]
    }
  ];

  return (
    <div className="space-y-12 pb-32">
      {/* Dynamic Hero Section */}
      <div className="relative overflow-hidden bg-gray-900 rounded-[64px] p-12 lg:p-20 text-white shadow-2xl">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
        >
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-black uppercase tracking-widest mb-8">
              <Globe className="w-3 h-3" /> نظام أوبن تشاريتي الإصدار 2.0
            </div>
            <h1 className="text-5xl lg:text-7xl font-black leading-tight mb-8">
              دليلك الذكي <br/>
              <span className="text-emerald-500">لإدارة الأثر</span>
            </h1>
            <p className="text-gray-400 text-xl font-medium leading-relaxed mb-12 max-w-lg">
              تعرف على كيفية تحويل العمليات الورقية المعقدة إلى تدفقات رقمية سلسة تضمن الشفافية والعدالة.
            </p>
            <div className="flex flex-wrap gap-4">
              {stats.map((s, i) => (
                <div key={i} className="bg-white/5 border border-white/10 px-6 py-4 rounded-3xl backdrop-blur-sm">
                  <div className="flex items-center gap-3 mb-1">
                    <s.icon className={cn("w-4 h-4", s.color)} />
                    <span className="text-lg font-black">{s.value}</span>
                  </div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute inset-0 bg-emerald-500/20 blur-[100px] rounded-full" />
            <motion.div 
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="bg-white/10 backdrop-blur-md rounded-[48px] border border-white/20 p-8 shadow-2xl relative z-10"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Layout className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-black">لوحة التحكم الذكية</p>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">مراقب العمليات الفوري</p>
                </div>
              </div>
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                    <div className="w-8 h-8 rounded-xl bg-white/10" />
                    <div className="flex-1 space-y-2">
                      <div className="h-1.5 bg-white/20 rounded-full w-3/4" />
                      <div className="h-1.5 bg-white/10 rounded-full w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Decor */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2" />
      </div>

      {/* System Mind Map (Visual Architecture) */}
      <div className="bg-white rounded-[56px] border border-gray-100 p-12 lg:p-20 shadow-sm relative overflow-hidden">
        <div className="text-center mb-20 max-w-2xl mx-auto">
          <h2 className="text-3xl font-black text-gray-900 mb-4">خرائط تدفق البيانات (Architecture)</h2>
          <p className="text-gray-400 font-bold leading-relaxed">
            النظام يعمل كمحرك واحد متصل، حيث تؤدي كل مدخلات إلى نتائج محسوبة في الوحدات الأخرى.
          </p>
        </div>

        <div className="relative flex flex-col items-center">
          {/* Main Flow Lines (Visual) */}
          <div className="hidden lg:block absolute top-[110px] left-1/4 right-1/4 h-0.5 bg-gray-100 -z-10" />
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-20 w-full relative z-10">
            {/* Input Layer */}
            <div className="space-y-8">
              <div className="text-center">
                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-4 block">المدخلات الأساسية</span>
              </div>
              <motion.div whileHover={{ y: -5 }} className="bg-gray-50 border border-gray-100 p-8 rounded-[40px] text-center">
                <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm text-indigo-600">
                  <Users className="w-8 h-8" />
                </div>
                <h4 className="font-black text-gray-900 mb-2">العائلات والبحث</h4>
                <p className="text-xs font-bold text-gray-400 leading-relaxed">بيانات الحالات، تقارير البحث، وتوثيق الاحتياج.</p>
              </motion.div>
              <motion.div whileHover={{ y: -5 }} className="bg-gray-50 border border-gray-100 p-8 rounded-[40px] text-center">
                <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm text-emerald-600">
                  <DollarSign className="w-8 h-8" />
                </div>
                <h4 className="font-black text-gray-900 mb-2">الموارد المالية</h4>
                <p className="text-xs font-bold text-gray-400 leading-relaxed">تبرعات نقدية وعينية، تبرعات مؤسسية، وحملات.</p>
              </motion.div>
            </div>

            {/* Core Processing Layer */}
            <div className="flex flex-col justify-center items-center">
              <div className="w-32 h-32 bg-emerald-600 rounded-[40px] flex items-center justify-center shadow-2xl shadow-emerald-200 text-white relative group">
                <Database className="w-12 h-12" />
                <div className="absolute -inset-4 bg-emerald-600/10 rounded-[48px] -z-10 animate-pulse" />
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-[10px] px-3 py-1.5 rounded-full font-black opacity-0 group-hover:opacity-100 transition-all">
                  محرك المعالجة السحابي
                </div>
              </div>
              <div className="mt-8 text-center">
                <h4 className="font-black text-gray-900 text-xl">قاعدة بيانات موحدة</h4>
                <p className="text-xs font-bold text-gray-400 mt-2">تربط العائلة بالتبرع بالصرف آلياً</p>
              </div>
            </div>

            {/* Output Layer */}
            <div className="space-y-8">
              <div className="text-center">
                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-4 block">المخرجات والتنفيذ</span>
              </div>
              <motion.div whileHover={{ y: -5 }} className="bg-emerald-50 border border-emerald-100 p-8 rounded-[40px] text-center">
                <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm text-emerald-600">
                  <Heart className="w-8 h-8" />
                </div>
                <h4 className="font-black text-gray-900 mb-2">تسليم المساعدات</h4>
                <p className="text-xs font-bold text-gray-400 leading-relaxed">إعانات نقدية، كراتين غذائية، فواتير علاجية.</p>
              </motion.div>
              <motion.div whileHover={{ y: -5 }} className="bg-amber-50 border border-amber-100 p-8 rounded-[40px] text-center">
                <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm text-amber-600">
                  <TrendingUp className="w-8 h-8" />
                </div>
                <h4 className="font-black text-gray-900 mb-2">تقارير الأثر</h4>
                <p className="text-xs font-bold text-gray-400 leading-relaxed">إحصائيات الإنجاز، لوحات البيانات، وتقارير الشفافية.</p>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Module Explorer */}
      <section>
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl font-black text-gray-900 mb-2">استكشف النظام بالتفصيل</h2>
            <p className="text-gray-400 font-bold">كل قسم في أوبن تشاريتي يحتوي على أدوات متخصصة لمهمة محددة.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {coreModules.map((module) => {
            const Icon = module.icon;
            const isExpanded = activeModule === module.id;
            
            return (
              <motion.div 
                key={module.id}
                layout
                onClick={() => setActiveModule(isExpanded ? null : module.id)}
                className={cn(
                  "bg-white rounded-[40px] border border-gray-100 p-8 cursor-pointer transition-all hover:bg-gray-50/50 relative overflow-hidden",
                  isExpanded && "ring-2 ring-emerald-500/20 shadow-xl"
                )}
              >
                <div className="flex items-start gap-6 relative z-10">
                  <div className={cn("shrink-0 w-16 h-16 rounded-3xl flex items-center justify-center", module.color)}>
                    <Icon className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-black text-gray-900 mb-2 flex items-center justify-between">
                      {module.title}
                      <ChevronRight className={cn("w-5 h-5 text-gray-300 transition-transform", isExpanded && "rotate-90")} />
                    </h3>
                    <p className="text-sm font-bold text-gray-400 pr-10">{module.description}</p>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="mt-8 space-y-4 pt-8 border-t border-gray-100"
                        >
                          {module.details.map((detail, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                              <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                                <CheckCircle2 className="w-3 h-3" />
                              </div>
                              <p className="text-sm font-bold text-gray-600 leading-relaxed text-right md:text-justify lg:text-right">{detail}</p>
                            </div>
                          ))}
                          <button className="w-full mt-6 bg-gray-900 text-white font-black py-4 rounded-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2">
                             فتح المكون الآن <ArrowLeftRight className="w-4 h-4" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                {/* Background Decor */}
                <div className="absolute top-0 left-0 w-32 h-32 bg-gray-50 rounded-full -translate-x-1/2 -translate-y-1/2 -z-10" />
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Advanced Capabilities (Grid) */}
      <div className="bg-emerald-600 rounded-[56px] p-12 lg:p-20 text-white relative overflow-hidden">
        <div className="relative z-10">
          <div className="max-w-2xl mb-16">
            <h2 className="text-4xl font-black mb-6">قدرات متقدمة للمستخدم المحترف</h2>
            <p className="text-emerald-50 text-lg font-medium opacity-80 leading-relaxed">أوبن تشاريتي ليس مجرد واجهة بيانات، بل هو نظام ذكاء اصطناعي لدعم اتخاذ القرار.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="space-y-6 bg-white/5 p-8 rounded-[40px] border border-white/10 hover:bg-white/10 transition-colors">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-emerald-300">
                <Box className="w-8 h-8" />
              </div>
              <h5 className="text-xl font-black">إدارة المخزون الذكية</h5>
              <p className="text-sm font-bold text-emerald-50/70 leading-relaxed">نظام يحسب "معدل الاستهلاك" تلقائياً وينبهك قبل نفاذ كميات الكراتين أو المساعدات العينية من المخازن.</p>
            </div>
            <div className="space-y-6 bg-white/5 p-8 rounded-[40px] border border-white/10 hover:bg-white/10 transition-colors">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-amber-300">
                <Clock className="w-8 h-8" />
              </div>
              <h5 className="text-xl font-black">خط زمن الحالة (Timeline)</h5>
              <p className="text-sm font-bold text-emerald-50/70 leading-relaxed">دفق زمني يعرض كل تفاعل تم مع العائلة (زيارة، مساعدة، تواصل هاتفي) منذ أول يوم تسجيل.</p>
            </div>
            <div className="space-y-6 bg-white/5 p-8 rounded-[40px] border border-white/10 hover:bg-white/10 transition-colors">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-indigo-300">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h5 className="text-xl font-black">أمان الحوكمة (Governance)</h5>
              <p className="text-sm font-bold text-emerald-50/70 leading-relaxed">نظام "المراجعة المزدوجة"؛ حيث لا يمكن صرف مساعدة دون موافقة مدير القسم وتأكيد أمين المخزن.</p>
            </div>
          </div>
        </div>

        {/* Decor */}
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[150px] translate-y-1/2 translate-x-1/2" />
      </div>

      {/* Support CTA */}
      <div className="p-12 lg:p-20 bg-white rounded-[64px] border border-gray-100 shadow-sm text-center">
        <h3 className="text-3xl font-black text-gray-900 mb-6">هل تبحث عن شرح لميزة معينة؟</h3>
        <p className="text-gray-400 font-bold mb-12 max-w-xl mx-auto">فريق النجاح لدينا جاهز لتقديم دورات تدريبية متخصصة لمؤسستك لضمان أقصى استفادة من النظام.</p>
        <div className="flex flex-wrap justify-center gap-6">
          <button className="px-12 py-6 bg-emerald-600 text-white font-black rounded-3xl hover:bg-emerald-700 transition-all shadow-2xl shadow-emerald-200 flex items-center gap-2">
            <LifeBuoy className="w-5 h-5" /> تواصل مع الدعم الفني
          </button>
          <button className="px-12 py-6 bg-gray-50 text-gray-900 font-black rounded-3xl hover:bg-gray-100 transition-all border border-gray-100 flex items-center gap-2">
            <FileText className="w-5 h-5" /> دليل الاستخدام (PDF)
          </button>
        </div>
      </div>
    </div>
  );
}

