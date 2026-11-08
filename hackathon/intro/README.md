# 교통문화연수원 태양광 점검 앱

FastAPI 서버와 React 기반 모니터링 화면을 사용합니다. 서버는 8501 포트에서 실행합니다.

```bash
.venv/bin/python server.py
```

`frontend/inspection_flow.*`, `frontend/chat_widget.*` 또는 사이트 설정을 수정했다면 화면 번들을 갱신합니다.

```bash
.venv/bin/python build_inspection_frontend.py
```

## 챗봇 연결

`.env.example`을 `.env`로 복사하고 `AGENTSTREAM_API_KEY`를 입력하거나, 동일한 이름의 서버 환경변수를 설정합니다. 환경변수가 `.env`보다 우선합니다. 실제 `.env`는 Git에서 제외되며 API 키는 브라우저에 전달하지 않습니다.

홈페이지 우측 하단의 **AI 도우미** 버튼으로 위젯을 엽니다. Enter로 전송하고 Shift+Enter로 줄바꿈합니다. 답변 생성 중에는 중지 버튼을 사용할 수 있습니다. 위젯을 닫아도 현재 화면의 대화는 유지되며, 새 대화 버튼이나 페이지 새로고침 시 초기화됩니다.

요청은 브라우저 → `/api/chat/messages` → AgentStream `/open/v1` 순서로 전달됩니다. 서버는 최초 질문으로 외부 세션을 생성한 뒤 동일한 질문을 메시지 API로 전송합니다. 후속 질문은 같은 외부 세션을 사용합니다. HttpOnly 방문자 쿠키와 서버의 대화 매핑으로 방문자별 세션을 분리합니다. 외부 세션 ID와 API 키는 브라우저로 보내지 않습니다.

NDJSON의 `assistant.delta` 텍스트만 화면에 표시하고 `turn.completed`를 수신해야 답변 완료로 처리합니다. 중복 이벤트는 제외합니다. 실패·취소 시 수신한 텍스트를 유지하며, 새 대화로 명시적으로 다시 시작합니다. 실패한 POST를 자동 재전송하지 않습니다. 저장된 챗봇 프롬프트는 AgentStream이 적용하며 앱은 시스템 프롬프트를 추가하지 않습니다.

방문자·대화 매핑은 현재 서버 프로세스 메모리에서 최대 24시간 유지되므로 서버가 재시작되면 새 대화를 시작해야 합니다. 질문과 답변은 AgentStream의 이력 정책에 따라 저장될 수 있습니다. 현재 역할 전환은 시연 기능이며 챗봇의 서버 인증과 별개입니다.

```bash
.venv/bin/python -m unittest test_chat_service test_row_route test_inspection_flow -q
```

`test_chat_service`는 외부 통신 대역을 사용해 분할 스트림·실패·세션 소유권 등을 검사합니다. 실제 모델 연결과 배포 주소에서의 응답 완료는 별도로 확인해야 합니다.
