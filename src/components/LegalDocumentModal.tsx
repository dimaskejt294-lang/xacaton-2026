import { Download, ExternalLink, FileText, X } from 'lucide-react';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { LegalDocumentItem } from '../types.ts';

interface LegalDocumentModalProps {
  doc: LegalDocumentItem | null;
  onClose: () => void;
}

export const LegalDocumentModal: React.FC<LegalDocumentModalProps> = ({ doc, onClose }) => {
  const [viewTab, setViewTab] = useState<'text' | 'pdf'>('text');

  if (!doc || typeof document === 'undefined') {
    return null;
  }

  const isPdf = doc.has_file === 1 && doc.mime_type === 'application/pdf';
  const isImage = doc.has_file === 1 && doc.mime_type?.startsWith('image/');
  const hasOtherFile = doc.has_file === 1 && !isPdf && !isImage && doc.mime_type !== 'text/plain';

  const fileInlineUrl = `/api/public/legal/${encodeURIComponent(doc.doc_key)}/file?inline=1`;
  const fileDownloadUrl = `/api/public/legal/${encodeURIComponent(doc.doc_key)}/file`;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-[#6B7280]">Документ мастерской «Ясна»</div>
            <div className="truncate font-display text-sm font-semibold text-[#111827] sm:text-base">
              {doc.title}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isPdf && (
              <a
                href={fileInlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 text-xs font-medium text-[#111827] hover:bg-[#F3F4F6]"
              >
                <ExternalLink className="h-3.5 w-3.5 text-[#C86D2D]" strokeWidth={1.5} />
                <span className="hidden sm:inline">Открыть PDF</span>
                <span className="sm:hidden">PDF</span>
              </a>
            )}
            <a
              href={fileDownloadUrl}
              download={doc.original_name || `${doc.doc_key}.pdf`}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#C86D2D] px-3 text-xs font-medium text-white hover:bg-[#B05B20]"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Скачать</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть документ"
              className="inline-flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Toggle between mobile-friendly Text and PDF preview when PDF is attached */}
        {isPdf && (
          <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-4 py-2 sm:px-5">
            <div className="inline-flex rounded-lg border border-[#E5E7EB] bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewTab('text')}
                className={`min-h-[32px] cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors ${
                  viewTab === 'text'
                    ? 'bg-[#C86D2D] text-white'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                Текст документа
              </button>
              <button
                type="button"
                onClick={() => setViewTab('pdf')}
                className={`min-h-[32px] cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors ${
                  viewTab === 'pdf'
                    ? 'bg-[#C86D2D] text-white'
                    : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                PDF-оригинал
              </button>
            </div>
            {doc.original_name && (
              <span className="hidden truncate text-[11px] text-[#6B7280] sm:inline">
                {doc.original_name}
              </span>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-[#F9FAFB] p-4 sm:p-5">
          {isPdf && viewTab === 'pdf' ? (
            <iframe
              src={fileInlineUrl}
              title={doc.title}
              className="h-[66vh] w-full rounded-xl border border-[#E5E7EB] bg-white"
            />
          ) : isImage ? (
            <div className="flex items-center justify-center">
              <img
                src={fileInlineUrl}
                alt={doc.title}
                className="max-h-[70vh] w-auto rounded-xl border border-[#E5E7EB] bg-white object-contain shadow-sm"
              />
            </div>
          ) : hasOtherFile ? (
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-6 text-center text-sm text-[#374151]">
              <FileText className="mx-auto h-8 w-8 text-[#C86D2D]" strokeWidth={1.5} />
              <p className="mt-2">
                Загружен файл: <strong>{doc.original_name}</strong>.
              </p>
              <p className="mt-1 text-xs text-[#6B7280]">
                Нажмите «Скачать» выше, чтобы открыть документ на вашем устройстве.
              </p>
            </div>
          ) : (
            <div className="whitespace-pre-wrap rounded-xl border border-[#E5E7EB] bg-white p-4 text-sm leading-relaxed text-[#111827] sm:p-5">
              {doc.content_text}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
