import React from 'react';

export default function SectionCard({ title, children }) {
  return (
    <section className="section-card">
      {title && <h3 className="section-card__title">{title}</h3>}
      <div className="section-card__body">{children}</div>
    </section>
  );
}
