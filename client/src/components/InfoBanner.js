import React from 'react';

export default function InfoBanner({ children, variant = 'warning' }) {
  return <div className={`info-banner info-banner--${variant}`}>{children}</div>;
}
