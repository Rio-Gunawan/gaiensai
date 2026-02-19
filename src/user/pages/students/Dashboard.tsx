import { supabase } from '../../../lib/supabase';

import type { UserData } from '../../../types/types';
import NormalSection from '../../../components/ui/NormalSection';

import subPageStyles from '../../../styles/sub-pages.module.css';
import sharedStyles from '../../../styles/shared.module.css';
import styles from './Dashboard.module.css';
import { Link } from 'wouter-preact';
import { IoMdAdd } from 'react-icons/io';
import PerformancesTable from '../../../components/PerformancesTable';

type DashboardProps = {
  userData: Exclude<UserData, null>;
};

const Dashboard = ({ userData }: DashboardProps) => {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <>
      <h1 className={subPageStyles.pageTitle}>ダッシュボード</h1>
      <section>
        <h2 className={sharedStyles.normalH2}>
          {userData.affiliation} {userData.name} 様
        </h2>
        <Link to='/students/issue' class={styles.buttonLink}>
          <IoMdAdd />
          新規チケット発行
        </Link>
      </section>
      <NormalSection>
        <h2>自分が使うチケット</h2>
        <p>ここにチケット一覧が表示されます。</p>
      </NormalSection>
      <NormalSection>
        <h2>発券したチケット</h2>
        <p>ここにチケット一覧が表示されます。</p>
      </NormalSection>
      <NormalSection>
        <h2>公演空き状況</h2>
        <h3>予約可能なチケットの残り枚数</h3>
        <PerformancesTable />
      </NormalSection>
      <section>
        <button onClick={handleLogout} className={styles.logoutBtn}>ログアウト</button>
      </section>
    </>
  );
};

export default Dashboard;
