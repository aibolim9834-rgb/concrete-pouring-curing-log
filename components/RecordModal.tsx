'use client';

import React, { useState, useEffect } from 'react';
import { PouringLog, PouringLogInput, Site } from '@/lib/types';
import { X, Save, Calendar, Thermometer, MapPin, Building, ShieldCheck } from 'lucide-react';

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PouringLogInput, id?: string) => void;
  initialData?: PouringLog | null;
  currentSite: Site | undefined;
}

export const RecordModal: React.FC<RecordModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  currentSite,
}) => {
  const [formData, setFormData] = useState<PouringLogInput>({
    site_id: '',
    category: '1',
    date: new Date().toISOString().split('T')[0],
    building: '',
    floor: '',
    member_type: '슬라브',
    min_temp: 20,
    max_temp: 28,
    weather: '맑음',
    remicon_company: '',
    strength: '24MPa',
    volume: '',
    curing_watering: '',
    curing_protection: '',
    remarks: '',
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        site_id: initialData.site_id,
        category: initialData.category,
        date: initialData.date,
        building: initialData.building,
        floor: initialData.floor,
        member_type: initialData.member_type,
        min_temp: initialData.min_temp,
        max_temp: initialData.max_temp,
        weather: initialData.weather,
        remicon_company: initialData.remicon_company,
        strength: initialData.strength || '',
        volume: initialData.volume !== null && initialData.volume !== undefined ? initialData.volume : '',
        curing_watering: initialData.curing_watering,
        curing_protection: initialData.curing_protection,
        remarks: initialData.remarks || '',
      });
    } else {
      setFormData({
        site_id: currentSite?.id || '',
        category: '1',
        date: new Date().toISOString().split('T')[0],
        building: '',
        floor: '',
        member_type: '슬라브',
        min_temp: 20,
        max_temp: 28,
        weather: '맑음',
        remicon_company: '',
        strength: '24MPa',
        volume: 150,
        curing_watering: '1일 3회 살수 실시',
        curing_protection: '양생시트 보양',
        remarks: '',
      });
    }
  }, [initialData, currentSite, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(
      {
        ...formData,
        site_id: currentSite?.id || formData.site_id,
      },
      initialData?.id
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {initialData ? '타설 및 양생 일지 수정' : '신규 타설 및 양생 일지 작성'}
              </h2>
              <p className="text-xs text-amber-400 font-medium mt-0.5">
                현장: {currentSite?.name || '미선택'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Row 1: 구분, 일자 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                구분 (순번/종류)
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="예: 1, 2 또는 타설"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" /> 일자
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
          </div>

          {/* Row 2: 타설위치 (동/구역, 층, 벽/슬라브) */}
          <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-amber-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> 타설 위치 정보
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  동 (구역)
                </label>
                <input
                  type="text"
                  placeholder="예: 101동"
                  value={formData.building}
                  onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  층
                </label>
                <input
                  type="text"
                  placeholder="예: 15층"
                  value={formData.floor}
                  onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  벽 / 슬라브 (구조부위)
                </label>
                <select
                  value={formData.member_type}
                  onChange={(e) => setFormData({ ...formData, member_type: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="슬라브">슬라브</option>
                  <option value="벽체">벽체</option>
                  <option value="기둥/보">기둥 / 보</option>
                  <option value="기초(MAT)">기초 (MAT)</option>
                  <option value="계단/기타">계단 / 기타</option>
                </select>
              </div>
            </div>
          </div>

          {/* Row 3: 온도 & 기상 & 레미콘사 */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-blue-400" /> 최저온도(°C)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="20"
                value={formData.min_temp !== null ? formData.min_temp : ''}
                onChange={(e) => setFormData({ ...formData, min_temp: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-red-400" /> 최고온도(°C)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="30"
                value={formData.max_temp !== null ? formData.max_temp : ''}
                onChange={(e) => setFormData({ ...formData, max_temp: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                기상 (눈/비/맑음)
              </label>
              <select
                value={formData.weather}
                onChange={(e) => setFormData({ ...formData, weather: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="맑음">맑음 ☀️</option>
                <option value="흐림">흐림 ☁️</option>
                <option value="비">비 🌧️</option>
                <option value="눈">눈 ❄️</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                레미콘사
              </label>
              <input
                type="text"
                placeholder="예: 유진기업"
                value={formData.remicon_company}
                onChange={(e) => setFormData({ ...formData, remicon_company: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Row 3.5: 타설강도 & 타설물량 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
            <div>
              <label className="block text-xs font-semibold text-amber-400 mb-1">
                타설강도 (규격/강도)
              </label>
              <input
                type="text"
                placeholder="예: 24MPa 또는 25-24-150"
                value={formData.strength || ''}
                onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-400 mb-1">
                타설물량 (m³)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="예: 150"
                value={formData.volume !== null && formData.volume !== undefined ? formData.volume : ''}
                onChange={(e) => setFormData({ ...formData, volume: e.target.value ? parseFloat(e.target.value) : '' })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>
          </div>

          {/* Row 4: 양생방법 (살수, 보양) */}
          <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl space-y-3">
            <div className="text-xs font-semibold text-amber-400 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> 양생 방법 상세
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  살수 (수분 공급 및 살수 양생)
                </label>
                <input
                  type="text"
                  placeholder="예: 1일 3회 살수 실시"
                  value={formData.curing_watering}
                  onChange={(e) => setFormData({ ...formData, curing_watering: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  보양 (단열/열풍/시트/거푸집 보양)
                </label>
                <input
                  type="text"
                  placeholder="예: 습윤양생포 피복 / 천막 방열"
                  value={formData.curing_protection}
                  onChange={(e) => setFormData({ ...formData, curing_protection: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Row 5: 비고 */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              비고 / 특이사항
            </label>
            <input
              type="text"
              placeholder="예: 서중 콘크리트 제어 조치, 균열 방지제 도포 등"
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 transition shadow"
            >
              <Save className="w-4 h-4" />
              {initialData ? '수정 저장' : '새 일지 저장'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
