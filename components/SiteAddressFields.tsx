'use client';

import React, { useState } from 'react';
import { KmaRegion, matchAddress, toArea, WeatherArea } from '@/lib/kma-area';

// 현장 주소 input plus the 기상 기준 위치 found from it. picked is a place chosen by hand (null = use what the address finds);
// the parent clears it whenever the address changes.
export function SiteAddressFields({ id, autoFocus, address, picked, regions, regionError, onAddressChange, onPick }: {
  id: string; autoFocus?: boolean; address: string; picked: WeatherArea | null; regions: KmaRegion[] | null; regionError: string;
  onAddressChange: (address: string) => void; onPick: (area: WeatherArea | null) => void;
}) {
  const resultId = `${id}-area`;
  return <div className="site-address-fields">
    <label htmlFor={id}>현장 주소 <small>선택 · 오늘 날씨에 씁니다</small></label>
    {/* The site's address, not the user's, so the browser's saved addresses are not offered. */}
    <input id={id} type="text" autoFocus={autoFocus} value={address} maxLength={200} autoComplete="off" placeholder="예: 서울특별시 서초구 반포동 1-1"
      aria-describedby={address.trim() ? resultId : undefined} onChange={e => onAddressChange(e.target.value)} />
    {address.trim() && <div id={resultId} role="status">
      {regionError ? <p className="site-area is-fail">{regionError}</p>
        : !regions ? <p className="ui-note">기상 위치 목록을 불러오는 중입니다.</p>
        : <AreaResult address={address} picked={picked} regions={regions} onPick={onPick} />}
    </div>}
  </div>;
}

function AreaResult({ address, picked, regions, onPick }: { address: string; picked: WeatherArea | null; regions: KmaRegion[]; onPick: (area: WeatherArea | null) => void }) {
  if (picked) return <div className="site-area is-ok">
    <span><b>기상 기준 위치:</b> {picked.label}</span>
    <button type="button" className="ui-button" onClick={() => onPick(null)}>주소로 다시 찾기</button>
  </div>;
  const match = matchAddress(address, regions);
  if (match.status === 'ok') return <p className="site-area is-ok"><span><b>기상 기준 위치:</b> {match.area.label}</span></p>;
  if (match.status === 'none') return <div className="site-area is-fail">
    <span><b>주소에서 지역을 찾지 못했습니다.</b> 지역을 직접 골라 주세요. 주소는 적은 그대로 저장됩니다.</span>
    <RegionCascade regions={regions} onPick={onPick} />
  </div>;
  const sggOnly = match.status === 'sgg';
  return <div className="site-area is-need">
    <span>{sggOnly
      ? <><b>{match.area.label}까지 찾았습니다.</b> 현장이 있는 읍·면·동을 고르면 더 가깝게 맞춥니다. 고르지 않으면 {match.area.label} 기준으로 씁니다.</>
      : <><b>&lsquo;{match.place}&rsquo;에 맞는 곳이 여러 곳입니다.</b> 현장이 있는 곳을 골라 주세요.</>}</span>
    <select aria-label="읍·면·동 선택" value="" onChange={e => { const row = match.choices.find(r => r[0] === e.target.value); if (row) onPick(toArea(row)); }}>
      <option value="">읍·면·동 선택</option>
      {match.choices.map(r => <option key={r[0]} value={r[0]}>{sggOnly ? r[3] : `${r[2]} ${r[3]}`}</option>)}
    </select>
  </div>;
}

// 시·도 → 시·군·구 → 읍·면·동 by hand. The last list also offers the whole 시·군·구.
function RegionCascade({ regions, onPick }: { regions: KmaRegion[]; onPick: (area: WeatherArea) => void }) {
  const [sido, setSido] = useState(''), [sgg, setSgg] = useState('');
  const sidos = Array.from(new Set(regions.map(r => r[1])));
  const sggs = regions.filter(r => r[1] === sido && r[2] && !r[3]);
  const places = regions.filter(r => r[1] === sido && r[2] === sgg);
  return <span className="site-area-pick">
    <select aria-label="시·도" value={sido} onChange={e => { setSido(e.target.value); setSgg(''); }}>
      <option value="">시·도</option>{sidos.map(name => <option key={name}>{name}</option>)}
    </select>
    <select aria-label="시·군·구" value={sgg} disabled={!sido} onChange={e => setSgg(e.target.value)}>
      <option value="">시·군·구</option>{sggs.map(r => <option key={r[0]} value={r[2]}>{r[2]}</option>)}
    </select>
    <select aria-label="읍·면·동" value="" disabled={!sgg} onChange={e => { const row = places.find(r => r[0] === e.target.value); if (row) onPick(toArea(row)); }}>
      <option value="">읍·면·동</option>{places.map(r => <option key={r[0]} value={r[0]}>{r[3] || `${r[2]} 전체`}</option>)}
    </select>
  </span>;
}
