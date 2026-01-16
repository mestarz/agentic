import { Code } from 'lucide-react';

export function DocsView() {
  return (
    <main className="flex-1 bg-white overflow-y-auto p-12 custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm"><Code size={28} /></div>
          <div><h1 className="text-3xl font-black text-slate-800 tracking-tight">API 接口文档</h1><p className="text-slate-500 font-medium">ContextFabric Core v1.0.0</p></div>
        </div>
        
        <section className="mb-12 text-sm leading-relaxed text-slate-600 bg-slate-50 p-6 rounded-2xl border border-slate-100">
          ContextFabric Core 提供无状态的上下文工程能力，负责会话管理、历史持久化以及 Token 优化裁剪。
        </section>

        <div className="space-y-12">
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div> 上下文构建 (Build Context)</h2>
            <p className="text-xs text-slate-500">获取经过 Token 优化和系统指令注入后的完整对话 Payload。</p>
            <div className="bg-slate-900 rounded-2xl p-6 font-mono text-xs text-indigo-300 shadow-xl overflow-x-auto">
              <pre>{`POST /api/v1/context\n\n请求体:\n{\n  "session_id": "string",\n  "query": "用户输入",\n  "config": { "model": "..." }\n}\n\n响应:\n{\n  "messages": [\n    { "role": "system", "content": "..." },\n    { "role": "user", "content": "...", "meta": { "tokens_total": 120 } }\n  ]\n`}</pre>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div> 消息追加 (Append Message)</h2>
            <p className="text-xs text-slate-500">将模型生成的回复或用户消息手动存入持久化层。</p>
            <div className="bg-slate-900 rounded-2xl p-6 font-mono text-xs text-emerald-300 shadow-xl overflow-x-auto">
              <pre>{`POST /api/v1/messages\n\n请求体:\n{\n  "session_id": "string",\n  "message": {\n    "role": "assistant",\n    "content": "内容",\n    "timestamp": "2026-01-16T..."\n  }\n}`}</pre>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div> 会话管理 (Admin APIs)</h2>
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                <code className="text-xs font-bold text-indigo-600">GET /api/admin/sessions</code>
                <p className="text-[10px] text-slate-500 mt-1">获取所有活跃会话的摘要列表。</p>
              </div>
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                <code className="text-xs font-bold text-indigo-600">GET /api/admin/sessions/:id</code>
                <p className="text-[10px] text-slate-500 mt-1">获取指定会话的完整历史记录。</p>
              </div>
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                <code className="text-xs font-bold text-red-600">DELETE /api/admin/sessions/:id</code>
                <p className="text-[10px] text-slate-500 mt-1">永久删除指定会话的文件。</p>
              </div>
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                <code className="text-xs font-bold text-red-600">DELETE /api/admin/sessions</code>
                <p className="text-[10px] text-slate-500 mt-1">批量删除会话。请求体为 ID 数组: <code className="bg-white px-1">["id1", "id2"]</code></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
