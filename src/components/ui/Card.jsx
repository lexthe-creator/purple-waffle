import React from 'react';

/**
 * Card — base surface primitive.
 *
 * @param {'default'|'elevated'|'flat'|'tinted'} variant
 * @param {'div'|'section'|'article'} as  — rendered element (default: 'section')
 */
export default function Card({ variant = 'default', as: Tag = 'section', className = '', children, style, ...props }) {
  const cls = [
    'ui-card',
    variant !== 'default' && `ui-card--${variant}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <Tag className={cls} style={style} {...props}>
      {children}
    </Tag>
  );
}
