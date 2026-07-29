import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TOUR_STEPS } from '../tour/steps';

const TOUR_STORAGE_PREFIX = 'cronedu_tour_done_';

interface TourContextValue {
  startTour: () => void;
  isActive: boolean;
}

const TourContext = createContext<TourContextValue>({ startTour: () => {}, isActive: false });

export const useTour = () => useContext(TourContext);

export function TourProvider({ userId, children }: { userId: number | null; children: ReactNode }) {
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = stepIndex !== null ? TOUR_STEPS[stepIndex] : null;

  const finish = useCallback(() => {
    setStepIndex(null);
    setRect(null);
    if (userId) localStorage.setItem(TOUR_STORAGE_PREFIX + userId, '1');
  }, [userId]);

  const startTour = useCallback(() => setStepIndex(0), []);

  const next = useCallback(() => {
    setStepIndex((current) => {
      if (current === null) return null;
      if (current + 1 >= TOUR_STEPS.length) {
        if (userId) localStorage.setItem(TOUR_STORAGE_PREFIX + userId, '1');
        return null;
      }
      return current + 1;
    });
    setRect(null);
  }, [userId]);

  const prev = useCallback(() => {
    setStepIndex((current) => (current !== null && current > 0 ? current - 1 : current));
    setRect(null);
  }, []);

  // Autoinício: uma vez por conta, na primeira vez que o painel carrega.
  useEffect(() => {
    if (!userId) return;
    if (localStorage.getItem(TOUR_STORAGE_PREFIX + userId)) return;
    const t = setTimeout(() => setStepIndex(0), 900);
    return () => clearTimeout(t);
  }, [userId]);

  // Localiza o elemento do passo atual (com novas tentativas até montar) e
  // navega para a rota do passo quando necessário.
  useEffect(() => {
    if (!step) return;
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
      return;
    }
    let attempts = 0;
    const locate = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.id}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setRect(el.getBoundingClientRect());
      } else if (attempts < 20) {
        attempts += 1;
        retryRef.current = setTimeout(locate, 100);
      } else {
        next();
      }
    };
    locate();
    return () => { if (retryRef.current) clearTimeout(retryRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, location.pathname]);

  useEffect(() => {
    if (!step) return;
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.id}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);

  return (
    <TourContext.Provider value={{ startTour, isActive: step !== null }}>
      {children}
      {step && (
        <TourOverlay
          title={step.title}
          description={step.description}
          index={stepIndex ?? 0}
          total={TOUR_STEPS.length}
          rect={rect}
          onNext={next}
          onPrev={prev}
          onSkip={finish}
        />
      )}
    </TourContext.Provider>
  );
}

interface TourOverlayProps {
  title: string;
  description: string;
  index: number;
  total: number;
  rect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

const PADDING = 8;
const CARD_WIDTH = 336;

const TourOverlay = ({ title, description, index, total, rect, onNext, onPrev, onSkip }: TourOverlayProps) => {
  const spotlightStyle = rect
    ? {
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
        boxShadow: '0 0 0 9999px rgba(9, 9, 11, 0.7)',
      }
    : { inset: 0, boxShadow: 'none', background: 'rgba(9, 9, 11, 0.7)' };

  const cardTop = rect ? Math.min(rect.bottom + PADDING + 12, window.innerHeight - 240) : window.innerHeight / 2 - 110;
  const cardLeft = rect
    ? Math.min(Math.max(rect.left, 16), window.innerWidth - CARD_WIDTH - 16)
    : window.innerWidth / 2 - CARD_WIDTH / 2;

  return (
    <div className="fixed inset-0 z-[200]" role="dialog" aria-label="Tour guiado">
      <div
        className="absolute rounded-lg transition-all duration-300 pointer-events-none"
        style={{ ...spotlightStyle, outline: rect ? '2px solid rgb(var(--accent))' : undefined }}
      />
      <div
        className="absolute card w-[336px] p-5 shadow-2xl transition-all duration-300"
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">Passo {index + 1} de {total}</span>
          <button onClick={onSkip} aria-label="Fechar tour" className="text-muted hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>
        <h4 className="text-base font-semibold text-ink mb-1.5">{title}</h4>
        <p className="text-sm text-muted leading-relaxed">{description}</p>
        <div className="flex items-center justify-between mt-4">
          <button onClick={onSkip} className="text-xs text-muted hover:text-ink transition-colors">Pular tour</button>
          <div className="flex gap-2">
            {index > 0 && <button onClick={onPrev} className="btn-ghost h-9 px-3 text-xs">Voltar</button>}
            <button onClick={onNext} className="btn-primary h-9 px-4 text-xs">{index + 1 === total ? 'Concluir' : 'Próximo'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};
