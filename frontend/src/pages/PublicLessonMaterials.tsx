import { useEffect, useState } from 'react';
import { Calendar, Download, FileWarning, Paperclip } from 'lucide-react';
import api from '../api/client';
import type { PublicLessonMaterials as PublicLessonMaterialsType } from '../types/domain';

const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

interface PublicLessonMaterialsProps {
  token: string;
}

const PublicLessonMaterials = ({ token }: PublicLessonMaterialsProps) => {
  const [data, setData] = useState<PublicLessonMaterialsType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.get<PublicLessonMaterialsType>(`/public/lesson-materials/${token}`)
      .then((res) => setData(res.data))
      .catch(() => setError('Este link é inválido ou já expirou. Peça ao professor um novo link.'))
      .finally(() => setLoading(false));
  }, [token]);

  const downloadUrl = (attachmentId: number) => {
    const base = String(api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}/public/lesson-materials/${token}/attachments/${attachmentId}/download`;
  };

  return (
    <main className="min-h-screen bg-bg text-ink flex items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6 shadow-2xl">
        {loading ? (
          <p className="text-sm text-muted text-center py-10">Carregando...</p>
        ) : error || !data ? (
          <div className="py-10 text-center space-y-3">
            <FileWarning size={36} className="mx-auto text-danger" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs font-medium text-accent uppercase tracking-wide">
              <Calendar size={14} /> {data.date}
            </div>
            <h1 className="text-xl font-semibold text-ink mt-1">{data.discipline_name}</h1>
            <p className="text-sm text-muted">{data.course_name}</p>
            {data.topic && <p className="text-sm text-ink mt-3 font-medium">{data.topic}</p>}

            <div className="mt-5 space-y-2">
              {data.attachments.length === 0 ? (
                <p className="text-sm text-muted italic">Nenhum material anexado para esta aula.</p>
              ) : data.attachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-2 border border-line">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip size={14} className="text-muted shrink-0" />
                    <span className="text-sm text-ink truncate">{att.filename}</span>
                    <span className="text-xs text-faint shrink-0">{formatSize(att.size_bytes)}</span>
                  </div>
                  <a href={downloadUrl(att.id)} className="p-1.5 text-muted hover:text-accent transition-colors shrink-0"><Download size={16} /></a>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
};

export default PublicLessonMaterials;
