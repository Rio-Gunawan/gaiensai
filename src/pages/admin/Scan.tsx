import { useTitle } from '../../hooks/useTitle';
import AdminEntryPage from './AdminEntryPage';

const Scan = () => {
  useTitle('チケットスキャン - 管理画面');
  return <AdminEntryPage mode='scan' />;
};

export default Scan;
