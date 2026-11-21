/** Kody alarmów sterownika stacji uzbrajania i opisy po polsku (praca, podrozdziały 7.5 i 7.10). */

export const KNOWN_ALARM_CODES = [
  'SPRING_SLOPE',
  'BAD_STROKE',
  'SPRING_FORCE',
  'ARM_FAILED',
  'DOOR',
  'SENSOR',
  'OVERLOAD',
  'NO_SUPPORT',
] as const;

export type KnownAlarmCode = (typeof KNOWN_ALARM_CODES)[number];

interface AlarmInfo {
  title: string;
  description: string;
}

const ALARMS: Record<KnownAlarmCode, AlarmInfo> = {
  SPRING_SLOPE: {
    title: 'Nachylenie F(x) poza tolerancją',
    description: 'Nachylenie charakterystyki siły odbiega od oczekiwanego o więcej niż 10%; prawdopodobny brak sprężyny. Naciąg przerwany, płyta wraca do S1.',
  },
  BAD_STROKE: {
    title: 'Niepoprawny skok naciągu',
    description: 'Droga płyty od oparcia do krańcówki S2 jest poza tolerancją. Naciąg przerwany.',
  },
  SPRING_FORCE: {
    title: 'Siła szczytowa poza tolerancją',
    description: 'Siła szczytowa na płycie odbiega od oczekiwanej. Naciąg przerwany przed zatrzaśnięciem zaczepów.',
  },
  ARM_FAILED: {
    title: 'Uzbrojenie nieudane',
    description: 'Siła resztkowa po cofnięciu płyty przekracza 20 N po drugiej próbie; zaczep nie zatrzasnął się. Wykonano kontrolowane rozładowanie.',
  },
  DOOR: {
    title: 'Osłona otwarta',
    description: 'Czujnik osłony S6 zgłosił otwarcie. Napęd zatrzymany, zasilanie odcięte przez przekaźnik K1. RESET po zamknięciu osłony prowadzi do bazowania.',
  },
  SENSOR: {
    title: 'Brak próbki czujnika siły',
    description: 'Czujnik siły nie dostarczył próbki dłużej niż 50 ms w ruchu. Napęd zatrzymany.',
  },
  OVERLOAD: {
    title: 'Przeciążenie',
    description: 'Siła na płycie przekroczyła 1600 N. Napęd zatrzymany.',
  },
  NO_SUPPORT: {
    title: 'Brak podparcia prętów',
    description: 'Przy krańcówce S2 siła podparcia jest mniejsza niż 20 N; wyzwolenie Y3 jest niedozwolone (podrozdział 7.10.6).',
  },
};

export function isKnownAlarm(code: string): code is KnownAlarmCode {
  return (KNOWN_ALARM_CODES as readonly string[]).includes(code);
}

export function alarmInfo(code: string): AlarmInfo {
  if (isKnownAlarm(code)) return ALARMS[code];
  return { title: `Alarm ${code}`, description: 'Kod spoza listy znanych alarmów; opis niedostępny.' };
}
