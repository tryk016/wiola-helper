import { useState, type DragEvent } from 'react';

interface Props {
  onDrop: (files: string[]) => void;
  onPickFiles: () => void;
}

export function DropZone({ onDrop, onPickFiles }: Props) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files: string[] = [];
    for (const f of Array.from(e.dataTransfer.files)) {
      try {
        const p = window.wiola.getPathForFile(f);
        if (p && p.toLowerCase().endsWith('.pdf')) files.push(p);
      } catch {
        // skip files without path
      }
    }
    if (files.length) onDrop(files);
  };

  return (
    <div className="p-6">
      <div
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={onPickFiles}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${dragOver
            ? 'border-ewi-green bg-ewi-green/10 scale-[1.02]'
            : 'border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'
          }
        `}
      >
        <div className="text-6xl mb-3 opacity-60">📥</div>
        <div className="text-lg font-medium">
          {dragOver ? 'Upuść tutaj' : 'Przeciągnij faktury Kreisla tutaj'}
        </div>
        <div className="text-sm text-slate-400 mt-1">
          {dragOver ? '' : 'lub kliknij aby wybrać pliki'}
        </div>
      </div>
    </div>
  );
}
