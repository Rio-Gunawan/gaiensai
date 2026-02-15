import type { ComponentChildren } from 'preact';
import Footer from '../components/Footer';
import Header from '../components/Header';
import styles from '../styles/sub-pages.module.css';

const MainLayout = ({ children }: { children: ComponentChildren }) => {
  return (
    <>
      <Header linkTo='/students'> 生徒用ページ</Header>
      <main>
        <div className={styles.subPageShell}>{children}</div>
      </main>
      <Footer />
    </>
  );
};

export default MainLayout;
