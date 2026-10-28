# Project Rules & Customizations

## Git Commit Message Directive
- 코드를 수정하거나 기능을 추가/수정한 후 답변을 마무리할 때, 답변의 **마지막 부분에 항상 해당 코드 변경 사항에 부합하는 Git 커밋 메시지 명령어 코드 블록**(`git commit -m "..."`)을 함께 제공합니다.

## Graphify 프로젝트 그래프

- 코드 구조나 관계를 조사할 때 이 프로젝트의 `graphify-out/graph.json`이 있으면 `graphify query "<질문>"`, `graphify path` 또는 `graphify explain`으로 그래프를 먼저 참고한다. 관련 원본 코드도 확인한다.
- 그래프가 없거나 오래되었거나 검색 결과가 부족하면 원본 코드로 확인하고 그 한계를 밝힌다.
- 파일 감시가 실행 중이면 코드 변경 후 그래프 갱신이 끝났는지 확인한다. 감시가 중지됐거나 갱신이 실패했으면 이 프로젝트 루트에서 `graphify update .`를 실행한다.
- 그래프는 코드 구조 중심이며 문서·이미지의 의미 분석은 자동으로 갱신되지 않는다. `.graphifyignore`의 보관·백업 및 로컬 데이터 제외 규칙을 유지한다.
