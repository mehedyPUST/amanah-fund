import { ImageResponse } from 'next/og';

export const size = {
  width: 64,
  height: 64,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #059669 0%, #065f46 65%, #064e3b 100%)',
          borderRadius: '16px',
          border: '2px solid rgba(52, 211, 153, 0.35)',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '46px',
            height: '46px',
            borderRadius: '11px',
            border: '1.5px solid rgba(255, 255, 255, 0.28)',
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#ffffff',
            fontSize: '30px',
            fontWeight: 700,
            letterSpacing: '-0.03em',
          }}
        >
          A
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '9px',
            right: '9px',
            width: '10px',
            height: '10px',
            borderRadius: '9999px',
            background: '#fbbf24',
            border: '2px solid #064e3b',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
