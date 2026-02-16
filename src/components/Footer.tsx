import GlobalNav from './GlobalNav';
import { useEventConfig } from '../hooks/useEventConfig';

import styles from './Footer.module.css';

const Footer = () => {
  const { config } = useEventConfig();
  const date = new Date();
  const year = date.getFullYear();

  return (
    <footer className={styles.footer}>
      <GlobalNav />
      <p>最終更新日: {config.last_update?.replaceAll('-', '/') ?? '-'}</p>
      <p>© 2026{year === 2026 ? '' : ` - ${year}`} {config.operating_organization}</p>
    </footer>
  );
};

export default Footer;
