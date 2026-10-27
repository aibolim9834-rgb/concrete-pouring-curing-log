import { difference } from './date-only';
import { ProgressBuilding } from './pouring-progress';

export function previousStageId(building: ProgressBuilding, stageId: string): string {
  const stage = building.stages.find(s => s.id === stageId);
  return building.stages.filter(s => s.order < (stage?.order ?? -Infinity)).sort((a,b) => b.order-a.order)[0]?.id || '';
}

// Holidays are included; the starting date is excluded. Missing dates remain unknown.
export function scheduleMetrics(building: ProgressBuilding, stageId: string, record: {date?: string; plannedDate?: string; comparisonStage?: string} = building.records[stageId] || {}) {
  const comparisonStage = record.comparisonStage ?? previousStageId(building,stageId);
  const previous = building.records[comparisonStage];
  return {
    comparisonStage,
    plannedDays: comparisonStage ? difference(previous?.plannedDate || '',record.plannedDate || '') : null,
    actualDays: comparisonStage ? difference(previous?.date || '',record.date || '') : null,
    variance: difference(record.plannedDate || '',record.date || ''),
  };
}
