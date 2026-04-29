import GlobalNav from './GlobalNav';
import { useEventConfig } from '../hooks/useEventConfig';

import styles from './Footer.module.css';

import schoolLogo from '../assets/aoyama-logo.webp';

const Footer = () => {
  const { config } = useEventConfig();
  const date = new Date();
  const year = date.getFullYear();

  return (
    <footer className={styles.footer}>
      <GlobalNav />
      <a
        href='https://www.metro.ed.jp/aoyama-h/'
        target='_blank'
        rel='noopener noreferrer'
        className={styles.logoLink}
      >
        <img
          src={schoolLogo}
          alt='青山高校ロゴ'
          className={styles.logo}
          width={250}
        />
      </a>
      <p>最終更新日: {config.last_update?.replaceAll('-', '/') ?? '-'}</p>
      <p>
        © 2026{year === 2026 ? '' : ` - ${year}`}{' '}
        {config.operating_organization}
      </p>
    </footer>
  );
};

export default Footer;
