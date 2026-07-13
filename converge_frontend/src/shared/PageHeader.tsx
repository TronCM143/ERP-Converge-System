import React, { ReactNode } from 'react';
import Breadcrumbs, { BreadcrumbItem } from './Breadcrumbs';
import './shared.css';

export default function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbItems
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbItems?: BreadcrumbItem[];
}) {
  return (
    <div className="page-header">
      <div>
        {breadcrumbItems?.length ? <Breadcrumbs items={breadcrumbItems} /> : null}
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <div className="page-header__subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  );
}

