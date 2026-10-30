import { ProgressDocument, progressRows, validateProgress } from './pouring-progress';

export function changeStage(document: ProgressDocument, buildingId: string, action: 'add' | 'rename' | 'delete', id: string, name = '', above = '') {
  const next = structuredClone(document), building = next.buildings.find(b => b.id === buildingId);
  if (!building) throw new Error('편집할 동을 선택해주세요.');
  const stage = building.stages.find(s => s.id === id);
  if (action !== 'add' && !stage) throw new Error('층·단계를 다시 선택해주세요.');
  name = name.trim();
  if (action !== 'delete' && (!name || building.stages.some(s => s.id !== id && s.name.trim() === name))) throw new Error('중복되지 않는 층·단계 이름을 입력해주세요.');
  if (action === 'add') {
    // A floor another building already has joins that row (same id and order), so its 해당 없음 cell becomes this floor.
    const existing = sameNameRow(next, buildingId, name);
    if (existing) { building.stages.push({ id: existing.id, name, order: existing.order }); validateProgress(next); return next; }
    const reference = building.stages.find(s => s.id === above);
    if (above && !reference) throw new Error('추가 위치를 다시 선택해주세요.');
    const orders = progressRows(next.buildings).map(s => s.order);
    const higher = orders.filter(n => n > (reference?.order ?? 0)).sort((a,b) => a-b)[0];
    const order = reference ? (reference.order + (higher ?? reference.order + 2))/2 : Math.min(0,...orders)-1;
    building.stages.push({id,name,order});
  } else if (action === 'rename') stage!.name = name;
  else {
    building.stages = building.stages.filter(s => s.id !== id);
    delete building.records[id];
    for (const record of Object.values(building.records)) if (record.comparisonStage === id) delete record.comparisonStage;
  }
  validateProgress(next);
  return next;
}
// The table row of another building's floor with this name that the building has no floor for yet.
export function sameNameRow(document: ProgressDocument, buildingId: string, name: string) {
  const building = document.buildings.find(b => b.id === buildingId);
  name = name.trim();
  if (!building || !name) return undefined;
  return progressRows(document.buildings.filter(b => b.id !== buildingId)).find(s => s.name.trim() === name && !building.stages.some(own => own.id === s.id));
}
