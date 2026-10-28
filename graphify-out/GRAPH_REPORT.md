# Graph Report - con1  (2026-10-28)

## Corpus Check
- 63 files · ~25,797 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 3, .css 3, .example 1)

## Summary
- 516 nodes · 1201 edges · 29 communities (23 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `66575e28`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PouringProgress
- ConcreteApp.tsx
- site-photos-cloud.ts
- test-log-upgrade.cjs
- test-progress-schedule.cjs
- test-same-day-progress.cjs
- compilerOptions
- test-data-safety.cjs
- 🏗️ 콘크리트 타설 및 양생 관리 시스템 (Concrete Pouring & Curing Log)
- test-pouring-progress.cjs
- test-progress-structure.cjs
- test-cloud-storage-live.cjs
- package.json
- ref_node_assert
- test-progress-print.cjs
- dependencies
- devDependencies
- layout.tsx
- 20261026013357_progress_and_photos_cloud.sql
- scripts
- schema.sql
- overrides
- @supabase/supabase-js
- tailwindcss
- next.config.mjs
- Project Rules & Customizations
- app-backup.ts

## God Nodes (most connected - your core abstractions)
1. `PouringProgress()` - 63 edges
2. `ConcreteApp()` - 39 edges
3. `SitePhotos()` - 25 edges
4. `Site` - 22 edges
5. `validateProgress()` - 18 edges
6. `react` - 16 edges
7. `compilerOptions` - 16 edges
8. `shortDate()` - 14 edges
9. `PouringLog` - 14 edges
10. `document()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Props` --references--> `Site`  [EXTRACTED]
  components/PouringProgress.tsx → lib/types.ts
- `editStage()` --indirect_call--> `document()`  [INFERRED]
  components/ProgressStructure.tsx → scripts/test-pouring-progress.cjs
- `input()` --calls--> `normalizeShortDate()`  [EXTRACTED]
  components/ShortDateInput.tsx → lib/date-only.ts
- `Home()` --calls--> `ConcreteApp()`  [EXTRACTED]
  app/page.tsx → components/ConcreteApp.tsx
- `PhotosPage()` --calls--> `ConcreteApp()`  [EXTRACTED]
  app/photos/page.tsx → components/ConcreteApp.tsx

## Import Cycles
- None detected.

## Communities (29 total, 6 thin omitted)

### Community 0 - "PouringProgress"
Cohesion: 0.07
Nodes (85): blankEntry(), cn(), ink(), PouringProgress(), applyRecords(), beginInline(), cancelInline(), chooseColor() (+77 more)

### Community 1 - "ConcreteApp.tsx"
Cohesion: 0.09
Nodes (53): Home(), PhotosPage(), ProgressPage(), ConcreteApp(), canLeavePhotos(), openSiteManager(), refreshArchives(), Header() (+45 more)

### Community 2 - "site-photos-cloud.ts"
Cohesion: 0.11
Nodes (44): PhotoImage(), photoLocation(), PhotoLocationEditor(), submit(), SitePhotos(), attach(), changeMonth(), download() (+36 more)

### Community 3 - "test-log-upgrade.cjs"
Cohesion: 0.06
Nodes (20): appHarness(), assert, backup, cache, check(), data, editorNode(), find() (+12 more)

### Community 4 - "test-progress-schedule.cjs"
Cohesion: 0.09
Nodes (20): area, assert, backup, cache, colors, dates, entries, extended() (+12 more)

### Community 5 - "test-same-day-progress.cjs"
Cohesion: 0.10
Nodes (17): appBackup, archive, assert, backup, cache, detail, draft(), entries (+9 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "test-data-safety.cjs"
Cohesion: 0.13
Nodes (13): assert, cloud(), data, fs, load(), model, path, photosCloud() (+5 more)

### Community 8 - "🏗️ 콘크리트 타설 및 양생 관리 시스템 (Concrete Pouring & Curing Log)"
Cohesion: 0.13
Nodes (14): 1. 저장소 클론 및 패키지 설치, 2026-10-27 안정성 검토, 2. 개발 서버 실행, ⚡ Supabase DB 연동 가이드, Supabase 접속 없이 실제 앱 실행 방법, 🛠️ 기술 스택 (Tech Stack), 동별 타설현황, 📄 라이선스 (License) (+6 more)

### Community 9 - "test-pouring-progress.cjs"
Cohesion: 0.12
Nodes (13): archive, assert, backup, editor, entries, fs, logData, model (+5 more)

### Community 10 - "test-progress-structure.cjs"
Cohesion: 0.14
Nodes (11): assert, {changeStage}, doc, empty, fs, model, next, original (+3 more)

### Community 11 - "test-cloud-storage-live.cjs"
Cohesion: 0.14
Nodes (12): assert, cache, client, env, fs, localPhotos, original, path (+4 more)

### Community 12 - "package.json"
Cohesion: 0.17
Nodes (11): name, private, version, autoprefixer, clsx, postcss, react-dom, tailwind-merge (+3 more)

### Community 13 - "ref_node_assert"
Cohesion: 0.22
Nodes (5): assert, client, crypto, env, fs

### Community 14 - "test-progress-print.cjs"
Cohesion: 0.22
Nodes (7): typescript, assert, fs, load(), path, { progressPrintPages }, ts

### Community 15 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, clsx, lucide-react, next, react, react-dom, @supabase/supabase-js, tailwind-merge

### Community 16 - "devDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, autoprefixer, postcss, tailwindcss, @types/node, @types/react, @types/react-dom, typescript

### Community 18 - "20261026013357_progress_and_photos_cloud.sql"
Cohesion: 0.38
Nodes (3): public.pouring_progress, public.site_photos, site_photos_site_id_idx

### Community 19 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, start

### Community 20 - "schema.sql"
Cohesion: 0.70
Nodes (4): idx_pouring_logs_date, idx_pouring_logs_site_id, pouring_logs, sites

### Community 21 - "overrides"
Cohesion: 0.50
Nodes (4): postcss, overrides, next, postcss-selector-parser

### Community 27 - "Project Rules & Customizations"
Cohesion: 0.50
Nodes (3): Git Commit Message Directive, Graphify 프로젝트 그래프, Project Rules & Customizations

### Community 28 - "app-backup.ts"
Cohesion: 0.21
Nodes (22): BackupManager(), exportData(), prepare(), preview(), initData(), AppBackup, backupCounts(), collectBackup() (+14 more)

## Knowledge Gaps
- **5 isolated node(s):** `@types/node`, `@types/react`, `@types/react-dom`, `autoprefixer`, `postcss`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 216 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `typescript` connect `test-progress-print.cjs` to `test-log-upgrade.cjs`, `test-progress-schedule.cjs`, `test-same-day-progress.cjs`, `test-data-safety.cjs`, `test-pouring-progress.cjs`, `test-progress-structure.cjs`, `test-cloud-storage-live.cjs`, `package.json`?**
  _High betweenness centrality (0.303) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `PouringProgress()` (e.g. with `blankEntry()` and `exportCSV()`) actually correct?**
  _`PouringProgress()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@types/node`, `@types/react`, `@types/react-dom` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PouringProgress` be split into smaller, more focused modules?**
  _Cohesion score 0.06990099009900991 - nodes in this community are weakly interconnected._
- **Why does `react` connect `ConcreteApp.tsx` to `PouringProgress`, `site-photos-cloud.ts`, `app-backup.ts`, `package.json`?**
  _High betweenness centrality (0.206) - this node is a cross-community bridge._
- **Should `ConcreteApp.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0887719298245614 - nodes in this community are weakly interconnected._
- **Why does `PouringProgress()` connect `PouringProgress` to `ConcreteApp.tsx`, `site-photos-cloud.ts`, `app-backup.ts`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._