import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

export default function Header() {
  const qc = useQueryClient();
  const user = qc.getQueryData(['user']);

  return (
    <nav className="navbar navbar-expand-lg navbar-light bg-light mb-3">
      <div className="container-fluid">
        <Link className="navbar-brand" to="/"><img src="/kavyashift.png" alt="kavya" width="50"  className='img-fluid'/></Link>
        <div className="collapse navbar-collapse">
          <ul className="navbar-nav ms-auto">
            {user && <li className="nav-item nav-link">{user.name} ({user.role})</li>}
          </ul>
        </div>
      </div>
    </nav>
  );
}
