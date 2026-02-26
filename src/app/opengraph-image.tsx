import { ImageResponse } from 'next/og';

export const alt = 'Ad Maker — Create scroll-stopping video ads in minutes';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#030712',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Blue accent line at top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #3B82F6, #60A5FA, #3B82F6)',
          }}
        />

        {/* Icon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            background: '#111827',
            borderRadius: '20px',
            marginBottom: '40px',
          }}
        >
          <svg
            width="40"
            height="44"
            viewBox="0 0 18 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 1.5L16 10L2 18.5V1.5Z"
              fill="#3B82F6"
              stroke="#3B82F6"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: '72px',
            fontWeight: 800,
            color: '#FFFFFF',
            letterSpacing: '-2px',
            lineHeight: 1,
            marginBottom: '24px',
          }}
        >
          Ad Maker
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '28px',
            fontWeight: 400,
            color: '#9CA3AF',
            maxWidth: '700px',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          Create scroll-stopping video ads in minutes
        </div>

        {/* Blue accent bar */}
        <div
          style={{
            width: '60px',
            height: '4px',
            background: '#3B82F6',
            borderRadius: '2px',
            marginTop: '40px',
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
