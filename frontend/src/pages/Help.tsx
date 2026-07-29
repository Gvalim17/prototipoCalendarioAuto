import { useState } from 'react';
import {
  AlertCircle, BarChart3, Bell, BookOpen, Calendar, CalendarClock, CalendarDays,
  ChevronDown, GraduationCap, PlayCircle, ShieldCheck,
} from 'lucide-react';
import { useTour } from '../contexts/TourContext';

interface Topic {
  icon: React.ReactNode;
  title: string;
  body: string[];
}

const TOPICS: Topic[] = [
  {
    icon: <GraduationCap size={18} />,
    title: 'Cursos, módulos e disciplinas',
    body: [
      'É o catálogo que você usa para gerar cronogramas: cada Curso tem Módulos, e cada Módulo tem Disciplinas.',
      'Cada professor tem seu próprio catálogo — cursos e disciplinas que você cadastra não aparecem para outros professores (só administradores veem tudo).',
      'Ao adicionar uma disciplina, é possível buscar e reutilizar uma que você já cadastrou antes, em vez de recriar do zero.',
    ],
  },
  {
    icon: <Calendar size={18} />,
    title: 'Gerar Cronogramas',
    body: [
      'Escolha curso, módulo e disciplina, defina o formato (presencial/remoto), o período, a recorrência (semanal, quinzenal ou evento único) e o horário.',
      'O sistema já pula feriados e recessos cadastrados automaticamente, seguindo a política que você escolher: remarcar automaticamente, remarcar manualmente ou simplesmente não remarcar.',
      'Antes de confirmar, você revisa a lista de aulas geradas e pode desmarcar ou remarcar aulas específicas, sem precisar regenerar tudo.',
      'Se uma aula cair na véspera ou no dia seguinte a um feriado, um aviso aparece — só para você se planejar, não bloqueia nada.',
    ],
  },
  {
    icon: <CalendarDays size={18} />,
    title: 'Cronogramas e Planejar Aulas',
    body: [
      'A lista de Cronogramas mostra tudo que você já salvou, com filtros por instituição, formato, curso e nível.',
      'O ícone de lápis regenera o cronograma inteiro (útil quando o período ou a recorrência muda). Para mexer em uma aula específica sem afetar as demais, use "Planejar aulas".',
      'Em "Planejar aulas" você também escreve o roteiro de cada aula, anexa materiais e monta o Plano de Trabalho Docente (PTD) da disciplina.',
    ],
  },
  {
    icon: <CalendarClock size={18} />,
    title: 'Feriados e Recessos',
    body: [
      'Cadastre feriados individualmente ou importe uma planilha com um ano inteiro de uma vez.',
      'Recessos são períodos (início e fim), como férias escolares — todo esse intervalo é tratado como bloqueado na geração de cronogramas.',
    ],
  },
  {
    icon: <Bell size={18} />,
    title: 'Alertas',
    body: [
      'Configure lembretes (in-app e por e-mail) antes de cada aula, com a antecedência que preferir.',
      'Também é possível assinar sua agenda de aulas direto no Google Calendar, Outlook ou Apple Calendar — o link fica em Alertas.',
    ],
  },
  {
    icon: <BarChart3 size={18} />,
    title: 'Relatórios',
    body: [
      'Mostra quantas aulas e horas você já lecionou, quais disciplinas e instituições mais aparecem no seu cronograma, e a proporção entre aulas presenciais e remotas.',
    ],
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Privacidade',
    body: [
      'Baixe uma cópia dos seus dados pessoais a qualquer momento, ou exclua sua conta permanentemente — direitos garantidos pela LGPD.',
      'Ali também fica o link para os Termos de Uso e a Política de Privacidade completos.',
    ],
  },
  {
    icon: <AlertCircle size={18} />,
    title: 'Avisos que não bloqueiam',
    body: [
      'Conflitos de horário (duas aulas suas no mesmo dia/horário) e feriados na véspera/dia seguinte são só avisos — a decisão final de manter ou remarcar é sempre sua.',
    ],
  },
];

const Help = () => {
  const { startTour } = useTour();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink tracking-tight">Central de Ajuda</h2>
        <p className="text-muted mt-1 text-sm">Como usar cada parte do CronEdu.</p>
      </div>

      <div className="card p-6 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Tour guiado</h3>
          <p className="text-xs text-muted mt-0.5">Reveja a explicação passo a passo pela interface, destacando cada área do sistema.</p>
        </div>
        <button onClick={startTour} className="btn-primary shrink-0"><PlayCircle size={16} /> Iniciar tour</button>
      </div>

      <div className="space-y-3">
        {TOPICS.map((topic, i) => {
          const open = openIndex === i;
          return (
            <div key={topic.title} className="card overflow-hidden">
              <button
                onClick={() => setOpenIndex(open ? null : i)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-surface-2/60 transition-colors"
              >
                <span className="flex items-center gap-3 text-sm font-medium text-ink">
                  <span className="text-accent">{topic.icon}</span> {topic.title}
                </span>
                <ChevronDown size={18} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="px-4 pb-4 pl-11 space-y-2">
                  {topic.body.map((paragraph, j) => (
                    <p key={j} className="text-sm text-muted leading-relaxed">{paragraph}</p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card p-6 flex items-start gap-3 bg-accent/5 border-accent/20">
        <BookOpen size={18} className="text-accent shrink-0 mt-0.5" />
        <p className="text-sm text-muted">
          Não achou o que precisava? Fale com o administrador do seu sistema — ele consegue ver os logs
          e ajudar a diagnosticar qualquer problema.
        </p>
      </div>
    </div>
  );
};

export default Help;
