import type { ComponentChildren } from 'preact';
import AdminFooter from '../components/AdminFooter';
import Header from '../components/Header';

const AdminLayout = ({ children }: { children: ComponentChildren }) => {
  return (
    <>
      <Header linkTo='/admin/' isAdmin> 管理画面</Header>
      <main>{children}</main>
      <AdminFooter />
    </>
  );
};

export default AdminLayout;
