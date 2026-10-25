import React, { useState } from 'react';
import { Product } from '../types/printos';

interface ProductArtworkProps {
  product: Pick<
    Product,
    'name' | 'artworkPreset' | 'imageUrl' | 'filamentMaterial' | 'stlFileName' | 'dimensions'
  >;
  className?: string;
  compact?: boolean;
}

/**
 * Renders either the user-uploaded product photo (with automatic fallback on error)
 * or a bright, playful, colorful 3D-printed studio illustration in light theme.
 */
export const ProductArtwork: React.FC<ProductArtworkProps> = ({
  product,
  className = 'h-36',
  compact = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (product.imageUrl && !imgFailed) {
    return (
      <div
        className={`relative overflow-hidden bg-orange-50 ${className} select-none`}
      >
        <img
          src={product.imageUrl}
          alt={product.name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
        {!compact && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 py-2 flex items-center justify-between text-[11px] font-medium text-white">
            <span className="truncate">{product.stlFileName}</span>
            <span className="shrink-0 ml-2 text-amber-200">{product.filamentMaterial}</span>
          </div>
        )}
      </div>
    );
  }

  // Pick a cheerful pastel studio backdrop based on preset
  const bgMap: Record<Product['artworkPreset'], { from: string; to: string; mat: string; accent: string }> = {
    dragon: { from: '#FEF3C7', to: '#D1FAE5', mat: '#FDE68A', accent: '#059669' },
    macropad: { from: '#FFEDD5', to: '#E0E7FF', mat: '#FED7AA', accent: '#EA580C' },
    planter: { from: '#DCFCE7', to: '#FEF9C3', mat: '#BBF7D0', accent: '#16A34A' },
    headphone: { from: '#E0F2FE', to: '#FCE7F3', mat: '#BAE6FD', accent: '#0284C7' },
    voron: { from: '#FFE4E6', to: '#FFEDD5', mat: '#FECDD3', accent: '#E11D48' },
    organizer: { from: '#F3E8FF', to: '#E0F2FE', mat: '#E9D5FF', accent: '#7C3AED' },
    custom: { from: '#FEF3C7', to: '#FFEDD5', mat: '#FDE68A', accent: '#D97706' },
  };

  const palette = bgMap[product.artworkPreset] || bgMap.custom;
  const gradId = `studioGrad-${product.artworkPreset}`;

  return (
    <div
      className={`relative overflow-hidden ${className} flex items-center justify-center select-none`}
    >
      <svg
        viewBox="0 0 320 180"
        className="w-full h-full object-cover"
        aria-label={`Illustration of ${product.name}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette.from} />
            <stop offset="100%" stopColor={palette.to} />
          </linearGradient>
          <linearGradient id="funGoldEmerald" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="funCoral" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#F43F5E" />
          </linearGradient>
        </defs>

        {/* Bright Cheerful Studio Backdrop */}
        <rect width="320" height="180" fill={`url(#${gradId})`} />

        {/* Soft Decorative Studio Sunburst / Craft Mat */}
        <circle cx="265" cy="36" r="42" fill="#FFFFFF" opacity="0.45" />
        <circle cx="52" cy="145" r="55" fill="#FFFFFF" opacity="0.35" />

        {/* Isometric Pastel Craft Build Mat */}
        <g>
          <polygon
            points="160,104 270,136 160,168 50,136"
            fill="#FFFFFF"
            fillOpacity="0.82"
            stroke={palette.mat}
            strokeWidth="2"
          />
          <line x1="105" y1="120" x2="215" y2="152" stroke={palette.mat} strokeWidth="1" />
          <line x1="215" y1="120" x2="105" y2="152" stroke={palette.mat} strokeWidth="1" />
        </g>

        {/* Playful 3D Printed Object Illustrations */}
        {product.artworkPreset === 'dragon' && (
          <g>
            <path
              d="M78,134 C96,92 135,144 162,98 C188,56 222,126 244,82"
              fill="none"
              stroke="url(#funGoldEmerald)"
              strokeWidth="20"
              strokeLinecap="round"
            />
            <path
              d="M78,134 C96,92 135,144 162,98 C188,56 222,126 244,82"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="4"
              strokeDasharray="4 7"
              strokeLinecap="round"
              opacity="0.75"
            />
            <polygon points="110,100 117,76 125,102" fill="#F59E0B" />
            <polygon points="154,84 162,56 171,86" fill="#10B981" />
            <polygon points="195,70 205,44 212,74" fill="#F59E0B" />
            <polygon points="234,74 248,48 253,82" fill="#059669" />
            <circle cx="244" cy="78" r="3.5" fill="#FEF3C7" />
          </g>
        )}

        {product.artworkPreset === 'macropad' && (
          <g>
            {/* Friendly chunky mechanical keypad */}
            <polygon
              points="160,60 236,88 160,122 84,88"
              fill="#475569"
              stroke="#334155"
              strokeWidth="1.5"
            />
            <polygon
              points="84,88 160,122 160,146 84,110"
              fill="#334155"
            />
            <polygon
              points="236,88 160,122 160,146 236,110"
              fill="#1E293B"
            />
            {/* Colorful Candy Keycaps & Orange Rotary Knob */}
            <ellipse
              cx="160"
              cy="75"
              rx="15"
              ry="9"
              fill="url(#funCoral)"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
            <polygon points="128,86 145,93 132,101 115,93" fill="#F8FAFC" />
            <polygon points="160,95 177,102 164,110 147,102" fill="#FDE047" />
            <polygon points="192,86 209,93 196,101 179,93" fill="#38BDF8" />
          </g>
        )}

        {product.artworkPreset === 'planter' && (
          <g>
            {/* Happy green succulent */}
            <ellipse cx="160" cy="52" rx="24" ry="10" fill="#10B981" />
            <ellipse cx="146" cy="45" rx="15" ry="13" fill="#059669" />
            <ellipse cx="174" cy="46" rx="15" ry="12" fill="#34D399" />
            {/* Warm ceramic-style ribbed 3D planter */}
            <path
              d="M120,58 L129,136 C145,147 175,147 191,136 L200,58 Z"
              fill="#FFFBEB"
              stroke="#D97706"
              strokeWidth="1.8"
            />
            <ellipse cx="160" cy="58" rx="40" ry="11" fill="#FDE68A" stroke="#D97706" strokeWidth="1.5" />
            <line x1="138" y1="68" x2="142" y2="138" stroke="#F59E0B" strokeWidth="1.5" opacity="0.55" />
            <line x1="153" y1="70" x2="155" y2="141" stroke="#F59E0B" strokeWidth="1.5" opacity="0.55" />
            <line x1="167" y1="70" x2="165" y2="141" stroke="#F59E0B" strokeWidth="1.5" opacity="0.55" />
            <line x1="182" y1="68" x2="178" y2="138" stroke="#F59E0B" strokeWidth="1.5" opacity="0.55" />
          </g>
        )}

        {product.artworkPreset === 'headphone' && (
          <g>
            <ellipse cx="160" cy="136" rx="42" ry="12" fill="#38BDF8" stroke="#0284C7" strokeWidth="1.5" />
            <path
              d="M151,136 L153,48 L167,48 L169,136 Z"
              fill="#0284C7"
            />
            <path
              d="M128,54 Q160,30 192,54"
              fill="none"
              stroke="url(#funCoral)"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <circle cx="160" cy="86" r="9" fill="#FFFBEB" stroke="#0284C7" strokeWidth="2" />
          </g>
        )}

        {product.artworkPreset === 'voron' && (
          <g>
            <polygon
              points="160,36 204,63 191,126 160,143 129,126 116,63"
              fill="url(#funCoral)"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <polygon
              points="160,52 186,68 176,104 160,114 144,104 134,68"
              fill="#FFF1F2"
            />
            <circle cx="160" cy="82" r="14" fill="#F43F5E" />
            <circle cx="160" cy="82" r="6" fill="#FFFFFF" />
          </g>
        )}

        {(product.artworkPreset === 'organizer' || product.artworkPreset === 'custom') && (
          <g>
            <polygon
              points="160,56 234,85 160,116 86,85"
              fill="#A855F7"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
            <polygon
              points="86,85 160,116 160,146 86,115"
              fill="#9333EA"
            />
            <polygon
              points="234,85 160,116 160,146 234,115"
              fill="#7E22CE"
            />
            <line x1="123" y1="70" x2="197" y2="100" stroke="#F3E8FF" strokeWidth="2" />
            <line x1="197" y1="70" x2="123" y2="100" stroke="#F3E8FF" strokeWidth="2" />
          </g>
        )}
      </svg>

      {!compact && (
        <div className="absolute inset-x-0 bottom-0 bg-white/85 backdrop-blur-xs border-t border-slate-200/60 px-3 py-1.5 flex items-center justify-between text-[11px] font-medium text-slate-700">
          <span className="truncate">{product.stlFileName || 'model.3mf'}</span>
          <span
            className="shrink-0 ml-2 font-bold"
            style={{ color: palette.accent }}
          >
            {product.filamentMaterial}
          </span>
        </div>
      )}
    </div>
  );
};
