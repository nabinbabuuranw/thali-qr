import React from 'react';
import { Link, navigate } from '../lib/router';
import { ThaliMark } from './Mark';
import { useSession, ROLE_LABEL } from '../lib/session';
import { post } from '../lib/api';

export function Header({ children, tone = 'light' }: { children?: React.ReactNode; tone?: 'light' | 'kitchen' }) {
  const { staff, setStaff } = useSession();
  const logout = async () => {
    try {
      await post('/api/staff/logout');
    } finally {
      setStaff(null);
      navigate('/');
    }
  };
  return (
    <header className={`top top-${tone}`}>
      <Link to="/" className="brand">
        <ThaliMark size={30} />
        <span className="brand-word">Thali<b>QR</b></span>
        <span className="demo-chip">DEMO</span>
      </Link>
      <div className="top-right">
        {children}
        {staff ? (
          <>
            <span className="who">{staff.name} · {ROLE_LABEL[staff.role]}</span>
            <button className="btn btn-quiet" onClick={logout}>Sign out</button>
          </>
        ) : null}
      </div>
    </header>
  );
}

export function Notice() {
  return (
    <p className="demo-note">
      Demo restaurant. Menu, prices, staff and tables are invented and labelled DEMO. No money is taken here; bills are settled in cash at the counter. eSewa and Khalti are not connected.
    </p>
  );
}
