import { useTitle } from '../../hooks/useTitle';
import AdminEntryPage from './AdminEntryPage';

const Register = () => {
  useTitle('チケット使用 - 管理画面');
  return <AdminEntryPage mode='register' />;
};

export default Register;
