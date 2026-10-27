import { supabase } from './supabase';
import { emptyProgress, ProgressDocument, validateProgress } from './pouring-progress';
import { canonical } from './cloud-storage';
export interface ProgressSnapshot { document: ProgressDocument; revision: number; mode: 'local' | 'cloud' }
const storageKey = (site: string) => `cp_pouring_progress_v1:${site}`;
export async function loadProgress(site: string, connected: boolean): Promise<ProgressSnapshot> {
  if (connected) {
    const local = await loadProgress(site, false);
    const markerKey = `cp_progress_cloud_import:${site}`, source = canonical(local.document);
    const marker = localStorage.getItem(markerKey);
    if (marker && marker !== source) throw new Error('서버 이전 후 브라우저 자료가 변경되었습니다. 원본을 보존했으니 두 자료를 비교해주세요.');
    let { data, error } = await supabase.from('pouring_progress').select('document,revision').eq('site_id', site).maybeSingle();
    if (error) throw new Error('타설현황 서버를 불러오지 못했습니다. 브라우저 원본은 유지됩니다.');
    if (!data && local.revision > 0) {
      const result = await supabase.from('pouring_progress').insert({site_id:site,document:local.document,revision:1}).select('document,revision').single();
      if (result.error?.code === '23505') return loadProgress(site, true);
      if (result.error) throw new Error('기존 타설현황을 서버로 옮기지 못했습니다. 원본은 유지됩니다.');
      data=result.data;
    }
    if (data) {
      validateProgress(data.document);
      if (!marker && local.revision > 0 && canonical(data.document)!==source) throw new Error('서버와 브라우저에 서로 다른 타설현황이 있습니다. 덮어쓰지 않았습니다. 자료를 비교해주세요.');
      localStorage.setItem(markerKey,source);
    }
    return {document:data?.document || emptyProgress(),revision:data?.revision || 0,mode:'cloud'};
  }
  const saved = localStorage.getItem(storageKey(site));
  if (!saved) return { document: emptyProgress(), revision: 0, mode: 'local' };
  const parsed = JSON.parse(saved); validateProgress(parsed.document);
  if (!Number.isInteger(parsed.revision) || parsed.revision < 1) throw new Error('저장 형식을 확인해주세요.');
  return { document: parsed.document, revision: parsed.revision, mode: 'local' };
}
export async function saveProgress(site: string, current: ProgressSnapshot, document: ProgressDocument): Promise<ProgressSnapshot> {
  validateProgress(document);
  const revision = current.revision + 1;
  if (current.mode === 'cloud') {
    const result = current.revision === 0
      ? await supabase.from('pouring_progress').insert({ site_id: site, document, revision }).select('revision').single()
      : await supabase.from('pouring_progress').update({ document, revision }).eq('site_id', site).eq('revision', current.revision).select('revision').maybeSingle();
    if (result.error || !result.data) throw new Error(result.error?.code === '23505' || !result.data ? '다른 화면에서 변경되었습니다. 새로 불러온 뒤 다시 입력해주세요.' : 'DB 저장에 실패했습니다. 입력 내용은 유지됩니다.');
  } else {
    const saved = localStorage.getItem(storageKey(site));
    if ((saved ? JSON.parse(saved).revision : 0) !== current.revision) throw new Error('다른 탭에서 변경되었습니다. 새로 불러온 뒤 다시 입력해주세요.');
    const raw = JSON.stringify({ document, revision });
    localStorage.setItem(storageKey(site), raw);
    if (localStorage.getItem(storageKey(site)) !== raw) throw new Error('현황을 저장하지 못했습니다. 입력을 유지하고 브라우저 저장 공간을 확인해주세요.');
  }
  return { document, revision, mode: current.mode };
}
