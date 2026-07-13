import React from 'react';
import { Link } from 'react-router-dom';
import './shared.css';

export type BreadcrumbItem = { label: string; href?: string };

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <div className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((it, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={`${it.label}-${idx}`}>
            {it.href && !isLast ? (
              <Link className="breadcrumbs__link" to={it.href}>
                {it.label}
              </Link>
            ) : (
              <span className="breadcrumbs__current">{it.label}</span>
            )}
            {!isLast ? <span className="breadcrumbs__sep">/</span> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

