export type AcademicLevel = 'graduacao' | 'pos_graduacao' | 'mba' | 'extensao' | 'tecnico' | 'outro';

export const ACADEMIC_LEVELS: { value: AcademicLevel; label: string }[] = [
  { value: 'graduacao', label: 'Graduação' },
  { value: 'pos_graduacao', label: 'Pós-graduação' },
  { value: 'mba', label: 'MBA' },
  { value: 'extensao', label: 'Extensão' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'outro', label: 'Outro' },
];

export const levelLabel = (level?: string | null, other?: string | null): string => {
  if (level === 'outro' && other) return other;
  return ACADEMIC_LEVELS.find((l) => l.value === level)?.label ?? (level ?? '—');
};

export interface Discipline {
  id: number;
  name: string;
  code: string;
  module_id: number;
}

export interface Module {
  id: number;
  name: string;
  course_id: number;
  disciplines: Discipline[];
}

export interface Course {
  id: number;
  name: string;
  institution?: string | null;
  academic_level: AcademicLevel;
  academic_level_other?: string | null;
  description?: string | null;
  year: number;
  semester?: number | null;
  modules: Module[];
}

export interface Holiday {
  id: number;
  date: string;
  description: string;
  type: string;
  source: string;
}

export interface Recess {
  id: number;
  start_date: string;
  end_date: string;
  description?: string | null;
  source: string;
}

export interface CalendarEvent {
  id: number;
  date: string;
  order: number;
  discipline_id: number;
  format: 'presencial' | 'remoto' | string;
  course_name: string;
  academic_level?: string | null;
  academic_level_label?: string | null;
  discipline_name: string;
  start_time?: string | null;
  end_time?: string | null;
  color?: string;
}

export interface Stats {
  courses: number;
  modules: number;
  disciplines: number;
  scheduled_classes: number;
}

export type HolidayPolicy = 'reschedule' | 'manual' | 'skip';
export type Recurrence = 'semanal' | 'quinzenal' | 'na';

export const WEEKDAYS: { value: number; short: string; label: string }[] = [
  { value: 0, short: 'Seg', label: 'Segunda' },
  { value: 1, short: 'Ter', label: 'Terça' },
  { value: 2, short: 'Qua', label: 'Quarta' },
  { value: 3, short: 'Qui', label: 'Quinta' },
  { value: 4, short: 'Sex', label: 'Sexta' },
  { value: 5, short: 'Sáb', label: 'Sábado' },
  { value: 6, short: 'Dom', label: 'Domingo' },
];

export interface ScheduleConfigRead {
  id: number;
  course_id: number;
  module_id: number;
  discipline_id: number;
  format: 'presencial' | 'remoto' | string;
  start_date: string;
  end_date?: string | null;
  recurrence: Recurrence;
  days_of_week: number[];
  start_time?: string | null;
  end_time?: string | null;
  holiday_policy: HolidayPolicy;
  num_classes?: number | null;
  workload?: number | null;
  course_name: string;
  module_name: string;
  discipline_name: string;
  institution?: string | null;
  academic_level?: AcademicLevel | null;
  owner_id?: number | null;
  owner_name?: string | null;
}

export interface ScheduleConflictItem {
  date: string;
  course_name: string;
  discipline_name: string;
  start_time?: string | null;
  end_time?: string | null;
}

export interface ScheduleConflictCheckResponse {
  overlaps: ScheduleConflictItem[];
  near: ScheduleConflictItem[];
}

export interface LogEntry {
  time: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | string;
  logger: string;
  message: string;
  method?: string | null;
  path?: string | null;
  status_code?: number | null;
  duration_ms?: number | null;
  client?: string | null;
  event?: string | null;
  request_id?: string | null;
  actor_id?: number | null;
  outcome?: string | null;
  resource?: string | null;
  exception?: string | null;
}

export interface AlertPreference {
  id: number;
  enabled: boolean;
  minutes_before: number[];
  in_app_enabled: boolean;
  email_enabled: boolean;
  timezone: string;
  updated_at: string;
}

export interface AlertNotification {
  id: number;
  channel: string;
  minutes_before: number;
  status: string;
  title: string;
  body: string;
  scheduled_for: string;
  sent_at?: string | null;
  read_at?: string | null;
  created_at: string;
}

export interface CalendarTokenInfo {
  has_token: boolean;
}

export interface LessonPlan {
  id: number;
  discipline_id: number;
  ementa?: string | null;
  objetivos?: string | null;
  conteudo_programatico?: string | null;
  metodologia?: string | null;
  recursos_didaticos?: string | null;
  criterios_avaliacao?: string | null;
  bibliografia?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonAttachment {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface LessonScript {
  id: number;
  scheduled_class_id: number;
  topic?: string | null;
  content?: string | null;
  created_at: string;
  updated_at: string;
  attachments: LessonAttachment[];
}

export interface ScheduledClassSummary {
  id: number;
  date: string;
  order: number;
  status: 'scheduled' | 'cancelled';
  change_reason?: string | null;
}
