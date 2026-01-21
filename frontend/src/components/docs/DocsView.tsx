import { Code } from 'lucide-react';

export function DocsView() {
  return (
    <main className="custom-scrollbar flex-1 overflow-y-auto bg-white p-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 shadow-sm">
            <Code size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-800">API 接口文档</h1>
            <p className="font-medium text-slate-500">ContextFabric Core v1.0.0</p>
          </div>
        </div>

        <section className="mb-12 rounded-2xl border border-slate-100 bg-slate-50 p-6 text-sm leading-relaxed text-slate-600">
          ContextFabric Core 提供无状态的上下文工程能力，负责会话管理、历史持久化以及 Token
          优化裁剪。
        </section>

        <div className="space-y-12">
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-600"></div> 上下文构建 (Build
              Context)
            </h2>
            <p className="text-xs text-slate-500">
              获取经过 Token 优化和系统指令注入后的完整对话 Payload。
            </p>
            <div className="overflow-x-auto rounded-2xl bg-slate-900 p-6 font-mono text-xs text-indigo-300 shadow-xl">
              <pre>{`POST /api/v1/context\n\n请求体:\n{\n  "session_id": "string",\n  "query": "用户输入",\n  "config": { "model": "..." }\n}\n\n响应:\n{\n  "messages": [\n    { "role": "system", "content": "..." },\n    { "role": "user", "content": "...", "meta": { "tokens_total": 120 } }\n  ]\n`}</pre>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-600"></div> 消息追加 (Append
              Message)
            </h2>
            <p className="text-xs text-slate-500">将模型生成的回复或用户消息手动存入持久化层。</p>
            <div className="overflow-x-auto rounded-2xl bg-slate-900 p-6 font-mono text-xs text-emerald-300 shadow-xl">
              <pre>{`POST /api/v1/messages\n\n请求体:\n{\n  "session_id": "string",\n  "message": {\n    "role": "assistant",\n    "content": "内容",\n    "timestamp": "2026-01-16T..."\n  }\n}`}</pre>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
              <div className="h-1.5 w-1.5 rounded-full bg-red-500"></div> 会话管理 (Admin APIs)
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
                <code className="text-xs font-bold text-indigo-600">GET /api/admin/sessions</code>
                <p className="mt-1 text-[10px] text-slate-500">获取所有活跃会话的摘要列表。</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
                <code className="text-xs font-bold text-indigo-600">
                  GET /api/admin/sessions/:id
                </code>
                <p className="mt-1 text-[10px] text-slate-500">获取指定会话的完整历史记录。</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
                <code className="text-xs font-bold text-red-600">
                  DELETE /api/admin/sessions/:id
                </code>
                <p className="mt-1 text-[10px] text-slate-500">永久删除指定会话的文件。</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-4">
                <code className="text-xs font-bold text-red-600">DELETE /api/admin/sessions</code>
                <p className="mt-1 text-[10px] text-slate-500">
                  批量删除会话。请求体为 ID 数组:{' '}
                  <code className="bg-white px-1">["id1", "id2"]</code>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
