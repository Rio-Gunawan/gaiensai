import styles from '../../../styles/sub-pages.module.css';
import Login from './Login';

const Student = () => {
  return (
    <>
      <h1 className={styles.pageTitle}>生徒用ページ</h1>
      <Login />
      <p></p>
    </>
  );
};

export default Student;
