import React, { useState, useMemo } from 'react';
import { Family, LookupItem } from '../types';
import { MapPin, Globe, ChevronRight, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet icon issue in dynamic environments
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface GeographicMapProps {
  families: Family[];
  lookups: LookupItem[];
}

export function GeographicMap({ families, lookups }: GeographicMapProps) {
  const [activeTab, setActiveTab] = useState<'map' | 'list'>('map');

  const regionData = useMemo(() => {
    const neighborhoodLookups = lookups.filter(l => l.type === 'neighborhood');
    const counts: Record<string, { count: number, lat: number, lng: number }> = {};
    
    // Default coordinates for some common areas if not found (Egypt focus)
    const defaultCoords: Record<string, [number, number]> = {
      'القاهرة': [30.0444, 31.2357],
      'الجيزة': [30.0131, 31.2089],
      'الإسكندرية': [31.2001, 29.9187],
      'المنصورة': [31.0409, 31.3785],
      'طنطا': [30.7865, 31.0004],
      'أسيوط': [27.1783, 31.1859],
      'default': [30.0444, 31.2357]
    };

    families.forEach(f => {
      let name = '';
      if (f.neighborhood) {
        name = neighborhoodLookups.find(l => l.id === f.neighborhood)?.name || f.neighborhood;
      } else if (f.city) {
        name = f.city;
      }

      if (name) {
        if (!counts[name]) {
          // Try to find coordinates or assign something close to Cairo with small random offset for display
          const base = defaultCoords[name] || defaultCoords['default'];
          counts[name] = { 
            count: 0, 
            lat: base[0] + (Math.random() - 0.5) * 0.1, 
            lng: base[1] + (Math.random() - 0.5) * 0.1 
          };
        }
        counts[name].count++;
      }
    });

    return Object.entries(counts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [families, lookups]);

  return (
    <div className="bg-white p-6 md:p-8 rounded-[40px] border border-gray-100 shadow-sm h-[600px] flex flex-col relative overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h3 className="text-xl font-black flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Globe className="w-5 h-5 text-emerald-600" />
            </div>
            توزيع الحالات جغرافياً
          </h3>
          <p className="text-[10px] font-bold text-gray-400 mt-1 mr-13">تحديد المناطق الأكثر احتياجاً والأولوية القصوى</p>
        </div>
        
        <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('map')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all",
              activeTab === 'map' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400"
            )}
          >
            الخريطة
          </button>
          <button 
            onClick={() => setActiveTab('list')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all",
              activeTab === 'list' ? "bg-white text-emerald-600 shadow-sm" : "text-gray-400"
            )}
          >
            القائمة
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-[32px] overflow-hidden border border-gray-100 relative group">
        {activeTab === 'map' ? (
          <div className="h-full w-full z-0">
            <MapContainer 
              center={[30.0444, 31.2357]} 
              zoom={6} 
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {regionData.map((region) => (
                <CircleMarker
                  key={region.name}
                  center={[region.lat, region.lng]}
                  radius={Math.min(20, Math.max(8, region.count * 2))}
                  fillColor="#10b981"
                  color="#059669"
                  weight={2}
                  opacity={0.8}
                  fillOpacity={0.6}
                >
                  <Popup>
                    <div className="p-2 text-right" dir="rtl">
                      <p className="font-black text-gray-900 border-b border-gray-100 pb-1 mb-1">{region.name}</p>
                      <p className="text-xs font-bold text-emerald-600">عدد الحالات: {region.count}</p>
                      <p className="text-[10px] text-gray-400 mt-1">تحديد الأولويات الميدانية لهذه المنطقة</p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-6 space-y-4">
            {regionData.map((region) => (
              <div key={region.name} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white hover:shadow-md transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                    <MapPin className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <h4 className="font-black text-gray-900">{region.name}</h4>
                    <p className="text-[10px] font-bold text-gray-400">منطقة نشطة</p>
                  </div>
                </div>
                <div className="text-left">
                  <span className="text-xl font-black text-emerald-600">{region.count}</span>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">حالة</p>
                </div>
              </div>
            ))}
            {regionData.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Globe className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-medium">لا توجد بيانات توزيع متاحة حالياً</p>
              </div>
            )}
          </div>
        )}

        <div className="absolute bottom-4 right-4 z-10">
          <div className="bg-white/90 backdrop-blur-md p-3 rounded-2xl border border-gray-100 shadow-xl flex items-center gap-3">
            <div className="flex -space-x-2 rtl:space-x-reverse">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-emerald-100 flex items-center justify-center text-[8px] font-black text-emerald-600">
                  {i}
                </div>
              ))}
            </div>
            <p className="text-[10px] font-black text-gray-900">أكثر المناطق طلباً للمساعدات</p>
          </div>
        </div>
      </div>
      
      <div className="mt-6 flex items-center gap-4 p-4 bg-amber-50 rounded-[28px] border border-amber-100 shrink-0">
        <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0">
          <Info className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <p className="text-xs font-black text-amber-900">المناطق ذات الأولوية العالية</p>
          <p className="text-[10px] font-bold text-amber-700/80 leading-relaxed">بناءً على التوزيع الموزون، تحتاج المناطق المذكورة أعلاه إلى زيادة في الزيارات الميدانية وتسريع الموافقات.</p>
        </div>
      </div>
    </div>
  );
}
