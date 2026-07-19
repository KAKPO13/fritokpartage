// app/admin-x0k8p9x1/layout.js
import AdminAuthGate from './AdminAuthGate';

export const metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return <AdminAuthGate>{children}</AdminAuthGate>;
}