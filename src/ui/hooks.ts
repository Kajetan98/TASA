import { useEffect, useState } from 'react';
import { useApp } from '../store/app';

/** Motyw wynikowy (jasny/ciemny) z wyboru użytkownika i ustawień systemu. */
export function useResolvedTheme(): 'light' | 'dark' {
  const choice = useApp((s) => s.theme);
  const [sys, setSys] = useState<'light' | 'dark'>(() =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const h = () => setSys(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return choice === 'system' ? sys : choice;
}

/** Odświeżenie co 100 ms (wiek ramek, odczyty). */
export function useNow(): number {
  return useApp((s) => s.now);
}

export function useTick(): number {
  return useApp((s) => s.tick);
}
