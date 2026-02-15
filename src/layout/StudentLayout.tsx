import type { ComponentChildren } from 'preact';
import Footer from '../components/Footer';
import Header from '../components/Header';
import styles from '../styles/sub-pages.module.css';

const MainLayout = ({ children }: { children: ComponentChildren }) => {
  return (
    <>
      <Header />
      <main>
        <div className={styles.subPageShell}>
          <h1 className={styles.pageTitle}>生徒用ページ</h1>
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default MainLayout;
