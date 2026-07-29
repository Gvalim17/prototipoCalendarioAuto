// Formata horas decimais (ex: 1.6666666h) como "1h40" em vez do número cru.
export const formatHours = (hours?: number | null): string => {
  const totalMinutes = Math.round((hours ?? 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
};
