import { Login } from './Login';
import styles from '../../../styles/sub-pages.module.css';

export const Student = () => {
  return (
    <>
      <h1 className={styles.pageTitle}>生徒用ページ</h1>
      <Login />
      <p></p>
    </>
  );
};
