import { useEffect, useState, useMemo } from 'preact/hooks';
import { supabase } from '../../lib/supabase';
import {
  AdminAuthLayout,
  getSessionToken,
  readErrorMessage,
} from '../../layout/AdminAuthLayout';
import { useTitle } from '../../hooks/useTitle';
import NormalSection from '../../components/ui/NormalSection';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Alert from '../../components/ui/Alert';
import styles from './Settings.module.css';

type TeacherRecord = {
  id: number;
  grade: number;
  class_id: number;
  name: string;
};

interface TeachersContentProps {
  onDirtyChange: (isDirty: boolean) => void;
  showExitModal: boolean;
  onCloseModal: () => void;
}

const TeachersContent = ({
  onDirtyChange,
  showExitModal,
  onCloseModal,
}: TeachersContentProps) => {
  const [teachers, setTeachers] = useState<TeacherRecord[]>([]);
  const [originalTeachers, setOriginalTeachers] = useState<TeacherRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dirtyIds = useMemo(() => {
    const set = new Set<number>();
    if (isLoading) {
      return set;
    }
    teachers.forEach((t) => {
      const original = originalTeachers.find((o) => o.id === t.id);
      if (original && t.name !== original.name) {
        set.add(t.id);
      }
    });
    return set;
  }, [teachers, originalTeachers, isLoading]);

  const isDirty = dirtyIds.size > 0;

  // 親コンポーネントに dirty 状態を伝える
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = ''; // ブラウザ標準の警告を表示
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const fetchTeachers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getSessionToken();
      const { data, error: fetchError } = await supabase.functions.invoke(
        'admin-auth',
        {
          body: { action: 'getTeachers' },
          headers: {
            'x-admin-session-token': token ?? '',
          },
        },
      );

      if (fetchError) {
        throw fetchError;
      }

      setTeachers(data?.teachers || []);
      setOriginalTeachers(data?.teachers || []);
    } catch (err) {
      setError('先生データの取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchTeachers();
  }, []);

  const handleSaveAll = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const token = getSessionToken();
      const { data, error: updateError } = await supabase.functions.invoke(
        'admin-auth',
        {
          body: {
            action: 'updateAllTeachers',
            teachers: teachers.map((t) => ({ id: t.id, name: t.name })),
          },
          headers: {
            'x-admin-session-token': token ?? '',
          },
        },
      );

      if (updateError) {
        throw updateError;
      }

      if (!data?.updated) {
        throw new Error('更新に失敗しました。');
      }

      setOriginalTeachers(teachers);
      setSuccess('担任の先生の名簿を更新しました。');
    } catch (err) {
      const message = await readErrorMessage(err);
      setError(`更新に失敗しました: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message='先生データを読み込み中...' />;
  }

  return (
    <>
      {isDirty && <Alert type='warning'>未保存の変更：{dirtyIds.size}件</Alert>}
      <NormalSection>
        <div className={styles.toggleList}>
          {teachers.map((teacher) => {
            const isRowDirty = dirtyIds.has(teacher.id);
            return (
              <div
                key={teacher.id}
                className={`${styles.field} ${isRowDirty ? styles.fieldDirty : ''}`}
              >
                <span
                  className={`${styles.settingLabel} ${isRowDirty ? styles.settingLabelDirty : ''}`}
                >
                  {teacher.grade + '-' + teacher.class_id}
                </span>
                <div className={styles.settingControlGroup}>
                  <input
                    type='text'
                    className={`${styles.fieldControl} ${isRowDirty ? styles.fieldControlDirty : ''}`}
                    value={teacher.name}
                    onInput={(e) => {
                      const val = (e.target as HTMLInputElement).value;
                      setTeachers((prev) =>
                        prev.map((t) =>
                          t.id === teacher.id ? { ...t, name: val } : t,
                        ),
                      );
                    }}
                    placeholder='先生の名前を入力'
                  />
                </div>
              </div>
            );
          })}
          {teachers.length === 0 && <p>登録されているクラスがありません。</p>}
        </div>
        <div className={styles.saveButtonContainer}>
          <button
            type='button'
            className={`${styles.authButton} ${styles.saveButton} ${isDirty ? styles.saveButtonPrimary : styles.saveButtonSecondary}`}
            onClick={handleSaveAll}
            disabled={isSubmitting || teachers.length === 0 || !isDirty}
          >
            {isSubmitting ? '保存中...' : '設定を保存する'}
          </button>
        </div>
        <div style={{ textAlign: 'center' }}>
          {error && <Alert type='error'>{error}</Alert>}
          {success && <p className={styles.authSuccess}>{success}</p>}
        </div>
      </NormalSection>

      {showExitModal && (
        <div className={styles.settingModalOverlay} onClick={onCloseModal}>
          <div
            className={styles.settingModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.settingModalTitle}>未保存の変更があります</h3>
            <p>
              変更内容が保存されていません。このままページを離れると、入力した内容は破棄されます。よろしいですか？
            </p>
            <div className={styles.settingModalActions}>
              <button
                type='button'
                className={styles.settingModalCancel}
                onClick={onCloseModal}
              >
                編集を続ける
              </button>
              <button
                type='button'
                className={`${styles.settingModalConfirm} ${styles.settingModalConfirmDanger}`}
                onClick={() => {
                  onCloseModal();
                  window.history.back();
                }}
              >
                保存せずに戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const TeachersPage = () => {
  useTitle('担任の先生設定 - 管理画面');
  // TeachersContent 内の isDirty 状態を管理するために、Content を分離して state を持ち上げます
  return <TeachersWrapper />;
};

const TeachersWrapper = () => {
  const [isDirty, setIsDirty] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleBack = () => {
    if (isDirty) {
      setShowModal(true);
    } else {
      window.history.back();
    }
  };

  return (
    <AdminAuthLayout
      title='担任の先生設定'
      description='生徒アカウント登録時の照合に使用される担任の先生の名前を設定します。'
      onBack={handleBack}
    >
      <TeachersContent
        onDirtyChange={setIsDirty}
        showExitModal={showModal}
        onCloseModal={() => setShowModal(false)}
      />
    </AdminAuthLayout>
  );
};

export default TeachersPage;
