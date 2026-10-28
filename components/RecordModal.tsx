'use client';

import { Modal } from './Modal';
import React, { useState, useEffect, useRef } from 'react';
import { PouringLog, PouringLogInput, Site } from '@/lib/types';
import { newLog } from '@/lib/log-data';
import { WateringSelect } from './WateringSelect';
import { normalizeStrength } from '@/lib/strength';
import { X, Save, Calendar, Thermometer, MapPin, Building, ShieldCheck } from 'lucide-react';

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PouringLogInput, id?: string) => Promise<void>;
  blocked?: boolean;
  initialData?: PouringLog | null;
  currentSite: Site | undefined;
}

export const RecordModal: React.FC<RecordModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  currentSite, blocked = false,
}) => {
  const [formData, setFormData] = useState<PouringLogInput>(() => newLog());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

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
    } else setFormData(newLog(currentSite?.id));
    setError('');
  }, [initialData, currentSite, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await onSave({ ...formData, site_id: currentSite?.id || formData.site_id }, initialData?.id); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : '저장에 실패했습니다. 입력은 유지됩니다.'); }
    finally { lock.current = false; setBusy(false); }
  };

  return (
    <Modal onClose={() => { if (!busy) onClose(); }} labelledBy="record-modal-title">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h2 id="record-modal-title" className="text-base font-bold text-slate-100">
                {initialData ? '타설 및 양생 일지 수정' : '신규 타설 및 양생 일지 작성'}
              </h2>
              <p className="text-xs text-amber-400 font-medium mt-0.5">
                현장: {currentSite?.name || '미선택'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="일지 닫기"
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} onInput={() => setError('')} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {error && <p className="progress-error" role="alert">{error}</p>}
          {blocked && <p className="progress-error">자료 읽기 오류를 해결한 뒤 입력해주세요.</p>}
          {!currentSite && <p className="progress-error">현장을 먼저 선택해주세요.</p>}
          <fieldset disabled={busy || blocked || !currentSite} className="space-y-4">
          {/* Row 1: 일자 (번호는 조회 순서에 따라 자동 표시) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="record-field-2" className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-amber-400" /> 일자
              </label>
              <input id="record-field-2"
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
                <label htmlFor="record-field-3" className="block text-[11px] font-medium text-slate-400 mb-1">
                  동 (구역)
                </label>
                <input id="record-field-3"
                  type="text"
                  placeholder="예: 101동"
                  value={formData.building}
                  onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="record-field-4" className="block text-[11px] font-medium text-slate-400 mb-1">
                  층
                </label>
                <input id="record-field-4"
                  type="text"
                  placeholder="예: 15층"
                  value={formData.floor}
                  onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="record-field-5" className="block text-[11px] font-medium text-slate-400 mb-1">
                  벽 / 슬라브 (구조부위)
                </label>
                <select id="record-field-5"
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
              <label htmlFor="record-field-6" className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-blue-400" /> 최저온도(°C)
              </label>
              <input id="record-field-6"
                type="number"
                step="0.1"
                placeholder="20"
                value={formData.min_temp !== null ? formData.min_temp : ''}
                onChange={(e) => setFormData({ ...formData, min_temp: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label htmlFor="record-field-7" className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-red-400" /> 최고온도(°C)
              </label>
              <input id="record-field-7"
                type="number"
                step="0.1"
                placeholder="30"
                value={formData.max_temp !== null ? formData.max_temp : ''}
                onChange={(e) => setFormData({ ...formData, max_temp: e.target.value ? parseFloat(e.target.value) : null })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label htmlFor="record-field-8" className="block text-xs font-medium text-slate-300 mb-1">
                기상 (눈/비/맑음)
              </label>
              <select id="record-field-8"
                value={formData.weather}
                onChange={(e) => setFormData({ ...formData, weather: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">기상 미입력</option>
                <option value="맑음">맑음 ☀️</option>
                <option value="흐림">흐림 ☁️</option>
                <option value="비">비 🌧️</option>
                <option value="눈">눈 ❄️</option>
              </select>
            </div>

            <div>
              <label htmlFor="record-field-9" className="block text-xs font-medium text-slate-300 mb-1">
                레미콘사
              </label>
              <input id="record-field-9"
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
              <label htmlFor="record-field-10" className="block text-xs font-semibold text-amber-400 mb-1">
                타설강도 (규격/강도)
              </label>
              <input id="record-field-10"
                type="text"
                placeholder="예: 24 (MPa 자동) 또는 25-24-150"
                value={formData.strength || ''}
                onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                onBlur={(e) => { const strength = normalizeStrength(e.target.value); setFormData(current => ({ ...current, strength })); }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>

            <div>
              <label htmlFor="record-field-11" className="block text-xs font-semibold text-amber-400 mb-1">
                타설물량 (m³)
              </label>
              <input id="record-field-11"
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
                <label htmlFor="record-field-12" className="block text-[11px] font-medium text-slate-400 mb-1">
                  살수 (수분 공급 및 살수 양생)
                </label>
                <WateringSelect id="record-field-12"
                  value={formData.curing_watering}
                  onChange={(e) => setFormData({ ...formData, curing_watering: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label htmlFor="record-field-13" className="block text-[11px] font-medium text-slate-400 mb-1">
                  보양 (단열/열풍/시트/거푸집 보양)
                </label>
                <input id="record-field-13"
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
            <label htmlFor="record-field-14" className="block text-xs font-medium text-slate-300 mb-1">
              비고 / 특이사항
            </label>
            <input id="record-field-14"
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
            disabled={busy}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1.5 transition shadow"
            >
              <Save className="w-4 h-4" />
              {busy ? '저장 중…' : initialData ? '수정 저장' : '새 일지 저장'}
            </button>
          </div>

          </fieldset>
          <p role="status" className="ui-note">{busy ? '저장 중입니다.' : ''}</p>
        </form>
      </div>
    </Modal>
  );
};
