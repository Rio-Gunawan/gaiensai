import { Link } from 'wouter-preact';
import styles from './NotFound.module.css';

const NotFound = () => {
  return (
    <section className={styles.card}>
      <p className={styles.status}>404 Not Found</p>
      <h1 className={styles.heading}>ページが見つかりません</h1>
      <p className={styles.description}>
        お探しのページは削除されたか、URLが間違っている可能性があります。
      </p>
      <p className={styles.description}>
        リンクをたどるか、ホームに戻って別のページをご覧ください。
      </p>
      <Link className={styles.returnLink} to='/'>
        ホームに戻る
      </Link>
    </section>
  );
};

export default NotFound;
