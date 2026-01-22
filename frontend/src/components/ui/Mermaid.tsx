import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidProps {
  chart: string;
}

mermaid.initialize({
  startOnLoad: true,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif',
});

const Mermaid: React.FC<MermaidProps> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      mermaid.contentLoaded();
      // Generate a unique ID for each chart
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

      // Clear previous content
      ref.current.innerHTML = `<div id="${id}" class="mermaid">${chart}</div>`;

      mermaid
        .render(id, chart)
        .then(({ svg }) => {
          if (ref.current) {
            ref.current.innerHTML = svg;
          }
        })
        .catch((error) => {
          console.error('Mermaid rendering failed:', error);
          if (ref.current) {
            ref.current.innerHTML = `<div class="p-4 bg-red-50 text-red-500 rounded border border-red-200 text-sm">
            <p font-bold>Mermaid Chart Error</p>
            <pre class="mt-2 overflow-auto">${error.message}</pre>
          </div>`;
          }
        });
    }
  }, [chart]);

  return (
    <div
      ref={ref}
      className="my-6 flex justify-center overflow-x-auto rounded-lg border border-slate-100 bg-white p-4 shadow-sm"
    />
  );
};

export default Mermaid;
