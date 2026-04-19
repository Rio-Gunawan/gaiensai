import type { UserData } from '../../../types/types';
import { useTitle } from '../../../hooks/useTitle';
import subPageStyles from '../../../styles/sub-pages.module.css';

type JuniorMyPageProps = {
  userData: Exclude<UserData, null>;
};

const JuniorMyPage = ({ userData }: JuniorMyPageProps) => {
  useTitle('マイページ - 中学生用ページ');

  const localPart = userData.email.replace('@gaiensai.local', '');
  const loginId = localPart.match(/^(.*)-\d{8}$/)?.[1] ?? localPart;

  return (
    <section>
      <h1 className={subPageStyles.pageTitle}>中学生用マイページ</h1>
      <p>ログインしました。</p>
      <p>ログインID: {loginId}</p>
      <p>所属番号: {userData.affiliation}</p>
    </section>
  );
};

export default JuniorMyPage;
