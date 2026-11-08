"""AgentStream proxy. Credentials and upstream session IDs stay on this server."""
import asyncio
import codecs
from dataclasses import dataclass, field
import json
import os
from pathlib import Path
import secrets
import time
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
router = APIRouter(prefix='/api/chat')
COOKIE = 'ax_chat_visitor'
TTL = 24*3600


def settings():
    local = {}
    path = ROOT/'.env'
    if path.is_file():
        for line in path.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                if key.startswith('AGENTSTREAM_'):
                    local[key.strip()] = value.strip().strip('\"\'')
    get = lambda key, default='': os.environ.get(key, local.get(key, default))
    return get('AGENTSTREAM_BASE_URL', 'https://api-gateway.jntp-ax.or.kr/agentstream').rstrip('/'), get('AGENTSTREAM_CHATBOT_ID', '33264ead-9e98-44b5-b550-d91b72b844cc'), get('AGENTSTREAM_API_KEY')


def connection():
    base, bot, key = settings()
    if not key:
        raise HTTPException(503, '챗봇 연결 설정이 필요합니다.')
    return base+'/open/v1', bot, {'X-API-Key': key}


def check_origin(request):
    origin = request.headers.get('origin')
    host = request.headers.get('x-forwarded-host', request.headers.get('host', '')).split(',')[0].strip()
    if origin and urlsplit(origin).netloc != host:
        raise HTTPException(403, '현재 사이트에서 채팅을 이용해 주세요.')


@dataclass
class Conversation:
    remote_id: str | None = None
    busy: bool = False
    interrupted: bool = False


@dataclass
class Visitor:
    touched: float = field(default_factory=time.monotonic)
    conversations: dict = field(default_factory=dict)


visitors: dict[str, Visitor] = {}
health_cache = None


def visitor(request):
    now = time.monotonic()
    for key, value in list(visitors.items()):
        if now-value.touched > TTL and not any(c.busy for c in value.conversations.values()):
            del visitors[key]
    token = request.cookies.get(COOKIE)
    if token not in visitors:
        if len(visitors) >= 2000:
            raise HTTPException(429, '접속자가 많습니다. 잠시 후 다시 시도해 주세요.')
        token = secrets.token_urlsafe(32)
        visitors[token] = Visitor()
    visitors[token].touched = now
    return token, visitors[token]


async def health():
    global health_cache
    if health_cache and time.monotonic()-health_cache[0] < 20:
        return health_cache[1]
    base, bot, headers = connection()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(f'{base}/chatbots/{bot}/health', headers=headers)
            if response.status_code != 200 or 'application/json' not in response.headers.get('content-type', ''):
                raise HTTPException(503, '챗봇 연결 상태를 확인할 수 없습니다.')
            doc = response.json()
            data = {k: doc.get(k) for k in ('status', 'message', 'checked_at')}
            if data['status'] not in ('healthy', 'unhealthy', 'unknown'):
                data['status'] = 'unknown'
            # The upstream message is user-facing health text, never credentials.
            data['message'] = str(data['message'] or '').replace(settings()[2], '[비공개]')[:300]
            health_cache = (time.monotonic(), data)
            return data
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(503, '챗봇 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.') from exc


@router.get('/health')
async def chat_health():
    return JSONResponse(await health(), headers={'Cache-Control': 'no-store'})


class ChatMessage(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    conversation_id: str | None = Field(default=None, max_length=80)


async def ndjson_lines(chunks):
    decoder = codecs.getincrementaldecoder('utf-8')('strict')
    buffer = ''
    async for chunk in chunks:
        buffer += decoder.decode(chunk)
        if len(buffer) > 1024*1024:
            raise ValueError('응답이 너무 큽니다.')
        while '\n' in buffer:
            line, buffer = buffer.split('\n', 1)
            if line.strip():
                data = json.loads(line)
                if not isinstance(data, dict):
                    raise ValueError('잘못된 채팅 이벤트입니다.')
                yield data
    buffer += decoder.decode(b'', final=True)
    if buffer.strip():
        data = json.loads(buffer)
        if not isinstance(data, dict):
            raise ValueError('잘못된 채팅 이벤트입니다.')
        yield data


def delta_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return ''.join(block.get('text', '') for block in value
                       if isinstance(block, dict) and block.get('type') == 'text' and isinstance(block.get('text'), str))
    return ''


def event_type(event):
    return event.get('event') or event.get('type')


def pack(kind, **fields):
    return json.dumps({'type': kind, **fields}, ensure_ascii=False)+'\n'


def upstream_error(status):
    return {401: '챗봇 인증 정보를 확인해 주세요.', 403: '챗봇 호출 권한을 확인해 주세요.',
            404: '챗봇 연결 주소를 확인해 주세요.', 422: '질문 형식을 확인해 주세요.',
            429: '챗봇 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
            503: '챗봇 서버가 일시적으로 응답하지 않습니다.'}.get(status, '챗봇 서버 요청에 실패했습니다.')


@router.post('/messages')
async def send_message(body: ChatMessage, request: Request):
    check_origin(request)
    message = body.message.strip()
    if not message:
        raise HTTPException(422, '질문을 입력해 주세요.')
    base, bot, headers = connection()
    token, owner = visitor(request)
    cid = body.conversation_id
    if cid:
        if cid not in owner.conversations:
            raise HTTPException(404, '대화를 찾을 수 없습니다. 새 대화를 시작해 주세요.')
    else:
        if len(owner.conversations) >= 20:
            removable = next((k for k, v in owner.conversations.items() if not v.busy), None)
            if removable is None:
                raise HTTPException(429, '진행 중인 대화를 먼저 완료해 주세요.')
            del owner.conversations[removable]
        cid = secrets.token_urlsafe(24)
        owner.conversations[cid] = Conversation()
    conversation = owner.conversations[cid]
    if conversation.busy:
        raise HTTPException(409, '답변을 생성 중입니다. 완료 후 질문해 주세요.')
    if conversation.interrupted:
        raise HTTPException(409, '이전 답변이 중단되었습니다. 새 대화를 시작해 주세요.')
    conversation.busy = True
    try:
        state = await health()
        if state['status'] != 'healthy':
            raise HTTPException(503, '챗봇이 현재 응답할 수 없습니다. 잠시 후 다시 시도해 주세요.')
        if not conversation.remote_id:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(f'{base}/chatbots/{bot}/sessions', headers=headers, json={'query': message})
            if response.status_code != 201:
                raise HTTPException(response.status_code if response.status_code in (401, 403, 404, 422, 429, 503) else 502, upstream_error(response.status_code))
            sid = response.json().get('session_id')
            if not isinstance(sid, str) or not sid:
                raise HTTPException(502, '챗봇 대화를 시작할 수 없습니다.')
            conversation.remote_id = sid
    except (httpx.HTTPError, ValueError) as exc:
        conversation.busy = False
        raise HTTPException(502, '챗봇 대화를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.') from exc
    except BaseException:
        conversation.busy = False
        raise

    async def stream():
        completed = False
        seen = set()
        try:
            yield pack('conversation.created', conversation_id=cid)
            async with asyncio.timeout(120):
                async with httpx.AsyncClient(timeout=httpx.Timeout(90, connect=15)) as client:
                    async with client.stream('POST', f'{base}/chat-sessions/{conversation.remote_id}/messages', headers=headers, json={'message': message}) as response:
                        if response.status_code != 200:
                            yield pack('turn.failed', message=upstream_error(response.status_code), status=response.status_code)
                            return
                        if 'application/x-ndjson' not in response.headers.get('content-type', ''):
                            yield pack('turn.failed', message='챗봇 응답 형식을 확인할 수 없습니다.')
                            return
                        async for event in ndjson_lines(response.aiter_bytes()):
                            if await request.is_disconnected():
                                return
                            eid = event.get('event_id')
                            if eid:
                                if eid in seen:
                                    continue
                                seen.add(eid)
                            kind = event_type(event)
                            if kind == 'assistant.delta':
                                text = delta_text(event.get('content'))
                                if text:
                                    yield pack(kind, content=text)
                            elif kind == 'turn.completed':
                                completed = True
                                yield pack(kind)
                                return
                            elif kind in ('turn.failed', 'tool.failed'):
                                yield pack('turn.failed', message='답변 생성이 완료되지 않았습니다. 새 대화로 다시 시도해 주세요.')
                                return
                            elif kind in ('progress', 'agent.progress'):
                                yield pack('progress')
                        yield pack('turn.failed', message='답변 연결이 중단되었습니다. 새 대화로 다시 시도해 주세요.')
        except (httpx.TimeoutException, TimeoutError):
            yield pack('turn.failed', message='답변 시간이 초과되었습니다. 새 대화로 다시 시도해 주세요.')
        except (httpx.HTTPError, ValueError, UnicodeError):
            yield pack('turn.failed', message='답변을 받는 중 오류가 발생했습니다. 새 대화로 다시 시도해 주세요.')
        finally:
            conversation.busy = False
            conversation.interrupted = not completed
            owner.touched = time.monotonic()

    response = StreamingResponse(stream(), media_type='application/x-ndjson', headers={
        'Cache-Control': 'no-cache, no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff'})
    secure = request.url.scheme == 'https' or request.headers.get('x-forwarded-proto') == 'https'
    response.set_cookie(COOKIE, token, httponly=True, secure=secure, samesite='lax', max_age=TTL, path='/')
    return response
