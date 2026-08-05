# 🏗️ 콘크리트 타설 및 양생 관리 시스템 (Concrete Pouring & Curing Log)

> **Next.js 14 (App Router)**와 **Supabase**를 기반으로 구축된 건설 현장 콘크리트 타설 위치, 온도, 기상, 레미콘사, 강도/물량 및 살수/보양 양생 통합 관리 웹 애플리케이션입니다.

---

## ✨ 핵심 기능

* 📋 **엑셀 표 서식 100% 매핑**
  * `구분`, `일자`, `타설위치(동/층/벽-슬라브)`, `최저/최고온도`, `기상`, `레미콘사`, `타설강도`, `타설물량`, `양생방법(살수/보양)` 통합 테이블
* ✏️ **엑셀형 표 직접 입력 (Inline Quick Entry & Cell Editing)**
  * 표 하단 점선 빈칸 행에 직접 입력 후 `Enter` 또는 `[추가]` 클릭 시 즉시 기록
  * 기존 기록 행의 `✏️ 수정` 클릭 시 셀 단위 직관 수정 지원
* 🏢 **현장별 멀티 관리**
  * 이미지 양식의 현장 목록 기본 제공 (`대구 범어 자이 S&D`, `평택역 센트럴시티 현대 2공구`, `용인 SK FAB 지원 부속시설` 등)
  * 신규 현장 추가/삭제 관리 모달 지원
* 🚨 **스마트 양생 조건 자동 알림**
  * **서중 콘크리트 양생**: 최고온도 30°C 이상 시 살수 피복 양생 필수 알림
  * **동절기 보양 양생**: 최저온도 4°C 이하 시 방열/가온 보양 필수 알림
* 🖨️ **공식 A4 인쇄 / PDF 결재 서식**
  * 엑셀 공식 양식(작성자/검토자/승인자 결재란 포함) 그대로 내보내기 및 `window.print()` 지원
* 📑 **CSV 내보내기**
  * 엑셀 한글 깨짐 방지(UTF-8 BOM)가 적용된 CSV 내보내기 지원
* ⚡ **Supabase 자동 감지 & 실시간 DB 연동**
  * 기본 로컬 상태 및 LocalStorage 지원 + `.env.local` 입력 시 Supabase 실시간 클라우드 DB로 자동 전환

---

## 🛠️ 기술 스택 (Tech Stack)

| 구분 | 사용 기술 |
| :--- | :--- |
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS, Lucide Icons |
| **Database** | Supabase (PostgreSQL), LocalStorage |
| **Deployment** | Vercel Ready |

---

## 📂 프로젝트 구조

```text
├── app/
│   ├── globals.css        # 전역 스타일 및 인쇄 서식 미디어 쿼리
│   ├── layout.tsx         # 루트 레이아웃 & Tailwind 스크립트
│   └── page.tsx           # 메인 대시보드 페이지
├── components/
│   ├── Header.tsx         # 네비게이션, 현장 선택, 액션 버튼
│   ├── RecordTable.tsx    # 엑셀 스타일 일지 테이블 (직접 입력 빈칸 행 포함)
│   ├── RecordModal.tsx    # 기록 추가/수정 모달 폼
│   ├── SiteModal.tsx      # 현장 등록/삭제 관리 모달
│   ├── SummaryCards.tsx   # 현장별 온도시스템 및 상태 카운터
│   └── PrintView.tsx      # A4 공식 출력/PDF 서식 뷰
├── lib/
│   ├── mockData.ts        # 샘플 현장 및 타설 일지 데이터
│   ├── supabase.ts        # Supabase 클라이언트 감지 모듈
│   └── types.ts           # TypeScript 인터페이스 정의
├── supabase/
│   └── schema.sql         # Supabase DB 생성 및 RLS 정책 SQL
├── .env.example           # 환경 변수 예시 템플릿
├── package.json
└── README.md
```

---

## 🚀 로컬 실행 방법 (Getting Started)

### 1. 저장소 클론 및 패키지 설치
```bash
git clone https://github.com/YOUR_USERNAME/concrete-pouring-curing-log.git
cd concrete-pouring-curing-log
npm install
```

### 2. 개발 서버 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:3000` 접속 시 즉시 확인하실 수 있습니다.

---

## ⚡ Supabase DB 연동 가이드

1. [Supabase](https://supabase.com) 프로젝트 생성
2. Supabase **SQL Editor**에서 [`supabase/schema.sql`](./supabase/schema.sql) 스크립트 실행 (테이블 자동 생성)
3. `.env.example` 파일을 복사하여 `.env.local` 생성 후 API 키 입력:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```
4. 앱 재시작 시 상단 뱃지가 **`⚡ Supabase 연동됨`**으로 바뀌며 실시간 DB로 연결됩니다.

---

## 📄 라이선스 (License)

This project is licensed under the [MIT License](LICENSE).
