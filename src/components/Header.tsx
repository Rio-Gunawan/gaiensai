import { useEffect, useState } from 'preact/hooks';
import { RxHamburgerMenu } from 'react-icons/rx';
import { Link, useLocation } from 'wouter-preact';

import Drawer from './Drawer';

import iconUrl from '../assets/icon.webp';
import styles from './Header.module.css';
import { useEventConfig } from '../hooks/useEventConfig';

const Header = ({linkTo = '/', children}: {linkTo?: string, children?: React.ReactNode}) => {
  const [open, setOpen] = useState(false);
  const { config } = useEventConfig();

  const [location] = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location]);

  return (
    <>
      <Link href={linkTo}>
        <header className={styles.header}>
          <img alt='アイコン' src={iconUrl} width={64} />
          {config.name}
          {config.year}
          {children}
        </header>
      </Link>

      <button
        className={styles.menuButton}
        onClick={() => setOpen(true)}
        aria-label='メニュー'
      >
        <RxHamburgerMenu />
      </button>
      <Drawer isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default Header;
