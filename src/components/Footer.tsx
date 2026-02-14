import GlobalNav from './GlobalNav';

import styles from './Footer.module.css';

const Footer = () => {
  return (
    <footer className={styles.footer}>
      <GlobalNav />
      <p>最終更新日: 2026/2/14</p>
      <p>© 2026 外苑祭総務</p>
    </footer>
  );
};

export default Footer;
