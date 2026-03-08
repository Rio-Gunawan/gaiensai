import type { ComponentChildren } from 'preact';
import AdminFooter from '../components/AdminFooter';
import Header from '../components/Header';

const ScanLayout = ({ children }: { children: ComponentChildren }) => {
  return (
    <>
      <Header linkTo='/admin/' isAdmin>
        {' '}
        スキャン
      </Header>
      <main>{children}</main>
      <AdminFooter />
    </>
  );
};

export default ScanLayout;
