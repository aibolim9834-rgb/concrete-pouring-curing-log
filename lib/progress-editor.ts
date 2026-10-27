import { ProgressDocument } from './pouring-progress';

// Both the visible selection and the write target must obey the building filter.
export function visibleSelection(document: ProgressDocument, selected: string[], filter: string) {
  return selected.filter(key => {
    const [bid, sid] = key.split(':');
    const building = document.buildings.find(b => b.id === bid);
    return (filter === 'all' || filter === bid) && building?.stages.some(s => s.id === sid);
  });
}

export function progressEditor(document: ProgressDocument, preferredId?: string) {
  const building = document.buildings.find(b => b.id === preferredId) || document.buildings[0];
  return { buildingId: building?.id || '', buildingName: building?.name || '', stageId: '', stageName: '' };
}
