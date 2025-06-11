
// This layout can be used for common structure within the /admin section
// For now, it will just render children, but could include admin-specific headers/footers later.
import React from 'react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="space-y-6">{children}</div>;
}
