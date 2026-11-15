import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
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
          borderRadius: '40px',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '132px',
            height: '132px',
            borderRadius: '28px',
            border: '3px solid rgba(255, 255, 255, 0.28)',
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#ffffff',
            fontSize: '86px',
            fontWeight: 700,
            letterSpacing: '-0.03em',
          }}
        >
          A
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            width: '26px',
            height: '26px',
            borderRadius: '9999px',
            background: '#fbbf24',
            border: '5px solid #064e3b',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
