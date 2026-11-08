import asyncio
import json
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from starlette.requests import Request

import app
import chat_service as chat


def line(event):
    return json.dumps(event, ensure_ascii=False).encode()+b'\n'


class SplitStream(httpx.AsyncByteStream):
    def __init__(self, content):
        self.content = content

    async def __aiter__(self):
        for index in range(0, len(self.content), 3):
            yield self.content[index:index+3]


class ChatTests(unittest.TestCase):
    def setUp(self):
        chat.visitors.clear()
        chat.health_cache = None
        self.requests = []
        self.created = 0
        self.stream = (line({'event': 'assistant.delta', 'event_id': 'one', 'content': '안녕'})+
                       line({'event': 'assistant.delta', 'event_id': 'one', 'content': '중복'})+
                       line({'event': 'assistant.delta', 'content': [{'type': 'reasoning', 'text': '비공개'}, {'type': 'text', 'text': '하세요.'}]})+
                       line({'event': 'tool.completed', 'content': '도구 원문'})+
                       line({'event': 'turn.completed'}))
        original = httpx.AsyncClient
        transport = httpx.MockTransport(self.handle)
        self.patches = [patch.object(chat, 'settings', return_value=('https://agent.invalid/agentstream', 'fixed-bot', 'test-only-key')),
                        patch.object(chat.httpx, 'AsyncClient', side_effect=lambda **kw: original(transport=transport, **kw))]
        for p in self.patches:
            p.start()
        self.client = TestClient(app.app)

    def tearDown(self):
        self.client.close()
        for p in reversed(self.patches):
            p.stop()

    def handle(self, request):
        self.requests.append(request)
        self.assertEqual(request.headers.get('X-API-Key'), 'test-only-key')
        self.assertNotIn('cookie', request.headers)
        if request.url.path.endswith('/health'):
            return httpx.Response(200, json={'status': 'healthy', 'message': '정상', 'checked_at': 'now'})
        if request.url.path.endswith('/sessions'):
            self.created += 1
            return httpx.Response(201, json={'session_id': 'upstream-'+str(self.created)})
        return httpx.Response(200, headers={'content-type': 'application/x-ndjson'}, stream=SplitStream(self.stream))

    def post(self, text='첫 질문', cid=None, client=None):
        r = (client or self.client).post('/api/chat/messages', json={'message': text, 'conversation_id': cid})
        return r, [json.loads(x) for x in r.text.splitlines()] if r.status_code == 200 else []

    def test_fragmented_korean_text_dedup_and_follow_up_same_session(self):
        response, events = self.post()
        self.assertEqual(response.status_code, 200)
        cid = events[0]['conversation_id']
        self.assertEqual(''.join(e.get('content', '') for e in events), '안녕하세요.')
        self.assertEqual(events[-1]['type'], 'turn.completed')
        self.assertIn('HttpOnly', response.headers['set-cookie'])
        self.assertNotIn('upstream-', response.text)
        self.assertNotIn('test-only-key', response.text)
        response, _ = self.post('후속 질문', cid)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.created, 1)
        posts = [r for r in self.requests if r.method == 'POST']
        self.assertEqual(json.loads(posts[0].content), {'query': '첫 질문'})
        self.assertEqual(json.loads(posts[1].content), {'message': '첫 질문'})
        self.assertEqual(json.loads(posts[2].content), {'message': '후속 질문'})
        self.assertEqual(posts[1].url, posts[2].url)

    def test_another_visitor_cannot_access_conversation(self):
        _, events = self.post()
        with TestClient(app.app) as other:
            response, _ = self.post('다른 사용자', events[0]['conversation_id'], other)
            self.assertEqual(response.status_code, 404)
            response, _ = self.post('새 질문', client=other)
            self.assertEqual(response.status_code, 200)
        self.assertEqual(self.created, 2)

    def test_incomplete_stream_keeps_partial_and_requires_new_conversation(self):
        self.stream = line({'event': 'assistant.delta', 'content': '일부 답변'})
        response, events = self.post()
        self.assertIn('일부 답변', response.text)
        self.assertEqual(events[-1]['type'], 'turn.failed')
        response, _ = self.post('다음', events[0]['conversation_id'])
        self.assertEqual(response.status_code, 409)

    def test_failed_tool_and_malformed_json_do_not_complete(self):
        for payload in [line({'event': 'tool.failed'}), b'{broken}\n']:
            self.stream = payload
            _, events = self.post()
            self.assertEqual(events[-1]['type'], 'turn.failed')
            self.assertNotIn('turn.completed', [e['type'] for e in events])

    def test_cross_origin_and_blank_message_are_rejected(self):
        response = self.client.post('/api/chat/messages', json={'message': '안녕'}, headers={'Origin': 'https://other.invalid'})
        self.assertEqual(response.status_code, 403)
        response, _ = self.post('   ')
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.created, 0)

    def test_health_status_is_not_inferred_from_http_200(self):
        chat.health_cache = (chat.time.monotonic(), {'status': 'unhealthy'})
        response, _ = self.post()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.created, 0)

    def test_cancellation_releases_lock_and_marks_conversation_interrupted(self):
        async def cancel():
            request = Request({'type': 'http', 'method': 'POST', 'path': '/api/chat/messages',
                               'scheme': 'http', 'server': ('testserver', 80), 'headers': []})
            response = await chat.send_message(chat.ChatMessage(message='취소 검사'), request)
            first = json.loads(await anext(response.body_iterator))
            await response.body_iterator.aclose()
            owner = next(iter(chat.visitors.values()))
            conversation = owner.conversations[first['conversation_id']]
            self.assertFalse(conversation.busy)
            self.assertTrue(conversation.interrupted)
        asyncio.run(cancel())

    def test_upstream_auth_failure_does_not_retry_or_expose_error_body(self):
        original = httpx.AsyncClient
        def handler(request):
            if request.url.path.endswith('/health'):
                return httpx.Response(200, json={'status': 'healthy'})
            self.created += 1
            return httpx.Response(401, json={'detail': 'test-only-key should not appear'})
        self.patches[-1].stop()
        # The initial method was patched globally; use the unpatched class from httpx internals.
        from httpx._client import AsyncClient
        with patch.object(chat.httpx, 'AsyncClient', side_effect=lambda **kw: AsyncClient(transport=httpx.MockTransport(handler), **kw)):
            response, _ = self.post()
        self.assertEqual(response.status_code, 401)
        self.assertNotIn('test-only-key', response.text)
        self.assertEqual(self.created, 1)
