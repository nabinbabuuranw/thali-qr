import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { get } from './api';

export type Role = 'kitchen' | 'floor' | 'manager';
interface Staff { name: string; role: Role }
interface Ctx { staff: Staff | null; loading: boolean; refresh: () => Promise<void>; setStaff: (s: Staff | null) => void }

const SessionCtx = createContext<Ctx>({ staff: null, loading: true, refresh: async () => {}, setStaff: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaffState] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  // A sign-in that lands while a "who am I" read is in flight wins: the read's answer is then stale.
  const version = useRef(0);
  const setStaff = (s: Staff | null) => {
    version.current += 1;
    setStaffState(s);
  };
  const refresh = async () => {
    const v = version.current;
    try {
      const r = await get<{ staff: Staff | null }>('/api/staff/me');
      if (v === version.current) setStaffState(r.staff);
    } catch {
      if (v === version.current) setStaffState(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <SessionCtx.Provider value={{ staff, loading, refresh, setStaff }}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

export const ROLE_LABEL: Record<Role, string> = { kitchen: 'Kitchen', floor: 'Floor', manager: 'Manager' };
