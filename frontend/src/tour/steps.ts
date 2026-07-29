export interface TourStep {
  id: string;
  route?: string;
  title: string;
  description: string;
}

// Cada passo aponta para um elemento marcado com data-tour="<id>" em algum
// componente. Todos ficam ancorados na sidebar/topo (presentes em toda
// página via Layout), então o tour nunca precisa esperar uma página
// específica terminar de carregar — só garante que está em "/" no início.
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'nav-brand',
    route: '/',
    title: 'Bem-vindo(a) ao CronEdu!',
    description: 'Vamos fazer um tour rápido pelas principais áreas do sistema. Dá para pular a qualquer momento e rever depois em "Ajuda".',
  },
  {
    id: 'dashboard-stats',
    title: 'Seu painel',
    description: 'Acompanhe rapidamente quantos cursos, módulos, disciplinas e aulas você já tem cadastrados.',
  },
  {
    id: 'dashboard-new-schedule',
    title: 'Gerar um novo cronograma',
    description: 'Esse botão leva direto para o gerador de cronogramas — o coração do sistema.',
  },
  {
    id: 'nav-courses',
    title: 'Cursos',
    description: 'Cadastre cursos, módulos e disciplinas aqui. É o catálogo que alimenta a geração de cronogramas.',
  },
  {
    id: 'nav-generate',
    title: 'Gerar Cronogramas',
    description: 'Defina disciplina, período, recorrência e horário para o sistema gerar automaticamente as datas das aulas, já pulando feriados e recessos.',
  },
  {
    id: 'nav-schedules',
    title: 'Cronogramas',
    description: 'Veja, edite e exclua os cronogramas salvos. É aqui também que você acessa "Planejar aulas" para remarcar ou cancelar uma aula específica.',
  },
  {
    id: 'nav-holidays',
    title: 'Feriados e Recessos',
    description: 'O gerador evita marcar aulas em feriados e recessos automaticamente — cadastre-os aqui (ou importe um ano inteiro de uma vez).',
  },
  {
    id: 'nav-alerts',
    title: 'Alertas',
    description: 'Configure lembretes antes de cada aula e assine sua agenda no Google Calendar, Outlook ou Apple Calendar.',
  },
  {
    id: 'nav-reports',
    title: 'Relatórios',
    description: 'Veja quantas aulas e horas você lecionou, e quais disciplinas e instituições mais aparecem no seu cronograma.',
  },
  {
    id: 'nav-privacy',
    title: 'Privacidade',
    description: 'Baixe seus dados ou exclua sua conta quando quiser, conforme a LGPD.',
  },
  {
    id: 'header-help',
    title: 'Precisa rever isso depois?',
    description: 'Clique aqui a qualquer momento para reabrir este tour ou a Central de Ajuda, com explicações de cada funcionalidade.',
  },
];
