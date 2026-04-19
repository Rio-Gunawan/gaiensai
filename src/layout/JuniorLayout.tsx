import type { ComponentChildren } from 'preact';
import Footer from '../components/Footer';
import Header from '../components/Header';
import styles from '../styles/sub-pages.module.css';

const JuniorLayout = ({ children }: { children: ComponentChildren }) => {
  return (
    <>
      <Header linkTo='/junior'> 中学生</Header>
      <main>
        <div className={styles.subPageShell}>{children}</div>
      </main>
      <Footer />
    </>
  );
};

export default JuniorLayout;
