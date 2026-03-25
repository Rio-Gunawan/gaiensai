type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
};

const Switch = ({ checked, onChange, id }: SwitchProps) => {
  return (
    <div
      style={{
        position: 'relative',
        width: '34px',
        height: '20px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <input
        type='checkbox'
        id={id}
        style={{
          opacity: 0,
          width: 0,
          height: 0,
          position: 'absolute',
        }}
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <div
        style={{
          width: '34px',
          height: '14px',
          backgroundColor: checked
            ? 'rgba(63, 81, 181, 0.5)'
            : 'rgba(0, 0, 0, 0.26)',
          borderRadius: '7px',
          transition: 'background-color 0.2s',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: checked ? '14px' : '0px',
          width: '20px',
          height: '20px',
          backgroundColor: checked ? '#3f51b5' : '#fafafa',
          borderRadius: '50%',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          transition: 'left 0.2s, background-color 0.2s',
        }}
      />
    </div>
  );
};

export default Switch;
