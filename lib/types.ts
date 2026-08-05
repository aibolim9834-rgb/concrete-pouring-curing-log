export interface Site {
  id: string;
  name: string;
  code?: string;
  address?: string;
  created_at?: string;
}

export interface PouringLog {
  id: string;
  site_id: string;
  category: string; // 구분 (e.g. 1, 2, 3...)
  date: string; // 일자 (YYYY-MM-DD)
  building: string; // 동(구역)
  floor: string; // 층
  member_type: string; // 벽/슬라브 (구조부위)
  min_temp: number | null; // 최저온도 (°C)
  max_temp: number | null; // 최고온도 (°C)
  weather: '맑음' | '흐림' | '비' | '눈' | string; // 기상 (눈/비/맑음)
  remicon_company: string; // 레미콘사
  strength?: string; // 타설강도 (e.g. 24MPa, 25-24-150 등)
  volume?: number | string | null; // 타설물량 (m³)
  curing_watering: string; // 양생방법 - 살수
  curing_protection: string; // 양생방법 - 보양
  remarks?: string; // 비고
  created_at?: string;
}

export type PouringLogInput = Omit<PouringLog, 'id' | 'created_at'>;
