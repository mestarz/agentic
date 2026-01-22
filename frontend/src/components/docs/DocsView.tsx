import { useState, useEffect } from 'react';
import { BookOpen, FileText, Loader2 } from 'lucide-react';
import { Markdown } from '../ui/Markdown';

export function DocsView() {
  const [docs, setDocs] = useState<string[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/admin/docs')
      .then((res) => res.json())
      .then((data) => {
        setDocs(data);
        if (data.length > 0) {
          const readme = data.find((d: string) => d.toLowerCase() === 'readme.md');
          const initialDoc = readme || data[0];
          setSelectedDoc(initialDoc);
          setLoading(true); // 初始加载列表后，立即标记正在加载第一个文档内容
        }
      })
      .catch((err) => console.error('Failed to load docs list', err));
  }, []);

  useEffect(() => {
    if (!selectedDoc) return;
    // 不再在这里同步执行 setLoading(true)，因为它应该由触发者设置
    fetch(`/api/admin/docs?name=${selectedDoc}`)
      .then((res) => res.text())
      .then((text) => setContent(text))
      .catch((err) => console.error('Failed to load doc content', err))
      .finally(() => setLoading(false));
  }, [selectedDoc]);

  const handleSelectDoc = (doc: string) => {
    if (doc === selectedDoc) return;
    setSelectedDoc(doc);
    setLoading(true); // 用户点击时手动触发加载状态
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 p-6">
          <BookOpen size={18} className="text-indigo-600" />
          <h2 className="text-[10px] font-black tracking-widest text-slate-800 uppercase">
            项目文档
          </h2>
        </div>

        <div className="flex-1 space-y-1 p-4">
          {docs.map((doc) => (
            <button
              key={doc}
              onClick={() => handleSelectDoc(doc)}
              className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all ${
                selectedDoc === doc
                  ? 'bg-indigo-50 font-bold text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <FileText
                size={16}
                className={selectedDoc === doc ? 'text-indigo-600' : 'text-slate-400'}
              />
              <span className="truncate text-xs">{doc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        {selectedDoc && (
          <div className="flex items-center justify-between border-b border-slate-100 px-8 py-4">
            <h1 className="text-lg font-black tracking-tight text-slate-800">{selectedDoc}</h1>
          </div>
        )}

        <div className="custom-scrollbar flex-1 overflow-y-auto p-8 lg:p-12">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={32} className="animate-spin text-indigo-200" />
            </div>
          ) : (
            <div className="prose prose-slate prose-headings:font-black prose-a:text-indigo-600 prose-pre:bg-slate-900 prose-pre:text-slate-50 max-w-4xl">
              <Markdown content={content} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
