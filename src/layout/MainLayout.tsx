import Footer from '../components/Footer';
import Header from '../components/Header';
import type { ComponentChildren } from 'preact';

const MainLayout = ({ children }: { children: ComponentChildren }) => {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
};

export default MainLayout;
