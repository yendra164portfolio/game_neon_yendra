import React from 'react';

export const NeonRushLogo: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 460 118"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role="img"
    aria-label="NEON RUSH 3D"
  >
    {/* Subtle outer chassis speed lines */}
    <path d="M10 22H112L98 30H4L10 22Z" fill="#22E6FF" fillOpacity="0.9" />
    <path d="M4 36H76L66 42H0L4 36Z" fill="#FF3B9A" fillOpacity="0.85" />
    <path d="M352 84H450L444 92H338L352 84Z" fill="#FF3B9A" fillOpacity="0.85" />

    {/* Primary Title Text with heavy dark silhouette stroke + cyan/white fill */}
    <text
      x="18"
      y="74"
      fill="#060914"
      stroke="#060914"
      strokeWidth="12"
      strokeLinejoin="round"
      fontFamily="'Chakra Petch', sans-serif"
      fontWeight="700"
      fontStyle="italic"
      fontSize="58"
      letterSpacing="2"
    >
      NEON RUSH
    </text>
    <text
      x="18"
      y="74"
      fill="#F3FAFF"
      stroke="#22E6FF"
      strokeWidth="2.2"
      strokeLinejoin="round"
      fontFamily="'Chakra Petch', sans-serif"
      fontWeight="700"
      fontStyle="italic"
      fontSize="58"
      letterSpacing="2"
    >
      NEON RUSH
    </text>

    {/* 3D Crest Badge */}
    <polygon points="366,18 438,18 424,68 352,68" fill="#0B1124" stroke="#FF3B9A" strokeWidth="3" />
    <polygon points="370,22 432,22 420,64 358,64" fill="#FF2E7A" fillOpacity="0.22" />
    <text
      x="371"
      y="56"
      fill="#FFE259"
      fontFamily="'Chakra Petch', sans-serif"
      fontWeight="700"
      fontStyle="italic"
      fontSize="34"
      letterSpacing="1"
    >
      3D
    </text>

    {/* Underline speed bar */}
    <path d="M18 88H336L326 96H14L18 88Z" fill="#22E6FF" />
    <text
      x="18"
      y="113"
      fill="#8EEFFF"
      fontFamily="'Space Grotesk', sans-serif"
      fontWeight="600"
      fontSize="13"
      letterSpacing="5.5"
    >
      CYBER HIGHWAY ENDLESS RUNNER
    </text>
  </svg>
);

export const CoinSvgIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10.5" fill="#0B1020" stroke="#FFE066" strokeWidth="2" />
    <circle cx="12" cy="12" r="8" fill="#FFB800" />
    <polygon points="12,6.5 16.5,9.2 16.5,14.8 12,17.5 7.5,14.8 7.5,9.2" fill="#FFF3A8" />
    <circle cx="9.5" cy="8.5" r="1.4" fill="#FFFFFF" fillOpacity="0.7" />
  </svg>
);

export const TrophySvgIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M7 4H17V9.5C17 12.5 14.8 14.8 12 14.8C9.2 14.8 7 12.5 7 9.5V4Z"
      fill="#22E6FF"
      stroke="#060914"
      strokeWidth="1.8"
    />
    <path d="M7 6H4V8.5C4 10.2 5.2 11.4 7 11.5" stroke="#22E6FF" strokeWidth="2" strokeLinecap="round" />
    <path d="M17 6H20V8.5C20 10.2 18.8 11.4 17 11.5" stroke="#22E6FF" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 15V19M8.5 20H15.5" stroke="#9EEFFF" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
