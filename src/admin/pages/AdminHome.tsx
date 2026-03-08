import { Link } from 'wouter-preact';
import styles from '../../styles/sub-pages.module.css';

const adminHome = () => {
  return (
    <div>
      <h1 className={styles.pageTitle}>管理画面</h1>
      <section>
        <h2>管理画面へようこそ</h2>
        <p>セキュリティ上の理由から、各ページへのURLは貼っていません。Teamsのマニュアルからそれぞれのページへアクセスしてください。</p>
      </section>
      <section>
        <h2>リンク集</h2>
        <p>開発中はリンクがないと不便なので、仮としてリンクを貼っておきます。本番なのにリンクが残っていることに気づいた方は至急お知らせください。</p>
        <ul>
          <li><Link href='/admin/scan'>スキャンページ</Link></li>
        </ul>
      </section>
    </div>
  );
};

export default adminHome;
